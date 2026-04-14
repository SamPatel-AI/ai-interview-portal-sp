import { supabaseAdmin } from '../config/database';
import { createOutboundCall } from './retell.service';
import { buildDynamicVariables } from '../utils/retellPromptBuilder';
import { formatPhoneE164 } from '../utils/phone';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { Application, Candidate, Job, AIAgent, Call } from '../types';

interface InitiateCallParams {
  applicationId: string;
  orgId: string;
  userId: string;
  scheduledAt?: string; // ISO timestamp for delayed calls
}

/**
 * Initiate an outbound interview call for an application.
 */
export async function initiateOutboundCall(params: InitiateCallParams): Promise<Call> {
  // Fetch all required data
  const { data: app, error: appErr } = await supabaseAdmin
    .from('applications')
    .select(`
      *,
      candidates (*),
      jobs (
        *,
        ai_agents (*),
        client_companies (name)
      )
    `)
    .eq('id', params.applicationId)
    .eq('org_id', params.orgId)
    .single();

  if (appErr || !app) throw new Error('Application not found');

  const candidate = app.candidates as Candidate;
  const job = app.jobs as Job & { ai_agents: AIAgent; client_companies: { name: string } };
  const agent = job.ai_agents;

  if (!agent) throw new Error('No AI agent assigned to this job. Assign an agent first.');
  if (!candidate.phone) throw new Error('Candidate has no phone number');
  if (!agent.retell_agent_id) throw new Error('AI agent not synced with Retell');

  const formattedPhone = formatPhoneE164(candidate.phone);

  // Build dynamic variables for the call
  const dynamicVars = buildDynamicVariables({
    candidate,
    application: app as Application,
    job: job as Job,
    agent,
  });

  // Add company name
  if (job.client_companies?.name) {
    dynamicVars.company_name = job.client_companies.name;
  }

  // Create call record in our DB first
  const { data: callRecord, error: callErr } = await supabaseAdmin
    .from('calls')
    .insert({
      org_id: params.orgId,
      application_id: params.applicationId,
      candidate_id: candidate.id,
      ai_agent_id: agent.id,
      direction: 'outbound',
      status: params.scheduledAt ? 'scheduled' : 'in_progress',
      from_number: env.RETELL_FROM_NUMBER,
      to_number: formattedPhone,
      scheduled_at: params.scheduledAt || null,
      context_passed: dynamicVars,
    })
    .select()
    .single();

  if (callErr || !callRecord) throw new Error('Failed to create call record');

  // If scheduled for later, don't call Retell now
  if (params.scheduledAt) {
    logger.info(`Call scheduled for ${params.scheduledAt}: ${callRecord.id}`);
    return callRecord as Call;
  }

  // Make the actual call via Retell
  try {
    const retellResult = await createOutboundCall({
      agentId: agent.retell_agent_id,
      toNumber: formattedPhone,
      dynamicVariables: dynamicVars,
      metadata: {
        call_id: callRecord.id,
        application_id: params.applicationId,
        org_id: params.orgId,
      },
    });

    // Update call record with Retell call ID
    await supabaseAdmin
      .from('calls')
      .update({
        retell_call_id: retellResult.callId,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', callRecord.id);

    // Update application status
    await supabaseAdmin
      .from('applications')
      .update({ status: 'screening' })
      .eq('id', params.applicationId);

    // Log activity
    await supabaseAdmin.from('activity_log').insert({
      org_id: params.orgId,
      user_id: params.userId,
      entity_type: 'call',
      entity_id: callRecord.id,
      action: 'outbound_call_initiated',
      details: {
        candidate_name: `${candidate.first_name} ${candidate.last_name}`,
        job_title: job.title,
        to_number: formattedPhone,
      },
    });

    return { ...callRecord, retell_call_id: retellResult.callId, status: 'in_progress' } as Call;
  } catch (err) {
    // Mark call as failed
    await supabaseAdmin
      .from('calls')
      .update({ status: 'failed', disconnection_reason: String(err) })
      .eq('id', callRecord.id);

    throw err;
  }
}

/**
 * Resume an interrupted call by creating a new call with previous context.
 */
export async function resumeInterruptedCall(
  interruptedCallId: string,
  orgId: string,
  userId: string
): Promise<Call> {
  // Fetch the interrupted call
  const { data: prevCall, error } = await supabaseAdmin
    .from('calls')
    .select(`
      *,
      applications (*, candidates (*), jobs (*, ai_agents (*), client_companies (name)))
    `)
    .eq('id', interruptedCallId)
    .eq('org_id', orgId)
    .single();

  if (error || !prevCall) throw new Error('Previous call not found');
  if (prevCall.status !== 'interrupted' && prevCall.status !== 'failed') {
    throw new Error('Call is not in interrupted or failed state');
  }

  const app = prevCall.applications;
  const candidate = app.candidates as Candidate;
  const job = app.jobs as Job & { ai_agents: AIAgent; client_companies: { name: string } };
  const agent = job.ai_agents;

  if (!candidate.phone) throw new Error('Candidate has no phone number');
  if (!agent?.retell_agent_id) throw new Error('AI agent not available');

  const formattedPhone = formatPhoneE164(candidate.phone);

  // Build context from previous call
  const dynamicVars = buildDynamicVariables({
    candidate,
    application: app as Application,
    job: job as Job,
    agent,
    resumptionContext: {
      previousTranscript: prevCall.transcript || 'No transcript available',
      questionsAsked: extractQuestionsFromTranscript(prevCall.transcript || ''),
      answersGiven: extractAnswersFromTranscript(prevCall.transcript || ''),
    },
  });

  if (job.client_companies?.name) {
    dynamicVars.company_name = job.client_companies.name;
  }

  // Create new call record linked to parent
  const { data: newCall, error: callErr } = await supabaseAdmin
    .from('calls')
    .insert({
      org_id: orgId,
      application_id: prevCall.application_id,
      candidate_id: candidate.id,
      ai_agent_id: agent.id,
      direction: 'outbound',
      status: 'in_progress',
      from_number: env.RETELL_FROM_NUMBER,
      to_number: formattedPhone,
      is_resumption: true,
      parent_call_id: interruptedCallId,
      context_passed: dynamicVars,
    })
    .select()
    .single();

  if (callErr || !newCall) throw new Error('Failed to create resumption call record');

  // Make the call
  const retellResult = await createOutboundCall({
    agentId: agent.retell_agent_id,
    toNumber: formattedPhone,
    dynamicVariables: dynamicVars,
    metadata: {
      call_id: newCall.id,
      parent_call_id: interruptedCallId,
      application_id: prevCall.application_id,
      org_id: orgId,
    },
  });

  await supabaseAdmin
    .from('calls')
    .update({
      retell_call_id: retellResult.callId,
      started_at: new Date().toISOString(),
    })
    .eq('id', newCall.id);

  logger.info(`Resumed call ${interruptedCallId} -> new call ${newCall.id}`);

  return { ...newCall, retell_call_id: retellResult.callId } as Call;
}

// ─── Helpers ───────────────────────────────────────────────

function extractQuestionsFromTranscript(transcript: string): string[] {
  // Extract lines that look like agent questions
  const lines = transcript.split('\n');
  return lines
    .filter(line => line.startsWith('Agent:') && line.includes('?'))
    .map(line => line.replace(/^Agent:\s*/, '').trim());
}

function extractAnswersFromTranscript(transcript: string): string[] {
  const lines = transcript.split('\n');
  return lines
    .filter(line => line.startsWith('User:'))
    .map(line => line.replace(/^User:\s*/, '').trim());
}

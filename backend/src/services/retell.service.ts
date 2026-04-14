import { retellClient } from '../config/retell';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AIAgent } from '../types';

// ─── Agent Management ──────────────────────────────────────

interface CreateAgentParams {
  name: string;
  systemPrompt: string;
  voiceId: string;
  language?: string;
  maxCallDurationSec?: number;
  interviewStyle?: string;
  greetingTemplate?: string;
  webhookUrl: string;
}

export async function createRetellAgent(params: CreateAgentParams): Promise<string> {
  try {
    const agent = await retellClient.agent.create({
      agent_name: params.name,
      response_engine: {
        type: 'retell-llm',
        llm_id: '', // Will be auto-created
      },
      voice_id: params.voiceId,
      language: (params.language || 'en-US') as any,
      max_call_duration_ms: (params.maxCallDurationSec || 1200) * 1000,
      post_call_analysis_data: [
        {
          name: 'call_summary',
          type: 'string' as any,
          description: 'A detailed summary of the interview call including key points discussed.',
        },
        {
          name: 'call_successful',
          type: 'boolean' as any,
          description: 'Whether the interview was completed successfully (candidate answered questions).',
        },
        {
          name: 'candidate_sentiment',
          type: 'enum' as any,
          description: 'Overall sentiment of the candidate during the call.',
          choices: ['Positive', 'Neutral', 'Negative'],
        },
        {
          name: 'callback_requested',
          type: 'boolean' as any,
          description: 'Whether the candidate asked to be called back later.',
        },
        {
          name: 'callback_time_minutes',
          type: 'number' as any,
          description: 'If callback was requested, how many minutes later the candidate wants to be called. 0 if not requested.',
        },
      ],
      webhook_url: params.webhookUrl,
      voicemail_option: 'machine_detection_with_beep' as any,
    });

    logger.info(`Created Retell agent: ${agent.agent_id}`);
    return agent.agent_id;
  } catch (err) {
    logger.error('Failed to create Retell agent:', err);
    throw err;
  }
}

export async function updateRetellAgent(agentId: string, params: Partial<CreateAgentParams>): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {};

    if (params.name) updateData.agent_name = params.name;
    if (params.voiceId) updateData.voice_id = params.voiceId;
    if (params.language) updateData.language = params.language;
    if (params.maxCallDurationSec) updateData.max_call_duration_ms = params.maxCallDurationSec * 1000;

    await retellClient.agent.update(agentId, updateData as any);
    logger.info(`Updated Retell agent: ${agentId}`);
  } catch (err) {
    logger.error(`Failed to update Retell agent ${agentId}:`, err);
    throw err;
  }
}

export async function deleteRetellAgent(agentId: string): Promise<void> {
  try {
    await retellClient.agent.delete(agentId);
    logger.info(`Deleted Retell agent: ${agentId}`);
  } catch (err) {
    logger.error(`Failed to delete Retell agent ${agentId}:`, err);
    throw err;
  }
}

// ─── Voice Listing ─────────────────────────────────────────

export async function listVoices() {
  try {
    const voices = await retellClient.voice.list();
    return voices;
  } catch (err) {
    logger.error('Failed to list Retell voices:', err);
    throw err;
  }
}

// ─── Call Management ───────────────────────────────────────

interface CreateCallParams {
  agentId: string;
  toNumber: string;
  fromNumber?: string;
  dynamicVariables: Record<string, string>;
  metadata?: Record<string, string>;
}

export async function createOutboundCall(params: CreateCallParams): Promise<{
  callId: string;
  status: string;
}> {
  try {
    const call = await retellClient.call.createPhoneCall({
      from_number: params.fromNumber || env.RETELL_FROM_NUMBER,
      to_number: params.toNumber,
      override_agent_id: params.agentId,
      retell_llm_dynamic_variables: params.dynamicVariables,
      metadata: params.metadata,
    });

    logger.info(`Created outbound call: ${call.call_id} to ${params.toNumber}`);
    return {
      callId: call.call_id,
      status: call.call_status,
    };
  } catch (err) {
    logger.error('Failed to create outbound call:', err);
    throw err;
  }
}

// ─── Phone Number Management ───────────────────────────────

interface RegisterPhoneParams {
  areaCode?: number;
  inboundAgentId?: string;
  inboundWebhookUrl?: string;
}

export async function registerPhoneNumber(params: RegisterPhoneParams) {
  try {
    const phone = await retellClient.phoneNumber.create({
      area_code: params.areaCode || 240,
      inbound_agent_id: params.inboundAgentId,
    });

    logger.info(`Registered phone number: ${phone.phone_number}`);
    return phone;
  } catch (err) {
    logger.error('Failed to register phone number:', err);
    throw err;
  }
}

export async function listPhoneNumbers() {
  try {
    return await retellClient.phoneNumber.list();
  } catch (err) {
    logger.error('Failed to list phone numbers:', err);
    throw err;
  }
}

import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { webhookLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';
import { phonesMatch } from '../utils/phone';
import { scheduleCallRetry } from '../jobs/callRetry.job';
import { buildInboundContext } from '../utils/retellPromptBuilder';
import { verifyRetellSignature, requireWebhookSecret } from '../middleware/webhookAuth';

const router = Router();

router.use(webhookLimiter);

// ─── POST /api/webhooks/candidate-intake ───────────────────
// External systems (CEIPAL email parser, n8n, Zapier, etc.) POST candidates here.
// Auto-creates candidate + application + triggers resume screening.
// This is the entry point that replaces the n8n Outlook trigger.

router.post('/candidate-intake', requireWebhookSecret, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : typeof req.body === 'object' && Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;

    const {
      first_name, last_name, email, phone,
      location, work_authorization, source,
      job_code, job_id, org_id,
      resume_text, resume_url,
    } = body;

    if (!email || !org_id) {
      res.status(400).json({ error: 'email and org_id are required' });
      return;
    }

    logger.info(`Candidate intake: ${email} for org ${org_id}`);

    // 1. Upsert candidate (create or find existing by email within org)
    let candidateId: string;

    const { data: existing } = await supabaseAdmin
      .from('candidates')
      .select('id')
      .eq('org_id', org_id)
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      candidateId = existing.id;
      // Update fields if provided
      await supabaseAdmin
        .from('candidates')
        .update({
          ...(first_name && { first_name }),
          ...(last_name && { last_name }),
          ...(phone && { phone }),
          ...(location && { location }),
          ...(work_authorization && { work_authorization }),
          ...(resume_text && { resume_text }),
          ...(resume_url && { resume_url }),
        })
        .eq('id', candidateId);
    } else {
      const { data: newCand, error: candErr } = await supabaseAdmin
        .from('candidates')
        .insert({
          org_id,
          first_name: first_name || 'Unknown',
          last_name: last_name || '',
          email: email.toLowerCase(),
          phone: phone || null,
          location: location || null,
          work_authorization: work_authorization || null,
          resume_text: resume_text || null,
          resume_url: resume_url || null,
          source: source || 'webhook',
        })
        .select('id')
        .single();

      if (candErr || !newCand) {
        logger.error('Failed to create candidate:', candErr);
        res.status(500).json({ error: 'Failed to create candidate' });
        return;
      }
      candidateId = newCand.id;
    }

    // 2. Find the job (by job_id or CEIPAL job_code)
    let resolvedJobId: string | null = job_id || null;

    if (!resolvedJobId && job_code) {
      const { data: job } = await supabaseAdmin
        .from('jobs')
        .select('id')
        .eq('org_id', org_id)
        .eq('ceipal_job_id', job_code)
        .single();

      resolvedJobId = job?.id || null;
    }

    // 3. Create application if we have a job
    let applicationId: string | null = null;

    if (resolvedJobId) {
      // Check if application already exists
      const { data: existingApp } = await supabaseAdmin
        .from('applications')
        .select('id')
        .eq('candidate_id', candidateId)
        .eq('job_id', resolvedJobId)
        .single();

      if (existingApp) {
        applicationId = existingApp.id;
      } else {
        const { data: newApp, error: appErr } = await supabaseAdmin
          .from('applications')
          .insert({
            org_id,
            candidate_id: candidateId,
            job_id: resolvedJobId,
            status: 'new',
          })
          .select('id')
          .single();

        if (!appErr && newApp) {
          applicationId = newApp.id;
        }
      }
    }

    // 4. Auto-trigger AI screening if we have resume text + application
    if (resume_text && applicationId && resolvedJobId) {
      // Fetch job details for screening
      const { data: job } = await supabaseAdmin
        .from('jobs')
        .select('title, description, skills, state, country, tax_terms')
        .eq('id', resolvedJobId)
        .single();

      if (job) {
        // Run screening in background (don't block the webhook response)
        const { screenResume } = await import('../services/screening.service');
        screenResume({
          resumeText: resume_text,
          jobTitle: job.title,
          jobDescription: job.description,
          skills: job.skills,
          state: job.state,
          country: job.country,
          taxTerms: job.tax_terms,
        }).then(async (result) => {
          await supabaseAdmin
            .from('applications')
            .update({
              ai_screening_score: result.overall_fit_rating,
              ai_screening_result: result,
              mandate_questions: result.mandate_questions,
              interview_questions: result.interview_questions,
              status: 'screening',
            })
            .eq('id', applicationId);

          logger.info(`Auto-screening complete for ${email}: score ${result.overall_fit_rating}/10`);
        }).catch((err) => {
          logger.error(`Auto-screening failed for ${email}:`, err);
        });
      }
    }

    // 5. Log activity
    await supabaseAdmin.from('activity_log').insert({
      org_id,
      entity_type: 'candidate',
      entity_id: candidateId,
      action: 'intake_received',
      details: { email, source: source || 'webhook', job_code, has_resume: !!resume_text },
    });

    res.status(201).json({
      received: true,
      candidate_id: candidateId,
      application_id: applicationId,
      screening: resume_text && applicationId ? 'triggered' : 'skipped',
    });
  } catch (err) {
    logger.error('Candidate intake error:', err);
    res.status(500).json({ error: 'Intake processing failed' });
  }
});

// ─── POST /api/webhooks/cal-booking ────────────────────────
// Cal.com fires this when a candidate books an interview slot.
// Auto-schedules the outbound Retell AI call for that time slot.
// This closes the loop: recruiter approves → email sent → candidate books → AI calls.

router.post('/cal-booking', requireWebhookSecret, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : typeof req.body === 'object' && Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;

    // Cal.com webhook payload structure
    const payload = body.payload || body;
    const eventType = body.triggerEvent || body.type || '';

    // Only process booking creation events
    if (eventType !== 'BOOKING_CREATED' && eventType !== 'booking.created') {
      res.json({ received: true, skipped: true });
      return;
    }

    // Extract attendee email from Cal.com booking
    const attendees = payload.attendees || [];
    const candidateEmail = attendees[0]?.email?.toLowerCase() || payload.email?.toLowerCase();
    const scheduledStart = payload.startTime || payload.start_time;

    if (!candidateEmail || !scheduledStart) {
      logger.warn('Cal booking webhook missing email or start time');
      res.json({ received: true, error: 'Missing data' });
      return;
    }

    logger.info(`Cal.com booking: ${candidateEmail} at ${scheduledStart}`);

    // Find the candidate by email
    const { data: candidate } = await supabaseAdmin
      .from('candidates')
      .select('id, org_id, first_name, last_name, phone')
      .eq('email', candidateEmail)
      .limit(1)
      .single();

    if (!candidate) {
      logger.warn(`Cal booking: candidate not found for ${candidateEmail}`);
      res.json({ received: true, error: 'Candidate not found' });
      return;
    }

    if (!candidate.phone) {
      logger.warn(`Cal booking: candidate ${candidateEmail} has no phone number`);
      res.json({ received: true, error: 'No phone number' });
      return;
    }

    // Find their active application (shortlisted = approved by recruiter)
    const { data: application } = await supabaseAdmin
      .from('applications')
      .select(`
        id, job_id,
        jobs (id, title, ai_agent_id, ai_agents (id, retell_agent_id))
      `)
      .eq('candidate_id', candidate.id)
      .in('status', ['shortlisted', 'screening', 'new'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!application) {
      logger.warn(`Cal booking: no active application for ${candidateEmail}`);
      res.json({ received: true, error: 'No active application' });
      return;
    }

    const appJob = (application.jobs as any);
    const appAgent = (appJob?.ai_agents as any);

    if (!appAgent?.retell_agent_id) {
      logger.warn(`Cal booking: no AI agent assigned to job for ${candidateEmail}`);
      res.json({ received: true, error: 'No agent assigned' });
      return;
    }

    // Schedule the outbound call for the booked time
    const { initiateOutboundCall } = await import('../services/call.service');
    const call = await initiateOutboundCall({
      applicationId: application.id,
      orgId: candidate.org_id,
      userId: 'system',
      scheduledAt: new Date(scheduledStart).toISOString(),
    });

    // Update application status to show interview is booked
    await supabaseAdmin
      .from('applications')
      .update({ status: 'screening' })
      .eq('id', application.id);

    // Log activity
    await supabaseAdmin.from('activity_log').insert({
      org_id: candidate.org_id,
      entity_type: 'call',
      entity_id: call.id,
      action: 'interview_booked',
      details: {
        candidate_email: candidateEmail,
        candidate_name: `${candidate.first_name} ${candidate.last_name}`,
        scheduled_at: scheduledStart,
        job_title: appJob?.title,
        booking_source: 'cal.com',
      },
    });

    logger.info(`Auto-scheduled call ${call.id} for ${candidateEmail} at ${scheduledStart}`);

    res.json({
      received: true,
      call_id: call.id,
      scheduled_at: scheduledStart,
    });
  } catch (err) {
    logger.error('Cal.com booking webhook error:', err);
    res.json({ received: true, error: 'Processing failed' });
  }
});

// ─── POST /api/webhooks/retell/post-call ───────────────────
// Retell fires this after a call ends with analysis

router.post('/retell/post-call', verifyRetellSignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Parse raw body (mounted before JSON parser in index.ts)
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : typeof req.body === 'object' && Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;

    const { event, call } = body;

    // Test calls (from the agent builder) carry metadata.test and must not
    // create call records or evaluations.
    if (call?.metadata?.test === 'true') {
      logger.info(`Skipping DB write for test call ${call?.call_id}`);
      res.json({ received: true, test: true });
      return;
    }

    if (event !== 'call_analyzed' && event !== 'call_ended') {
      res.json({ received: true });
      return;
    }

    const retellCallId = call?.call_id;
    if (!retellCallId) {
      logger.warn('Webhook received without call_id');
      res.json({ received: true });
      return;
    }

    logger.info(`Retell webhook: ${event} for call ${retellCallId}`);

    // Find the call in our database
    const { data: callRecord, error } = await supabaseAdmin
      .from('calls')
      .select('id, org_id, application_id, candidate_id')
      .eq('retell_call_id', retellCallId)
      .single();

    if (error || !callRecord) {
      // Try matching by metadata
      const metadata = call.metadata;
      if (metadata?.call_id) {
        const { data: metaCall } = await supabaseAdmin
          .from('calls')
          .select('id, org_id, application_id, candidate_id')
          .eq('id', metadata.call_id)
          .single();

        if (!metaCall) {
          logger.warn(`Call not found for retell_call_id: ${retellCallId}`);
          res.json({ received: true });
          return;
        }
        Object.assign(callRecord ?? {}, metaCall);
      } else {
        logger.warn(`Call not found for retell_call_id: ${retellCallId}`);
        res.json({ received: true });
        return;
      }
    }

    // Determine call status
    const disconnectionReason = call.disconnection_reason || '';
    let status: string;

    if (disconnectionReason === 'dial_no_answer') {
      status = 'no_answer';
    } else if (disconnectionReason === 'voicemail_reached') {
      status = 'voicemail';
    } else if (
      call.call_analysis?.call_successful === true ||
      disconnectionReason === 'agent_hangup' ||
      disconnectionReason === 'user_hangup'
    ) {
      status = 'completed';
    } else if (
      disconnectionReason === 'dial_busy' ||
      disconnectionReason === 'dial_failed' ||
      disconnectionReason === 'error_inactivity'
    ) {
      status = 'failed';
    } else {
      // Possible interruption
      status = 'interrupted';
    }

    // Update call record
    await supabaseAdmin
      .from('calls')
      .update({
        retell_call_id: retellCallId,
        status,
        ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : new Date().toISOString(),
        duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : null,
        transcript: call.transcript || null,
        transcript_object: call.transcript_object || null,
        recording_url: call.recording_url || null,
        disconnection_reason: disconnectionReason,
        call_analysis: call.call_analysis || null,
        call_cost: call.call_cost || null,
      })
      .eq('id', callRecord!.id);

    // Track missed outbound calls for inbound callback detection
    if (status === 'no_answer' || status === 'voicemail') {
      await supabaseAdmin
        .from('calls')
        .update({ missed_call_detected_at: new Date().toISOString() })
        .eq('id', callRecord!.id);
    }

    // Auto-redial no-answer / failed calls within the slot, up to 3 total attempts.
    // After that the call is left as failed so it surfaces for manual recruiter action.
    if (status === 'no_answer' || status === 'failed') {
      const appId = callRecord!.application_id;
      const { count: attempts } = await supabaseAdmin
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('application_id', appId);
      const MAX_ATTEMPTS = 3;
      if ((attempts ?? 0) < MAX_ATTEMPTS && appId) {
        const { scheduleCallRedial } = await import('../jobs/callRetry.job');
        await scheduleCallRedial(appId, callRecord!.org_id, (attempts ?? 0) + 1);
        logger.info(`Auto-redial scheduled for application ${appId} (attempt ${(attempts ?? 0) + 1}/${MAX_ATTEMPTS})`);
      } else {
        logger.info(`Application ${appId} exhausted ${MAX_ATTEMPTS} call attempts — left as failed for recruiter action`);
      }
    }

    // Auto-retry interrupted calls (max depth of 2 retries)
    if (status === 'interrupted') {
      // Count how deep in the retry chain we are
      let depth = 0;
      let parentId = callRecord!.id;
      while (parentId) {
        const { data: parent } = await supabaseAdmin
          .from('calls')
          .select('parent_call_id')
          .eq('id', parentId)
          .single();
        if (parent?.parent_call_id) {
          depth++;
          parentId = parent.parent_call_id;
        } else {
          break;
        }
      }

      if (depth < 2) {
        await scheduleCallRetry(callRecord!.id, callRecord!.org_id, 120000);
        logger.info(`Auto-retry scheduled for interrupted call ${callRecord!.id} (depth: ${depth})`);
      } else {
        logger.info(`Skipping auto-retry for call ${callRecord!.id} — max retry depth reached (${depth})`);
      }
    }

    // Update application status based on call result
    if (status === 'completed') {
      await supabaseAdmin
        .from('applications')
        .update({ status: 'interviewed' })
        .eq('id', callRecord!.application_id);
    }

    // Handle callback requests
    if (call.call_analysis?.custom_analysis_data?.callback_requested === true) {
      const callbackMinutes = call.call_analysis.custom_analysis_data.callback_time_minutes || 15;
      const callbackAt = new Date(Date.now() + callbackMinutes * 60 * 1000);

      logger.info(`Callback requested for call ${callRecord!.id} in ${callbackMinutes} minutes`);

      // Schedule a callback call
      await supabaseAdmin
        .from('calls')
        .insert({
          org_id: callRecord!.org_id,
          application_id: callRecord!.application_id,
          candidate_id: callRecord!.candidate_id,
          ai_agent_id: (await supabaseAdmin.from('calls').select('ai_agent_id').eq('id', callRecord!.id).single()).data?.ai_agent_id,
          direction: 'outbound',
          status: 'scheduled',
          is_resumption: true,
          parent_call_id: callRecord!.id,
          scheduled_at: callbackAt.toISOString(),
          context_passed: {
            reason: 'candidate_requested_callback',
            previous_transcript: call.transcript,
          },
        });
    }

    // Log activity
    await supabaseAdmin.from('activity_log').insert({
      org_id: callRecord!.org_id,
      entity_type: 'call',
      entity_id: callRecord!.id,
      action: `call_${status}`,
      details: {
        disconnection_reason: disconnectionReason,
        duration_seconds: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
        call_successful: call.call_analysis?.call_successful ?? false,
      },
    });

    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook processing error:', err);
    // Always return 200 to Retell to prevent retries on our errors
    res.json({ received: true, error: 'Processing error' });
  }
});

// ─── POST /api/webhooks/retell/inbound ─────────────────────
// Retell fires this when an inbound call comes in to route to the right agent

router.post('/retell/inbound', verifyRetellSignature, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : typeof req.body === 'object' && Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;

    const fromNumber = body.from_number || body.caller_number || '';
    const toNumber = body.to_number || body.called_number || '';

    logger.info(`Inbound call from ${fromNumber} to ${toNumber}`);

    // Find the phone number config
    const { data: phoneConfig } = await supabaseAdmin
      .from('phone_numbers')
      .select('org_id, assigned_agent_id, ai_agents (retell_agent_id)')
      .eq('number', toNumber)
      .eq('is_active', true)
      .single();

    // Find candidate by phone — robust matching using normalizeForLookup
    const orgId = phoneConfig?.org_id;
    let candidate: any = null;

    if (orgId) {
      // Fetch candidates with phone numbers for this org, match in JS for reliability
      const { data: orgCandidates } = await supabaseAdmin
        .from('candidates')
        .select('id, org_id, first_name, last_name, email, phone')
        .eq('org_id', orgId)
        .not('phone', 'is', null);

      const matches = (orgCandidates || []).filter(c => c.phone && phonesMatch(c.phone, fromNumber));

      if (matches.length === 1) {
        candidate = matches[0];
      } else if (matches.length > 1) {
        // Disambiguate: pick candidate with most recent active application
        for (const m of matches) {
          const { data: app } = await supabaseAdmin
            .from('applications')
            .select('id, created_at')
            .eq('candidate_id', m.id)
            .in('status', ['new', 'screening'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (app) {
            candidate = m;
            break;
          }
        }
        // If none have active apps, just take the first match
        if (!candidate) candidate = matches[0];
      }
    }

    const phoneAgent = (phoneConfig?.ai_agents as any[])?.[0];

    if (!candidate) {
      // Unknown caller — use default agent or reject
      if (phoneAgent?.retell_agent_id) {
        res.json({
          agent_id: phoneAgent.retell_agent_id,
          retell_llm_dynamic_variables: {
            candidate_name: 'there',
            call_context: 'This is an inbound call from an unknown number. Introduce yourself and ask who is calling.',
          },
        });
        return;
      }

      res.status(404).json({ error: 'No agent configured for this number' });
      return;
    }

    // Check for recent missed outbound call (callback within 2 hours)
    const { data: missedCall } = await supabaseAdmin
      .from('calls')
      .select('id, application_id, ai_agent_id, transcript, context_passed')
      .eq('candidate_id', candidate.id)
      .eq('direction', 'outbound')
      .in('status', ['no_answer', 'voicemail'])
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Check for interrupted calls to resume
    const { data: interruptedCall } = await supabaseAdmin
      .from('calls')
      .select('id, application_id, ai_agent_id, transcript, context_passed')
      .eq('candidate_id', candidate.id)
      .eq('status', 'interrupted')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Determine which application/job/agent context to use
    // Priority: missed call context > interrupted call context > latest active application
    const contextSourceAppId = missedCall?.application_id
      || interruptedCall?.application_id
      || null;

    let application: any = null;
    let job: any = null;
    let agent: any = null;

    if (contextSourceAppId) {
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select(`
          id, job_id, mandate_questions, interview_questions, ai_screening_result,
          jobs (id, title, description, skills, ai_agent_id,
            ai_agents (id, retell_agent_id, interview_style, greeting_template, closing_template, evaluation_criteria, system_prompt))
        `)
        .eq('id', contextSourceAppId)
        .single();
      application = app;
      job = (app?.jobs as any);
      agent = (job?.ai_agents as any);
    }

    // Fallback: find most recent active application
    if (!application) {
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select(`
          id, job_id, mandate_questions, interview_questions, ai_screening_result,
          jobs (id, title, description, skills, ai_agent_id,
            ai_agents (id, retell_agent_id, interview_style, greeting_template, closing_template, evaluation_criteria, system_prompt))
        `)
        .eq('candidate_id', candidate.id)
        .in('status', ['new', 'screening'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      application = app;
      job = (app?.jobs as any);
      agent = (job?.ai_agents as any);
    }

    const agentId = agent?.retell_agent_id || phoneAgent?.retell_agent_id;

    if (!agentId) {
      res.status(404).json({ error: 'No agent available for this candidate' });
      return;
    }

    // Build dynamic variables using the centralized prompt builder
    const dynamicVars = buildInboundContext({
      candidate,
      application,
      job,
      agent,
      missedCall: missedCall || undefined,
      interruptedCall: interruptedCall || undefined,
    });

    // Create inbound call record
    const isResumption = !!(interruptedCall || missedCall);
    const parentCallId = interruptedCall?.id || missedCall?.id || null;

    const { data: callRecord } = await supabaseAdmin
      .from('calls')
      .insert({
        org_id: candidate.org_id,
        application_id: application?.id || null,
        candidate_id: candidate.id,
        ai_agent_id: agent?.id || phoneConfig?.assigned_agent_id || null,
        direction: 'inbound',
        status: 'in_progress',
        from_number: fromNumber,
        to_number: toNumber,
        started_at: new Date().toISOString(),
        is_resumption: isResumption,
        parent_call_id: parentCallId,
        context_passed: dynamicVars,
      })
      .select('id')
      .single();

    // Respond to Retell with agent routing
    res.json({
      agent_id: agentId,
      retell_llm_dynamic_variables: dynamicVars,
      metadata: {
        call_id: callRecord?.id,
        candidate_id: candidate.id,
        org_id: candidate.org_id,
      },
    });
  } catch (err) {
    logger.error('Inbound webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;

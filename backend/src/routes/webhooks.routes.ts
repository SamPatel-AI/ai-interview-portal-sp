import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { webhookLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';
import { phonesMatch } from '../utils/phone';
import { scheduleCallRetry } from '../jobs/callRetry.job';
import { buildInboundContext } from '../utils/retellPromptBuilder';
import { verifyRetellSignature, requireWebhookSecret, verifyCalSignature } from '../middleware/webhookAuth';
import { cancelBooking } from '../services/cal.service';
import { notifyBookingIssue } from '../services/notification.service';
import { ingestCandidate } from '../services/intake.service';

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

    // 1-3. Upsert candidate + resolve job + create application (shared with the
    // CEIPAL submissions poll). This path supplies resume_text (no résumé bytes),
    // so the service does NOT enqueue resume-processor; we screen inline below.
    let candidateId: string;
    let resolvedJobId: string | null;
    let applicationId: string | null;
    try {
      const result = await ingestCandidate({
        orgId: org_id,
        email,
        firstName: first_name,
        lastName: last_name,
        phone,
        location,
        workAuthorization: work_authorization,
        source: source || 'webhook',
        resolvedJobId: job_id || null,
        jobCode: job_code || null,
        resumeText: resume_text || null,
        resumeUrl: resume_url || null,
      });
      candidateId = result.candidateId;
      resolvedJobId = result.resolvedJobId;
      applicationId = result.applicationId;
    } catch (err) {
      logger.error('Failed to ingest candidate:', err);
      res.status(500).json({ error: 'Failed to create candidate' });
      return;
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

// Shape returned by the application lookups below.
const APP_SELECT = `
  id, job_id, org_id, status,
  candidates (id, org_id, first_name, last_name, email, phone),
  jobs (id, title, interview_deadline, ai_agent_id, ai_agents (id, retell_agent_id))
`;

router.post('/cal-booking', verifyCalSignature, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : typeof req.body === 'object' && Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;

    // Cal.com webhook payload structure
    const payload = body.payload || body;
    const eventType = body.triggerEvent || body.type || '';

    // ── BOOKING_RESCHEDULED (WS6) ─────────────────────────────
    // Match the existing scheduled call by its Cal.com uid and move it to the
    // new time. Cal.com may mint a new uid on reschedule, so match on either the
    // prior uid (rescheduleUid) or the new one, then track the new uid forward.
    if (eventType === 'BOOKING_RESCHEDULED' || eventType === 'booking.rescheduled') {
      const newStart: string | null = payload.startTime || payload.start_time || null;
      const newUid: string | null = payload.uid || payload.bookingUid || null;
      const oldUid: string | null =
        payload.rescheduleUid || payload.fromReschedule || payload.originalRescheduledBooking?.uid || null;
      const uids = [oldUid, newUid].filter(Boolean) as string[];

      if (!newStart || uids.length === 0) {
        logger.error(`Cal reschedule webhook missing start/uid (newUid=${newUid}, oldUid=${oldUid})`);
        res.json({ received: true, handled: false, error: 'Missing data' });
        return;
      }

      const { data: call, error } = await supabaseAdmin
        .from('calls')
        .select('id, org_id, status, application_id, cal_booking_uid, applications (id, jobs (id, title, interview_deadline))')
        .in('cal_booking_uid', uids)
        .maybeSingle();
      if (error) {
        logger.error('Cal reschedule: call lookup failed (transient):', error);
        res.status(500).json({ received: false, error: 'Database error' });
        return;
      }
      if (!call) {
        logger.error(`Cal reschedule UNMATCHED — no scheduled call for uids ${uids.join(',')}`);
        res.json({ received: true, handled: false, error: 'No matching call' });
        return;
      }
      if (call.status !== 'scheduled') {
        logger.warn(`Cal reschedule: call ${call.id} is '${call.status}', not rescheduling`);
        res.json({ received: true, handled: false, reason: `call_${call.status}` });
        return;
      }

      const job = (call as any).applications?.jobs;
      // Re-apply the deadline backstop to the new time.
      if (job?.interview_deadline && new Date(newStart).getTime() > new Date(job.interview_deadline).getTime()) {
        let cancelled = false;
        if (newUid) cancelled = await cancelBooking(newUid, 'Rescheduled to after the interview deadline.');
        await supabaseAdmin.from('calls').update({ status: 'cancelled' }).eq('id', call.id);
        await notifyBookingIssue({
          orgId: call.org_id,
          entityType: 'application',
          entityId: call.application_id,
          action: 'reschedule_after_deadline',
          message: `A reschedule moved the call to ${newStart}, after the ${job.title} deadline (${job.interview_deadline}). Call cancelled.`,
          details: { scheduled_at: newStart, deadline: job.interview_deadline, booking_uid: newUid, cancelled },
        });
        res.json({ received: true, handled: true, scheduled: false, reason: 'after_deadline', cancelled });
        return;
      }

      await supabaseAdmin
        .from('calls')
        .update({ scheduled_at: new Date(newStart).toISOString(), cal_booking_uid: newUid || call.cal_booking_uid })
        .eq('id', call.id);
      await supabaseAdmin.from('activity_log').insert({
        org_id: call.org_id,
        entity_type: 'call',
        entity_id: call.id,
        action: 'interview_rescheduled',
        details: { scheduled_at: newStart, booking_uid: newUid, booking_source: 'cal.com' },
      });
      logger.info(`Rescheduled call ${call.id} to ${newStart}`);
      res.json({ received: true, handled: true, rescheduled: true, call_id: call.id, scheduled_at: newStart });
      return;
    }

    // ── BOOKING_CANCELLED (WS6) ───────────────────────────────
    if (eventType === 'BOOKING_CANCELLED' || eventType === 'booking.cancelled') {
      const uid: string | null = payload.uid || payload.bookingUid || body.uid || null;
      if (!uid) {
        logger.error('Cal cancel webhook missing booking uid');
        res.json({ received: true, handled: false, error: 'Missing uid' });
        return;
      }

      const { data: call, error } = await supabaseAdmin
        .from('calls')
        .select('id, org_id, status, application_id')
        .eq('cal_booking_uid', uid)
        .maybeSingle();
      if (error) {
        logger.error('Cal cancel: call lookup failed (transient):', error);
        res.status(500).json({ received: false, error: 'Database error' });
        return;
      }
      if (!call) {
        logger.warn(`Cal cancel: no call found for booking ${uid}`);
        res.json({ received: true, handled: false, error: 'No matching call' });
        return;
      }
      // Only cancel a still-pending call; never touch one already dialing/completed.
      if (call.status !== 'scheduled') {
        logger.info(`Cal cancel: call ${call.id} is '${call.status}', leaving as-is`);
        res.json({ received: true, handled: false, reason: `call_${call.status}` });
        return;
      }

      await supabaseAdmin.from('calls').update({ status: 'cancelled' }).eq('id', call.id);
      await supabaseAdmin.from('activity_log').insert({
        org_id: call.org_id,
        entity_type: 'call',
        entity_id: call.id,
        action: 'interview_cancelled',
        details: { booking_uid: uid, booking_source: 'cal.com' },
      });
      logger.info(`Cancelled scheduled call ${call.id} (Cal.com booking ${uid} cancelled)`);
      res.json({ received: true, handled: true, cancelled: true, call_id: call.id });
      return;
    }

    // Anything else: only BOOKING_CREATED proceeds below.
    if (eventType !== 'BOOKING_CREATED' && eventType !== 'booking.created') {
      res.json({ received: true, skipped: true, event: eventType });
      return;
    }

    const metadata = payload.metadata || {};
    const metaApplicationId: string | null = metadata.application_id || null;
    const bookingUid: string | null = payload.uid || payload.bookingUid || body.uid || null;

    const attendees = payload.attendees || [];
    const candidateEmail: string | null =
      attendees[0]?.email?.toLowerCase() || payload.email?.toLowerCase() || null;
    const scheduledStart: string | null = payload.startTime || payload.start_time || null;

    if (!scheduledStart) {
      // Malformed payload — retrying won't help, so acknowledge (200) but log loudly.
      logger.error(`Cal booking webhook missing start time (uid=${bookingUid}, email=${candidateEmail})`);
      res.json({ received: true, scheduled: false, error: 'Missing start time' });
      return;
    }

    // ── Idempotency (WS6) ─────────────────────────────────────
    // Cal.com may deliver the same BOOKING_CREATED more than once. If we've
    // already created a call for this booking uid, ack and do nothing.
    if (bookingUid) {
      const { data: existingCall } = await supabaseAdmin
        .from('calls')
        .select('id, status')
        .eq('cal_booking_uid', bookingUid)
        .maybeSingle();
      if (existingCall) {
        logger.info(`Cal booking ${bookingUid} already processed (call ${existingCall.id}) — duplicate ignored`);
        res.json({ received: true, matched: true, scheduled: true, duplicate: true, call_id: existingCall.id });
        return;
      }
    }

    logger.info(`Cal.com booking: email=${candidateEmail} application_id=${metaApplicationId} at ${scheduledStart}`);

    // ── Resolve the EXACT application (WS3) ───────────────────
    // 1) Authoritative: metadata.application_id carried through the invite link.
    // 2) Fallback: email match → candidate → most-recent active application.
    let application: any = null;
    let candidate: any = null;

    if (metaApplicationId) {
      const { data, error } = await supabaseAdmin
        .from('applications')
        .select(APP_SELECT)
        .eq('id', metaApplicationId)
        .maybeSingle();
      if (error) {
        logger.error('Cal booking: application lookup by id failed (transient):', error);
        res.status(500).json({ received: false, error: 'Database error' }); // let Cal.com retry
        return;
      }
      application = data || null;
      candidate = application?.candidates || null;
    }

    if (!application && candidateEmail) {
      const { data: cand, error: candErr } = await supabaseAdmin
        .from('candidates')
        .select('id, org_id, first_name, last_name, email, phone')
        .eq('email', candidateEmail)
        .limit(1)
        .maybeSingle();
      if (candErr) {
        logger.error('Cal booking: candidate lookup failed (transient):', candErr);
        res.status(500).json({ received: false, error: 'Database error' });
        return;
      }
      candidate = cand || null;
      if (candidate) {
        const { data: app, error: appErr } = await supabaseAdmin
          .from('applications')
          .select(APP_SELECT)
          .eq('candidate_id', candidate.id)
          .in('status', ['shortlisted', 'screening', 'new'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (appErr) {
          logger.error('Cal booking: application lookup by candidate failed (transient):', appErr);
          res.status(500).json({ received: false, error: 'Database error' });
          return;
        }
        application = app || null;
        if (application) candidate = application.candidates || candidate;
      }
    }

    // ── Unmatchable booking (WS7) ─────────────────────────────
    // No org context here, so activity_log can't record it — log loudly and ack
    // (200, since retrying can't create a matching application).
    if (!application || !candidate) {
      logger.error(
        `Cal booking UNMATCHED — no application found (email=${candidateEmail}, ` +
        `application_id=${metaApplicationId}, uid=${bookingUid}). No AI call will be scheduled.`,
      );
      res.json({ received: true, matched: false, scheduled: false, error: 'No matching application' });
      return;
    }

    const orgId: string = candidate.org_id || application.org_id;
    const appJob = application.jobs as any;
    const appAgent = appJob?.ai_agents as any;

    // ── No phone (WS7): loud + recruiter notice, then ack ─────
    if (!candidate.phone) {
      await notifyBookingIssue({
        orgId,
        entityType: 'application',
        entityId: application.id,
        action: 'booking_no_phone',
        message: `${candidate.email} booked an interview but has no phone number — the AI call cannot be placed.`,
        details: { candidate_email: candidate.email, scheduled_at: scheduledStart, booking_uid: bookingUid, job_title: appJob?.title },
      });
      res.json({ received: true, matched: true, scheduled: false, error: 'No phone number' });
      return;
    }

    // ── Deadline backstop (WS4, authoritative) ────────────────
    if (appJob?.interview_deadline) {
      const deadline = new Date(appJob.interview_deadline);
      if (new Date(scheduledStart).getTime() > deadline.getTime()) {
        let cancelled = false;
        if (bookingUid) cancelled = await cancelBooking(bookingUid, 'Booked after the interview deadline for this role.');

        await notifyBookingIssue({
          orgId,
          entityType: 'application',
          entityId: application.id,
          action: 'booking_after_deadline',
          message:
            `${candidate.email} booked ${scheduledStart}, which is after the ${appJob.title} deadline ` +
            `(${deadline.toISOString()}). No call scheduled` +
            (cancelled ? '; the Cal.com booking was cancelled.' : '; Cal.com booking NOT cancelled (CAL_API_KEY missing).'),
          details: { scheduled_at: scheduledStart, deadline: deadline.toISOString(), booking_uid: bookingUid, cancelled },
        });

        // Re-invite if the deadline is still in the future (candidate can pick an earlier slot).
        if (deadline.getTime() > Date.now()) {
          try {
            const { sendInvitationEmail } = await import('../services/email.service');
            await sendInvitationEmail(
              { id: candidate.id, first_name: candidate.first_name, last_name: candidate.last_name, email: candidate.email },
              appJob.title,
              application.id,
              deadline,
              appJob.id,
            );
          } catch (e) {
            logger.error('Cal booking: re-invite after late booking failed:', e);
          }
        }

        res.json({ received: true, matched: true, scheduled: false, reason: 'after_deadline', cancelled });
        return;
      }
    }

    // Don't hard-fail when the job has no agent: initiateOutboundCall falls back
    // to the org's default active agent. Only warn so the fallback can run.
    if (!appAgent?.retell_agent_id) {
      logger.warn(`Cal booking: job has no agent for ${candidate.email}; will use org default agent`);
    }

    // ── Schedule the outbound call for the booked time ────────
    const { initiateOutboundCall } = await import('../services/call.service');
    let call;
    try {
      call = await initiateOutboundCall({
        applicationId: application.id,
        orgId,
        userId: 'system',
        scheduledAt: new Date(scheduledStart).toISOString(),
        calBookingUid: bookingUid || undefined,
      });
    } catch (scheduleErr) {
      // Loud failure (WS7): record + notify, then 500 so Cal.com retries (the
      // cause — e.g. no agent configured — may be fixed before the next retry).
      await notifyBookingIssue({
        orgId,
        entityType: 'application',
        entityId: application.id,
        action: 'booking_schedule_failed',
        message: `Failed to schedule the AI call for ${candidate.email}: ${String(scheduleErr)}`,
        details: { scheduled_at: scheduledStart, booking_uid: bookingUid, job_title: appJob?.title },
      });
      logger.error(`Cal booking: scheduling failed for ${candidate.email}:`, scheduleErr);
      res.status(500).json({ received: false, error: 'Failed to schedule call' });
      return;
    }

    // Update application status to show interview is booked
    await supabaseAdmin
      .from('applications')
      .update({ status: 'screening' })
      .eq('id', application.id);

    // Log activity
    await supabaseAdmin.from('activity_log').insert({
      org_id: orgId,
      entity_type: 'call',
      entity_id: call.id,
      action: 'interview_booked',
      details: {
        candidate_email: candidate.email,
        candidate_name: `${candidate.first_name} ${candidate.last_name}`,
        scheduled_at: scheduledStart,
        job_title: appJob?.title,
        booking_uid: bookingUid,
        matched_by: metaApplicationId ? 'metadata' : 'email',
        booking_source: 'cal.com',
      },
    });

    logger.info(`Auto-scheduled call ${call.id} for ${candidate.email} at ${scheduledStart}`);

    res.json({
      received: true,
      matched: true,
      scheduled: true,
      call_id: call.id,
      scheduled_at: scheduledStart,
    });
  } catch (err) {
    // Transient/internal error — return 5xx so Cal.com retries the delivery.
    logger.error('Cal.com booking webhook error:', err);
    res.status(500).json({ received: false, error: 'Processing failed' });
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
          jobs (id, title, description, skills, ai_agent_id, client_companies (name),
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
          jobs (id, title, description, skills, ai_agent_id, client_companies (name),
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
      job: job ? { ...job, company_name: (job.client_companies as any)?.name } : job,
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

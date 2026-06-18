import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { derivePipelineStage } from '../utils/pipelineStage';
import { logger } from '../utils/logger';
import '../types';

const router = Router();

router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const createApplicationSchema = z.object({
  candidate_id: z.string().uuid(),
  job_id: z.string().uuid(),
  assigned_recruiter_id: z.string().uuid().optional(),
});

const updateApplicationSchema = z.object({
  status: z.enum(['new', 'screening', 'interviewed', 'shortlisted', 'rejected', 'hired']).optional(),
  recruiter_notes: z.string().optional(),
  assigned_recruiter_id: z.string().uuid().nullable().optional(),
});

// ─── GET /api/applications ─────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { job_id, status, recruiter_id, candidate_id, company_id } = req.query;

    // If filtering by company, resolve to matching job IDs first
    let jobIdFilter: string[] | null = null;
    if (company_id) {
      const { data: companyJobs } = await supabaseAdmin
        .from('jobs')
        .select('id')
        .eq('org_id', req.user!.org_id)
        .eq('client_company_id', company_id as string);
      jobIdFilter = (companyJobs ?? []).map((j: any) => j.id);
      if (jobIdFilter.length === 0) {
        return res.json({ success: true, data: [], total: 0, page, limit, totalPages: 0 });
      }
    }

    let query = supabaseAdmin
      .from('applications')
      .select(`
        *,
        candidates (id, first_name, last_name, email, phone),
        jobs (id, title, interview_deadline, client_company_id, status, client_companies (id, name)),
        calls (id, status, disconnection_reason, started_at),
        email_logs (count)
      `, { count: 'exact' })
      .eq('org_id', req.user!.org_id);

    if (jobIdFilter) query = query.in('job_id', jobIdFilter);
    if (job_id) query = query.eq('job_id', job_id);
    if (status) query = query.eq('status', status);
    if (recruiter_id) query = query.eq('assigned_recruiter_id', recruiter_id);
    if (candidate_id) query = query.eq('candidate_id', candidate_id);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch applications');

    const enriched = (data ?? []).map((a: any) => {
      const invitation_sent = (a.email_logs?.[0]?.count ?? 0) > 0;
      const stage = derivePipelineStage({
        status: a.status,
        invitation_sent,
        shortlisted_at: a.shortlisted_at,
        calls: a.calls,
      });
      return { ...a, invitation_sent, ...stage, email_logs: undefined };
    });

    res.json({
      success: true,
      data: enriched,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/applications/:id ─────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('applications')
      .select(`
        *,
        candidates (
          id, first_name, last_name, email, phone, location,
          work_authorization, resume_url, resume_text
        ),
        jobs (
          id, title, description, skills, location, state, country,
          tax_terms, employment_type, status,
          client_companies (id, name),
          ai_agents (id, name)
        )
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !data) throw new AppError(404, 'Application not found');

    // Fetch associated calls with full detail
    const { data: calls } = await supabaseAdmin
      .from('calls')
      .select(`
        id, direction, status, duration_seconds, started_at, ended_at,
        recording_url, transcript, transcript_object, call_analysis, is_resumption,
        call_evaluations (id, decision, rating, notes, evaluated_by, created_at)
      `)
      .eq('application_id', req.params.id)
      .order('created_at', { ascending: false });

    // Fetch email logs for invitation tracking
    const { data: emailLogs } = await supabaseAdmin
      .from('email_logs')
      .select('id, type, status, sent_at')
      .eq('application_id', req.params.id)
      .order('sent_at', { ascending: false });

    const invitation_sent = (emailLogs ?? []).some((e: any) => e.type === 'invitation');
    const stage = derivePipelineStage({
      status: (data as any).status,
      invitation_sent,
      shortlisted_at: (data as any).shortlisted_at,
      calls: calls ?? [],
    });

    res.json({ success: true, data: { ...data, invitation_sent, ...stage, calls: calls ?? [], email_logs: emailLogs ?? [] } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/applications ────────────────────────────────

router.post(
  '/',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createApplicationSchema.parse(req.body);

      // Verify candidate and job belong to org
      const [candResult, jobResult] = await Promise.all([
        supabaseAdmin.from('candidates').select('id').eq('id', body.candidate_id).eq('org_id', req.user!.org_id).single(),
        supabaseAdmin.from('jobs').select('id').eq('id', body.job_id).eq('org_id', req.user!.org_id).single(),
      ]);

      if (!candResult.data) throw new AppError(404, 'Candidate not found');
      if (!jobResult.data) throw new AppError(404, 'Job not found');

      const { data, error } = await supabaseAdmin
        .from('applications')
        .insert({
          ...body,
          org_id: req.user!.org_id,
          assigned_recruiter_id: body.assigned_recruiter_id || req.user!.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError(409, 'Application already exists for this candidate and job');
        }
        throw new AppError(500, 'Failed to create application');
      }

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'application',
        entity_id: data.id,
        action: 'created',
        details: { candidate_id: body.candidate_id, job_id: body.job_id },
      });

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/applications/:id ───────────────────────────

router.patch(
  '/:id',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateApplicationSchema.parse(req.body);

      // Stamp shortlisted_at so the 7-day board auto-archive is exact.
      const updates: Record<string, unknown> = { ...body };
      if (body.status === 'shortlisted') updates.shortlisted_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('applications')
        .update(updates)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(404, 'Application not found');

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'application',
        entity_id: data.id,
        action: 'updated',
        details: body,
      });

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/applications/:id/approve-interview ──────────
// Recruiter approves candidate after AI screening → sends invitation email

router.post(
  '/:id/approve-interview',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data: app, error } = await supabaseAdmin
        .from('applications')
        .select(`
          id, status, ai_screening_score, job_id,
          candidates (id, first_name, last_name, email),
          jobs (id, title, interview_deadline)
        `)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (error || !app) throw new AppError(404, 'Application not found');

      const candidate = (app.candidates as any);
      const job = (app.jobs as any);

      if (!candidate?.email) throw new AppError(400, 'Candidate has no email address');
      if (!job?.title) throw new AppError(400, 'Job information missing');

      // Check if invitation was already sent
      const { data: existingEmail } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('application_id', req.params.id)
        .eq('type', 'invitation')
        .limit(1);

      if (existingEmail && existingEmail.length > 0) {
        throw new AppError(409, 'Invitation email has already been sent for this application');
      }

      // Deadline lives on the JOB. Use the job's deadline; if it has none yet,
      // require one in the body (first invite for this job) and set it on the job.
      const { deadline } = req.body as { deadline?: string };
      let deadlineDate: Date | null = job.interview_deadline ? new Date(job.interview_deadline) : null;

      if (!deadlineDate) {
        if (!deadline) {
          throw new AppError(400, 'An interview deadline must be set for this job before sending invites.');
        }
        deadlineDate = new Date(deadline);
        if (Number.isNaN(deadlineDate.getTime())) {
          throw new AppError(400, 'Invalid interview deadline date.');
        }
        if (deadlineDate.getTime() <= Date.now()) {
          throw new AppError(400, 'Interview deadline must be a future date.');
        }
        await supabaseAdmin
          .from('jobs')
          .update({ interview_deadline: deadlineDate.toISOString() })
          .eq('id', job.id);
      }

      // Mirror the effective deadline onto the application for its own record.
      const { error: mirrorErr } = await supabaseAdmin
        .from('applications')
        .update({ interview_deadline: deadlineDate.toISOString() })
        .eq('id', req.params.id);
      if (mirrorErr) {
        logger.error('approve-interview: failed to mirror deadline to application', mirrorErr);
        throw new AppError(500, 'Failed to record the interview deadline on the application.');
      }

      // Send invitation email (capped to the job deadline)
      const { sendInvitationEmail } = await import('../services/email.service');
      await sendInvitationEmail(
        { id: candidate.id, first_name: candidate.first_name, last_name: candidate.last_name, email: candidate.email },
        job.title,
        req.params.id as string,
        deadlineDate
      );

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'application',
        entity_id: app.id,
        action: 'approved_for_interview',
        details: { candidate_email: candidate.email, job_title: job.title },
      });

      res.json({ success: true, data: { message: 'Invitation email sent successfully' } });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/applications/:id/resend-invitation ─────────
// Resend invitation (for missed calls or candidates who didn't book)

router.post(
  '/:id/resend-invitation',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data: app, error } = await supabaseAdmin
        .from('applications')
        .select(`
          id, job_id, interview_deadline,
          candidates (id, first_name, last_name, email),
          jobs (id, title)
        `)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      // PGRST116 = no rows (genuine 404). Any other error is a real query failure
      // and must surface as 500 instead of being masked as "not found".
      if (error && (error as any).code !== 'PGRST116') {
        logger.error('resend-invitation: application query failed', error);
        throw new AppError(500, 'Failed to load the application.');
      }
      if (!app) throw new AppError(404, 'Application not found');

      const candidate = (app.candidates as any);
      const job = (app.jobs as any);
      if (!candidate?.email) throw new AppError(400, 'Candidate has no email address');

      // A (re)send needs a FUTURE booking deadline (else the Cal link is capped
      // to a past date). Accept an optional new deadline to extend a missed call;
      // otherwise reuse the existing one — but reject if it's missing or expired.
      const { deadline: newDeadline } = req.body as { deadline?: string };
      let deadline = (app as any).interview_deadline ? new Date((app as any).interview_deadline) : null;
      if (newDeadline) {
        const d = new Date(newDeadline);
        if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
          throw new AppError(400, 'Interview deadline must be a future date.');
        }
        deadline = d;
        const { error: appErr } = await supabaseAdmin
          .from('applications')
          .update({ interview_deadline: d.toISOString() })
          .eq('id', app.id);
        if (appErr) {
          logger.error('resend-invitation: failed to update application deadline', appErr);
          throw new AppError(500, 'Failed to update the interview deadline.');
        }
        if (job?.id) {
          const { error: jobErr } = await supabaseAdmin
            .from('jobs')
            .update({ interview_deadline: d.toISOString() })
            .eq('id', job.id);
          if (jobErr) {
            logger.error('resend-invitation: failed to update job deadline', jobErr);
            throw new AppError(500, 'Failed to update the interview deadline.');
          }
        }
      }
      if (!deadline || deadline.getTime() <= Date.now()) {
        throw new AppError(
          400,
          'A future interview deadline is required to resend this invitation. Provide a new deadline to extend it.',
        );
      }

      const { sendInvitationEmail } = await import('../services/email.service');
      await sendInvitationEmail(
        { id: candidate.id, first_name: candidate.first_name, last_name: candidate.last_name, email: candidate.email },
        job.title,
        app.id,
        deadline
      );

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'application',
        entity_id: app.id,
        action: 'approved_for_interview',
        details: { candidate_email: candidate.email, job_title: job.title, resent: true },
      });

      res.json({ success: true, data: { message: 'Invitation resent successfully' } });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/applications/:id/screen ─────────────────────
// Trigger AI screening for an application

router.post(
  '/:id/screen',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Fetch application with candidate resume and job description
      const { data: app, error } = await supabaseAdmin
        .from('applications')
        .select(`
          *,
          candidates (resume_text, first_name, last_name),
          jobs (title, description, skills, state, country, tax_terms)
        `)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (error || !app) throw new AppError(404, 'Application not found');

      const candidates = app.candidates as any;
      const jobs = app.jobs as any;

      if (!candidates?.resume_text) throw new AppError(400, 'Candidate has no resume text. Upload and parse resume first.');

      // Update status to screening
      await supabaseAdmin
        .from('applications')
        .update({ status: 'screening' })
        .eq('id', req.params.id);

      // Import and run screening service (lazy import to avoid circular deps)
      const { screenResume } = await import('../services/screening.service');
      const result = await screenResume({
        resumeText: candidates.resume_text,
        jobTitle: jobs.title,
        jobDescription: jobs.description,
        skills: jobs.skills,
        state: jobs.state,
        country: jobs.country,
        taxTerms: jobs.tax_terms,
      });

      // Update application with screening results
      await supabaseAdmin
        .from('applications')
        .update({
          ai_screening_score: result.overall_fit_rating,
          ai_screening_result: result,
          mandate_questions: result.mandate_questions,
          interview_questions: result.interview_questions,
        })
        .eq('id', req.params.id);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/applications/:id/assign ─────────────────────
// Reassign application to a different recruiter

router.post(
  '/:id/assign',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recruiter_id } = req.body;
      if (!recruiter_id) throw new AppError(400, 'recruiter_id is required');

      // Verify recruiter exists in org
      const { data: recruiter } = await supabaseAdmin
        .from('users')
        .select('id, full_name')
        .eq('id', recruiter_id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (!recruiter) throw new AppError(404, 'Recruiter not found');

      const { data, error } = await supabaseAdmin
        .from('applications')
        .update({ assigned_recruiter_id: recruiter_id })
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(404, 'Application not found');

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'application',
        entity_id: data.id,
        action: 'reassigned',
        details: { recruiter_id, recruiter_name: recruiter.full_name },
      });

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

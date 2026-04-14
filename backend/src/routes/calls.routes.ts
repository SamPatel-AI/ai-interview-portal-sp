import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';
import { initiateOutboundCall, resumeInterruptedCall } from '../services/call.service';
import { validateCallScheduling } from '../services/scheduling.service';

const router = Router();

router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const outboundCallSchema = z.object({
  application_id: z.string().uuid(),
});

const scheduleCallSchema = z.object({
  application_id: z.string().uuid(),
  scheduled_at: z.string().datetime(),
});

const batchCallSchema = z.object({
  application_ids: z.array(z.string().uuid()).min(1).max(50),
  interval_minutes: z.number().int().min(1).max(60).default(5),
});

const evaluationSchema = z.object({
  application_id: z.string().uuid(),
  decision: z.enum(['advance', 'reject', 'callback', 'hold']),
  rating: z.number().int().min(1).max(5),
  notes: z.string().optional(),
});

// ─── GET /api/calls ────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { status, direction, application_id, candidate_id } = req.query;

    let query = supabaseAdmin
      .from('calls')
      .select(`
        *,
        candidates (id, first_name, last_name, email),
        ai_agents (id, name),
        applications (id, jobs (id, title))
      `, { count: 'exact' })
      .eq('org_id', req.user!.org_id);

    if (status) query = query.eq('status', status);
    if (direction) query = query.eq('direction', direction);
    if (application_id) query = query.eq('application_id', application_id);
    if (candidate_id) query = query.eq('candidate_id', candidate_id);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch calls');

    res.json({
      success: true,
      data,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/calls/:id ────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('calls')
      .select(`
        *,
        candidates (id, first_name, last_name, email, phone),
        ai_agents (id, name, client_company_id),
        applications (
          id, status,
          jobs (id, title, client_company_id)
        ),
        call_evaluations (id, decision, rating, notes, evaluated_by, created_at)
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !data) throw new AppError(404, 'Call not found');

    // If this is a resumption, also fetch parent call
    if (data.parent_call_id) {
      const { data: parentCall } = await supabaseAdmin
        .from('calls')
        .select('id, transcript, duration_seconds, started_at, ended_at, status')
        .eq('id', data.parent_call_id)
        .single();

      res.json({ success: true, data: { ...data, parent_call: parentCall } });
    } else {
      // Check for child resumption calls
      const { data: childCalls } = await supabaseAdmin
        .from('calls')
        .select('id, status, duration_seconds, started_at, is_resumption')
        .eq('parent_call_id', req.params.id)
        .order('created_at', { ascending: true });

      res.json({ success: true, data: { ...data, resumption_calls: childCalls ?? [] } });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/calls/outbound ──────────────────────────────

router.post(
  '/outbound',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = outboundCallSchema.parse(req.body);

      const call = await initiateOutboundCall({
        applicationId: body.application_id,
        orgId: req.user!.org_id,
        userId: req.user!.id,
      });

      res.status(201).json({ success: true, data: call });
    } catch (err) {
      next(err instanceof Error ? new AppError(400, err.message) : err);
    }
  }
);

// ─── POST /api/calls/schedule ──────────────────────────────

router.post(
  '/schedule',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = scheduleCallSchema.parse(req.body);

      // Resolve the job for this application to check scheduling restrictions
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('job_id')
        .eq('id', body.application_id)
        .eq('org_id', req.user!.org_id)
        .single();

      // Validate against scheduling restrictions
      await validateCallScheduling(body.scheduled_at, req.user!.org_id, app?.job_id);

      const call = await initiateOutboundCall({
        applicationId: body.application_id,
        orgId: req.user!.org_id,
        userId: req.user!.id,
        scheduledAt: body.scheduled_at,
      });

      res.status(201).json({ success: true, data: call });
    } catch (err) {
      next(err instanceof Error ? new AppError(400, err.message) : err);
    }
  }
);

// ─── POST /api/calls/batch ─────────────────────────────────

router.post(
  '/batch',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = batchCallSchema.parse(req.body);

      const results: Array<{ application_id: string; call_id?: string; error?: string }> = [];
      const now = new Date();

      for (let i = 0; i < body.application_ids.length; i++) {
        const scheduledAt = new Date(now.getTime() + i * body.interval_minutes * 60 * 1000);

        try {
          const call = await initiateOutboundCall({
            applicationId: body.application_ids[i],
            orgId: req.user!.org_id,
            userId: req.user!.id,
            scheduledAt: i === 0 ? undefined : scheduledAt.toISOString(),
          });

          results.push({ application_id: body.application_ids[i], call_id: call.id });
        } catch (err) {
          results.push({
            application_id: body.application_ids[i],
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      res.status(201).json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/calls/:id/retry ─────────────────────────────

router.post(
  '/:id/retry',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const call = await resumeInterruptedCall(
        req.params.id as string,
        req.user!.org_id,
        req.user!.id
      );

      res.status(201).json({ success: true, data: call });
    } catch (err) {
      next(err instanceof Error ? new AppError(400, err.message) : err);
    }
  }
);

// ─── POST /api/calls/auto-queue ────────────────────────────
// Auto-schedule calls for top uninterviewed candidates by priority score

router.post(
  '/auto-queue',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const maxCalls = Math.min(20, Math.max(1, parseInt(req.body.max_calls) || 10));
      const intervalMinutes = Math.min(60, Math.max(1, parseInt(req.body.interval_minutes) || 5));
      const orgId = req.user!.org_id;

      // Priority weight mapping
      const priorityWeight: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };

      // Get screened applications that haven't been called yet
      const { data: applications } = await supabaseAdmin
        .from('applications')
        .select(`
          id, ai_screening_score, job_id,
          jobs (priority, ai_agent_id, title)
        `)
        .eq('org_id', orgId)
        .in('status', ['new', 'screening'])
        .not('ai_screening_score', 'is', null)
        .order('ai_screening_score', { ascending: false })
        .limit(100);

      if (!applications?.length) {
        return res.json({ success: true, data: { queued: 0, message: 'No eligible candidates found' } });
      }

      // Filter out those that already have scheduled/in_progress/completed calls
      const appIds = applications.map(a => a.id);
      const { data: existingCalls } = await supabaseAdmin
        .from('calls')
        .select('application_id')
        .in('application_id', appIds)
        .in('status', ['scheduled', 'in_progress', 'completed']);

      const calledAppIds = new Set((existingCalls || []).map(c => c.application_id));
      const eligible = applications.filter(a => !calledAppIds.has(a.id));

      // Score and sort by priority * screening score
      const scored = eligible.map(a => {
        const jobPriority = (a.jobs as any)?.priority || 'normal';
        const pWeight = priorityWeight[jobPriority] || 2;
        const score = (a.ai_screening_score || 0) * 0.6 + pWeight * 2.5 * 0.4;
        return { ...a, priority_score: score };
      }).sort((a, b) => b.priority_score - a.priority_score).slice(0, maxCalls);

      // Schedule calls with intervals
      const results: Array<{ application_id: string; call_id?: string; error?: string }> = [];
      const now = new Date();

      for (let i = 0; i < scored.length; i++) {
        const app = scored[i];
        if (!(app.jobs as any)?.ai_agent_id) {
          results.push({ application_id: app.id, error: 'No AI agent assigned to job' });
          continue;
        }

        const scheduledAt = i === 0 ? undefined : new Date(now.getTime() + i * intervalMinutes * 60 * 1000).toISOString();

        try {
          const call = await initiateOutboundCall({
            applicationId: app.id,
            orgId,
            userId: req.user!.id,
            scheduledAt,
          });
          results.push({ application_id: app.id, call_id: call.id });
        } catch (err) {
          results.push({ application_id: app.id, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      res.status(201).json({
        success: true,
        data: {
          queued: results.filter(r => r.call_id).length,
          failed: results.filter(r => r.error).length,
          details: results,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/calls/:id/evaluate ──────────────────────────

router.post(
  '/:id/evaluate',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = evaluationSchema.parse(req.body);

      // Verify call belongs to org
      const { data: call, error: callErr } = await supabaseAdmin
        .from('calls')
        .select('id, application_id')
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (callErr || !call) throw new AppError(404, 'Call not found');

      const { data, error } = await supabaseAdmin
        .from('call_evaluations')
        .insert({
          call_id: req.params.id,
          application_id: body.application_id,
          evaluated_by: req.user!.id,
          decision: body.decision,
          rating: body.rating,
          notes: body.notes,
        })
        .select()
        .single();

      if (error) throw new AppError(500, 'Failed to save evaluation');

      // Update application status based on decision
      const statusMap: Record<string, string> = {
        advance: 'shortlisted',
        reject: 'rejected',
        callback: 'screening',
        hold: 'screening',
      };

      await supabaseAdmin
        .from('applications')
        .update({ status: statusMap[body.decision] || 'screening' })
        .eq('id', body.application_id);

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'call_evaluation',
        entity_id: data.id,
        action: 'evaluated',
        details: { decision: body.decision, rating: body.rating },
      });

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

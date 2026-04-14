import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';
import { syncCeipalJobs } from '../services/ceipal.service';

const router = Router();

router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  client_company_id: z.string().uuid().optional(),
  skills: z.array(z.string()).default([]),
  location: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  tax_terms: z.string().optional(),
  employment_type: z.enum(['full_time', 'contract', 'c2c', 'w2']).default('full_time'),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).default('normal'),
  ai_agent_id: z.string().uuid().optional(),
  assigned_recruiter_id: z.string().uuid().optional(),
});

const updateJobSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
  skills: z.array(z.string()).optional(),
  location: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  tax_terms: z.string().optional(),
  employment_type: z.enum(['full_time', 'contract', 'c2c', 'w2']).optional(),
  status: z.enum(['open', 'closed', 'on_hold', 'filled']).optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
  ai_agent_id: z.string().uuid().nullable().optional(),
  assigned_recruiter_id: z.string().uuid().nullable().optional(),
});

// ─── GET /api/jobs ─────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { status, company_id, search, recruiter_id } = req.query;

    let query = supabaseAdmin
      .from('jobs')
      .select(`
        *,
        client_companies (id, name),
        ai_agents (id, name),
        users!jobs_assigned_recruiter_id_fkey (id, full_name)
      `, { count: 'exact' })
      .eq('org_id', req.user!.org_id);

    if (status) query = query.eq('status', status);
    if (company_id) query = query.eq('client_company_id', company_id);
    if (recruiter_id) query = query.eq('assigned_recruiter_id', recruiter_id);
    if (search) query = query.or(`title.ilike.%${search}%,ceipal_job_id.ilike.%${search}%`);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch jobs');

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

// ─── GET /api/jobs/:id ─────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select(`
        *,
        client_companies (id, name),
        ai_agents (id, name, voice_id, interview_style),
        users!jobs_assigned_recruiter_id_fkey (id, full_name, email),
        applications (
          id, status, ai_screening_score, created_at,
          candidates (id, first_name, last_name, email)
        )
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !data) throw new AppError(404, 'Job not found');

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/jobs ────────────────────────────────────────

router.post(
  '/',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createJobSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('jobs')
        .insert({
          ...body,
          org_id: req.user!.org_id,
        })
        .select()
        .single();

      if (error) throw new AppError(500, 'Failed to create job');

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'job',
        entity_id: data.id,
        action: 'created',
        details: { title: body.title },
      });

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/jobs/:id ───────────────────────────────────

router.patch(
  '/:id',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateJobSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('jobs')
        .update(body)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(404, 'Job not found');

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/jobs/sync-ceipal ────────────────────────────

router.post(
  '/sync-ceipal',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { client_company_id } = req.body;

      const result = await syncCeipalJobs(req.user!.org_id, client_company_id);

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'job',
        entity_id: req.user!.org_id,
        action: 'ceipal_sync',
        details: result,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err instanceof Error ? new AppError(500, `CEIPAL sync failed: ${err.message}`) : err);
    }
  }
);

// ─── GET /api/jobs/:id/stages ──────────────────────────────

router.get('/:id/stages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('interview_stages')
      .select('*, ai_agents (id, name, interview_style)')
      .eq('job_id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .order('stage_number', { ascending: true });

    if (error) throw new AppError(500, 'Failed to fetch interview stages');

    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/jobs/:id/stages ─────────────────────────────

router.post(
  '/:id/stages',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stageSchema = z.object({
        name: z.string().min(1),
        stage_number: z.number().int().min(1),
        ai_agent_id: z.string().uuid().optional(),
        evaluation_criteria: z.record(z.unknown()).default({}),
        is_eliminatory: z.boolean().default(true),
      });

      const body = stageSchema.parse(req.body);

      // Verify job belongs to org
      const { data: job } = await supabaseAdmin
        .from('jobs')
        .select('id')
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (!job) throw new AppError(404, 'Job not found');

      const { data, error } = await supabaseAdmin
        .from('interview_stages')
        .insert({
          ...body,
          job_id: req.params.id,
          org_id: req.user!.org_id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') throw new AppError(409, 'Stage number already exists for this job');
        throw new AppError(500, 'Failed to create stage');
      }

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/jobs/:id/stages/:stageId ───────────────────

router.patch(
  '/:id/stages/:stageId',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updateStageSchema = z.object({
        name: z.string().min(1).optional(),
        stage_number: z.number().int().min(1).optional(),
        ai_agent_id: z.string().uuid().nullable().optional(),
        evaluation_criteria: z.record(z.unknown()).optional(),
        is_eliminatory: z.boolean().optional(),
      });

      const body = updateStageSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('interview_stages')
        .update(body)
        .eq('id', req.params.stageId)
        .eq('job_id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(404, 'Stage not found');

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/jobs/:id/stages/:stageId ──────────────────

router.delete(
  '/:id/stages/:stageId',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error } = await supabaseAdmin
        .from('interview_stages')
        .delete()
        .eq('id', req.params.stageId)
        .eq('job_id', req.params.id)
        .eq('org_id', req.user!.org_id);

      if (error) throw new AppError(500, 'Failed to delete stage');

      res.json({ success: true, data: { message: 'Stage deleted' } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

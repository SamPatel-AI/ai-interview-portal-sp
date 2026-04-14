import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

// All company routes require authentication
router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const createCompanySchema = z.object({
  name: z.string().min(1),
  logo_url: z.string().url().optional(),
  description: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

const updateCompanySchema = createCompanySchema.partial();

// ─── GET /api/companies ────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from('client_companies')
      .select('*, jobs (id), ai_agents (id)', { count: 'exact' })
      .eq('org_id', req.user!.org_id)
      .order('name');

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch companies');

    // Add jobs_count and agents_count for the frontend
    const enriched = (data ?? []).map(({ jobs, ai_agents, ...company }) => ({
      ...company,
      jobs_count: Array.isArray(jobs) ? jobs.length : 0,
      agents_count: Array.isArray(ai_agents) ? ai_agents.length : 0,
    }));

    res.json({ success: true, data: enriched, total: count });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/companies/:id ────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_companies')
      .select(`
        *,
        ai_agents (id, name, is_active, interview_style, voice_id),
        jobs (
          id, ceipal_job_id, title, description, skills, location, state, country,
          tax_terms, employment_type, status, created_at,
          ai_agents (id, name),
          users!jobs_assigned_recruiter_id_fkey (id, full_name),
          applications (id)
        )
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !data) throw new AppError(404, 'Company not found');

    // Enrich jobs with applications_count
    if (data.jobs && Array.isArray(data.jobs)) {
      data.jobs = data.jobs.map(({ applications, ...job }: any) => ({
        ...job,
        applications_count: Array.isArray(applications) ? applications.length : 0,
      }));
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/companies ───────────────────────────────────

router.post(
  '/',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createCompanySchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('client_companies')
        .insert({
          ...body,
          org_id: req.user!.org_id,
        })
        .select()
        .single();

      if (error) throw new AppError(500, 'Failed to create company');

      // Log activity
      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'client_company',
        entity_id: data.id,
        action: 'created',
        details: { name: body.name },
      });

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/companies/:id ──────────────────────────────

router.patch(
  '/:id',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateCompanySchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('client_companies')
        .update(body)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(404, 'Company not found');

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/companies/:id ─────────────────────────────

router.delete(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error } = await supabaseAdmin
        .from('client_companies')
        .delete()
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id);

      if (error) throw new AppError(500, 'Failed to delete company');

      res.json({ success: true, message: 'Company deleted' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

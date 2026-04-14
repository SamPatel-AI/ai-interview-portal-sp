import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

// ─── Client user management (admin endpoints) ─────────────

router.use(authenticate);

// ─── GET /api/client-portal/users ──────────────────────────
// List client users for companies in this org

router.get(
  '/users',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { company_id } = req.query;

      // Get all companies for this org
      const { data: companies } = await supabaseAdmin
        .from('client_companies')
        .select('id')
        .eq('org_id', req.user!.org_id);

      const companyIds = (companies || []).map(c => c.id);
      if (companyIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      let query = supabaseAdmin
        .from('client_users')
        .select('*, client_companies (id, name)')
        .in('client_company_id', companyIds);

      if (company_id) query = query.eq('client_company_id', company_id);

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) throw new AppError(500, 'Failed to fetch client users');

      res.json({ success: true, data: data || [] });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/client-portal/users ─────────────────────────
// Create a client user

router.post(
  '/users',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        client_company_id: z.string().uuid(),
        email: z.string().email(),
        name: z.string().min(1),
      });
      const body = schema.parse(req.body);

      // Verify company belongs to this org
      const { data: company } = await supabaseAdmin
        .from('client_companies')
        .select('id')
        .eq('id', body.client_company_id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (!company) throw new AppError(404, 'Company not found');

      const { data, error } = await supabaseAdmin
        .from('client_users')
        .insert(body)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') throw new AppError(409, 'Client user already exists for this company');
        throw new AppError(500, 'Failed to create client user');
      }

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/client-portal/pipeline ───────────────────────
// View pipeline for a specific company's jobs

router.get(
  '/pipeline',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { company_id } = req.query;
      if (!company_id) throw new AppError(400, 'company_id required');

      // Verify company belongs to this org
      const { data: company } = await supabaseAdmin
        .from('client_companies')
        .select('id, name')
        .eq('id', company_id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (!company) throw new AppError(404, 'Company not found');

      // Get jobs for this company
      const { data: jobs } = await supabaseAdmin
        .from('jobs')
        .select('id, title, status')
        .eq('client_company_id', company_id)
        .eq('org_id', req.user!.org_id);

      // Get applications for these jobs
      const jobIds = (jobs || []).map(j => j.id);
      const { data: applications } = await supabaseAdmin
        .from('applications')
        .select(`
          id, status, ai_screening_score, created_at,
          candidates (first_name, last_name),
          jobs (title)
        `)
        .in('job_id', jobIds.length > 0 ? jobIds : ['_none_'])
        .eq('org_id', req.user!.org_id)
        .order('created_at', { ascending: false });

      // Build pipeline stats
      const statusCounts: Record<string, number> = {};
      for (const app of applications || []) {
        statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
      }

      res.json({
        success: true,
        data: {
          company,
          jobs: jobs || [],
          applications: applications || [],
          pipeline: statusCounts,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/client-portal/feedback ──────────────────────
// Client provides feedback on a candidate

router.post(
  '/feedback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        application_id: z.string().uuid(),
        feedback: z.string().min(1),
        decision: z.enum(['interested', 'not_interested', 'need_more_info']).optional(),
      });
      const body = schema.parse(req.body);

      // Verify application belongs to this org
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('id, recruiter_notes')
        .eq('id', body.application_id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (!app) throw new AppError(404, 'Application not found');

      // Append client feedback to recruiter notes
      const existingNotes = app.recruiter_notes || '';
      const clientNote = `\n\n--- Client Feedback (${new Date().toLocaleDateString()}) ---\n${body.feedback}${body.decision ? `\nDecision: ${body.decision}` : ''}`;

      await supabaseAdmin
        .from('applications')
        .update({ recruiter_notes: existingNotes + clientNote })
        .eq('id', body.application_id);

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'application',
        entity_id: body.application_id,
        action: 'client_feedback',
        details: { decision: body.decision },
      });

      res.json({ success: true, data: { message: 'Feedback recorded' } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

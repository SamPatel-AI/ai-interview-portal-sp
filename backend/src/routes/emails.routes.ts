import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

router.use(authenticate);

// ─── GET /api/emails ───────────────────────────────────────
// List email logs with filters: candidate_id, application_id, type, status

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { candidate_id, application_id, type, status, search } = req.query;

    // email_logs has no org_id — scope through the candidate with an INNER
    // join AT THE QUERY LEVEL (candidate_id is NOT NULL, so every email has
    // one). The old version paginated across ALL orgs and filtered in JS
    // afterwards: totals counted other orgs' emails and pages could come back
    // empty — a wrong-numbers bug and a cross-org count leak in one.
    let query = supabaseAdmin
      .from('email_logs')
      .select(`
        *,
        candidates!inner (id, first_name, last_name, email, org_id),
        applications (id, jobs (id, title))
      `, { count: 'exact' })
      .eq('candidates.org_id', req.user!.org_id);

    if (candidate_id) query = query.eq('candidate_id', candidate_id);
    if (application_id) query = query.eq('application_id', application_id);
    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);

    query = query.order('sent_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch email logs');

    // Search filters the current page on candidate name or subject (kept in
    // JS: PostgREST can't OR a base-table column against a joined column).
    let filtered = data || [];
    if (search) {
      const s = (search as string).toLowerCase();
      filtered = filtered.filter((e: any) => {
        const name = `${e.candidates?.first_name || ''} ${e.candidates?.last_name || ''}`.toLowerCase();
        return name.includes(s) || e.subject?.toLowerCase().includes(s);
      });
    }

    res.json({
      success: true,
      data: filtered,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/emails/:id ──────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('email_logs')
      .select(`
        *,
        candidates (id, first_name, last_name, email, org_id),
        applications (id, status, jobs (id, title))
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) throw new AppError(404, 'Email not found');

    // Verify org access
    if ((data as any).candidates?.org_id !== req.user!.org_id) {
      throw new AppError(404, 'Email not found');
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;

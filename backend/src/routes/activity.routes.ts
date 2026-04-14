import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

router.use(authenticate);

// ─── GET /api/activity ─────────────────────────────────────
// List activity logs with filters: user_id, entity_type, action, from, to

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
    const offset = (page - 1) * limit;
    const { user_id, entity_type, action, from, to } = req.query;

    let query = supabaseAdmin
      .from('activity_log')
      .select(`
        *,
        users (id, full_name, email, avatar_url)
      `, { count: 'exact' })
      .eq('org_id', req.user!.org_id);

    if (user_id) query = query.eq('user_id', user_id);
    if (entity_type) query = query.eq('entity_type', entity_type);
    if (action) query = query.eq('action', action);
    if (from) query = query.gte('created_at', from as string);
    if (to) query = query.lte('created_at', to as string);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch activity logs');

    res.json({
      success: true,
      data: data || [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/activity/filters ─────────────────────────────
// Get distinct entity types, actions, and users for filter dropdowns

router.get('/filters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [entityTypesRes, actionsRes, usersRes] = await Promise.all([
      supabaseAdmin
        .from('activity_log')
        .select('entity_type')
        .eq('org_id', req.user!.org_id)
        .limit(100),
      supabaseAdmin
        .from('activity_log')
        .select('action')
        .eq('org_id', req.user!.org_id)
        .limit(100),
      supabaseAdmin
        .from('users')
        .select('id, full_name')
        .eq('org_id', req.user!.org_id)
        .eq('is_active', true),
    ]);

    const entityTypes = [...new Set((entityTypesRes.data || []).map((r: any) => r.entity_type))];
    const actions = [...new Set((actionsRes.data || []).map((r: any) => r.action))];

    res.json({
      success: true,
      data: {
        entity_types: entityTypes,
        actions,
        users: usersRes.data || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

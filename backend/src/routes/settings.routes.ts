import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const schedulingConfigSchema = z.object({
  business_hours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
    timezone: z.string().min(1),
    days: z.array(z.number().min(0).max(6)),
  }).optional(),
  blackout_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  custom_windows: z.array(z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  })).optional(),
});

// ─── GET /api/settings/scheduling ──────────────────────────

router.get(
  '/scheduling',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('organizations')
        .select('scheduling_config')
        .eq('id', req.user!.org_id)
        .single();

      if (error) throw new AppError(500, 'Failed to fetch scheduling config');

      res.json({ success: true, data: data?.scheduling_config || {} });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/settings/scheduling ────────────────────────

router.patch(
  '/scheduling',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = schedulingConfigSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('organizations')
        .update({ scheduling_config: config })
        .eq('id', req.user!.org_id)
        .select('scheduling_config')
        .single();

      if (error) throw new AppError(500, 'Failed to update scheduling config');

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'organization',
        entity_id: req.user!.org_id,
        action: 'updated_scheduling_config',
        details: config,
      });

      res.json({ success: true, data: data?.scheduling_config });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

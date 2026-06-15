import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import { launchCampaign } from '../services/reengagement.service';

const router = Router();

router.use(authenticate);
router.use(requireRole('admin', 'recruiter'));

// POST /api/reengagement/trigger — manually trigger re-engagement for a job
router.post('/trigger', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const schema = z.object({ job_id: z.string().uuid() });
    const { job_id } = schema.parse(req.body);

    const campaignId = await launchCampaign(req.user!.org_id, job_id);

    res.json({ success: true, campaign_id: campaignId });
  } catch (err: any) {
    logger.error('Re-engagement trigger error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/reengagement/campaigns — list campaigns for org
router.get('/campaigns', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { data: campaigns, error, count } = await supabaseAdmin
      .from('reengagement_campaigns')
      .select('*, jobs(title)', { count: 'exact' })
      .eq('org_id', req.user!.org_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const enriched = (campaigns ?? []).map((c: any) => ({
      ...c,
      job_title: c.jobs?.title ?? null,
      jobs: undefined,
    }));

    res.json({
      success: true,
      data: enriched,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err: any) {
    logger.error('List campaigns error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reengagement/campaigns/:id — campaign detail with candidates
router.get('/campaigns/:id', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { data: campaign, error } = await supabaseAdmin
      .from('reengagement_campaigns')
      .select('*, jobs(title, description)')
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !campaign) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }

    // Fetch candidates for this campaign
    const { data: candidates } = await supabaseAdmin
      .from('reengagement_candidates')
      .select('*, candidates(first_name, last_name, email)')
      .eq('campaign_id', campaign.id)
      .order('fit_score', { ascending: false });

    const enrichedCandidates = (candidates ?? []).map((c: any) => ({
      ...c,
      candidate_name: c.candidates
        ? `${c.candidates.first_name} ${c.candidates.last_name}`
        : null,
      candidates: undefined,
    }));

    res.json({
      success: true,
      data: {
        campaign: {
          ...(campaign as any),
          job_title: (campaign as any).jobs?.title ?? null,
          jobs: undefined,
        },
        candidates: enrichedCandidates,
      },
    });
  } catch (err: any) {
    logger.error('Campaign detail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

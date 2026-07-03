import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import { createCampaign } from '../services/reengagement.service';
import { reengagementQueue } from '../jobs/reengagement.job';
import { verifyOptOutToken } from '../utils/optOut';

const router = Router();

// ─── GET /api/reengagement/opt-out — PUBLIC unsubscribe ────
// Clicked from a re-engagement email, so it must work with no login. The
// HMAC token (utils/optOut.ts) proves the link came from an email we sent
// for exactly this candidate. Mounted BEFORE the authenticate middleware.
router.get('/opt-out', async (req: Request, res: Response, _next: NextFunction) => {
  const { c: candidateId, t: token } = req.query as { c?: string; t?: string };

  const page = (title: string, message: string) =>
    `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222">
      <h2>${title}</h2><p>${message}</p></body></html>`;

  if (!candidateId || !token || !verifyOptOutToken(candidateId, token)) {
    res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid or incomplete.'));
    return;
  }

  const { data: candidate, error } = await supabaseAdmin
    .from('candidates')
    .update({ reengagement_opted_out: true })
    .eq('id', candidateId)
    .select('id, org_id')
    .single();

  if (error || !candidate) {
    res.status(404).send(page('Not found', 'We could not find your record. You may already have been removed.'));
    return;
  }

  await supabaseAdmin.from('activity_log').insert({
    org_id: candidate.org_id,
    entity_type: 'candidate',
    entity_id: candidate.id,
    action: 'reengagement_opted_out',
    details: { via: 'email_unsubscribe_link' },
  });

  logger.info(`Candidate ${candidateId} opted out of re-engagement via email link`);
  res.send(page("You're unsubscribed", 'You will no longer receive job re-engagement emails from us.'));
});

router.use(authenticate);
router.use(requireRole('admin', 'recruiter'));

// POST /api/reengagement/trigger — manually trigger re-engagement for a job.
// Creates the campaign row (visible immediately as 'pending') and enqueues the
// heavy pipeline — FTS matching, throttled AI scoring, rate-limited emails —
// to the worker instead of running it inside the HTTP request.
router.post('/trigger', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const schema = z.object({ job_id: z.string().uuid() });
    const { job_id } = schema.parse(req.body);

    const campaignId = await createCampaign(req.user!.org_id, job_id);
    await reengagementQueue.add(
      `reengagement-manual-${campaignId}`,
      { campaignId, orgId: req.user!.org_id, jobId: job_id },
      { jobId: `reengagement-manual-${campaignId}` },
    );

    res.status(202).json({ success: true, campaign_id: campaignId });
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

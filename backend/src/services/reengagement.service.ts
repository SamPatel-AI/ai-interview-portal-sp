import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';
import { batchScreenResumesLite } from './screening-lite.service';
import { queueEmail } from '../jobs/emailSender.job';

// Only jobs the client has touched this recently count as re-engageable.
// CEIPAL leaves years-old reqs marked "Active", so status=open alone matches
// ~1.7k historical jobs — recency (ceipal_modified_at, or created_at for
// portal-created jobs) is what separates a live req from an abandoned one.
const ACTIVE_JOB_WINDOW_DAYS = 30;

/**
 * Find recently-active open jobs with zero applications in the last N days.
 * These are "stale" jobs that need candidate re-engagement.
 */
export async function findStaleJobs(orgId: string, staleDays: number = 3) {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  const activeCutoff = new Date(
    Date.now() - ACTIVE_JOB_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Get open jobs still active within the window
  const { data: openJobs, error } = await supabaseAdmin
    .from('jobs')
    .select('id, title, description, skills, client_company_id')
    .eq('org_id', orgId)
    .eq('status', 'open')
    .or(`ceipal_modified_at.gte.${activeCutoff},and(ceipal_modified_at.is.null,created_at.gte.${activeCutoff})`);

  if (error || !openJobs?.length) return [];

  // Filter to those with no recent applications
  const staleJobs = [];
  for (const job of openJobs) {
    const { count } = await supabaseAdmin
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .gte('created_at', cutoff);

    if ((count || 0) === 0) {
      staleJobs.push(job);
    }
  }

  return staleJobs;
}

/**
 * Pre-filter candidates using PostgreSQL full-text search on resume_tsv.
 * Returns candidates whose resumes match the job keywords, excluding:
 * - Candidates who already applied for this job
 * - Candidates who opted out of re-engagement
 * Cost: $0 (pure PostgreSQL)
 */
export async function preFilterCandidates(
  orgId: string,
  job: { id: string; title: string; skills: string[] }
) {
  const searchTerms = [job.title, ...(job.skills || [])].join(' ');

  // Use RPC or raw query for full-text search with ts_rank
  const { data, error } = await supabaseAdmin
    .rpc('search_candidates_for_reengagement', {
      p_org_id: orgId,
      p_job_id: job.id,
      p_search_terms: searchTerms,
      p_limit: 100,
    });

  if (error) {
    // Fallback: simple keyword search if RPC doesn't exist yet
    logger.warn('RPC not available, falling back to basic search:', error.message);
    const { data: fallback } = await supabaseAdmin
      .from('candidates')
      .select('id, first_name, last_name, email, resume_text')
      .eq('org_id', orgId)
      .eq('reengagement_opted_out', false)
      .not('resume_text', 'is', null)
      .limit(100);

    // Filter out candidates who already applied for this job
    if (!fallback?.length) return [];

    const { data: existingApps } = await supabaseAdmin
      .from('applications')
      .select('candidate_id')
      .eq('job_id', job.id);

    const appliedIds = new Set((existingApps || []).map(a => a.candidate_id));
    return fallback.filter(c => !appliedIds.has(c.id));
  }

  return data || [];
}

/**
 * Create the campaign row only (status 'pending'). Cheap — safe to call in an
 * HTTP handler so the caller gets a campaign_id immediately; the heavy
 * pipeline runs in the worker via launchCampaign(existingCampaignId).
 */
export async function createCampaign(
  orgId: string,
  jobId: string,
  config: Record<string, unknown> = {},
): Promise<string> {
  // Org-scoped job check — jobId comes from the request body, and without
  // this a recruiter could launch a campaign against another org's job.
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();
  if (jobErr || !job) throw new Error(`Job ${jobId} not found`);

  const { data: campaign, error } = await supabaseAdmin
    .from('reengagement_campaigns')
    .insert({ org_id: orgId, job_id: jobId, status: 'pending', config })
    .select('id')
    .single();
  if (error || !campaign) throw new Error(`Failed to create campaign: ${error?.message}`);
  return campaign.id;
}

/**
 * Launch a re-engagement campaign for a specific job.
 * 1. Creates campaign record (unless existingCampaignId is passed)
 * 2. Pre-filters candidates via FTS
 * 3. Scores them with lite AI screening
 * 4. Emails high-scorers (fit_score >= 6)
 */
export async function launchCampaign(
  orgId: string,
  jobId: string,
  config: Record<string, unknown> = {},
  existingCampaignId?: string,
) {
  // Get job details (org-scoped — jobId may originate from user input)
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id, title, description, skills, client_company_id, client_companies(name)')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();

  if (jobErr || !job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const companyName = (job.client_companies as any)?.name || 'our company';

  // 1. Create (or adopt) the campaign row
  let campaignId: string;
  if (existingCampaignId) {
    campaignId = existingCampaignId;
    await supabaseAdmin
      .from('reengagement_campaigns')
      .update({ status: 'matching' })
      .eq('id', campaignId);
  } else {
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('reengagement_campaigns')
      .insert({
        org_id: orgId,
        job_id: jobId,
        status: 'matching',
        config,
      })
      .select('id')
      .single();

    if (campErr || !campaign) {
      throw new Error(`Failed to create campaign: ${campErr?.message}`);
    }
    campaignId = campaign.id;
  }
  const campaign = { id: campaignId };

  try {
    // 2. Pre-filter candidates via FTS
    const candidates = await preFilterCandidates(orgId, {
      id: jobId,
      title: job.title,
      skills: job.skills || [],
    });

    await supabaseAdmin
      .from('reengagement_campaigns')
      .update({ candidates_matched: candidates.length })
      .eq('id', campaign.id);

    if (!candidates.length) {
      await supabaseAdmin
        .from('reengagement_campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', campaign.id);
      logger.info(`Campaign ${campaign.id}: no matching candidates found`);
      return campaign.id;
    }

    // 3. Lite AI scoring
    const withResumes = candidates.filter((c: any) => c.resume_text);
    const scores = await batchScreenResumesLite(
      withResumes.map((c: any) => ({ id: c.id, resume_text: c.resume_text })),
      job.title,
      job.skills || []
    );

    // Insert scored candidates
    const scoreMap = new Map(scores.map(s => [s.candidateId, s]));
    for (const c of candidates as Array<{ id: string; resume_text: string; email: string }>) {
      const score = scoreMap.get(c.id);
      await supabaseAdmin
        .from('reengagement_candidates')
        .insert({
          campaign_id: campaign.id,
          candidate_id: c.id,
          fit_score: score?.fit_score ?? 0,
          fit_justification: score?.justification || 'No resume available for scoring',
        });
    }

    // 4. Email high scorers
    await supabaseAdmin
      .from('reengagement_campaigns')
      .update({ status: 'emailing' })
      .eq('id', campaign.id);

    let emailed = 0;
    for (const c of candidates as Array<{ id: string; resume_text: string; email: string }>) {
      const score = scoreMap.get(c.id);
      if (score && score.fit_score >= 6) {
        await queueEmail({
          type: 're_engagement',
          candidateId: c.id,
          applicationId: '', // No application yet
          jobTitle: job.title,
          companyName,
          jobDescription: job.description || '',
        });

        await supabaseAdmin
          .from('reengagement_candidates')
          .update({ email_sent: true })
          .eq('campaign_id', campaign.id)
          .eq('candidate_id', c.id);

        emailed++;
      }
    }

    // 5. Complete campaign
    await supabaseAdmin
      .from('reengagement_campaigns')
      .update({
        status: 'completed',
        candidates_emailed: emailed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);

    logger.info(`Campaign ${campaign.id}: matched ${candidates.length}, emailed ${emailed}`);
    return campaign.id;
  } catch (err) {
    await supabaseAdmin
      .from('reengagement_campaigns')
      .update({ status: 'failed' })
      .eq('id', campaign.id);
    logger.error(`Campaign ${campaign.id} failed:`, err);
    throw err;
  }
}

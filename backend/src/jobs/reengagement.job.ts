import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { env } from '../config/env';
import { findStaleJobs, launchCampaign } from '../services/reengagement.service';
import { logger } from '../utils/logger';

// Don't relaunch a campaign for a job that had one (any status) this recently.
const CAMPAIGN_COOLDOWN_DAYS = 7;

// ─── Queue Definition ──────────────────────────────────────

export const reengagementQueue = new Queue('reengagement-checker', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const reengagementWorker = new Worker(
  'reengagement-checker',
  async () => {
    logger.info('Running re-engagement check...');

    // Get all organizations
    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name');

    if (error || !orgs?.length) {
      logger.info('No organizations found for re-engagement check');
      return;
    }

    for (const org of orgs) {
      try {
        const staleJobs = await findStaleJobs(org.id);

        if (!staleJobs.length) {
          logger.info(`Org ${org.name}: no stale jobs found`);
          continue;
        }

        logger.info(`Org ${org.name}: found ${staleJobs.length} stale jobs, launching campaigns`);

        for (const staleJob of staleJobs) {
          // Cooldown: skip if ANY campaign (whatever its status) ran for this
          // job recently. Checking only in-progress statuses let completed
          // campaigns relaunch every sweep — with ~1.7k CEIPAL "open" jobs
          // that minted thousands of junk campaigns per day.
          const cooldownCutoff = new Date(
            Date.now() - CAMPAIGN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
          ).toISOString();
          const { data: existing } = await supabaseAdmin
            .from('reengagement_campaigns')
            .select('id')
            .eq('job_id', staleJob.id)
            .gte('created_at', cooldownCutoff)
            .limit(1)
            .single();

          if (existing) {
            logger.info(`Skipping job ${staleJob.title}: campaign within ${CAMPAIGN_COOLDOWN_DAYS}-day cooldown`);
            continue;
          }

          await launchCampaign(org.id, staleJob.id);
        }
      } catch (err) {
        logger.error(`Re-engagement failed for org ${org.name}:`, err);
      }
    }
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

reengagementWorker.on('failed', (job, err) => {
  logger.error(`Re-engagement job ${job?.id} failed:`, err);
});

/**
 * Set up the recurring re-engagement check (every 6 hours).
 *
 * OFF unless REENGAGEMENT_AUTO_SWEEP=true: the sweep sends real emails to
 * candidates on its own, so it must be an explicit opt-in. When disabled we
 * also REMOVE any previously-registered repeatable job — BullMQ repeatables
 * persist in Redis, so merely not re-adding one would leave the old schedule
 * firing forever. Manual per-job campaigns (POST /api/reengagement/trigger)
 * are unaffected by this flag.
 */
export async function startReengagementScheduler(): Promise<void> {
  if (env.REENGAGEMENT_AUTO_SWEEP !== 'true') {
    const repeatables = await reengagementQueue.getRepeatableJobs();
    for (const r of repeatables) {
      await reengagementQueue.removeRepeatableByKey(r.key);
    }
    logger.info(
      `Re-engagement auto-sweep DISABLED (REENGAGEMENT_AUTO_SWEEP != true)` +
      (repeatables.length ? ` — removed ${repeatables.length} stale recurring job(s)` : '')
    );
    return;
  }

  await reengagementQueue.add(
    'reengagement-check',
    {},
    {
      repeat: { every: 6 * 60 * 60 * 1000 }, // 6 hours
      jobId: 'reengagement-recurring',
    }
  );

  logger.info('Re-engagement scheduler started (every 6 hours)');
}

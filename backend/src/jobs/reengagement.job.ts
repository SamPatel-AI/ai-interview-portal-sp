import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { findStaleJobs, launchCampaign } from '../services/reengagement.service';
import { logger } from '../utils/logger';

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
          // Check if there's already an active campaign for this job
          const { data: existing } = await supabaseAdmin
            .from('reengagement_campaigns')
            .select('id')
            .eq('job_id', staleJob.id)
            .in('status', ['pending', 'matching', 'emailing'])
            .limit(1)
            .single();

          if (existing) {
            logger.info(`Skipping job ${staleJob.title}: campaign already in progress`);
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
 */
export async function startReengagementScheduler(): Promise<void> {
  // Add recurring job
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

import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { syncCeipalJobs } from '../services/ceipal.service';
import { logger } from '../utils/logger';

// ─── Queue Definition ──────────────────────────────────────

export const ceipalSyncQueue = new Queue('ceipal-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const ceipalSyncWorker = new Worker(
  'ceipal-sync',
  async (job) => {
    const { orgId, clientCompanyId } = job.data;

    logger.info(`Running CEIPAL sync for org ${orgId}`);

    const result = await syncCeipalJobs(orgId, clientCompanyId);

    logger.info(`CEIPAL sync completed: ${JSON.stringify(result)}`);

    return result;
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

ceipalSyncWorker.on('failed', (job, err) => {
  logger.error(`CEIPAL sync job ${job?.id} failed:`, err);
});

/**
 * Start the recurring CEIPAL sync (every 30 minutes) for all active orgs.
 */
export async function startRecurringCeipalSync(): Promise<void> {
  // Fetch all active organizations
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id');

  if (!orgs?.length) return;

  // Add recurring jobs for each org
  for (const org of orgs) {
    await ceipalSyncQueue.add(
      `ceipal-sync-${org.id}`,
      { orgId: org.id },
      {
        repeat: {
          every: 30 * 60 * 1000, // Every 30 minutes
        },
        jobId: `ceipal-recurring-${org.id}`,
      }
    );
  }

  logger.info(`Started recurring CEIPAL sync for ${orgs.length} organizations`);
}

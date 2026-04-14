import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { resumeInterruptedCall } from '../services/call.service';
import { logger } from '../utils/logger';

// ─── Queue Definition ──────────────────────────────────────

export const callRetryQueue = new Queue('call-retry', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const callRetryWorker = new Worker(
  'call-retry',
  async (job) => {
    const { callId, orgId, reason } = job.data;

    logger.info(`Retrying call ${callId} (reason: ${reason})`);

    try {
      await resumeInterruptedCall(callId, orgId, 'system');
      logger.info(`Call ${callId} retry successful`);
    } catch (err) {
      logger.error(`Call ${callId} retry failed:`, err);
      throw err; // Let BullMQ handle the retry
    }
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

callRetryWorker.on('failed', (job, err) => {
  logger.error(`Call retry job ${job?.id} failed:`, err);
});

/**
 * Schedule a retry for an interrupted call.
 * Called from the webhook handler when a call is detected as interrupted.
 */
export async function scheduleCallRetry(
  callId: string,
  orgId: string,
  delayMs: number = 120000 // Default 2 minutes
): Promise<void> {
  await callRetryQueue.add(
    `retry-call-${callId}`,
    { callId, orgId, reason: 'auto_retry_interrupted' },
    {
      delay: delayMs,
      jobId: `retry-${callId}`, // Prevent duplicate retries
    }
  );

  logger.info(`Scheduled retry for call ${callId} in ${delayMs / 1000}s`);
}

/**
 * Schedule a callback at a specific time (candidate requested).
 */
export async function scheduleCallback(
  callId: string,
  orgId: string,
  callbackAt: Date
): Promise<void> {
  const delay = Math.max(0, callbackAt.getTime() - Date.now());

  await callRetryQueue.add(
    `callback-${callId}`,
    { callId, orgId, reason: 'candidate_requested_callback' },
    {
      delay,
      jobId: `callback-${callId}`,
    }
  );

  logger.info(`Scheduled callback for call ${callId} at ${callbackAt.toISOString()}`);
}

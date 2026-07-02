import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { initiateOutboundCall, resumeInterruptedCall } from '../services/call.service';
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
    const { callId, orgId, reason, applicationId } = job.data;

    logger.info(`Retrying call ${callId ?? applicationId} (reason: ${reason})`);

    try {
      if (reason && String(reason).startsWith('auto_redial')) {
        // No-answer / failed call → place a fresh outbound call.
        await initiateOutboundCall({ applicationId, orgId, userId: null });
      } else {
        // Interrupted call → resume where it left off.
        await resumeInterruptedCall(callId, orgId);
      }
      logger.info(`Call retry successful (reason: ${reason})`);
    } catch (err) {
      logger.error(`Call retry failed (reason: ${reason}):`, err);
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
 * Schedule an auto-redial: place a fresh outbound call after a no-answer/failed
 * call, within the booked slot. Capped by the caller (max attempts).
 */
export async function scheduleCallRedial(
  applicationId: string,
  orgId: string,
  attempt: number,
  delayMs: number = 180000 // 3 minutes between attempts
): Promise<void> {
  await callRetryQueue.add(
    `redial-${applicationId}`,
    { applicationId, orgId, reason: 'auto_redial' },
    {
      delay: delayMs,
      jobId: `redial-${applicationId}-${attempt}`, // unique per attempt, prevents dupes
    }
  );

  logger.info(`Scheduled auto-redial for application ${applicationId} (attempt ${attempt}) in ${delayMs / 1000}s`);
}

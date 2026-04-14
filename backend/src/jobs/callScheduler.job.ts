import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { initiateOutboundCall } from '../services/call.service';
import { logger } from '../utils/logger';

// ─── Queue Definition ──────────────────────────────────────

export const callSchedulerQueue = new Queue('call-scheduler', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const callSchedulerWorker = new Worker(
  'call-scheduler',
  async (job) => {
    const { callId, orgId } = job.data;

    logger.info(`Processing scheduled call: ${callId}`);

    // Fetch the scheduled call
    const { data: call, error } = await supabaseAdmin
      .from('calls')
      .select('id, application_id, candidate_id, ai_agent_id, status, context_passed')
      .eq('id', callId)
      .single();

    if (error || !call) {
      logger.error(`Scheduled call ${callId} not found`);
      return;
    }

    if (call.status !== 'scheduled') {
      logger.info(`Call ${callId} is no longer scheduled (status: ${call.status}), skipping`);
      return;
    }

    // Execute the call
    await initiateOutboundCall({
      applicationId: call.application_id,
      orgId,
      userId: 'system', // System-initiated
    });

    logger.info(`Scheduled call ${callId} executed successfully`);
  },
  {
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000, // Max 10 calls per minute
    },
  }
);

callSchedulerWorker.on('failed', (job, err) => {
  logger.error(`Call scheduler job ${job?.id} failed:`, err);
});

// ─── Poll for Scheduled Calls ──────────────────────────────
// Runs every minute to check for calls that need to be executed

export async function pollScheduledCalls(): Promise<void> {
  const now = new Date().toISOString();

  const { data: scheduledCalls, error } = await supabaseAdmin
    .from('calls')
    .select('id, org_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20);

  if (error || !scheduledCalls?.length) return;

  for (const call of scheduledCalls) {
    await callSchedulerQueue.add(
      `execute-call-${call.id}`,
      { callId: call.id, orgId: call.org_id },
      { jobId: `call-${call.id}` } // Prevent duplicate jobs
    );
  }

  logger.info(`Queued ${scheduledCalls.length} scheduled calls`);
}

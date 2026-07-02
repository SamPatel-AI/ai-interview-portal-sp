import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { sendInvitationEmail, sendRejectionEmail, sendFollowUpEmail, sendReEngagementEmail } from '../services/email.service';
import { logger } from '../utils/logger';

// ─── Queue Definition ──────────────────────────────────────

export const emailQueue = new Queue('email-sender', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const emailWorker = new Worker(
  'email-sender',
  async (job) => {
    const { type, candidateId, applicationId, jobTitle, jobId } = job.data;

    // Fetch candidate
    const { data: candidate, error } = await supabaseAdmin
      .from('candidates')
      .select('id, first_name, last_name, email')
      .eq('id', candidateId)
      .single();

    if (error || !candidate) {
      logger.error(`Candidate ${candidateId} not found for email job`);
      return;
    }

    switch (type) {
      case 'invitation':
        await sendInvitationEmail(candidate, jobTitle, applicationId, null, jobId);
        break;
      case 'rejection':
        await sendRejectionEmail(candidate, jobTitle, applicationId);
        break;
      case 'follow_up':
        await sendFollowUpEmail(candidate, jobTitle, applicationId, jobId);
        break;
      case 're_engagement':
        await sendReEngagementEmail(
          candidate,
          jobTitle,
          job.data.jobDescription || '',
          job.data.companyName || 'our company'
        );
        break;
      default:
        logger.warn(`Unknown email type: ${type}`);
    }

    logger.info(`Sent ${type} email to ${candidate.email}`);
  },
  {
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 20,
      duration: 60000, // Max 20 emails per minute
    },
  }
);

emailWorker.on('failed', (job, err) => {
  logger.error(`Email job ${job?.id} failed:`, err);
});

/**
 * Queue an email to be sent.
 */
export async function queueEmail(params: {
  type: 'invitation' | 'rejection' | 'follow_up' | 're_engagement';
  candidateId: string;
  applicationId: string;
  jobTitle: string;
  jobId?: string;
  companyName?: string;
  jobDescription?: string;
}): Promise<void> {
  await emailQueue.add(
    `email-${params.type}-${params.candidateId}`,
    params,
    {
      // Dedup key. Fall back to candidateId when there's no application yet
      // (re-engagement): with the empty-string applicationId every campaign
      // email shared ONE jobId, so BullMQ deduped all but the first away.
      jobId: `email-${params.type}-${params.applicationId || params.candidateId}`,
    }
  );
}

/**
 * Send pending invitation emails (daily batch).
 * Finds applications where status is new and no invitation has been sent.
 */
export async function sendPendingInvitations(orgId: string): Promise<number> {
  // Find applications without invitation emails
  const { data: pending, error } = await supabaseAdmin
    .from('applications')
    .select(`
      id,
      candidates (id, first_name, last_name, email),
      jobs (id, title)
    `)
    .eq('org_id', orgId)
    .eq('status', 'new')
    .limit(50);

  if (error || !pending?.length) return 0;

  let sent = 0;

  for (const app of pending) {
    // Check if invitation already sent
    const { data: existingEmail } = await supabaseAdmin
      .from('email_logs')
      .select('id')
      .eq('application_id', app.id)
      .eq('type', 'invitation')
      .limit(1)
      .single();

    if (existingEmail) continue;

    const candidate = (app.candidates as any[])[0];
    const job = (app.jobs as any[])[0];

    await queueEmail({
      type: 'invitation',
      candidateId: candidate.id,
      applicationId: app.id,
      jobTitle: job.title,
      jobId: job.id,
    });

    sent++;
  }

  logger.info(`Queued ${sent} pending invitation emails for org ${orgId}`);
  return sent;
}

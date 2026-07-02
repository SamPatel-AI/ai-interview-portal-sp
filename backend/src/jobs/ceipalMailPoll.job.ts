import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  listCeipalInboxMessages,
  getMessageBodyText,
  getMessageAttachments,
  moveMessageToProcessed,
  type GraphMailMessage,
} from '../services/graphMail.service';
import { parseCeipalNotificationEmail } from '../utils/ceipalEmail';
import { ingestCandidate } from '../services/intake.service';
import { notifySubmissionIssue } from '../services/notification.service';

/**
 * Candidate intake via CEIPAL notification emails (Microsoft Graph Mail.Read).
 *
 * Replaces the retired getSubmissionsList poller: that API set is frozen and
 * carries no job code / candidate identity, while the notification email has
 * the JPC code (subject), candidate contact fields (body) and the résumé
 * (attachment) — everything ingestCandidate needs.
 *
 * Idempotency: the ceipal_submissions ledger, keyed by the email's
 * internetMessageId (UNIQUE) — every email ends in a definite state
 * (processed / unmatched / skipped / failed) and is never ingested twice.
 * Handled applicant emails are additionally moved to a "Processed" folder to
 * keep the inbox clean; other CEIPAL templates stay in the inbox untouched.
 */

// Attachment types resume.service can extract text from.
const RESUME_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const ceipalMailQueue = new Queue('ceipal-mail-poll', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

function pickResumeAttachment(
  attachments: Awaited<ReturnType<typeof getMessageAttachments>>,
): { buffer: Buffer; filename: string; mimeType: string } | null {
  const file = attachments.find(
    (a) =>
      !a.isInline &&
      a.contentBytes &&
      RESUME_MIME_PREFIXES.some((m) => (a.contentType || '').startsWith(m)),
  );
  if (!file?.contentBytes) return null;
  return {
    buffer: Buffer.from(file.contentBytes, 'base64'),
    filename: file.name || 'resume.pdf',
    mimeType: file.contentType || 'application/pdf',
  };
}

async function updateLedger(
  internetMessageId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin
    .from('ceipal_submissions')
    .update({ ...fields, processed_at: new Date().toISOString() })
    .eq('ceipal_submission_id', internetMessageId);
}

async function processMessage(orgId: string, msg: GraphMailMessage): Promise<
  'processed' | 'unmatched' | 'skipped' | 'failed'
> {
  const { content, contentType } = await getMessageBodyText(msg.id);
  const parsed = parseCeipalNotificationEmail(msg.subject || '', content);

  // Same sender also emits note-created / reassignment / account emails —
  // recorded as skipped (so they're never re-fetched) but left in the inbox.
  if (!parsed) {
    logger.info(`ceipal-mail: skipping non-applicant email "${(msg.subject || '').slice(0, 80)}"`);
    await updateLedger(msg.internetMessageId, { status: 'skipped' });
    return 'skipped';
  }

  // Assigned-job gate (belt-and-suspenders — CEIPAL only emails the job's
  // assigned recruiters). Blocks only when we positively know our recruiter is
  // NOT on the job; unknown jobs and not-yet-synced rows pass through so a
  // fresh deploy or a brand-new job never silently drops candidates.
  const { data: jobRow } = await supabaseAdmin
    .from('jobs')
    .select('id, ceipal_assigned_recruiters')
    .eq('org_id', orgId)
    .eq('ceipal_job_id', parsed.jpcCode)
    .maybeSingle();

  if (
    env.CEIPAL_RECRUITER_ID &&
    jobRow?.ceipal_assigned_recruiters &&
    !jobRow.ceipal_assigned_recruiters.includes(env.CEIPAL_RECRUITER_ID)
  ) {
    logger.info(`ceipal-mail: ${parsed.jpcCode} is not assigned to our recruiter — skipping ${parsed.email}`);
    await updateLedger(msg.internetMessageId, { status: 'skipped', job_code: parsed.jpcCode });
    await moveMessageToProcessed(msg.id);
    return 'skipped';
  }

  if (!parsed.email) {
    throw new Error(`no candidate email in notification (contentType=${contentType})`);
  }

  const resume = msg.hasAttachments ? pickResumeAttachment(await getMessageAttachments(msg.id)) : null;
  if (!resume) {
    logger.warn(`ceipal-mail: no résumé attachment on "${(msg.subject || '').slice(0, 80)}" — ingesting without one`);
  }

  const result = await ingestCandidate({
    orgId,
    email: parsed.email,
    firstName: parsed.firstName || null,
    lastName: parsed.lastName || null,
    phone: parsed.phone,
    location: parsed.location,
    workAuthorization: parsed.workAuthorization,
    source: parsed.source?.toLowerCase() || 'ceipal-email',
    resolvedJobId: jobRow?.id || null,
    jobCode: parsed.jpcCode,
    resume,
    ceipalSubmissionId: msg.internetMessageId,
  });

  await updateLedger(msg.internetMessageId, {
    status: result.matched ? 'processed' : 'unmatched',
    job_code: parsed.jpcCode,
    candidate_id: result.candidateId,
    application_id: result.applicationId,
  });

  if (!result.matched) {
    await notifySubmissionIssue({
      orgId,
      candidateId: result.candidateId,
      type: 'unmatched',
      ceipalSubmissionId: msg.internetMessageId,
      message: `No job found for ${parsed.jpcCode} (run a CEIPAL sync?) — candidate saved but unlinked.`,
    });
  }

  await moveMessageToProcessed(msg.id);
  return result.matched ? 'processed' : 'unmatched';
}

export const ceipalMailWorker = new Worker(
  'ceipal-mail-poll',
  async (job) => {
    const orgId: string = job.data.orgId || env.DEFAULT_ORG_ID;
    if (!orgId) {
      logger.error('ceipal-mail: no orgId / DEFAULT_ORG_ID — skipping poll');
      return { skipped: true };
    }

    // Fractions allowed (e.g. "0.25" = 6h) — at ~260 applicants/day a fresh
    // deploy may want a small first window instead of the full backlog.
    const lookbackDays = parseFloat(env.CEIPAL_MAIL_LOOKBACK_DAYS) || 3;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const messages = await listCeipalInboxMessages(since);

    // Dedupe against the ledger before any per-message Graph calls.
    const ids = messages.map((m) => m.internetMessageId).filter(Boolean);
    const { data: seenRows } = ids.length
      ? await supabaseAdmin
          .from('ceipal_submissions')
          .select('ceipal_submission_id')
          .eq('org_id', orgId)
          .in('ceipal_submission_id', ids)
      : { data: [] };
    const seen = new Set((seenRows || []).map((r) => r.ceipal_submission_id));
    const fresh = messages.filter((m) => m.internetMessageId && !seen.has(m.internetMessageId));

    const counts = { inbox: messages.length, fresh: fresh.length, processed: 0, unmatched: 0, skipped: 0, failed: 0 };

    for (const msg of fresh) {
      // Claim in the ledger first (UNIQUE guards against overlapping polls).
      const { error: insErr } = await supabaseAdmin.from('ceipal_submissions').insert({
        org_id: orgId,
        ceipal_submission_id: msg.internetMessageId,
        status: 'received',
        raw: {
          via: 'graph-mail',
          graph_message_id: msg.id,
          subject: msg.subject,
          received_at: msg.receivedDateTime,
        },
      });
      if (insErr) {
        logger.warn(`ceipal-mail: ledger claim skipped for ${msg.internetMessageId}: ${insErr.message}`);
        continue;
      }

      try {
        counts[await processMessage(orgId, msg)]++;
      } catch (e) {
        counts.failed++;
        const message = (e as Error).message;
        logger.error(`ceipal-mail: failed to ingest "${(msg.subject || '').slice(0, 80)}":`, e);
        await updateLedger(msg.internetMessageId, { status: 'failed', error: message });
        await notifySubmissionIssue({
          orgId,
          type: 'failed',
          ceipalSubmissionId: msg.internetMessageId,
          message,
        });
      }
    }

    if (counts.fresh > 0) {
      logger.info(`CEIPAL mail poll complete: ${JSON.stringify(counts)}`);
    }
    return counts;
  },
  {
    connection: redis,
    concurrency: 1, // single poller; messages are processed serially within a run
  },
);

ceipalMailWorker.on('failed', (job, err) => {
  logger.error(`CEIPAL mail poll job ${job?.id} failed:`, err);
});

/**
 * One-time cleanup: drop the retired getSubmissionsList poller's repeatable
 * schedule + queued jobs from Redis (its worker no longer exists, so leftover
 * repeat schedules would just pile up delayed jobs forever).
 */
async function retireCeipalSubmissionsQueue(): Promise<void> {
  const oldQueue = new Queue('ceipal-submissions', { connection: redis });
  try {
    const repeatables = await oldQueue.getRepeatableJobs();
    for (const r of repeatables) await oldQueue.removeRepeatableByKey(r.key);
    await oldQueue.obliterate({ force: true });
    if (repeatables.length > 0) {
      logger.info(`Retired legacy ceipal-submissions queue (${repeatables.length} repeatable schedule(s) removed)`);
    }
  } catch (err) {
    logger.warn(`ceipal-mail: legacy ceipal-submissions cleanup failed (harmless): ${(err as Error).message}`);
  } finally {
    await oldQueue.close();
  }
}

/**
 * Start the recurring CEIPAL mail poll. Single mailbox → one org
 * (DEFAULT_ORG_ID). No-ops with a loud warning if config is missing.
 */
export async function startRecurringCeipalMailPoll(): Promise<void> {
  const orgId = env.DEFAULT_ORG_ID;
  if (!orgId) {
    logger.warn('DEFAULT_ORG_ID not set — CEIPAL mail poll NOT scheduled.');
    return;
  }
  if (!env.MS_GRAPH_TENANT_ID || !env.MS_GRAPH_CLIENT_ID || !env.MS_GRAPH_CLIENT_SECRET || !env.MS_GRAPH_SENDER) {
    logger.warn('MS_GRAPH_* config incomplete — CEIPAL mail poll (candidate intake) NOT scheduled.');
    return;
  }

  await retireCeipalSubmissionsQueue();

  const minutes = parseInt(env.CEIPAL_MAIL_POLL_MINUTES, 10) || 5;
  await ceipalMailQueue.add(
    'ceipal-mail-poll',
    { orgId },
    { repeat: { every: minutes * 60 * 1000 }, jobId: 'ceipal-mail-recurring' },
  );
  logger.info(`Started recurring CEIPAL mail poll (every ${minutes}m) on ${env.MS_GRAPH_SENDER} for org ${orgId}`);
}

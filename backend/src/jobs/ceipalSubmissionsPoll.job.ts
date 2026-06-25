import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  getCeipalToken,
  fetchAllCeipalSubmissions,
  fetchCeipalApplicantDetails,
  downloadCeipalResume,
} from '../services/ceipal.service';
import { ingestCandidate } from '../services/intake.service';
import { notifySubmissionIssue } from '../services/notification.service';

// ─── Queue Definition ──────────────────────────────────────

export const ceipalSubmissionsQueue = new Queue('ceipal-submissions', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const ceipalSubmissionsWorker = new Worker(
  'ceipal-submissions',
  async (job) => {
    const orgId: string = job.data.orgId || env.DEFAULT_ORG_ID;
    if (!orgId) {
      logger.error('ceipal-submissions: no orgId / DEFAULT_ORG_ID — skipping poll');
      return { skipped: true };
    }

    const token = await getCeipalToken();
    const submissions = await fetchAllCeipalSubmissions(token);
    logger.info(`CEIPAL submissions poll: ${submissions.length} total fetched`);

    // Dedupe against the ledger BEFORE any expensive per-submission work.
    const ids = submissions
      .map((s) => (s.submission_id != null ? String(s.submission_id) : null))
      .filter((x): x is string => !!x);
    const { data: seenRows } = await supabaseAdmin
      .from('ceipal_submissions')
      .select('ceipal_submission_id')
      .eq('org_id', orgId)
      .in('ceipal_submission_id', ids);
    const seen = new Set((seenRows || []).map((r) => r.ceipal_submission_id));
    const fresh = submissions.filter((s) => s.submission_id != null && !seen.has(String(s.submission_id)));
    logger.info(`CEIPAL submissions poll: ${fresh.length} new to ingest`);

    let processed = 0;
    let unmatched = 0;
    let failed = 0;

    for (const sub of fresh) {
      const subId = String(sub.submission_id);

      // Claim the submission in the ledger first (UNIQUE guards against races /
      // a duplicate appearing within the same scan).
      const { error: insErr } = await supabaseAdmin.from('ceipal_submissions').insert({
        org_id: orgId,
        ceipal_submission_id: subId,
        ceipal_applicant_id: sub.applicant_id != null ? String(sub.applicant_id) : null,
        status: 'received',
        raw: sub as unknown as Record<string, unknown>,
      });
      if (insErr) {
        logger.warn(`ceipal-submissions: ledger claim skipped for ${subId}: ${insErr.message}`);
        continue;
      }

      try {
        // Contact details live on the applicant, not the submission.
        const applicant = sub.applicant_id != null
          ? await fetchCeipalApplicantDetails(token, sub.applicant_id)
          : null;
        const email = (applicant?.email || applicant?.email_address_1 || '').trim().toLowerCase();
        if (!email) throw new Error(`no email on applicant ${sub.applicant_id}`);

        // Resolve the job via CEIPAL's opaque posting id (stored on jobs during sync).
        let resolvedJobId: string | null = null;
        let jobCode: string | null = null;
        if (sub.job_id) {
          const { data: jobRow } = await supabaseAdmin
            .from('jobs')
            .select('id, ceipal_job_id')
            .eq('org_id', orgId)
            .eq('ceipal_job_uuid', sub.job_id)
            .maybeSingle();
          if (jobRow) {
            resolvedJobId = jobRow.id;
            jobCode = jobRow.ceipal_job_id;
          }
        }

        // Résumé bytes (signed URL; no auth). Fall back through the document fields.
        let resume: { buffer: Buffer; filename: string; mimeType: string } | null = null;
        const resumeUrl = sub.resume || sub.merged_pdf_document || sub.merge_document_path || null;
        if (resumeUrl) {
          try {
            resume = await downloadCeipalResume(resumeUrl);
          } catch (e) {
            logger.warn(`ceipal-submissions: résumé download failed for ${subId}: ${(e as Error).message}`);
          }
        }

        const result = await ingestCandidate({
          orgId,
          email,
          firstName: applicant?.firstname,
          lastName: applicant?.lastname,
          phone: applicant?.mobile_number || applicant?.other_phone || null,
          location: [applicant?.city, applicant?.state, applicant?.country].filter(Boolean).join(', ') || null,
          workAuthorization: applicant?.work_authorization || null,
          source: 'ceipal',
          resolvedJobId,
          resume,
          ceipalSubmissionId: subId,
        });

        await supabaseAdmin
          .from('ceipal_submissions')
          .update({
            status: result.matched ? 'processed' : 'unmatched',
            job_code: jobCode,
            candidate_id: result.candidateId,
            application_id: result.applicationId,
            processed_at: new Date().toISOString(),
          })
          .eq('ceipal_submission_id', subId);

        if (result.matched) {
          processed++;
        } else {
          unmatched++;
          await notifySubmissionIssue({
            orgId,
            candidateId: result.candidateId,
            type: 'unmatched',
            ceipalSubmissionId: subId,
            message: `No matching job for CEIPAL job_id ${sub.job_id ?? '(none)'} — candidate saved but unlinked.`,
          });
        }
      } catch (e) {
        failed++;
        const msg = (e as Error).message;
        logger.error(`ceipal-submissions: failed to ingest ${subId}:`, e);
        await supabaseAdmin
          .from('ceipal_submissions')
          .update({ status: 'failed', error: msg, processed_at: new Date().toISOString() })
          .eq('ceipal_submission_id', subId);
        await notifySubmissionIssue({ orgId, type: 'failed', ceipalSubmissionId: subId, message: msg });
      }
    }

    const summary = { total: submissions.length, fresh: fresh.length, processed, unmatched, failed };
    logger.info(`CEIPAL submissions poll complete: ${JSON.stringify(summary)}`);
    return summary;
  },
  {
    connection: redis,
    concurrency: 1, // single poller; submissions are processed serially within a run
  }
);

ceipalSubmissionsWorker.on('failed', (job, err) => {
  logger.error(`CEIPAL submissions poll job ${job?.id} failed:`, err);
});

/**
 * Start the recurring CEIPAL submissions poll. Single CEIPAL account → one org
 * (DEFAULT_ORG_ID). No-ops with a loud warning if creds/org are missing.
 */
export async function startRecurringCeipalSubmissionsPoll(): Promise<void> {
  const orgId = env.DEFAULT_ORG_ID;
  if (!orgId) {
    logger.warn('DEFAULT_ORG_ID not set — CEIPAL submissions poll NOT scheduled.');
    return;
  }
  if (!env.CEIPAL_API_KEY || !env.CEIPAL_EMAIL || !env.CEIPAL_PASSWORD) {
    logger.warn('CEIPAL credentials incomplete — CEIPAL submissions poll NOT scheduled.');
    return;
  }
  const minutes = parseInt(env.CEIPAL_SUBMISSIONS_POLL_MINUTES, 10) || 15;
  await ceipalSubmissionsQueue.add(
    'ceipal-submissions-poll',
    { orgId },
    { repeat: { every: minutes * 60 * 1000 }, jobId: 'ceipal-submissions-recurring' },
  );
  logger.info(`Started recurring CEIPAL submissions poll (every ${minutes}m) for org ${orgId}`);
}

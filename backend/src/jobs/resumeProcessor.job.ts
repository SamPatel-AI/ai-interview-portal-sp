import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { processResume } from '../services/resume.service';
import { screenResume } from '../services/screening.service';
import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';
import { notifySubmissionIssue } from '../services/notification.service';

const RESUME_ATTEMPTS = 2;

// ─── Queue Definition ──────────────────────────────────────

export const resumeQueue = new Queue('resume-processor', {
  connection: redis,
  defaultJobOptions: {
    attempts: RESUME_ATTEMPTS,
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const resumeWorker = new Worker(
  'resume-processor',
  async (job) => {
    const { candidateId, resumePath, applicationId, orgId, ceipalSubmissionId } = job.data;

    logger.info(`Processing resume for candidate ${candidateId}`);

    // Step 1: Extract text from resume
    const resumeText = await processResume(candidateId, resumePath);

    // Step 1b: Empty text → unreadable (scanned/image PDF). Quarantine, don't screen.
    // OCR fallback is deferred; for now flag it loudly so it's never silently lost.
    if (!resumeText.trim()) {
      logger.warn(`Resume for candidate ${candidateId} produced no extractable text — skipping screening`);
      if (ceipalSubmissionId) {
        await supabaseAdmin
          .from('ceipal_submissions')
          .update({
            status: 'needs_resume',
            error: 'empty résumé text (likely scanned/image PDF — needs OCR)',
            processed_at: new Date().toISOString(),
          })
          .eq('ceipal_submission_id', ceipalSubmissionId);
        if (orgId) {
          await notifySubmissionIssue({
            orgId,
            candidateId,
            type: 'needs_resume',
            ceipalSubmissionId,
            message: 'Résumé produced no extractable text (likely a scanned/image PDF).',
          });
        }
      }
      return { candidateId, textLength: 0, needsResume: true };
    }

    // Step 2: If there's an application, run AI screening
    if (applicationId) {
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('id, jobs (title, description, skills, state, country, tax_terms)')
        .eq('id', applicationId)
        .single();

      // applications.job_id → jobs is a to-one relation: PostgREST returns it as
      // an object (older/ambiguous schemas return a single-element array). Handle both.
      const jobRel = (app as { jobs?: unknown } | null)?.jobs;
      const job = (Array.isArray(jobRel) ? jobRel[0] : jobRel) as {
        title: string;
        description: string;
        skills: string[];
        state: string | null;
        country: string | null;
        tax_terms: string | null;
      } | undefined;
      if (job) {
        await supabaseAdmin
          .from('applications')
          .update({ status: 'screening' })
          .eq('id', applicationId);

        const result = await screenResume({
          resumeText,
          jobTitle: job.title,
          jobDescription: job.description,
          skills: job.skills,
          state: job.state,
          country: job.country,
          taxTerms: job.tax_terms,
        });

        const { error: updErr } = await supabaseAdmin
          .from('applications')
          .update({
            ai_screening_score: result.overall_fit_rating,
            ai_screening_result: result,
            mandate_questions: result.mandate_questions,
            interview_questions: result.interview_questions,
          })
          .eq('id', applicationId);

        // Throw on a failed write so BullMQ retries — otherwise the screening
        // result is silently lost (the candidate has no score and no retry).
        if (updErr) throw new Error(`Failed to persist screening for ${applicationId}: ${updErr.message}`);

        logger.info(`AI screening complete for application ${applicationId}: score ${result.overall_fit_rating}/10`);
      }
    }

    return { candidateId, textLength: resumeText.length };
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

resumeWorker.on('failed', async (job, err) => {
  logger.error(`Resume processing job ${job?.id} failed:`, err);

  // On terminal failure (retries exhausted) of a CEIPAL-sourced résumé, mark the
  // submission ledger 'failed' + alert. The candidate/application are already
  // saved, so the applicant is never lost — only screening is incomplete.
  const ceipalSubmissionId = job?.data?.ceipalSubmissionId;
  const exhausted = (job?.attemptsMade ?? 0) >= (job?.opts?.attempts ?? RESUME_ATTEMPTS);
  if (ceipalSubmissionId && exhausted) {
    try {
      await supabaseAdmin
        .from('ceipal_submissions')
        .update({
          status: 'failed',
          error: `resume processing failed: ${err?.message || 'unknown error'}`,
          processed_at: new Date().toISOString(),
        })
        .eq('ceipal_submission_id', ceipalSubmissionId);
      if (job?.data?.orgId) {
        await notifySubmissionIssue({
          orgId: job.data.orgId,
          candidateId: job.data.candidateId,
          type: 'failed',
          ceipalSubmissionId,
          message: `Résumé processing failed after ${job?.attemptsMade} attempts: ${err?.message || 'unknown error'}`,
        });
      }
    } catch (e) {
      logger.error('resumeWorker.failed: could not update ceipal_submissions ledger:', e);
    }
  }
});

/**
 * Queue a resume for processing (text extraction + optional AI screening).
 */
export async function queueResumeProcessing(params: {
  candidateId: string;
  resumePath: string;
  applicationId?: string;
  /** Present for CEIPAL-sourced résumés so the worker can update the ledger + alert. */
  orgId?: string;
  ceipalSubmissionId?: string;
}): Promise<void> {
  await resumeQueue.add(
    `process-resume-${params.candidateId}`,
    params,
    {
      jobId: `resume-${params.candidateId}-${Date.now()}`,
    }
  );
}

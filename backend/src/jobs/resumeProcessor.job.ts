import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { processResume } from '../services/resume.service';
import { screenResume } from '../services/screening.service';
import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';

// ─── Queue Definition ──────────────────────────────────────

export const resumeQueue = new Queue('resume-processor', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ─── Worker ────────────────────────────────────────────────

export const resumeWorker = new Worker(
  'resume-processor',
  async (job) => {
    const { candidateId, resumePath, applicationId } = job.data;

    logger.info(`Processing resume for candidate ${candidateId}`);

    // Step 1: Extract text from resume
    const resumeText = await processResume(candidateId, resumePath);

    // Step 2: If there's an application, run AI screening
    if (applicationId) {
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('id, jobs (title, description, skills, state, country, tax_terms)')
        .eq('id', applicationId)
        .single();

      const job = (app?.jobs as any[])?.[0];
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

        await supabaseAdmin
          .from('applications')
          .update({
            ai_screening_score: result.overall_fit_rating,
            ai_screening_result: result,
            mandate_questions: result.mandate_questions,
            interview_questions: result.interview_questions,
          })
          .eq('id', applicationId);

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

resumeWorker.on('failed', (job, err) => {
  logger.error(`Resume processing job ${job?.id} failed:`, err);
});

/**
 * Queue a resume for processing (text extraction + optional AI screening).
 */
export async function queueResumeProcessing(params: {
  candidateId: string;
  resumePath: string;
  applicationId?: string;
}): Promise<void> {
  await resumeQueue.add(
    `process-resume-${params.candidateId}`,
    params,
    {
      jobId: `resume-${params.candidateId}-${Date.now()}`,
    }
  );
}

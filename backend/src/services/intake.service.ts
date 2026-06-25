import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';
import { queueResumeProcessing } from '../jobs/resumeProcessor.job';

/**
 * Shared candidate-intake logic: upsert the candidate (by org_id+email), resolve
 * the job, create the application, and — when a résumé file is supplied — store
 * it and enqueue the resume-processor (text extract + AI screening).
 *
 * Two callers drive their own screening path:
 *  - CEIPAL submissions poll: passes `resume` bytes → resume-processor extracts +
 *    screens (this is what wires up the previously-orphaned resume-processor queue).
 *  - /candidate-intake webhook: passes `resumeText` and screens inline itself, so
 *    it does NOT pass `resume` bytes and no resume-processor job is enqueued here.
 */
export interface IngestCandidateInput {
  orgId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  location?: string | null;
  workAuthorization?: string | null;
  source?: string;
  /** Pre-resolved jobs.id (CEIPAL poll resolves via jobs.ceipal_job_uuid). */
  resolvedJobId?: string | null;
  /** "JPC - <n>" code → resolved internally via jobs.ceipal_job_id. */
  jobCode?: string | null;
  /** Plain text stored on the candidate (candidate-intake path). */
  resumeText?: string | null;
  /** Storage path stored on the candidate (candidate-intake path). */
  resumeUrl?: string | null;
  /** Résumé bytes (CEIPAL path) → uploaded to the 'resumes' bucket + screened. */
  resume?: { buffer: Buffer; filename: string; mimeType: string } | null;
  /** Threaded into the resume-processor job so it can update the CEIPAL ledger. */
  ceipalSubmissionId?: string;
}

export interface IngestCandidateResult {
  candidateId: string;
  applicationId: string | null;
  resolvedJobId: string | null;
  matched: boolean;
}

export async function ingestCandidate(input: IngestCandidateInput): Promise<IngestCandidateResult> {
  const {
    orgId, email, firstName, lastName, phone, location, workAuthorization, source,
    resumeText, resumeUrl, resume, ceipalSubmissionId,
  } = input;

  const normalizedEmail = email.toLowerCase();

  // 1. Upsert candidate (create or find existing by email within org).
  let candidateId: string;
  const { data: existing } = await supabaseAdmin
    .from('candidates')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', normalizedEmail)
    .single();

  if (existing) {
    candidateId = existing.id;
    await supabaseAdmin
      .from('candidates')
      .update({
        ...(firstName && { first_name: firstName }),
        ...(lastName && { last_name: lastName }),
        ...(phone && { phone }),
        ...(location && { location }),
        ...(workAuthorization && { work_authorization: workAuthorization }),
        ...(resumeText && { resume_text: resumeText }),
        ...(resumeUrl && { resume_url: resumeUrl }),
      })
      .eq('id', candidateId);
  } else {
    const { data: newCand, error: candErr } = await supabaseAdmin
      .from('candidates')
      .insert({
        org_id: orgId,
        first_name: firstName || 'Unknown',
        last_name: lastName || '',
        email: normalizedEmail,
        phone: phone || null,
        location: location || null,
        work_authorization: workAuthorization || null,
        resume_text: resumeText || null,
        resume_url: resumeUrl || null,
        source: source || 'webhook',
      })
      .select('id')
      .single();

    if (candErr || !newCand) {
      throw new Error(`Failed to create candidate: ${candErr?.message || 'unknown error'}`);
    }
    candidateId = newCand.id;
  }

  // 2. Resolve the job (pre-resolved id wins; else look up by CEIPAL job_code).
  let resolvedJobId: string | null = input.resolvedJobId || null;
  if (!resolvedJobId && input.jobCode) {
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .eq('org_id', orgId)
      .eq('ceipal_job_id', input.jobCode)
      .single();
    resolvedJobId = job?.id || null;
  }

  // 3. Create the application if we matched a job (idempotent on candidate+job).
  let applicationId: string | null = null;
  if (resolvedJobId) {
    const { data: existingApp } = await supabaseAdmin
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('job_id', resolvedJobId)
      .single();

    if (existingApp) {
      applicationId = existingApp.id;
    } else {
      const { data: newApp, error: appErr } = await supabaseAdmin
        .from('applications')
        .insert({ org_id: orgId, candidate_id: candidateId, job_id: resolvedJobId, status: 'new' })
        .select('id')
        .single();
      if (!appErr && newApp) applicationId = newApp.id;
    }
  }

  // 4. If we have résumé bytes, store them and enqueue extract + screen.
  if (resume) {
    const safeName = resume.filename.replace(/[^A-Za-z0-9._-]/g, '_');
    const filePath = `${orgId}/${candidateId}/${safeName}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('resumes')
      .upload(filePath, resume.buffer, { contentType: resume.mimeType, upsert: true });

    if (uploadErr) {
      throw new Error(`Failed to upload résumé: ${uploadErr.message}`);
    }

    await supabaseAdmin.from('candidates').update({ resume_url: filePath }).eq('id', candidateId);

    await queueResumeProcessing({
      candidateId,
      resumePath: filePath,
      applicationId: applicationId ?? undefined,
      orgId,
      ceipalSubmissionId,
    });
  }

  logger.info(`Intake: candidate ${candidateId} (${normalizedEmail}), application ${applicationId ?? 'none'}`);

  return { candidateId, applicationId, resolvedJobId, matched: !!applicationId };
}

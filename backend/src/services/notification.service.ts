import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Surface a scheduling-loop failure to the recruiter.
 *
 * Channel: the in-app activity feed (`activity_log`) — the same stream the
 * recruiter dashboard already renders. This is the chosen "loud" channel for
 * WS7 (email-to-recruiter was left as a future option; in-app is the existing,
 * org-scoped, durable mechanism). Always logs to the server log too so the
 * failure is never silent even if the DB write itself fails.
 *
 * `entityId`/`orgId` are required by activity_log (NOT NULL), so this can only
 * be called once the org + an entity (application/candidate/call) are resolved.
 */
export async function notifyBookingIssue(params: {
  orgId: string;
  entityType: 'application' | 'candidate' | 'call';
  entityId: string;
  action: string; // e.g. 'booking_no_phone', 'booking_after_deadline'
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  logger.warn(`[booking-issue] ${params.action}: ${params.message}`);
  try {
    await supabaseAdmin.from('activity_log').insert({
      org_id: params.orgId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      details: { message: params.message, severity: 'warning', ...(params.details ?? {}) },
    });
  } catch (err) {
    logger.error(`notifyBookingIssue: failed to write activity_log for ${params.action}:`, err);
  }
}

/**
 * Surface a CEIPAL-submission intake issue to the recruiter (same in-app
 * activity_log channel as notifyBookingIssue). Always logs to the server log.
 *
 * `candidateId` is optional: activity_log.entity_id is NOT NULL + must be a UUID,
 * so when the failure happens before a candidate exists (e.g. an applicant-detail
 * fetch failed) we log only — the durable record lives in the ceipal_submissions
 * ledger (error column) regardless.
 */
export async function notifySubmissionIssue(params: {
  orgId: string;
  type: 'unmatched' | 'needs_resume' | 'failed';
  ceipalSubmissionId: string;
  message: string;
  candidateId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  logger.warn(`[ceipal-submission] ${params.type} (submission ${params.ceipalSubmissionId}): ${params.message}`);
  if (!params.candidateId) return;
  try {
    await supabaseAdmin.from('activity_log').insert({
      org_id: params.orgId,
      entity_type: 'candidate',
      entity_id: params.candidateId,
      action: `ceipal_submission_${params.type}`,
      details: {
        message: params.message,
        severity: 'warning',
        ceipal_submission_id: params.ceipalSubmissionId,
        ...(params.details ?? {}),
      },
    });
  } catch (err) {
    logger.error(`notifySubmissionIssue: failed to write activity_log for ${params.ceipalSubmissionId}:`, err);
  }
}

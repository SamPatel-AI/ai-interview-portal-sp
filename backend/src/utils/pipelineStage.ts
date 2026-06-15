/**
 * Single source of truth for an application's pipeline stage.
 *
 * The board, list view, and analytics all read `pipeline_stage` + `sub_status`
 * from the API — the frontend never re-derives them. Stored `applications.status`
 * stays the high-level state; `in_progress` and `failed` are derived from the
 * invitation + call history.
 */

export type PipelineStage =
  | 'new'
  | 'in_progress'
  | 'interviewed'
  | 'failed'
  | 'shortlisted'
  | 'archived';

interface CallLite {
  status?: string | null;
  started_at?: string | null;
}

export interface PipelineInput {
  status: string;
  invitation_sent?: boolean;
  shortlisted_at?: string | null;
  calls?: CallLite[] | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CALL_ATTEMPTS = 3;

export function derivePipelineStage(
  app: PipelineInput,
  now: number = Date.now(),
): { pipeline_stage: PipelineStage; sub_status: string | null } {
  const calls = app.calls ?? [];
  const attempts = calls.length;
  const hasCompleted = calls.some((c) => c.status === 'completed');

  if (app.status === 'rejected' || app.status === 'hired') {
    return { pipeline_stage: 'archived', sub_status: null };
  }

  if (app.status === 'shortlisted') {
    const at = app.shortlisted_at ? new Date(app.shortlisted_at).getTime() : now;
    const stage: PipelineStage = now - at > SEVEN_DAYS_MS ? 'archived' : 'shortlisted';
    return { pipeline_stage: stage, sub_status: null };
  }

  if (hasCompleted || app.status === 'interviewed') {
    return { pipeline_stage: 'interviewed', sub_status: 'interviewed' };
  }

  if (app.invitation_sent) {
    if (attempts >= MAX_CALL_ATTEMPTS && !hasCompleted) {
      return { pipeline_stage: 'failed', sub_status: `failed_${attempts}` };
    }
    const latest = [...calls].sort(
      (a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime(),
    )[0];
    let sub = 'invited';
    if (latest?.status === 'no_answer') sub = attempts < MAX_CALL_ATTEMPTS ? 'retrying' : 'no_answer';
    else if (latest?.status === 'failed' || latest?.status === 'interrupted')
      sub = attempts < MAX_CALL_ATTEMPTS ? 'retrying' : 'disconnected';
    else if (latest?.status === 'scheduled' || latest?.status === 'in_progress') sub = 'booked';
    return { pipeline_stage: 'in_progress', sub_status: sub };
  }

  return { pipeline_stage: 'new', sub_status: null };
}

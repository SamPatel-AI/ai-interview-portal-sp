import type { Application } from '@/domains/applications';

export const APPLICATION_STATUSES = ['new', 'screening', 'interviewed', 'shortlisted', 'rejected', 'hired'] as const;

export const getScore = (score: Application['ai_screening_score']): number | null => {
  if (score === null || score === undefined) return null;
  if (typeof score === 'number') return score;
  if (typeof score === 'object' && 'score' in (score as Record<string, unknown>)) {
    const s = (score as { score: unknown }).score;
    return typeof s === 'number' ? s : null;
  }
  return null;
};

export const scoreColor = (score: number | null) => {
  if (score === null) return 'text-muted-foreground';
  if (score >= 7) return 'text-success';
  if (score >= 4) return 'text-warning';
  return 'text-destructive';
};

export const scoreBg = (score: number | null) => {
  if (score === null) return 'bg-muted border-muted';
  if (score >= 7) return 'bg-success/10 border-success/20';
  if (score >= 4) return 'bg-warning/10 border-warning/20';
  return 'bg-destructive/10 border-destructive/20';
};

export function getAppCallOutcome(app: Application): { label: string; color: string } | null {
  if (!app.calls || app.calls.length === 0) return null;
  const latest = [...app.calls].sort((a, b) =>
    new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()
  )[0];
  const reason = latest.disconnection_reason;
  if (reason === 'dial_no_answer') return { label: 'No Answer', color: 'bg-yellow-500/10 text-yellow-600' };
  if (reason === 'voicemail_reached') return { label: 'Voicemail', color: 'bg-yellow-500/10 text-yellow-600' };
  if (reason === 'user_hangup') return { label: 'Candidate Ended', color: 'bg-blue-500/10 text-blue-600' };
  if (reason === 'agent_hangup') return { label: 'Completed', color: 'bg-green-500/10 text-green-600' };
  if (reason === 'dial_failed' || reason === 'dial_busy' || reason === 'error_inactivity')
    return { label: 'Failed', color: 'bg-destructive/10 text-destructive' };
  if (latest.status === 'scheduled') return { label: 'Scheduled', color: 'bg-blue-500/10 text-blue-600' };
  if (latest.status === 'in_progress') return { label: 'In Progress', color: 'bg-purple-500/10 text-purple-600' };
  return {
    label: latest.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'bg-muted text-muted-foreground',
  };
}

export const candidateName = (app: Application) =>
  app.candidates ? `${app.candidates.first_name} ${app.candidates.last_name}` : 'Unknown';

export const formatShortDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const canApproveForInterview = (status: string) => ['new', 'screening'].includes(status);
export const canMakeFinalDecision = (status: string) => status === 'interviewed';

export type AppPhase =
  | { key: 'interviewed'; label: 'Interviewed ✓'; tone: 'success' }
  | { key: 'no_answer'; label: 'No Answer'; tone: 'warning' }
  | { key: 'disconnected'; label: 'Call Disconnected'; tone: 'destructive' }
  | { key: 'booked'; label: 'Slot Booked'; tone: 'info' }
  | { key: 'email_sent'; label: 'Email Sent'; tone: 'muted' };

export function computePhase(app: Application): AppPhase | null {
  const calls = app.calls ?? [];
  if (calls.some(c => c.status === 'completed')) {
    return { key: 'interviewed', label: 'Interviewed ✓', tone: 'success' };
  }
  if (calls.length > 0) {
    const latest = [...calls].sort(
      (a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()
    )[0];
    if (latest.status === 'no_answer') return { key: 'no_answer', label: 'No Answer', tone: 'warning' };
    if (latest.status === 'failed' || latest.status === 'interrupted')
      return { key: 'disconnected', label: 'Call Disconnected', tone: 'destructive' };
    if (latest.status === 'scheduled' || latest.status === 'in_progress')
      return { key: 'booked', label: 'Slot Booked', tone: 'info' };
  }
  if (app.invitation_sent) return { key: 'email_sent', label: 'Email Sent', tone: 'muted' };
  return null;
}

export const phaseClasses = (tone: AppPhase['tone']) => {
  switch (tone) {
    case 'success': return 'bg-success/10 text-success border-success/20';
    case 'warning': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    case 'destructive': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'info': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    default: return 'bg-muted text-muted-foreground border-muted';
  }
};

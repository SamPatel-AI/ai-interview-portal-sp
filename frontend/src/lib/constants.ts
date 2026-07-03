// ─── Cache Timing (React Query staleTime) ──────────────────
export const STALE = {
  FAST: 30 * 1000,         // 30s — dashboard stats, activity feed
  MEDIUM: 5 * 60 * 1000,   // 5m — lists (candidates, jobs, applications)
  LONG: 15 * 60 * 1000,    // 15m — rarely changing (agents, companies)
  STATIC: 60 * 60 * 1000,  // 1h — reference data (voices, filter options)
} as const;

// ─── Page Sizes ────────────────────────────────────────────
export const PAGE_SIZE = {
  SM: 10,
  MD: 20,
  LG: 50,
  XL: 100,
} as const;

// ─── Status Color Maps ────────────────────────────────────
export const APPLICATION_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-600',
  screening: 'bg-yellow-500/10 text-yellow-600',
  interviewed: 'bg-purple-500/10 text-purple-600',
  shortlisted: 'bg-green-500/10 text-green-600',
  rejected: 'bg-destructive/10 text-destructive',
  hired: 'bg-emerald-500/10 text-emerald-600',
};

export const CALL_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600',
  scheduled: 'bg-blue-500/10 text-blue-600',
  in_progress: 'bg-yellow-500/10 text-yellow-600',
  failed: 'bg-destructive/10 text-destructive',
  no_answer: 'bg-muted text-muted-foreground',
  voicemail: 'bg-muted text-muted-foreground',
  interrupted: 'bg-orange-500/10 text-orange-600',
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-500/10 text-green-600',
  closed: 'bg-muted text-muted-foreground',
  on_hold: 'bg-yellow-500/10 text-yellow-600',
  filled: 'bg-blue-500/10 text-blue-600',
};

export const JOB_STATUS_COLORS_BORDER: Record<string, string> = {
  open: 'bg-success/10 text-success border-success/20',
  closed: 'bg-destructive/10 text-destructive border-destructive/20',
  on_hold: 'bg-warning/10 text-warning border-warning/20',
  filled: 'bg-info/10 text-info border-info/20',
};

export const CALL_STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  failed: 'Failed',
  no_answer: 'No Answer',
  voicemail: 'Voicemail',
  interrupted: 'Interrupted',
};

// Pipeline chart bar colors (Dashboard).
// Keys are capitalized backend stage labels ("New", "Screening", ...).
export const PIPELINE_STAGE_BAR_COLORS: Record<string, string> = {
  New: 'bg-info',
  Screening: 'bg-warning',
  Interviewed: 'bg-primary',
  Shortlisted: 'bg-accent',
  Hired: 'bg-success',
};

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full Time',
  contract: 'Contract',
  c2c: 'Corp-to-Corp (C2C)',
  w2: 'W2',
};

export const EMAIL_TYPE_COLORS: Record<string, string> = {
  invitation: 'bg-primary/10 text-primary',
  follow_up: 'bg-blue-500/10 text-blue-600',
  rejection: 'bg-destructive/10 text-destructive',
  custom: 'bg-muted text-muted-foreground',
};

export const EMAIL_STATUS_COLORS: Record<string, string> = {
  sent: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
  bounced: 'bg-yellow-500/10 text-yellow-600',
};

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600',
  high: 'bg-orange-500/10 text-orange-600',
  normal: 'bg-blue-500/10 text-blue-600',
  low: 'bg-muted text-muted-foreground',
};

// ─── Status Labels ─────────────────────────────────────────
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  screening: 'Screening',
  interviewed: 'Interviewed',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  hired: 'Hired',
};

// ─── Pipeline Stages (backend-computed) ────────────────────
export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  interviewed: 'Interviewed',
  failed: 'Failed',
  shortlisted: 'Shortlisted',
  archived: 'Archived',
};

export const PIPELINE_STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  in_progress: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  interviewed: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
  shortlisted: 'bg-green-500/10 text-green-600 border-green-500/20',
  archived: 'bg-muted text-muted-foreground border-muted',
};

export const REENGAGEMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  matching: 'bg-blue-500/10 text-blue-600',
  emailing: 'bg-amber-500/10 text-amber-600',
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
};

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  invitation: 'Invitation',
  follow_up: 'Follow-up',
  rejection: 'Rejection',
  custom: 'Custom',
};

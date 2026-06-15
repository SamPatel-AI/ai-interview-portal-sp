import type { ApplicationDetail, ScreeningResult, CallDetail } from '@/domains/applications';

export const formatFactor = (factor: ScreeningResult['risk_factor']): string => {
  if (!factor) return '';
  if (typeof factor === 'string') return factor;
  return factor.score || '';
};

export const getFactorExplanation = (factor: ScreeningResult['risk_factor']): string | null => {
  if (!factor || typeof factor === 'string') return null;
  return factor.explanation || null;
};

export const getScore = (score: ApplicationDetail['ai_screening_score']): number | null => {
  if (score === null || score === undefined) return null;
  if (typeof score === 'number') return score;
  if (typeof score === 'object' && 'score' in score) return score.score;
  return null;
};

export const scoreColor = (s: number | null) =>
  s === null ? 'text-muted-foreground' : s >= 7 ? 'text-success' : s >= 4 ? 'text-warning' : 'text-destructive';

export const scoreBg = (s: number | null) =>
  s === null ? 'bg-muted' : s >= 7 ? 'bg-success/10' : s >= 4 ? 'bg-warning/10' : 'bg-destructive/10';

export const formatDuration = (s: number | null) => {
  if (!s) return '--';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '--';

export const parseTranscript = (call: CallDetail): { role: string; content: string }[] => {
  if (call.transcript_object?.length) return call.transcript_object;
  if (!call.transcript) return [];
  return call.transcript.split('\n').filter(Boolean).map(line => {
    const match = line.match(/^(Agent|User|Candidate):\s*(.*)/i);
    return match ? { role: match[1].toLowerCase(), content: match[2] } : { role: 'agent', content: line };
  });
};

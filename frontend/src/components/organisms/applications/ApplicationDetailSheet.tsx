import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Sparkles, CheckCircle, XCircle, AlertTriangle, Trophy,
  Mail, Phone, Volume2, MessageSquare, Star, Clock, FileText,
  ArrowRight, ThumbsUp, ThumbsDown,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface ScreeningResult {
  candidate_strengths?: string[];
  candidate_weaknesses?: string[];
  risk_factor?: string | { score: string; explanation: string };
  reward_factor?: string | { score: string; explanation: string };
  overall_fit_rating?: number;
  justification_for_rating?: string;
}

interface CallEvaluation {
  id: string;
  decision: string;
  rating: number;
  notes: string;
  evaluated_by: string;
  created_at: string;
}

interface CallDetail {
  id: string;
  direction: string;
  status: string;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_object: { role: string; content: string }[] | null;
  call_analysis: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    callback_requested?: boolean;
    callback_time?: string;
  } | null;
  is_resumption: boolean;
  call_evaluations?: CallEvaluation[];
}

interface EmailLog {
  id: string;
  type: string;
  status: string;
  sent_at: string;
}

interface AppDetail {
  id: string;
  status: string;
  ai_screening_score: number | { score: number; explanation?: string } | null;
  ai_screening_result: ScreeningResult | null;
  recruiter_notes: string | null;
  created_at: string;
  candidates?: { first_name: string; last_name: string; email: string; phone?: string; resume_url?: string };
  jobs?: { title: string; client_companies?: { name: string } };
  calls?: CallDetail[];
  email_logs?: EmailLog[];
}

// ─── Helpers ────────────────────────────────────────────────

const formatFactor = (factor: string | { score: string; explanation: string } | undefined): string => {
  if (!factor) return '';
  if (typeof factor === 'string') return factor;
  return factor.score || '';
};

const getFactorExplanation = (factor: string | { score: string; explanation: string } | undefined): string | null => {
  if (!factor || typeof factor === 'string') return null;
  return factor.explanation || null;
};

const getScore = (score: AppDetail['ai_screening_score']): number | null => {
  if (score === null || score === undefined) return null;
  if (typeof score === 'number') return score;
  if (typeof score === 'object' && 'score' in score) return score.score;
  return null;
};

const scoreColor = (s: number | null) => s === null ? 'text-muted-foreground' : s >= 7 ? 'text-success' : s >= 4 ? 'text-warning' : 'text-destructive';
const scoreBg = (s: number | null) => s === null ? 'bg-muted' : s >= 7 ? 'bg-success/10' : s >= 4 ? 'bg-warning/10' : 'bg-destructive/10';

const formatDuration = (s: number | null) => {
  if (!s) return '--';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '--';

// ─── Pipeline Steps ─────────────────────────────────────────

const pipelineSteps = [
  { key: 'new', label: 'New' },
  { key: 'screening', label: 'Screening' },
  { key: 'interviewed', label: 'Interviewed' },
  { key: 'shortlisted', label: 'Shortlisted' },
] as const;

const getStepIndex = (status: string): number => {
  if (status === 'rejected') return -1;
  if (status === 'hired') return 4;
  return pipelineSteps.findIndex(s => s.key === status);
};

// ─── Component ──────────────────────────────────────────────

interface Props {
  applicationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ApplicationDetailSheet({ applicationId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [screening, setScreening] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showTranscript, setShowTranscript] = useState(false);
  const [recruiterNotes, setRecruiterNotes] = useState('');
  const [notesEditing, setNotesEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['application-detail', applicationId],
    queryFn: () => apiRequest<ApiResponse<AppDetail>>(`/api/applications/${applicationId}`),
    enabled: !!applicationId && open,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['application-detail', applicationId] });
    queryClient.invalidateQueries({ queryKey: ['applications'] });
  };

  const screenMutation = useMutation({
    mutationFn: () => apiRequest(`/api/applications/${applicationId}/screen`, { method: 'POST' }),
    onMutate: () => setScreening(true),
    onSuccess: () => { toast({ title: 'AI screening complete' }); invalidateAll(); setScreening(false); },
    onError: (e: Error) => { toast({ title: 'Screening failed', description: e.message, variant: 'destructive' }); setScreening(false); },
  });

  const approveInterviewMutation = useMutation({
    mutationFn: () => apiRequest(`/api/applications/${applicationId}/approve-interview`, { method: 'POST' }),
    onSuccess: () => { toast({ title: 'Invitation email sent', description: 'Candidate will receive booking link' }); invalidateAll(); },
    onError: (e: Error) => toast({ title: 'Failed to send invitation', description: e.message, variant: 'destructive' }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest(`/api/applications/${applicationId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: (_, status) => {
      toast({ title: status === 'shortlisted' ? 'Candidate shortlisted' : status === 'rejected' ? 'Candidate rejected' : 'Status updated' });
      invalidateAll();
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const notesMutation = useMutation({
    mutationFn: (notes: string) =>
      apiRequest(`/api/applications/${applicationId}`, { method: 'PATCH', body: JSON.stringify({ recruiter_notes: notes }) }),
    onSuccess: () => { toast({ title: 'Notes saved' }); invalidateAll(); setNotesEditing(false); },
    onError: (e: Error) => toast({ title: 'Failed to save notes', description: e.message, variant: 'destructive' }),
  });

  const app = data?.data;
  const sr = app?.ai_screening_result;
  const score = app ? getScore(app.ai_screening_score) : null;
  const completedCall = app?.calls?.find(c => c.status === 'completed');
  const latestCall = app?.calls?.[0];
  const invitationEmail = app?.email_logs?.find(e => e.type === 'invitation');
  const hasInvitation = !!invitationEmail;
  const currentStep = app ? getStepIndex(app.status) : 0;

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const parseTranscript = (call: CallDetail): { role: string; content: string }[] => {
    if (call.transcript_object?.length) return call.transcript_object;
    if (!call.transcript) return [];
    return call.transcript.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^(Agent|User|Candidate):\s*(.*)/i);
      return match ? { role: match[1].toLowerCase(), content: match[2] } : { role: 'agent', content: line };
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        {isLoading || !app ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* ─── Header ─── */}
            <div className="p-6 border-b space-y-3">
              <SheetTitle className="text-lg">
                {app.candidates ? `${app.candidates.first_name} ${app.candidates.last_name}` : 'Unknown'}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {app.jobs?.title ?? 'Unknown Job'} {app.jobs?.client_companies?.name ? `• ${app.jobs.client_companies.name}` : ''}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{app.status}</Badge>
                {app.candidates?.email && (
                  <span className="text-xs text-muted-foreground">{app.candidates.email}</span>
                )}
              </div>

              {/* ─── Pipeline Progress ─── */}
              {app.status !== 'rejected' && (
                <div className="flex items-center gap-1 pt-2">
                  {pipelineSteps.map((step, i) => {
                    const isActive = i <= currentStep;
                    const isCurrent = i === currentStep;
                    return (
                      <div key={step.key} className="flex items-center gap-1 flex-1">
                        <div className={`flex items-center justify-center h-7 flex-1 rounded-md text-xs font-medium transition-colors ${
                          isCurrent
                            ? 'bg-primary text-primary-foreground'
                            : isActive
                            ? 'bg-primary/20 text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {step.label}
                        </div>
                        {i < pipelineSteps.length - 1 && (
                          <ArrowRight className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/40'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {app.status === 'rejected' && (
                <div className="pt-2">
                  <div className="h-7 flex items-center justify-center rounded-md text-xs font-medium bg-destructive/10 text-destructive">
                    Rejected
                  </div>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">

                {/* ═══ SECTION 1: AI Screening ═══ */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Resume Screening
                  </h3>

                  <div className="flex items-center gap-4">
                    <div className={`h-16 w-16 rounded-xl flex items-center justify-center ${scoreBg(score)}`}>
                      <span className={`text-2xl font-bold ${scoreColor(score)}`}>
                        {score ?? '?'}
                      </span>
                    </div>
                    <div className="flex-1">
                      {score !== null ? (
                        <p className="text-sm text-muted-foreground">
                          AI Score: <span className={`font-semibold ${scoreColor(score)}`}>{score}/10</span>
                        </p>
                      ) : (
                        <Button onClick={() => screenMutation.mutate()} disabled={screening} size="sm">
                          {screening ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing...</> : <><Sparkles className="h-4 w-4 mr-2" />Screen with AI</>}
                        </Button>
                      )}
                    </div>
                  </div>

                  {sr && (
                    <div className="space-y-3 bg-muted/30 rounded-lg p-4">
                      {sr.candidate_strengths?.length ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-success flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Strengths</p>
                          {sr.candidate_strengths.map((s, i) => (
                            <p key={i} className="text-sm text-muted-foreground pl-5">• {s}</p>
                          ))}
                        </div>
                      ) : null}
                      {sr.candidate_weaknesses?.length ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Weaknesses</p>
                          {sr.candidate_weaknesses.map((w, i) => (
                            <p key={i} className="text-sm text-muted-foreground pl-5">• {w}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-3">
                        {sr.risk_factor && (
                          <Badge variant="outline" className="border-warning/30 text-warning gap-1" title={getFactorExplanation(sr.risk_factor) ?? undefined}>
                            <AlertTriangle className="h-3 w-3" />Risk: {formatFactor(sr.risk_factor)}
                          </Badge>
                        )}
                        {sr.reward_factor && (
                          <Badge variant="outline" className="border-success/30 text-success gap-1" title={getFactorExplanation(sr.reward_factor) ?? undefined}>
                            <Trophy className="h-3 w-3" />Reward: {formatFactor(sr.reward_factor)}
                          </Badge>
                        )}
                      </div>
                      {getFactorExplanation(sr.risk_factor) && (
                        <p className="text-sm text-muted-foreground bg-warning/5 p-3 rounded-lg">
                          <span className="font-medium text-warning">Risk:</span> {getFactorExplanation(sr.risk_factor)}
                        </p>
                      )}
                      {getFactorExplanation(sr.reward_factor) && (
                        <p className="text-sm text-muted-foreground bg-success/5 p-3 rounded-lg">
                          <span className="font-medium text-success">Reward:</span> {getFactorExplanation(sr.reward_factor)}
                        </p>
                      )}
                      {sr.justification_for_rating && (
                        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{sr.justification_for_rating}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* ─── Pre-Interview Action: Approve for Interview ─── */}
                {score !== null && !hasInvitation && app.status !== 'rejected' && app.status !== 'shortlisted' && app.status !== 'hired' && app.status !== 'interviewed' && (
                  <>
                    <Separator />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => approveInterviewMutation.mutate()}
                        disabled={approveInterviewMutation.isPending}
                      >
                        {approveInterviewMutation.isPending
                          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending...</>
                          : <><Mail className="h-4 w-4 mr-2" />Approve for Interview</>}
                      </Button>
                      <Button
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 border-destructive/20"
                        onClick={() => updateStatusMutation.mutate('rejected')}
                        disabled={updateStatusMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />Reject
                      </Button>
                    </div>
                  </>
                )}

                {/* ═══ SECTION 2: Interview Status ═══ */}
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Phone className="h-4 w-4" /> Interview
                  </h3>

                  {/* Invitation Status */}
                  {hasInvitation ? (
                    <div className="flex items-center gap-2 p-3 bg-accent/5 rounded-lg border border-accent/20">
                      <Mail className="h-4 w-4 text-accent" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-accent">Invitation Sent</p>
                        <p className="text-xs text-muted-foreground">{formatDate(invitationEmail!.sent_at)}</p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">{invitationEmail!.status}</Badge>
                    </div>
                  ) : !completedCall && (
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {score !== null ? 'Awaiting approval to send interview invitation' : 'Complete AI screening first'}
                      </p>
                    </div>
                  )}

                  {/* Pending/Scheduled Call */}
                  {latestCall && !completedCall && ['scheduled', 'in_progress'].includes(latestCall.status) && (
                    <div className="flex items-center gap-2 p-3 bg-warning/5 rounded-lg border border-warning/20">
                      <Phone className="h-4 w-4 text-warning animate-pulse" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-warning capitalize">{latestCall.status === 'scheduled' ? 'Call Scheduled' : 'Call In Progress'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(latestCall.started_at)}</p>
                      </div>
                    </div>
                  )}

                  {/* No call yet but invitation sent */}
                  {hasInvitation && !latestCall && (
                    <div className="flex items-center gap-2 p-3 bg-info/5 rounded-lg border border-info/20">
                      <Clock className="h-4 w-4 text-info" />
                      <p className="text-sm text-info">Waiting for candidate to book interview slot</p>
                    </div>
                  )}
                </div>

                {/* ═══ SECTION 3: Interview Results (when call completed) ═══ */}
                {completedCall && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-success" /> Interview Completed
                      </h3>

                      {/* Call Meta */}
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>Duration: {formatDuration(completedCall.duration_seconds)}</span>
                        <span>{formatDate(completedCall.started_at)}</span>
                      </div>

                      {/* Recording */}
                      {completedCall.recording_url && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" />Recording</p>
                            <div className="flex gap-1">
                              {[1, 1.5, 2].map(r => (
                                <Button key={r} size="sm" variant={playbackRate === r ? 'default' : 'outline'} className="h-6 px-2 text-xs" onClick={() => changeSpeed(r)}>
                                  {r}x
                                </Button>
                              ))}
                            </div>
                          </div>
                          <audio ref={audioRef} controls src={completedCall.recording_url} className="w-full" />
                        </div>
                      )}

                      {/* AI Call Summary */}
                      {completedCall.call_analysis && (
                        <div className="space-y-2 bg-muted/30 rounded-lg p-4">
                          <p className="text-xs font-medium">AI Call Summary</p>
                          {completedCall.call_analysis.call_summary && (
                            <p className="text-sm text-muted-foreground">{completedCall.call_analysis.call_summary}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {completedCall.call_analysis.user_sentiment && (
                              <Badge variant="outline" className={
                                completedCall.call_analysis.user_sentiment === 'Positive' ? 'border-success/30 text-success' :
                                completedCall.call_analysis.user_sentiment === 'Negative' ? 'border-destructive/30 text-destructive' :
                                'border-muted-foreground/30 text-muted-foreground'
                              }>
                                Sentiment: {completedCall.call_analysis.user_sentiment}
                              </Badge>
                            )}
                            <Badge variant="outline" className={completedCall.call_analysis.call_successful ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}>
                              {completedCall.call_analysis.call_successful ? 'Successful Call' : 'Unsuccessful Call'}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* Transcript Toggle */}
                      <div>
                        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTranscript(!showTranscript)}>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          {showTranscript ? 'Hide Transcript' : 'View Full Transcript'}
                        </Button>
                        {showTranscript && (
                          <div className="mt-3 max-h-80 overflow-y-auto space-y-2 pr-2 border rounded-lg p-3">
                            {parseTranscript(completedCall).length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">No transcript available</p>
                            ) : (
                              parseTranscript(completedCall).map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' || msg.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                    msg.role === 'user' || msg.role === 'candidate'
                                      ? 'bg-muted text-foreground'
                                      : 'bg-primary/10 text-foreground'
                                  }`}>
                                    <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase">{msg.role}</p>
                                    {msg.content}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* Existing Evaluation from CallDetailSheet (if already evaluated there) */}
                      {completedCall.call_evaluations && completedCall.call_evaluations.length > 0 && (
                        <div className="space-y-2 bg-muted/30 rounded-lg p-4">
                          <p className="text-xs font-medium">Call Evaluation</p>
                          {completedCall.call_evaluations.map(ev => (
                            <div key={ev.id} className="flex items-center gap-2">
                              <Badge variant={
                                ev.decision === 'advance' ? 'default' :
                                ev.decision === 'reject' ? 'destructive' : 'secondary'
                              } className="capitalize">{ev.decision}</Badge>
                              <div className="flex">
                                {[1,2,3,4,5].map(s => (
                                  <Star key={s} className={`h-3.5 w-3.5 ${s <= ev.rating ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                                ))}
                              </div>
                              {ev.notes && <span className="text-xs text-muted-foreground truncate flex-1">{ev.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══ SECTION 4: Other Calls (failed, no_answer, etc.) ═══ */}
                {app.calls && app.calls.filter(c => c.id !== completedCall?.id).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Other Call Attempts ({app.calls.filter(c => c.id !== completedCall?.id).length})</p>
                      {app.calls.filter(c => c.id !== completedCall?.id).map(call => (
                        <div key={call.id} className="flex items-center justify-between p-2 border rounded-lg text-xs">
                          <Badge variant="outline" className="capitalize text-xs">{call.status}</Badge>
                          <span className="text-muted-foreground">{formatDate(call.started_at)}</span>
                          {call.duration_seconds ? <span className="text-muted-foreground">{formatDuration(call.duration_seconds)}</span> : null}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ═══ SECTION 5: Recruiter Notes ═══ */}
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Recruiter Notes</h3>
                    {!notesEditing && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setRecruiterNotes(app.recruiter_notes || ''); setNotesEditing(true); }}>
                        Edit
                      </Button>
                    )}
                  </div>
                  {notesEditing ? (
                    <div className="space-y-2">
                      <Textarea value={recruiterNotes} onChange={e => setRecruiterNotes(e.target.value)} rows={3} placeholder="Add your notes about this candidate..." />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => notesMutation.mutate(recruiterNotes)} disabled={notesMutation.isPending}>
                          {notesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNotesEditing(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {app.recruiter_notes || 'No notes yet'}
                    </p>
                  )}
                </div>

                {/* ═══ SECTION 6: Post-Interview Decision ═══ */}
                {app.status === 'interviewed' && (
                  <>
                    <Separator />
                    <div className="space-y-3 bg-primary/5 rounded-lg p-4 border border-primary/20">
                      <h3 className="text-sm font-semibold">Final Decision</h3>
                      <p className="text-xs text-muted-foreground">
                        Review the AI screening results and interview data above, then make your final decision.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 bg-success hover:bg-success/90 text-white"
                          onClick={() => updateStatusMutation.mutate('shortlisted')}
                          disabled={updateStatusMutation.isPending}
                        >
                          <ThumbsUp className="h-4 w-4 mr-2" />Shortlist for Next Round
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 text-destructive hover:bg-destructive/10 border-destructive/20"
                          onClick={() => updateStatusMutation.mutate('rejected')}
                          disabled={updateStatusMutation.isPending}
                        >
                          <ThumbsDown className="h-4 w-4 mr-2" />Reject
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* Final status badges */}
                {app.status === 'shortlisted' && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 p-4 bg-success/5 rounded-lg border border-success/20">
                      <CheckCircle className="h-5 w-5 text-success" />
                      <div>
                        <p className="text-sm font-medium text-success">Shortlisted for Next Round</p>
                        <p className="text-xs text-muted-foreground">This candidate has been approved after interview review</p>
                      </div>
                    </div>
                  </>
                )}

                {app.status === 'hired' && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 p-4 bg-success/5 rounded-lg border border-success/20">
                      <Trophy className="h-5 w-5 text-success" />
                      <div>
                        <p className="text-sm font-medium text-success">Hired</p>
                        <p className="text-xs text-muted-foreground">This candidate has been hired</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

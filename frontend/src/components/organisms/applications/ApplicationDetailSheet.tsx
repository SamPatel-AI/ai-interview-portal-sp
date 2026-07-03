import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, CheckCircle, XCircle, Mail, ArrowRight, ThumbsUp, ThumbsDown, Trophy, UserCheck,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApplication, useAssignRecruiter } from '@/domains/applications';
import { useTeamRecruiters } from '@/domains/settings';
import ApplicationScreeningPanel from './ApplicationScreeningPanel';
import ApplicationCallsPanel from './ApplicationCallsPanel';
import ApplicationEmailsPanel from './ApplicationEmailsPanel';
import { getScore } from './applicationDetailHelpers';
import { subStatusBadge, phaseClasses } from './applicationListHelpers';
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS } from '@/lib/constants';

const PIPELINE_SEQUENCE = ['new', 'in_progress', 'interviewed', 'shortlisted'] as const;
type SequenceStage = typeof PIPELINE_SEQUENCE[number];

const stageIndex = (stage: string): number => {
  const idx = (PIPELINE_SEQUENCE as readonly string[]).indexOf(stage);
  return idx;
};

interface Props {
  applicationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ApplicationDetailSheet({ applicationId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [screening, setScreening] = useState(false);
  const [recruiterNotes, setRecruiterNotes] = useState('');
  const [notesEditing, setNotesEditing] = useState(false);

  const { data, isLoading } = useApplication(open ? applicationId : null);
  const { recruiters } = useTeamRecruiters();
  const assignMutation = useAssignRecruiter();

  const invalidateAll = () => {
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
  const score = app ? getScore(app.ai_screening_score) : null;
  const completedCall = app?.calls?.find(c => c.status === 'completed');
  const invitationEmail = app?.email_logs?.find(e => e.type === 'invitation');
  const hasInvitation = !!invitationEmail;
  const currentStep = app ? getStepIndex(app.status) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        {isLoading || !app ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
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

              {app.status !== 'rejected' ? (
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
              ) : (
                <div className="pt-2">
                  <div className="h-7 flex items-center justify-center rounded-md text-xs font-medium bg-destructive/10 text-destructive">
                    Rejected
                  </div>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                <ApplicationScreeningPanel
                  score={app.ai_screening_score}
                  result={app.ai_screening_result}
                  screening={screening}
                  onScreen={() => screenMutation.mutate()}
                />

                {score !== null && !hasInvitation && !['rejected', 'shortlisted', 'hired', 'interviewed'].includes(app.status) && (
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

                <Separator />
                <ApplicationCallsPanel
                  calls={app.calls ?? []}
                  invitationEmail={invitationEmail}
                  score={score}
                />

                {app.email_logs && app.email_logs.length > 0 && (
                  <>
                    <Separator />
                    <ApplicationEmailsPanel emails={app.email_logs} />
                  </>
                )}

                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Assigned Recruiter
                  </h3>
                  <Select
                    value={app.assigned_recruiter_id ?? 'unassigned'}
                    onValueChange={(value) => {
                      if (!applicationId) return;
                      assignMutation.mutate({ id: applicationId, recruiterId: value === 'unassigned' ? '' : value });
                    }}
                    disabled={assignMutation.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {recruiters.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.full_name} <span className="text-muted-foreground text-xs ml-1">({r.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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

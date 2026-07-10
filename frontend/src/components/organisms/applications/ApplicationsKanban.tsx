import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, PhoneCall, ThumbsDown, ThumbsUp, XCircle, RotateCw } from 'lucide-react';
import type { Application, PipelineStage } from '@/domains/applications';
import {
  candidateName,
  failedAttempts,
  getScore,
  phaseClasses,
  scoreBg,
  scoreColor,
  subStatusBadge,
} from './applicationListHelpers';

interface Props {
  apps: Application[];
  onOpenDetail: (id: string) => void;
  onInvite: (id: string, e: React.MouseEvent) => void;
  onReject: (id: string) => void;
  onShortlist: (id: string) => void;
  onRecall: (id: string) => void;
  onResendInvite: (id: string) => void;
  invitePending?: boolean;
  resendPending?: boolean;
}

type ColumnKey = 'new' | 'in_progress' | 'interviewed' | 'shortlisted';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'interviewed', label: 'Interviewed' },
  { key: 'shortlisted', label: 'Shortlisted' },
];

function columnFor(stage: PipelineStage): ColumnKey | null {
  if (stage === 'new') return 'new';
  if (stage === 'in_progress') return 'in_progress';
  if (stage === 'interviewed' || stage === 'failed') return 'interviewed';
  if (stage === 'shortlisted') return 'shortlisted';
  return null; // archived hidden
}

const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

export default function ApplicationsKanban({
  apps, onOpenDetail, onInvite, onReject, onShortlist, onRecall, onResendInvite, invitePending, resendPending,
}: Props) {
  const grouped: Record<ColumnKey, Application[]> = { new: [], in_progress: [], interviewed: [], shortlisted: [] };
  apps.forEach((a) => {
    const col = columnFor(a.pipeline_stage);
    if (col) grouped[col].push(a);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map(({ key, label }) => {
        const list = grouped[key];
        return (
          <div key={key} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{label}</h3>
              <Badge variant="secondary" className="text-xs">{list.length}</Badge>
            </div>
            <div className="space-y-2">
              {list.map((app) => {
                const score = getScore(app.ai_screening_score);
                const isFailed = app.pipeline_stage === 'failed';
                const badge = key === 'in_progress' ? subStatusBadge(app) : null;

                return (
                  <Card
                    key={app.id}
                    className="shadow-card cursor-pointer hover:shadow-elevated transition-shadow"
                    onClick={() => onOpenDetail(app.id)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{candidateName(app)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{app.jobs?.title ?? 'Unknown Job'}</p>
                      </div>

                      {key === 'new' && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">AI Score</span>
                            <span className={`inline-flex items-center justify-center h-7 w-10 rounded-md border text-xs font-bold ${scoreColor(score)} ${scoreBg(score)}`}>
                              {score ?? '--'}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs text-accent hover:bg-accent/10 hover:text-accent border-accent/20"
                              onClick={(e) => onInvite(app.id, e)}
                              disabled={invitePending}
                            >
                              <Mail className="h-3 w-3 mr-1" />Send Invite
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                              onClick={stop(() => onReject(app.id))}
                            >
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </div>
                        </>
                      )}

                      {key === 'in_progress' && badge && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${phaseClasses(badge.tone)}`}>
                          {badge.label}
                        </span>
                      )}

                      {key === 'interviewed' && !isFailed && (
                        <>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${phaseClasses('success')}`}>
                            Interviewed ✓
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs text-success hover:bg-success/10 hover:text-success border-success/20"
                              onClick={stop(() => onShortlist(app.id))}
                            >
                              <ThumbsUp className="h-3 w-3 mr-1" />Shortlist
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                              onClick={stop(() => onReject(app.id))}
                            >
                              <ThumbsDown className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </div>
                        </>
                      )}

                      {key === 'interviewed' && isFailed && (
                        <>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${phaseClasses('destructive')}`}>
                            Call Failed — {failedAttempts(app)} attempts
                          </span>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs"
                              onClick={stop(() => onRecall(app.id))}
                            >
                              <PhoneCall className="h-3 w-3 mr-1" />Recall
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs"
                              onClick={stop(() => onResendInvite(app.id))}
                              disabled={resendPending}
                            >
                              <RotateCw className="h-3 w-3 mr-1" />Re-send
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                              onClick={stop(() => onReject(app.id))}
                            >
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {list.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  No applications
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

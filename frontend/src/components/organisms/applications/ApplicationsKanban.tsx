import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Application } from '@/domains/applications';
import {
  candidateName,
  computePhase,
  getScore,
  phaseClasses,
  scoreBg,
  scoreColor,
} from './applicationListHelpers';

interface Props {
  apps: Application[];
  onOpenDetail: (id: string) => void;
  onInvite: (id: string, e: React.MouseEvent) => void;
  onReject: (id: string) => void;
  onShortlist: (id: string) => void;
}

type ColumnKey = 'to_review' | 'in_progress' | 'shortlisted';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'to_review', label: 'To Review' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'shortlisted', label: 'Shortlisted' },
];

function columnFor(app: Application): ColumnKey | null {
  if (app.status === 'rejected' || app.status === 'hired') return null;
  if (app.status === 'shortlisted') return 'shortlisted';
  if (app.invitation_sent) return 'in_progress';
  if (app.status === 'new' || app.status === 'screening') return 'to_review';
  return null;
}

export default function ApplicationsKanban({ apps, onOpenDetail, onInvite, onReject, onShortlist }: Props) {
  const grouped: Record<ColumnKey, Application[]> = { to_review: [], in_progress: [], shortlisted: [] };
  apps.forEach(a => {
    const col = columnFor(a);
    if (col) grouped[col].push(a);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                const phase = computePhase(app);
                return (
                  <Card key={app.id} className="shadow-card cursor-pointer hover:shadow-elevated transition-shadow" onClick={() => onOpenDetail(app.id)}>
                    <CardContent className="p-3 space-y-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{candidateName(app)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{app.jobs?.title ?? 'Unknown Job'}</p>
                      </div>

                      {key === 'to_review' && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">AI Score</span>
                            <span className={`inline-flex items-center justify-center h-7 w-10 rounded-md border text-xs font-bold ${scoreColor(score)} ${scoreBg(score)}`}>
                              {score ?? '--'}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-full text-xs text-accent hover:bg-accent/10 hover:text-accent border-accent/20"
                            onClick={(e) => onInvite(app.id, e)}
                          >
                            <Mail className="h-3 w-3 mr-1" />Send Invite
                          </Button>
                        </>
                      )}

                      {key === 'in_progress' && (
                        <>
                          {phase && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${phaseClasses(phase.tone)}`}>
                              {phase.label}
                            </span>
                          )}
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs text-success hover:bg-success/10 hover:text-success border-success/20"
                              onClick={(e) => { e.stopPropagation(); onShortlist(app.id); }}
                            >
                              <ThumbsUp className="h-3 w-3 mr-1" />Shortlist
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                              onClick={(e) => { e.stopPropagation(); onReject(app.id); }}
                            >
                              <ThumbsDown className="h-3 w-3 mr-1" />Reject
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

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Mail, Phone, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import type { Application } from '@/domains/applications';
import { APPLICATION_STATUS_LABELS } from '@/lib/constants';
import {
  APPLICATION_STATUSES,
  canApproveForInterview,
  canMakeFinalDecision,
  candidateName,
  formatShortDate,
  getAppCallOutcome,
  getScore,
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

const KANBAN_STATUSES = ['new', 'screening', 'shortlisted'] as const;

export default function ApplicationsKanban({ apps, onOpenDetail, onInvite, onReject, onShortlist }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {KANBAN_STATUSES.map((status) => {
        const filtered = apps.filter(a => a.status === status);
        return (
          <div key={status} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{APPLICATION_STATUS_LABELS[status]}</h3>
              <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
            </div>
            <div className="space-y-2">
              {filtered.map((app) => {
                const outcome = getAppCallOutcome(app);
                const score = getScore(app.ai_screening_score);
                return (
                  <Card key={app.id} className="shadow-card cursor-pointer hover:shadow-elevated transition-shadow" onClick={() => onOpenDetail(app.id)}>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium text-foreground">{candidateName(app)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{app.jobs?.title ?? 'Unknown Job'}</p>
                      {outcome && (
                        <div className="mt-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${outcome.color}`}>
                            <Phone className="h-3 w-3" />{outcome.label}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border text-sm font-bold ${scoreColor(score)} ${scoreBg(score)}`}>
                          {score ?? '--'}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatShortDate(app.created_at)}</span>
                      </div>

                      {canApproveForInterview(app.status) && score !== null && (
                        <div className="flex gap-1 mt-2">
                          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-accent hover:bg-accent/10 hover:text-accent border-accent/20" onClick={(e) => onInvite(app.id, e)}>
                            <Mail className="h-3 w-3 mr-1" />Send Invite
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); onReject(app.id); }}>
                            <XCircle className="h-3 w-3 mr-1" />Reject
                          </Button>
                        </div>
                      )}

                      {canMakeFinalDecision(app.status) && (
                        <div className="flex gap-1 mt-2">
                          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-success hover:bg-success/10 hover:text-success border-success/20" onClick={(e) => { e.stopPropagation(); onShortlist(app.id); }}>
                            <ThumbsUp className="h-3 w-3 mr-1" />Shortlist
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); onReject(app.id); }}>
                            <ThumbsDown className="h-3 w-3 mr-1" />Reject
                          </Button>
                        </div>
                      )}

                      {app.status === 'shortlisted' && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-success">
                          <CheckCircle className="h-3 w-3" /> Approved for next round
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {filtered.length === 0 && (
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

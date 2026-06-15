import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import type { Application } from '@/domains/applications';
import { APPLICATION_STATUS_COLORS, APPLICATION_STATUS_LABELS } from '@/lib/constants';
import {
  canApproveForInterview,
  canMakeFinalDecision,
  candidateName,
  computePhase,
  formatShortDate,
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

export default function ApplicationsTable({ apps, onOpenDetail, onInvite, onReject, onShortlist }: Props) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Candidate</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Job</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">AI Score</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
              <th className="text-center p-3 text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => {
              const score = getScore(app.ai_screening_score);
              return (
                <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => onOpenDetail(app.id)}>
                  <td className="p-3 text-sm font-medium">{candidateName(app)}</td>
                  <td className="p-3 text-sm text-muted-foreground">{app.jobs?.title ?? 'Unknown'}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center justify-center h-9 w-12 rounded-lg border text-base font-bold ${scoreColor(score)} ${scoreBg(score)}`}>
                      {score ?? '--'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${APPLICATION_STATUS_COLORS[app.status] || ''}`}>
                      {APPLICATION_STATUS_LABELS[app.status] || app.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{formatShortDate(app.created_at)}</td>
                  <td className="p-3">
                    {canApproveForInterview(app.status) && score !== null ? (
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="outline" className="h-8 text-xs text-accent hover:bg-accent/10 hover:text-accent border-accent/20" onClick={(e) => onInvite(app.id, e)}>
                          <Mail className="h-3.5 w-3.5 mr-1" />Send Invite
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); onReject(app.id); }}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                        </Button>
                      </div>
                    ) : canMakeFinalDecision(app.status) ? (
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="outline" className="h-8 text-xs text-success hover:bg-success/10 hover:text-success border-success/20" onClick={(e) => { e.stopPropagation(); onShortlist(app.id); }}>
                          <ThumbsUp className="h-3.5 w-3.5 mr-1" />Shortlist
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); onReject(app.id); }}>
                          <ThumbsDown className="h-3.5 w-3.5 mr-1" />Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground text-center block">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

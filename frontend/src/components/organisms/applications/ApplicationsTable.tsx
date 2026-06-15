import { Card, CardContent } from '@/components/ui/card';
import type { Application } from '@/domains/applications';
import { APPLICATION_STATUS_COLORS, APPLICATION_STATUS_LABELS } from '@/lib/constants';
import {
  candidateName,
  formatShortDate,
  getScore,
  humanizeStage,
  scoreBg,
  scoreColor,
} from './applicationListHelpers';

interface Props {
  apps: Application[];
  onOpenDetail: (id: string) => void;
}

export default function ApplicationsTable({ apps, onOpenDetail }: Props) {
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
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Stage</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
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
                  <td className="p-3 text-sm">{humanizeStage(app.pipeline_stage)}</td>
                  <td className="p-3 text-sm text-muted-foreground">{formatShortDate(app.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

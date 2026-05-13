import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Briefcase, Phone, ClipboardCheck, Clock, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import { useOverview } from '@/domains/analytics';

const pipelineColors: Record<string, string> = {
  New: 'bg-info',
  Screening: 'bg-warning',
  Interviewed: 'bg-primary',
  Shortlisted: 'bg-accent',
  Hired: 'bg-success',
};

const ACTION_LABELS: Record<string, string> = {
  ai_screening_complete: 'AI Screening Complete',
  outbound_call_initiated: 'Outbound Call Initiated',
  call_completed: 'Call Completed',
  intake_received: 'Intake Received',
  ceipal_sync: 'CEIPAL Sync',
  approved_for_interview: 'Approved for Interview',
  signup: 'Signup',
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Dashboard() {
  const { data, isLoading, error } = useOverview();

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data?.data) {
    return (
      <EmptyState
        title="Unable to load dashboard"
        description={error instanceof Error ? error.message : 'Could not connect to the server. Make sure the backend is running.'}
      />
    );
  }

  const overview = data.data as any;

  const stats = [
    { label: 'Total Candidates', value: overview.total_candidates?.toLocaleString() ?? '0', icon: Users },
    { label: 'Open Jobs', value: String(overview.open_jobs ?? 0), icon: Briefcase },
    { label: 'Calls Today', value: String(overview.calls_today ?? 0), icon: Phone },
    { label: 'Pending Reviews', value: String(overview.pending_reviews ?? 0), icon: ClipboardCheck },
  ];

  const recentActivity = (overview.recent_activity ?? []).map((item: any) => ({
    user: item.users?.full_name || item.user || 'System',
    action: `${formatAction(item.action)}${item.details?.candidate ? ` — ${item.details.candidate}` : ''}${item.details?.email ? ` (${item.details.email})` : ''}`,
    time: item.created_at ? new Date(item.created_at).toLocaleString() : '',
  }));
  const scheduledCalls = overview.scheduled_calls ?? [];
  const topJobs = overview.top_jobs ?? [];
  const pipeline = overview.pipeline ?? overview.application_stats ?? [];
  const maxPipeline = pipeline.length > 0 ? Math.max(...pipeline.map((p: any) => p.count || 0), 1) : 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-primary">{item.user[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground"><span className="font-medium">{item.user}</span> {item.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {pipeline.length > 0 && (
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Application Pipeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pipeline.map((stage: any) => (
                    <div key={stage.stage} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-24 shrink-0">{stage.stage}</span>
                      <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full ${pipelineColors[stage.stage] || 'bg-primary'} rounded-full flex items-center justify-end pr-2 transition-all`}
                          style={{ width: `${(stage.count / maxPipeline) * 100}%` }}
                        >
                          <span className="text-xs font-medium text-primary-foreground">{stage.count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Upcoming Interviews</CardTitle></CardHeader>
            <CardContent>
              {scheduledCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No upcoming interviews</p>
              ) : (
                <div className="space-y-3">
                  {scheduledCalls.map((call: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{call.candidate}</p>
                        <p className="text-xs text-muted-foreground truncate">{call.job}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="text-xs"><Clock className="h-3 w-3 mr-1" />{call.time}</Badge>
                          {call.source === 'cal.com' && (
                            <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">
                              <Calendar className="h-3 w-3 mr-1" />Cal.com
                            </Badge>
                          )}
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs"><Phone className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {topJobs.length > 0 && (
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Top Jobs by Applications</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topJobs} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="apps" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

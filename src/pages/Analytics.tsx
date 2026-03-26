import { useQuery } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Phone, Star, TrendingUp } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { StatsSkeleton } from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';

interface AnalyticsOverview {
  total_candidates: number;
  total_calls: number;
  avg_screening_score?: number;
  hire_rate?: number;
  calls_over_time?: { date: string; calls: number }[];
  call_outcomes?: { name: string; value: number; color: string }[];
  apps_by_status?: { status: string; count: number }[];
}

export default function Analytics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => apiRequest<ApiResponse<AnalyticsOverview>>('/api/analytics/overview'),
  });

  if (isLoading) return <div className="space-y-6"><StatsSkeleton /></div>;
  if (error) return <EmptyState title="Failed to load analytics" description={error instanceof Error ? error.message : 'An error occurred'} />;

  const overview = data?.data;
  const kpis = [
    { label: 'Total Candidates', value: overview?.total_candidates?.toLocaleString() ?? '0', icon: Users },
    { label: 'Total Calls', value: overview?.total_calls?.toLocaleString() ?? '0', icon: Phone },
    { label: 'Avg Screening Score', value: overview?.avg_screening_score?.toFixed(1) ?? '—', icon: Star },
    { label: 'Hire Rate', value: overview?.hire_rate ? `${overview.hire_rate}%` : '—', icon: TrendingUp },
  ];

  const callsOverTime = overview?.calls_over_time ?? [];
  const callOutcomes = overview?.call_outcomes ?? [];
  const appsByStatus = overview?.apps_by_status ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recruiter">Recruiter Performance</TabsTrigger>
          <TabsTrigger value="agent">Agent Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="shadow-card">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{kpi.label}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <kpi.icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {(callsOverTime.length > 0 || callOutcomes.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {callsOverTime.length > 0 && (
                <Card className="shadow-card">
                  <CardHeader><CardTitle className="text-base">Calls Over Time</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={callsOverTime}>
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
              {callOutcomes.length > 0 && (
                <Card className="shadow-card">
                  <CardHeader><CardTitle className="text-base">Call Outcomes</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={callOutcomes} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                          {callOutcomes.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {appsByStatus.length > 0 && (
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Applications by Status</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={appsByStatus}>
                    <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recruiter" className="mt-6">
          <Card className="shadow-card">
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Select a recruiter to view performance metrics.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent" className="mt-6">
          <Card className="shadow-card">
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Select an agent to view performance metrics.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

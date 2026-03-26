import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface RecruiterStats {
  total_applications: number;
  completed_calls: number;
  avg_call_duration: number;
  evaluations: { decision: string; count: number }[];
}

interface Agent { id: string; name: string }

interface AgentStats {
  agent_name: string;
  company_name: string;
  total_calls: number;
  completed_calls: number;
  success_rate: number;
  avg_duration_minutes: number;
  sentiment_breakdown: Record<string, number>;
  calls_by_status: { name: string; value: number }[];
}

export default function Analytics() {
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => apiRequest<ApiResponse<AnalyticsOverview>>('/api/analytics/overview'),
  });

  const { data: meData } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<ApiResponse<{ id: string; full_name: string }>>('/api/auth/me'),
    retry: false,
  });

  const recruiterId = meData?.data?.id;

  const { data: recruiterData } = useQuery({
    queryKey: ['analytics-recruiter', recruiterId],
    queryFn: () => apiRequest<ApiResponse<RecruiterStats>>(`/api/analytics/recruiter/${recruiterId}`),
    enabled: !!recruiterId,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents-for-analytics'],
    queryFn: () => apiRequest<ApiResponse<Agent[]>>('/api/agents?active_only=false'),
  });

  const { data: agentStatsData } = useQuery({
    queryKey: ['analytics-agent', selectedAgentId],
    queryFn: () => apiRequest<ApiResponse<AgentStats>>(`/api/analytics/agent/${selectedAgentId}`),
    enabled: !!selectedAgentId,
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
  const rStats = recruiterData?.data;
  const aStats = agentStatsData?.data;
  const agents = agentsData?.data ?? [];

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

        <TabsContent value="recruiter" className="mt-6 space-y-6">
          {rStats ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="shadow-card"><CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total Applications</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{rStats.total_applications}</p>
                </CardContent></Card>
                <Card className="shadow-card"><CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Completed Calls</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{rStats.completed_calls}</p>
                </CardContent></Card>
                <Card className="shadow-card"><CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Avg Call Duration</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{rStats.avg_call_duration ? `${Math.round(rStats.avg_call_duration / 60)}m` : '—'}</p>
                </CardContent></Card>
              </div>
              {rStats.evaluations?.length > 0 && (
                <Card className="shadow-card">
                  <CardHeader><CardTitle className="text-base">Evaluations</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={rStats.evaluations}>
                        <XAxis dataKey="decision" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="shadow-card"><CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Loading your performance data...</p>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="agent" className="mt-6 space-y-6">
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger className="max-w-xs"><SelectValue placeholder="Select an agent" /></SelectTrigger>
            <SelectContent>
              {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {aStats ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-foreground">{aStats.agent_name}</h3>
                {aStats.company_name && <span className="text-sm text-muted-foreground">• {aStats.company_name}</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="shadow-card"><CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total Calls</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{aStats.total_calls}</p>
                </CardContent></Card>
                <Card className="shadow-card"><CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{aStats.completed_calls}</p>
                </CardContent></Card>
                <Card className="shadow-card"><CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{aStats.success_rate != null ? `${aStats.success_rate}%` : '—'}</p>
                </CardContent></Card>
                <Card className="shadow-card"><CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Avg Duration</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{aStats.avg_duration_minutes != null ? `${aStats.avg_duration_minutes}m` : '—'}</p>
                </CardContent></Card>
              </div>
              {aStats.calls_by_status?.length > 0 && (
                <Card className="shadow-card">
                  <CardHeader><CardTitle className="text-base">Calls by Status</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={aStats.calls_by_status} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                          {aStats.calls_by_status.map((_, i) => (
                            <Cell key={i} fill={['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--info))'][i % 5]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="shadow-card"><CardContent className="p-12 text-center">
              <p className="text-muted-foreground">{selectedAgentId ? 'Loading agent stats...' : 'Select an agent to view performance.'}</p>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

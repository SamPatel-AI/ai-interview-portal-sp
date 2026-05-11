import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Phone, Star, TrendingUp, Download, Briefcase, ClipboardList, PhoneCall } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { StatsSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import { useQuery } from '@tanstack/react-query';
import { useOverview, useRecruiterStats, useAgentStats } from '@/domains/analytics';
import { useAgents } from '@/domains/agents';
import { useAuthMe } from '@/domains/auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';

interface RecruiterWorkload {
  id: string;
  full_name: string;
  email: string;
  open_applications: number;
  total_calls: number;
  pending_evaluations: number;
}

export default function Analytics() {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const { toast } = useToast();

  // Recruiter workload
  const { data: workloadData } = useQuery({
    queryKey: ['analytics-workload'],
    queryFn: () => apiRequest<ApiResponse<RecruiterWorkload[]>>('/api/analytics/recruiters'),
  });

  const workload: RecruiterWorkload[] = (workloadData as any)?.data || [];

  // CSV Export
  const handleExport = async (type: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/reports/export?type=${type}`, {
        headers: {
          'Authorization': `Bearer ${(await (await import('@/lib/supabase')).supabase.auth.getSession()).data.session?.access_token}`,
        },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export downloaded' });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  const { data, isLoading, error } = useOverview();
  const { data: meData } = useAuthMe();
  const recruiterId = meData?.data?.id;
  const { data: recruiterData } = useRecruiterStats(recruiterId ?? null);
  const { data: agentsData } = useAgents();
  const { data: agentStatsData } = useAgentStats(selectedAgentId || null);

  if (isLoading) return <div className="space-y-6"><StatsSkeleton /></div>;
  if (error) return <EmptyState title="Failed to load analytics" description={error instanceof Error ? error.message : 'An error occurred'} />;

  const overview = data?.data as any;
  const kpis = [
    { label: 'Total Candidates', value: overview?.total_candidates?.toLocaleString() ?? '0', icon: Users },
    { label: 'Total Calls', value: overview?.total_calls?.toLocaleString() ?? '0', icon: Phone },
    { label: 'Avg Screening Score', value: overview?.avg_screening_score?.toFixed(1) ?? '—', icon: Star },
    { label: 'Hire Rate', value: overview?.hire_rate ? `${overview.hire_rate}%` : '—', icon: TrendingUp },
  ];

  const callsOverTime = overview?.calls_over_time ?? [];
  const callOutcomes = overview?.call_outcomes ?? [];
  const appsByStatus = overview?.apps_by_status ?? [];
  const rStats = recruiterData?.data as any;
  const aStats = agentStatsData?.data as any;
  const agents = agentsData?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs defaultValue="overview">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="workload">Recruiter Workload</TabsTrigger>
            <TabsTrigger value="recruiter">My Performance</TabsTrigger>
            <TabsTrigger value="agent">Agent Performance</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('applications')}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Applications CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('calls')}>
              <Download className="h-3.5 w-3.5 mr-1.5" />Calls CSV
            </Button>
          </div>
        </div>

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
                          {callOutcomes.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
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

        <TabsContent value="workload" className="mt-6 space-y-6">
          {workload.length > 0 ? (
            <>
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-base">Recruiter Workload Comparison</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={workload} layout="vertical" margin={{ left: 100 }}>
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="full_name" tick={{ fontSize: 12 }} width={100} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="open_applications" name="Open Applications" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="total_calls" name="Total Calls" fill="hsl(210, 60%, 60%)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="pending_evaluations" name="Pending Reviews" fill="hsl(40, 80%, 55%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workload.map((r) => (
                  <Card key={r.id} className="shadow-card">
                    <CardContent className="p-5 space-y-3">
                      <div>
                        <p className="font-medium text-foreground">{r.full_name}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <Briefcase className="h-4 w-4 mx-auto text-primary mb-1" />
                          <p className="text-lg font-bold">{r.open_applications}</p>
                          <p className="text-[10px] text-muted-foreground">Applications</p>
                        </div>
                        <div>
                          <PhoneCall className="h-4 w-4 mx-auto text-blue-500 mb-1" />
                          <p className="text-lg font-bold">{r.total_calls}</p>
                          <p className="text-[10px] text-muted-foreground">Calls</p>
                        </div>
                        <div>
                          <ClipboardList className="h-4 w-4 mx-auto text-amber-500 mb-1" />
                          <p className="text-lg font-bold">{r.pending_evaluations}</p>
                          <p className="text-[10px] text-muted-foreground">Pending</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card className="shadow-card"><CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No recruiter data available</p>
            </CardContent></Card>
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
                          {aStats.calls_by_status.map((_: any, i: number) => (
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

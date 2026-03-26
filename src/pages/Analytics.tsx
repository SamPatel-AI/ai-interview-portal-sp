import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Phone, Star, TrendingUp } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const kpis = [
  { label: 'Total Candidates', value: '2,847', icon: Users },
  { label: 'Total Calls', value: '1,234', icon: Phone },
  { label: 'Avg Screening Score', value: '7.2', icon: Star },
  { label: 'Hire Rate', value: '18%', icon: TrendingUp },
];

const callsOverTime = [
  { date: 'Mar 1', calls: 12 }, { date: 'Mar 5', calls: 18 }, { date: 'Mar 9', calls: 24 },
  { date: 'Mar 13', calls: 15 }, { date: 'Mar 17', calls: 30 }, { date: 'Mar 21', calls: 22 },
  { date: 'Mar 25', calls: 28 },
];

const callOutcomes = [
  { name: 'Completed', value: 65, color: 'hsl(142, 76%, 36%)' },
  { name: 'No Answer', value: 15, color: 'hsl(220, 9%, 46%)' },
  { name: 'Voicemail', value: 10, color: 'hsl(199, 89%, 48%)' },
  { name: 'Failed', value: 7, color: 'hsl(0, 84%, 60%)' },
  { name: 'Interrupted', value: 3, color: 'hsl(38, 92%, 50%)' },
];

const appsByStatus = [
  { status: 'New', count: 156 }, { status: 'Screening', count: 89 },
  { status: 'Interviewed', count: 45 }, { status: 'Shortlisted', count: 23 },
  { status: 'Rejected', count: 67 }, { status: 'Hired', count: 12 },
];

export default function Analytics() {
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Calls Over Time</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={callsOverTime}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="calls" stroke="hsl(239, 84%, 67%)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

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
          </div>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Applications by Status</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={appsByStatus}>
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(239, 84%, 67%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
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

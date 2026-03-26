import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Briefcase, Phone, ClipboardCheck, TrendingUp, TrendingDown, Clock, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const stats = [
  { label: 'Total Candidates', value: '2,847', trend: '+12%', up: true, icon: Users },
  { label: 'Open Jobs', value: '34', trend: '+3', up: true, icon: Briefcase },
  { label: 'Calls Today', value: '18', trend: '-2', up: false, icon: Phone },
  { label: 'Pending Reviews', value: '42', trend: '+8', up: true, icon: ClipboardCheck },
];

const pipeline = [
  { stage: 'New', count: 156, color: 'bg-info' },
  { stage: 'Screening', count: 89, color: 'bg-warning' },
  { stage: 'Interviewed', count: 45, color: 'bg-primary' },
  { stage: 'Shortlisted', count: 23, color: 'bg-accent' },
  { stage: 'Hired', count: 12, color: 'bg-success' },
];

const recentActivity = [
  { user: 'Sarah K.', action: 'screened candidate Alex Johnson', time: '5 min ago' },
  { user: 'AI Agent', action: 'completed call with Maria Garcia', time: '12 min ago' },
  { user: 'John D.', action: 'posted new job: Senior React Developer', time: '1 hour ago' },
  { user: 'AI Agent', action: 'new application for Full-Stack Engineer', time: '2 hours ago' },
  { user: 'Emily R.', action: 'evaluated call with James Wilson', time: '3 hours ago' },
];

const scheduledCalls = [
  { candidate: 'Lisa Chen', job: 'Product Designer', time: '2:00 PM', source: 'cal.com' },
  { candidate: 'David Kim', job: 'Data Analyst', time: '10:00 AM', source: 'cal.com' },
  { candidate: 'Sarah Miller', job: 'Backend Engineer', time: '11:30 AM', source: 'cal.com' },
  { candidate: 'Alex Johnson', job: 'Sr. React Developer', time: '2:30 PM', source: null },
];

const topJobs = [
  { name: 'Sr. React Dev', apps: 45 },
  { name: 'Full-Stack Eng', apps: 38 },
  { name: 'DevOps Eng', apps: 31 },
  { name: 'Product Designer', apps: 27 },
  { name: 'Data Analyst', apps: 22 },
];

export default function Dashboard() {
  const maxPipeline = Math.max(...pipeline.map(p => p.count));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Row */}
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
              <div className="flex items-center gap-1 mt-2">
                {stat.up ? (
                  <TrendingUp className="h-3 w-3 text-success" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs font-medium ${stat.up ? 'text-success' : 'text-destructive'}`}>
                  {stat.trend}
                </span>
                <span className="text-xs text-muted-foreground">vs last week</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-medium text-primary">{item.user[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{item.user}</span> {item.action}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Application Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pipeline.map((stage) => (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-24 shrink-0">{stage.stage}</span>
                    <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                      <div
                        className={`h-full ${stage.color} rounded-full flex items-center justify-end pr-2 transition-all`}
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
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Upcoming Interviews</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {scheduledCalls.map((call, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{call.candidate}</p>
                      <p className="text-xs text-muted-foreground truncate">{call.job}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />{call.time}
                        </Badge>
                        {call.source === 'cal.com' && (
                          <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">
                            <Calendar className="h-3 w-3 mr-1" />Cal.com
                          </Badge>
                        )}
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <Phone className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Top Jobs by Applications</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topJobs} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="apps" fill="hsl(239, 84%, 67%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

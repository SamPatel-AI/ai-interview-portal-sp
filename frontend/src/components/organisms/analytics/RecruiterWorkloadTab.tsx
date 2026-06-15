import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Briefcase, PhoneCall, ClipboardList, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import EmptyState from '@/components/molecules/EmptyState';
import type { RecruiterWorkload } from '@/domains/analytics';

interface RecruiterWorkloadTabProps {
  data: RecruiterWorkload[];
}

export default function RecruiterWorkloadTab({ data }: RecruiterWorkloadTabProps) {
  if (!data.length) {
    return <EmptyState icon={Users} title="No recruiter data available" description="Recruiter workload metrics will appear here once team activity begins." />;
  }

  const chartData = data.map((r) => ({
    name: r.full_name,
    open_applications: r.open_applications,
    total_calls: r.total_calls,
    pending_evaluations: r.pending_evaluations,
  }));

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Recruiter Workload</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(240, data.length * 56)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
              <Tooltip />
              <Legend />
              <Bar dataKey="open_applications" name="Open Applications" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="total_calls" name="Total Calls" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="pending_evaluations" name="Pending Reviews" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((r) => (
          <Card key={r.id} className="shadow-card">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {r.avatar_url && <AvatarImage src={r.avatar_url} alt={r.full_name} />}
                  <AvatarFallback>{r.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{r.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <Briefcase className="h-4 w-4 mx-auto text-primary mb-1" />
                  <p className="text-lg font-bold text-foreground">{r.open_applications}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Open</p>
                </div>
                <div>
                  <PhoneCall className="h-4 w-4 mx-auto text-success mb-1" />
                  <p className="text-lg font-bold text-foreground">{r.total_calls}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Calls</p>
                </div>
                <div>
                  <ClipboardList className="h-4 w-4 mx-auto text-warning mb-1" />
                  <p className="text-lg font-bold text-foreground">{r.pending_evaluations}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

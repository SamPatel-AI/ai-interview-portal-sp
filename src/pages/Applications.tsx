import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutGrid, List } from 'lucide-react';

const statuses = ['New', 'Screening', 'Interviewed', 'Shortlisted', 'Rejected', 'Hired'] as const;

const statusColors: Record<string, string> = {
  New: 'bg-info/10 text-info border-info/20',
  Screening: 'bg-warning/10 text-warning border-warning/20',
  Interviewed: 'bg-primary/10 text-primary border-primary/20',
  Shortlisted: 'bg-accent/10 text-accent border-accent/20',
  Rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  Hired: 'bg-success/10 text-success border-success/20',
};

const mockApps = [
  { id: '1', candidate: 'Alex Johnson', job: 'Sr. React Developer', score: 8.5, status: 'Screening', date: 'Mar 15' },
  { id: '2', candidate: 'Maria Garcia', job: 'Full-Stack Engineer', score: 7.2, status: 'New', date: 'Mar 14' },
  { id: '3', candidate: 'James Wilson', job: 'DevOps Engineer', score: 6.1, status: 'Interviewed', date: 'Mar 13' },
  { id: '4', candidate: 'Lisa Chen', job: 'Product Designer', score: 9.0, status: 'Shortlisted', date: 'Mar 12' },
  { id: '5', candidate: 'Robert Davis', job: 'Sr. React Developer', score: 4.5, status: 'Rejected', date: 'Mar 11' },
  { id: '6', candidate: 'Emma Thompson', job: 'Full-Stack Engineer', score: 8.8, status: 'Hired', date: 'Mar 10' },
  { id: '7', candidate: 'David Kim', job: 'Data Analyst', score: 7.0, status: 'New', date: 'Mar 14' },
  { id: '8', candidate: 'Sarah Miller', job: 'Backend Engineer', score: 5.5, status: 'Screening', date: 'Mar 13' },
];

const scoreColor = (score: number) => {
  if (score >= 7) return 'text-success';
  if (score >= 4) return 'text-warning';
  return 'text-destructive';
};

export default function Applications() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant={view === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setView('kanban')}>
            <LayoutGrid className="h-4 w-4 mr-1" />Kanban
          </Button>
          <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')}>
            <List className="h-4 w-4 mr-1" />Table
          </Button>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {statuses.map((status) => {
            const apps = mockApps.filter(a => a.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">{status}</h3>
                  <Badge variant="secondary" className="text-xs">{apps.length}</Badge>
                </div>
                <div className="space-y-2">
                  {apps.map((app) => (
                    <Card key={app.id} className="shadow-card cursor-pointer hover:shadow-elevated transition-shadow">
                      <CardContent className="p-3">
                        <p className="text-sm font-medium text-foreground">{app.candidate}</p>
                        <p className="text-xs text-muted-foreground mt-1">{app.job}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-sm font-bold ${scoreColor(app.score)}`}>{app.score}</span>
                          <span className="text-xs text-muted-foreground">{app.date}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {apps.length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                      No applications
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Candidate</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Job</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Score</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {mockApps.map((app) => (
                  <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                    <td className="p-3 text-sm font-medium">{app.candidate}</td>
                    <td className="p-3 text-sm text-muted-foreground">{app.job}</td>
                    <td className={`p-3 text-sm font-bold ${scoreColor(app.score)}`}>{app.score}</td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[app.status]}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{app.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

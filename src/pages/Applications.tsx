import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List, CheckCircle, XCircle, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const statuses = ['New', 'Screening', 'Interviewed', 'Shortlisted', 'Rejected', 'Hired'] as const;

const statusColors: Record<string, string> = {
  New: 'bg-info/10 text-info border-info/20',
  Screening: 'bg-warning/10 text-warning border-warning/20',
  Interviewed: 'bg-primary/10 text-primary border-primary/20',
  Shortlisted: 'bg-accent/10 text-accent border-accent/20',
  Rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  Hired: 'bg-success/10 text-success border-success/20',
};

const initialApps = [
  { id: '1', candidate: 'Alex Johnson', job: 'Sr. React Developer', score: 8.5, status: 'Screening', date: 'Mar 15', invitationSent: false },
  { id: '2', candidate: 'Maria Garcia', job: 'Full-Stack Engineer', score: 7.2, status: 'New', date: 'Mar 14', invitationSent: false },
  { id: '3', candidate: 'James Wilson', job: 'DevOps Engineer', score: 6.1, status: 'Interviewed', date: 'Mar 13', invitationSent: false },
  { id: '4', candidate: 'Lisa Chen', job: 'Product Designer', score: 9.0, status: 'Shortlisted', date: 'Mar 12', invitationSent: true },
  { id: '5', candidate: 'Robert Davis', job: 'Sr. React Developer', score: 4.5, status: 'Rejected', date: 'Mar 11', invitationSent: false },
  { id: '6', candidate: 'Emma Thompson', job: 'Full-Stack Engineer', score: 8.8, status: 'Hired', date: 'Mar 10', invitationSent: true },
  { id: '7', candidate: 'David Kim', job: 'Data Analyst', score: 7.0, status: 'New', date: 'Mar 14', invitationSent: false },
  { id: '8', candidate: 'Sarah Miller', job: 'Backend Engineer', score: 5.5, status: 'Screening', date: 'Mar 13', invitationSent: false },
];

const scoreColor = (score: number) => {
  if (score >= 7) return 'text-success';
  if (score >= 4) return 'text-warning';
  return 'text-destructive';
};

const scoreBg = (score: number) => {
  if (score >= 7) return 'bg-success/10 border-success/20';
  if (score >= 4) return 'bg-warning/10 border-warning/20';
  return 'bg-destructive/10 border-destructive/20';
};

export default function Applications() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [apps, setApps] = useState(() =>
    [...initialApps].sort((a, b) => b.score - a.score)
  );
  const { toast } = useToast();

  const handleApprove = (id: string) => {
    setApps(prev =>
      prev.map(app =>
        app.id === id ? { ...app, status: 'Shortlisted', invitationSent: true } : app
      )
    );
    toast({
      title: '✅ Candidate approved',
      description: 'Invitation email sent automatically',
    });
  };

  const handleReject = (id: string) => {
    setApps(prev =>
      prev.map(app =>
        app.id === id ? { ...app, status: 'Rejected' } : app
      )
    );
    toast({
      title: '❌ Candidate rejected',
      description: 'Application status updated to Rejected',
    });
  };

  const canActOn = (status: string) =>
    !['Shortlisted', 'Rejected', 'Hired'].includes(status);

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
            const filtered = apps.filter(a => a.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">{status}</h3>
                  <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
                </div>
                <div className="space-y-2">
                  {filtered.map((app) => (
                    <Card key={app.id} className="shadow-card cursor-pointer hover:shadow-elevated transition-shadow">
                      <CardContent className="p-3">
                        <p className="text-sm font-medium text-foreground">{app.candidate}</p>
                        <p className="text-xs text-muted-foreground mt-1">{app.job}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border text-sm font-bold ${scoreColor(app.score)} ${scoreBg(app.score)}`}>
                            {app.score}
                          </span>
                          <span className="text-xs text-muted-foreground">{app.date}</span>
                        </div>
                        {app.invitationSent && app.status === 'Shortlisted' && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-accent">
                            <Mail className="h-3 w-3" /> Invitation sent
                          </div>
                        )}
                        {canActOn(app.status) && (
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-success hover:bg-success/10 hover:text-success border-success/20" onClick={(e) => { e.stopPropagation(); handleApprove(app.id); }}>
                              <CheckCircle className="h-3 w-3 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); handleReject(app.id); }}>
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {filtered.length === 0 && (
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
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">AI Score</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                    <td className="p-3 text-sm font-medium">{app.candidate}</td>
                    <td className="p-3 text-sm text-muted-foreground">{app.job}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center justify-center h-9 w-12 rounded-lg border text-base font-bold ${scoreColor(app.score)} ${scoreBg(app.score)}`}>
                        {app.score}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[app.status]}`}>
                          {app.status}
                        </span>
                        {app.invitationSent && app.status === 'Shortlisted' && (
                          <span className="inline-flex items-center gap-1 text-xs text-accent">
                            <Mail className="h-3 w-3" /> Sent
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{app.date}</td>
                    <td className="p-3">
                      {canActOn(app.status) ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 text-xs text-success hover:bg-success/10 hover:text-success border-success/20" onClick={() => handleApprove(app.id)}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={() => handleReject(app.id)}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground text-center block">—</span>
                      )}
                    </td>
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

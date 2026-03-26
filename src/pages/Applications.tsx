import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List, CheckCircle, XCircle, Mail, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';
import ApplicationDetailSheet from '@/components/ApplicationDetailSheet';

interface Application {
  id: string;
  status: string;
  ai_screening_score: number | null;
  created_at: string;
  candidates?: { first_name: string; last_name: string };
  jobs?: { title: string };
}

const statuses = ['new', 'screening', 'interviewed', 'shortlisted', 'rejected', 'hired'] as const;

const statusLabels: Record<string, string> = {
  new: 'New', screening: 'Screening', interviewed: 'Interviewed',
  shortlisted: 'Shortlisted', rejected: 'Rejected', hired: 'Hired',
};

const statusColors: Record<string, string> = {
  new: 'bg-info/10 text-info border-info/20',
  screening: 'bg-warning/10 text-warning border-warning/20',
  interviewed: 'bg-primary/10 text-primary border-primary/20',
  shortlisted: 'bg-accent/10 text-accent border-accent/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  hired: 'bg-success/10 text-success border-success/20',
};

const scoreColor = (score: number | null) => {
  if (score === null) return 'text-muted-foreground';
  if (score >= 7) return 'text-success';
  if (score >= 4) return 'text-warning';
  return 'text-destructive';
};

const scoreBg = (score: number | null) => {
  if (score === null) return 'bg-muted border-muted';
  if (score >= 7) return 'bg-success/10 border-success/20';
  if (score >= 4) return 'bg-warning/10 border-warning/20';
  return 'bg-destructive/10 border-destructive/20';
};

const canActOn = (status: string) =>
  !['shortlisted', 'rejected', 'hired'].includes(status);

export default function Applications() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiRequest<ApiResponse<Application[]>>('/api/applications?page=1&limit=100'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      if (variables.status === 'shortlisted') {
        toast({ title: '✅ Candidate approved', description: 'Invitation email sent automatically' });
      } else if (variables.status === 'rejected') {
        toast({ title: '❌ Candidate rejected', description: 'Application status updated to Rejected' });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update status', description: err.message, variant: 'destructive' });
    },
  });

  const handleApprove = (id: string) => updateStatusMutation.mutate({ id, status: 'shortlisted' });
  const handleReject = (id: string) => updateStatusMutation.mutate({ id, status: 'rejected' });
  const openDetail = (id: string) => { setSelectedAppId(id); setSheetOpen(true); };

  const apps = [...(data?.data ?? [])].sort((a, b) => (b.ai_screening_score ?? 0) - (a.ai_screening_score ?? 0));
  const candidateName = (app: Application) =>
    app.candidates ? `${app.candidates.first_name} ${app.candidates.last_name}` : 'Unknown';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (isLoading) return <TableSkeleton cols={6} />;
  if (error) return <EmptyState icon={ClipboardCheck} title="Failed to load applications" description={error instanceof Error ? error.message : 'An error occurred'} />;
  if (apps.length === 0) return <EmptyState icon={ClipboardCheck} title="No applications yet" description="Applications will appear here when candidates apply to your jobs." />;

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
                  <h3 className="text-sm font-medium text-foreground">{statusLabels[status]}</h3>
                  <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
                </div>
                <div className="space-y-2">
                  {filtered.map((app) => (
                    <Card key={app.id} className="shadow-card cursor-pointer hover:shadow-elevated transition-shadow" onClick={() => openDetail(app.id)}>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium text-foreground">{candidateName(app)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{app.jobs?.title ?? 'Unknown Job'}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border text-sm font-bold ${scoreColor(app.ai_screening_score)} ${scoreBg(app.ai_screening_score)}`}>
                            {app.ai_screening_score ?? '—'}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(app.created_at)}</span>
                        </div>
                        {app.status === 'shortlisted' && (
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
                  <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(app.id)}>
                    <td className="p-3 text-sm font-medium">{candidateName(app)}</td>
                    <td className="p-3 text-sm text-muted-foreground">{app.jobs?.title ?? 'Unknown'}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center justify-center h-9 w-12 rounded-lg border text-base font-bold ${scoreColor(app.ai_screening_score)} ${scoreBg(app.ai_screening_score)}`}>
                        {app.ai_screening_score ?? '—'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[app.status] || ''}`}>
                          {statusLabels[app.status] || app.status}
                        </span>
                        {app.status === 'shortlisted' && (
                          <span className="inline-flex items-center gap-1 text-xs text-accent">
                            <Mail className="h-3 w-3" /> Sent
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{formatDate(app.created_at)}</td>
                    <td className="p-3">
                      {canActOn(app.status) ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 text-xs text-success hover:bg-success/10 hover:text-success border-success/20" onClick={(e) => { e.stopPropagation(); handleApprove(app.id); }}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); handleReject(app.id); }}>
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

      <ApplicationDetailSheet applicationId={selectedAppId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

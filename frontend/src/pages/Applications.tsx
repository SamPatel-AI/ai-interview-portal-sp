import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LayoutGrid, List, CheckCircle, XCircle, Mail, ClipboardCheck, ThumbsUp, ThumbsDown, Phone, CalendarIcon } from 'lucide-react';
import { TableSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import ApplicationDetailSheet from '@/components/organisms/applications/ApplicationDetailSheet';
import { useApplications, useApproveInterview, useUpdateApplication } from '@/domains/applications';
import type { Application } from '@/domains/applications';
import { APPLICATION_STATUS_COLORS, APPLICATION_STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const getScore = (score: Application['ai_screening_score']): number | null => {
  if (score === null || score === undefined) return null;
  if (typeof score === 'number') return score;
  return null;
};

const statuses = ['new', 'screening', 'interviewed', 'shortlisted', 'rejected', 'hired'] as const;

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

function getAppCallOutcome(app: Application) {
  if (!app.calls || app.calls.length === 0) return null;
  const latest = [...app.calls].sort((a, b) =>
    new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()
  )[0];
  const reason = latest.disconnection_reason;
  if (reason === 'dial_no_answer') return { label: 'No Answer', color: 'bg-yellow-500/10 text-yellow-600' };
  if (reason === 'voicemail_reached') return { label: 'Voicemail', color: 'bg-yellow-500/10 text-yellow-600' };
  if (reason === 'user_hangup') return { label: 'Candidate Ended', color: 'bg-blue-500/10 text-blue-600' };
  if (reason === 'agent_hangup') return { label: 'Completed', color: 'bg-green-500/10 text-green-600' };
  if (reason === 'dial_failed' || reason === 'dial_busy' || reason === 'error_inactivity') return { label: 'Failed', color: 'bg-destructive/10 text-destructive' };
  if (latest.status === 'scheduled') return { label: 'Scheduled', color: 'bg-blue-500/10 text-blue-600' };
  if (latest.status === 'in_progress') return { label: 'In Progress', color: 'bg-purple-500/10 text-purple-600' };
  return { label: latest.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: 'bg-muted text-muted-foreground' };
}

export default function Applications() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingAppId, setPendingAppId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );

  const { data, isLoading, error } = useApplications({ page: 1 });
  const approveInterviewMutation = useApproveInterview();
  const updateStatusMutation = useUpdateApplication();

  const handleReject = (id: string) => updateStatusMutation.mutate({ id, status: 'rejected' });
  const openDetail = (id: string) => { setSelectedAppId(id); setSheetOpen(true); };

  const openInviteDialog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingAppId(id);
    setSelectedDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setDialogOpen(true);
  };

  const handleConfirmInvite = () => {
    if (!pendingAppId) return;
    approveInterviewMutation.mutate({
      id: pendingAppId,
      deadline: selectedDate?.toISOString(),
    });
    setDialogOpen(false);
    setPendingAppId(null);
  };

  const handleCancelInvite = () => {
    setDialogOpen(false);
    setPendingAppId(null);
  };

  const allApps = [...(data?.data ?? [])].sort((a, b) => (getScore(b.ai_screening_score) ?? 0) - (getScore(a.ai_screening_score) ?? 0));

  const companies = useMemo(() => {
    const names = new Set<string>();
    allApps.forEach((app) => {
      const name = app.jobs?.client_companies?.name;
      if (name) names.add(name);
    });
    return Array.from(names).sort();
  }, [allApps]);

  const filteredApps = selectedCompany === 'all'
    ? allApps
    : allApps.filter((app) => app.jobs?.client_companies?.name === selectedCompany);

  const candidateName = (app: Application) =>
    app.candidates ? `${app.candidates.first_name} ${app.candidates.last_name}` : 'Unknown';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const canApproveForInterview = (status: string) => ['new', 'screening'].includes(status);
  const canMakeFinalDecision = (status: string) => status === 'interviewed';

  if (isLoading) return <TableSkeleton cols={6} />;
  if (error) return <EmptyState icon={ClipboardCheck} title="Failed to load applications" description={error instanceof Error ? error.message : 'An error occurred'} />;
  if (allApps.length === 0) return <EmptyState icon={ClipboardCheck} title="No applications yet" description="Applications will appear here when candidates apply to your jobs." />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex gap-1">
          <Button variant={view === 'kanban' ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setView('kanban')}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={view === 'table' ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setView('table')}>
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {companies.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={selectedCompany === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCompany('all')}
          >
            All
          </Button>
          {companies.map((company) => (
            <Button
              key={company}
              variant={selectedCompany === company ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCompany(company)}
            >
              {company}
            </Button>
          ))}
        </div>
      )}

      {filteredApps.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No applications" description={`No applications match the selected company filter.`} />
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {statuses.map((status) => {
            const filtered = filteredApps.filter(a => a.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">{APPLICATION_STATUS_LABELS[status]}</h3>
                  <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
                </div>
                <div className="space-y-2">
                  {filtered.map((app) => (
                    <Card key={app.id} className="shadow-card cursor-pointer hover:shadow-elevated transition-shadow" onClick={() => openDetail(app.id)}>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium text-foreground">{candidateName(app)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{app.jobs?.title ?? 'Unknown Job'}</p>
                        {app.calls && app.calls.length > 0 && (
                          <div className="mt-1">
                            {(() => {
                              const outcome = getAppCallOutcome(app);
                              if (!outcome) return null;
                              return (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${outcome.color}`}>
                                  <Phone className="h-3 w-3" />{outcome.label}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border text-sm font-bold ${scoreColor(getScore(app.ai_screening_score))} ${scoreBg(getScore(app.ai_screening_score))}`}>
                            {getScore(app.ai_screening_score) ?? '--'}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(app.created_at)}</span>
                        </div>

                        {canApproveForInterview(app.status) && getScore(app.ai_screening_score) !== null && (
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-accent hover:bg-accent/10 hover:text-accent border-accent/20" onClick={(e) => openInviteDialog(app.id, e)}>
                              <Mail className="h-3 w-3 mr-1" />Send Invite
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); handleReject(app.id); }}>
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </div>
                        )}

                        {canMakeFinalDecision(app.status) && (
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-success hover:bg-success/10 hover:text-success border-success/20" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: app.id, status: 'shortlisted' }); }}>
                              <ThumbsUp className="h-3 w-3 mr-1" />Shortlist
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); handleReject(app.id); }}>
                              <ThumbsDown className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </div>
                        )}

                        {app.status === 'shortlisted' && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-success">
                            <CheckCircle className="h-3 w-3" /> Approved for next round
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
                {filteredApps.map((app) => (
                  <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(app.id)}>
                    <td className="p-3 text-sm font-medium">{candidateName(app)}</td>
                    <td className="p-3 text-sm text-muted-foreground">{app.jobs?.title ?? 'Unknown'}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center justify-center h-9 w-12 rounded-lg border text-base font-bold ${scoreColor(getScore(app.ai_screening_score))} ${scoreBg(getScore(app.ai_screening_score))}`}>
                        {getScore(app.ai_screening_score) ?? '--'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${APPLICATION_STATUS_COLORS[app.status] || ''}`}>
                        {APPLICATION_STATUS_LABELS[app.status] || app.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{formatDate(app.created_at)}</td>
                    <td className="p-3">
                      {canApproveForInterview(app.status) && getScore(app.ai_screening_score) !== null ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 text-xs text-accent hover:bg-accent/10 hover:text-accent border-accent/20" onClick={(e) => openInviteDialog(app.id, e)}>
                            <Mail className="h-3.5 w-3.5 mr-1" />Send Invite
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); handleReject(app.id); }}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                          </Button>
                        </div>
                      ) : canMakeFinalDecision(app.status) ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 text-xs text-success hover:bg-success/10 hover:text-success border-success/20" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: app.id, status: 'shortlisted' }); }}>
                            <ThumbsUp className="h-3.5 w-3.5 mr-1" />Shortlist
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={(e) => { e.stopPropagation(); handleReject(app.id); }}>
                            <ThumbsDown className="h-3.5 w-3.5 mr-1" />Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground text-center block">--</span>
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

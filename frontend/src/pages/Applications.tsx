import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List, ClipboardCheck } from 'lucide-react';
import { TableSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import ApplicationDetailSheet from '@/components/organisms/applications/ApplicationDetailSheet';
import ApplicationsKanban from '@/components/organisms/applications/ApplicationsKanban';
import ApplicationsTable from '@/components/organisms/applications/ApplicationsTable';
import CompanyFilterBar from '@/components/organisms/applications/CompanyFilterBar';
import InviteDeadlineDialog from '@/components/organisms/applications/InviteDeadlineDialog';
import Pagination from '@/components/molecules/Pagination';
import { getScore } from '@/components/organisms/applications/applicationListHelpers';
import {
  useApplications,
  useApproveInterview,
  useUpdateApplication,
  useResendInvitation,
  type Application,
} from '@/domains/applications';
import { useInitiateCall } from '@/domains/calls';
import { PAGE_SIZE } from '@/lib/constants';

export default function Applications() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [page, setPage] = useState(1);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingApp, setPendingApp] = useState<Application | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // List view: full record (every pipeline_stage incl. archived), paginated.
  const listQuery = useApplications({ page });

  // Kanban view: single query; each row carries its server-derived pipeline_stage.
  const kanbanQuery = useApplications({ limit: PAGE_SIZE.XL });

  const approveInterviewMutation = useApproveInterview();
  const updateStatusMutation = useUpdateApplication();
  const resendInviteMutation = useResendInvitation();
  const initiateCallMutation = useInitiateCall();

  const handleReject = (id: string) => updateStatusMutation.mutate({ id, status: 'rejected' });
  const handleShortlist = (id: string) => updateStatusMutation.mutate({ id, status: 'shortlisted' });
  const handleRecall = (id: string) => initiateCallMutation.mutate(id);
  const handleResendInvite = (id: string) => resendInviteMutation.mutate(id);
  const openDetail = (id: string) => { setSelectedAppId(id); setSheetOpen(true); };

  const kanbanApps = kanbanQuery.data?.data ?? [];


  const openInviteDialog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (approveInterviewMutation.isPending) return;
    const app = kanbanApps.find((a) => a.id === id);
    if (!app) return;
    const existing = app.jobs?.interview_deadline;
    if (existing) {
      // Job already has a deadline — send invite without re-prompting.
      approveInterviewMutation.mutate({ id });
      return;
    }
    setPendingApp(app);
    setSelectedDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setDialogOpen(true);
  };

  const handleConfirmInvite = () => {
    if (!pendingApp || !selectedDate) return;
    approveInterviewMutation.mutate({ id: pendingApp.id, deadline: selectedDate.toISOString() });
    setDialogOpen(false);
    setPendingApp(null);
  };

  const handleCancelInvite = () => {
    setDialogOpen(false);
    setPendingApp(null);
  };

  const sortByScore = (apps: Application[]) =>
    [...apps].sort(
      (a, b) => (getScore(b.ai_screening_score) ?? 0) - (getScore(a.ai_screening_score) ?? 0)
    );

  const listApps = listQuery.data?.data ?? [];
  const sourceApps = view === 'kanban' ? sortByScore(kanbanApps) : listApps;

  const companies = useMemo(() => {
    const names = new Set<string>();
    sourceApps.forEach((app) => {
      const name = app.jobs?.client_companies?.name;
      if (name) names.add(name);
    });
    return Array.from(names).sort();
  }, [sourceApps]);

  const filteredApps = selectedCompany === 'all'
    ? sourceApps
    : sourceApps.filter((app) => app.jobs?.client_companies?.name === selectedCompany);

  const isLoading = view === 'kanban' ? kanbanQuery.isLoading : listQuery.isLoading;
  const error = view === 'kanban' ? kanbanQuery.error : listQuery.error;

  if (isLoading) return <TableSkeleton cols={6} />;
  if (error) return <EmptyState icon={ClipboardCheck} title="Failed to load applications" description={error instanceof Error ? error.message : 'An error occurred'} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Pipeline</h1>
        <div className="flex gap-1">
          <Button variant={view === 'kanban' ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setView('kanban')}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={view === 'table' ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setView('table')}>
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CompanyFilterBar companies={companies} selected={selectedCompany} onSelect={setSelectedCompany} />

      {filteredApps.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={view === 'kanban' ? 'No active applications' : 'No applications'}
          description={view === 'kanban' ? 'New, in-progress, interviewed, and shortlisted candidates will appear here.' : 'No applications match the selected company filter.'}
        />
      ) : view === 'kanban' ? (
        <ApplicationsKanban
          apps={filteredApps}
          onOpenDetail={openDetail}
          onInvite={openInviteDialog}
          onReject={handleReject}
          onShortlist={handleShortlist}
          onRecall={handleRecall}
          onResendInvite={handleResendInvite}
        />
      ) : (
        <ApplicationsTable apps={filteredApps} onOpenDetail={openDetail} />
      )}

      {view === 'table' && listQuery.data && (
        <Pagination
          page={listQuery.data.page ?? page}
          limit={listQuery.data.limit}
          total={listQuery.data.total}
          totalPages={listQuery.data.totalPages}
          onPageChange={setPage}
        />
      )}

      <InviteDeadlineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onConfirm={handleConfirmInvite}
        onCancel={handleCancelInvite}
        isPending={approveInterviewMutation.isPending}
        title={pendingApp ? `Set interview deadline for ${pendingApp.jobs?.title ?? 'this job'}` : undefined}
      />

      <ApplicationDetailSheet applicationId={selectedAppId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

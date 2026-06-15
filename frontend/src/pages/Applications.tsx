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
import { useApplications, useApproveInterview, useUpdateApplication } from '@/domains/applications';

export default function Applications() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [page, setPage] = useState(1);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingAppId, setPendingAppId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );

  const { data, isLoading, error } = useApplications({ page });
  const approveInterviewMutation = useApproveInterview();
  const updateStatusMutation = useUpdateApplication();

  const handleReject = (id: string) => updateStatusMutation.mutate({ id, status: 'rejected' });
  const handleShortlist = (id: string) => updateStatusMutation.mutate({ id, status: 'shortlisted' });
  const openDetail = (id: string) => { setSelectedAppId(id); setSheetOpen(true); };

  const openInviteDialog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingAppId(id);
    setSelectedDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setDialogOpen(true);
  };

  const handleConfirmInvite = () => {
    if (!pendingAppId) return;
    approveInterviewMutation.mutate({ id: pendingAppId, deadline: selectedDate?.toISOString() });
    setDialogOpen(false);
    setPendingAppId(null);
  };

  const handleCancelInvite = () => {
    setDialogOpen(false);
    setPendingAppId(null);
  };

  const allApps = [...(data?.data ?? [])].sort(
    (a, b) => (getScore(b.ai_screening_score) ?? 0) - (getScore(a.ai_screening_score) ?? 0)
  );

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

      <CompanyFilterBar companies={companies} selected={selectedCompany} onSelect={setSelectedCompany} />

      {filteredApps.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No applications" description="No applications match the selected company filter." />
      ) : view === 'kanban' ? (
        <ApplicationsKanban
          apps={filteredApps}
          onOpenDetail={openDetail}
          onInvite={openInviteDialog}
          onReject={handleReject}
          onShortlist={handleShortlist}
        />
      ) : (
        <ApplicationsTable
          apps={filteredApps}
          onOpenDetail={openDetail}
          onInvite={openInviteDialog}
          onReject={handleReject}
          onShortlist={handleShortlist}
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
      />

      <ApplicationDetailSheet applicationId={selectedAppId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

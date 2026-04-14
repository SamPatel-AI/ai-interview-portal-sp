import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, RefreshCw, Briefcase, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import CreateJobDialog from '@/components/organisms/jobs/CreateJobDialog';
import JobDetailSheet from '@/components/organisms/jobs/JobDetailSheet';

interface Job {
  id: string;
  job_code: string;
  title: string;
  status: string;
  ai_agent_id: string | null;
  recruiter_name?: string;
  applications_count?: number;
  created_at: string;
  client_companies?: { name: string };
  ai_agents?: { name: string } | null;
}

const statusColors: Record<string, string> = {
  open: 'bg-success text-success-foreground',
  closed: 'bg-destructive text-destructive-foreground',
  on_hold: 'bg-warning text-warning-foreground',
  filled: 'bg-info text-info-foreground',
};

export default function Jobs() {
  const [search, setSearch] = useState('');
  const [page] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', page, search],
    queryFn: () => apiRequest<ApiResponse<Job[]>>(`/api/jobs?page=${page}&limit=20&search=${search}`),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest<{ synced: number; created: number; updated: number }>('/api/jobs/sync-ceipal', { method: 'POST' }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({ title: 'CEIPAL sync complete', description: `Created: ${result.created}, Updated: ${result.updated}` });
    },
    onError: (err: Error) => toast({ title: 'Sync failed', description: err.message, variant: 'destructive' }),
  });

  const jobs = data?.data ?? [];
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search jobs..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync from CEIPAL
          </Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Job</Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton cols={8} />
      ) : error ? (
        <EmptyState icon={Briefcase} title="Failed to load jobs" description={error instanceof Error ? error.message : 'An error occurred'} />
      ) : jobs.length === 0 ? (
        <EmptyState icon={Briefcase} title="No jobs yet" description="Create your first job posting or sync from CEIPAL." actionLabel="Add Job" onAction={() => setCreateOpen(true)} />
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Agent</TableHead>
                  <TableHead>Applications</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedJobId(j.id); setSheetOpen(true); }}>
                    <TableCell className="font-mono text-sm text-muted-foreground">{j.job_code}</TableCell>
                    <TableCell className="font-medium">{j.title}</TableCell>
                    <TableCell className="text-muted-foreground">{j.client_companies?.name ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[j.status] || 'bg-muted text-muted-foreground'}`}>
                        {j.status?.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{j.ai_agents?.name ?? 'None'}</TableCell>
                    <TableCell>{j.applications_count ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(j.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateJobDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JobDetailSheet jobId={selectedJobId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

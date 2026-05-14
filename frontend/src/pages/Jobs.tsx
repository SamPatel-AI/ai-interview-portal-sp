import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RefreshCw, Briefcase, Loader2 } from 'lucide-react';
import { TableSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import JobDetailSheet from '@/components/organisms/jobs/JobDetailSheet';
import { useJobs, useSyncCeipal } from '@/domains/jobs';
import { JOB_STATUS_COLORS } from '@/lib/constants';

export default function Jobs() {
  const [search, setSearch] = useState('');
  const [page] = useState(1);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, error } = useJobs({ page, search });
  const syncMutation = useSyncCeipal();

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
                    <TableCell className="font-mono text-sm text-muted-foreground">{(j as any).job_code}</TableCell>
                    <TableCell className="font-medium">{j.title}</TableCell>
                    <TableCell className="text-muted-foreground">{j.client_companies?.name ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_COLORS[j.status] || 'bg-muted text-muted-foreground'}`}>
                        {j.status?.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{j.ai_agents?.name ?? 'None'}</TableCell>
                    <TableCell>{(j as any).applications_count ?? 0}</TableCell>
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

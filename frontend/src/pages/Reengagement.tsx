import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import EmptyState from '@/components/molecules/EmptyState';
import { useReengagementCampaigns, useReengagementCampaign, useTriggerCampaign } from '@/domains/reengagement';
import type { ReengagementCampaign } from '@/domains/reengagement';
import { useJobs } from '@/domains/jobs';
import { REENGAGEMENT_STATUS_COLORS } from '@/lib/constants';

export default function Reengagement() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>('');

  const { data: response, isLoading } = useReengagementCampaigns({ page });
  const { data: detailResponse, isLoading: detailLoading } = useReengagementCampaign(selectedId);
  const { data: jobsResponse } = useJobs({ status: 'open' });
  const trigger = useTriggerCampaign();

  const raw = (response as any)?.data;
  const campaigns: ReengagementCampaign[] = Array.isArray(raw) ? raw : (raw?.campaigns || []);
  const totalPages = (response as any)?.totalPages || 1;

  const jobs = (jobsResponse as any)?.data || [];
  const detail = (detailResponse as any)?.data;

  const handleLaunch = async () => {
    if (!selectedJob) return;
    await trigger.mutateAsync(selectedJob);
    setLaunchOpen(false);
    setSelectedJob('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Re-engagement Campaigns</h1>
          <p className="text-sm text-muted-foreground">Surface past candidates that fit new openings.</p>
        </div>
        <Button onClick={() => setLaunchOpen(true)}>
          <Zap className="h-4 w-4 mr-2" /> Launch Campaign
        </Button>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent></Card>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No campaigns yet"
          description="Launch your first re-engagement campaign to email past candidates that match an open job."
        />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Matched</TableHead>
                  <TableHead className="text-right">Emailed</TableHead>
                  <TableHead className="text-right">Responded</TableHead>
                  <TableHead>Launched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedId(c.id)}>
                    <TableCell className="font-medium">{c.job_title || c.job_id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={REENGAGEMENT_STATUS_COLORS[c.status] || ''}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.candidates_matched ?? 0}</TableCell>
                    <TableCell className="text-right">{c.candidates_emailed ?? 0}</TableCell>
                    <TableCell className="text-right">{c.candidates_responded ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Launch dialog */}
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch Re-engagement Campaign</DialogTitle>
            <DialogDescription>This will email matching candidates from your database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Job</label>
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger><SelectValue placeholder="Select an open job" /></SelectTrigger>
              <SelectContent>
                {jobs.map((j: any) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLaunchOpen(false)}>Cancel</Button>
            <Button onClick={handleLaunch} disabled={!selectedJob || trigger.isPending}>
              {trigger.isPending ? 'Launching…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle className="text-left">Campaign Details</SheetTitle></SheetHeader>
          {detailLoading ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div>
                <p className="font-medium">{detail.campaign?.job_title || detail.campaign?.job_id}</p>
                <Badge variant="secondary" className={REENGAGEMENT_STATUS_COLORS[detail.campaign?.status] || ''}>
                  {detail.campaign?.status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Matched</p>
                  <p className="text-2xl font-semibold">{detail.campaign?.candidates_matched ?? 0}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Emailed</p>
                  <p className="text-2xl font-semibold">{detail.campaign?.candidates_emailed ?? 0}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Responded</p>
                  <p className="text-2xl font-semibold">{detail.campaign?.candidates_responded ?? 0}</p>
                </CardContent></Card>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Candidates</p>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead className="w-[80px]">Fit</TableHead>
                        <TableHead className="w-[80px] text-center">Sent</TableHead>
                        <TableHead className="w-[100px]">Responded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detail.candidates || []).map((c: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell>
                            <p className="font-medium">{c.candidate_name}</p>
                            <p className="text-xs text-muted-foreground">{c.fit_justification}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              {c.fit_score}/10
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {c.email_sent ? <Check className="h-4 w-4 text-green-600 inline" /> : <X className="h-4 w-4 text-muted-foreground inline" />}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={c.responded ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}>
                              {c.responded ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

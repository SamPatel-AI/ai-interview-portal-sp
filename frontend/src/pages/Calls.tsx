import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, PhoneIncoming, PhoneOutgoing, Search, Plus, Calendar, Loader2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import CallDetailSheet from '@/components/organisms/calls/CallDetailSheet';
import { useCalls, useInitiateCall, useScheduleCall } from '@/domains/calls';
import { useApplications } from '@/domains/applications';
import { CALL_STATUS_COLORS } from '@/lib/constants';

const CALL_STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  failed: 'Failed',
  no_answer: 'No Answer',
  voicemail: 'Voicemail',
  interrupted: 'Interrupted',
};

const formatDuration = (seconds: number | null) => {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function Calls() {
  const [search, setSearch] = useState('');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [callNowOpen, setCallNowOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [appId, setAppId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const { data, isLoading, error } = useCalls();
  const callNowMutation = useInitiateCall();
  const scheduleMutation = useScheduleCall();

  const { data: appsData } = useApplications({ page: 1 });
  const apps = appsData?.data ?? [];

  const calls = data?.data ?? [];
  const filtered = search
    ? calls.filter(c => {
        const name = c.candidates ? `${c.candidates.first_name} ${c.candidates.last_name}` : '';
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : calls;

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search calls..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScheduleOpen(true)}><Clock className="h-4 w-4 mr-2" />Schedule</Button>
          <Button onClick={() => setCallNowOpen(true)}><Plus className="h-4 w-4 mr-2" />Call Now</Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton cols={8} />
      ) : error ? (
        <EmptyState icon={Phone} title="Failed to load calls" description={error instanceof Error ? error.message : 'An error occurred'} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Phone} title="No calls yet" description="Schedule your first interview call to get started." actionLabel="Schedule Call" onAction={() => setScheduleOpen(true)} />
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((call) => (
                  <TableRow key={call.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedCallId(call.id); setSheetOpen(true); }}>
                    <TableCell className="font-medium">
                      {call.candidates ? `${call.candidates.first_name} ${call.candidates.last_name}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{call.applications?.jobs?.title ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{call.ai_agents?.name ?? '—'}</TableCell>
                    <TableCell>
                      {call.direction === 'outbound' ? <PhoneOutgoing className="h-4 w-4 text-primary" /> : <PhoneIncoming className="h-4 w-4 text-success" />}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CALL_STATUS_COLORS[call.status] ?? ''}`}>
                        {CALL_STATUS_LABELS[call.status] ?? call.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {(call as any).booking_source === 'cal.com' ? (
                        <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">
                          <Calendar className="h-3 w-3 mr-1" />Cal.com
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">{formatDuration(call.duration_seconds)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(call.started_at || call.scheduled_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CallDetailSheet callId={selectedCallId} open={sheetOpen} onOpenChange={setSheetOpen} />

      <Dialog open={callNowOpen} onOpenChange={setCallNowOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Initiate Call</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Application</Label>
              <Select value={appId} onValueChange={setAppId}>
                <SelectTrigger><SelectValue placeholder="Select application" /></SelectTrigger>
                <SelectContent>
                  {apps.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.candidates ? `${a.candidates.first_name} ${a.candidates.last_name}` : 'Unknown'} — {a.jobs?.title ?? 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={!appId || callNowMutation.isPending} onClick={() => callNowMutation.mutate(appId, { onSuccess: () => { setCallNowOpen(false); setAppId(''); } })}>
              {callNowMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Call Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Schedule Call</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Application</Label>
              <Select value={appId} onValueChange={setAppId}>
                <SelectTrigger><SelectValue placeholder="Select application" /></SelectTrigger>
                <SelectContent>
                  {apps.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.candidates ? `${a.candidates.first_name} ${a.candidates.last_name}` : 'Unknown'} — {a.jobs?.title ?? 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
            <Button className="w-full" disabled={!appId || !scheduledAt || scheduleMutation.isPending} onClick={() => scheduleMutation.mutate({ applicationId: appId, scheduledAt }, { onSuccess: () => { setScheduleOpen(false); setAppId(''); setScheduledAt(''); } })}>
              {scheduleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

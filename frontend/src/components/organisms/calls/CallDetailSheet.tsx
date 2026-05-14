import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Phone, PhoneIncoming, PhoneOutgoing, Star, RotateCcw, Loader2,
  CheckCircle, XCircle, PhoneCall, Pause, MessageSquare, Volume2
} from 'lucide-react';

interface CallDetail {
  id: string;
  direction: string;
  status: string;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  scheduled_at: string | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_object: { role: string; content: string }[] | null;
  call_analysis: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    callback_requested?: boolean;
    callback_time?: string;
  } | null;
  is_resumption: boolean;
  candidates?: { first_name: string; last_name: string };
  applications?: { id: string; jobs?: { title: string } };
  ai_agents?: { name: string } | null;
  call_evaluations?: {
    id: string;
    decision: string;
    rating: number;
    notes: string;
    created_at: string;
    users?: { full_name: string };
  }[];
  resumption_calls?: { id: string; status: string; started_at: string }[];
  parent_call?: { id: string; status: string } | null;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: 'bg-success/10 text-success', label: 'Completed' },
  scheduled: { color: 'bg-info/10 text-info', label: 'Scheduled' },
  in_progress: { color: 'bg-warning/10 text-warning', label: 'In Progress' },
  failed: { color: 'bg-destructive/10 text-destructive', label: 'Failed' },
  no_answer: { color: 'bg-muted text-muted-foreground', label: 'No Answer' },
  interrupted: { color: 'bg-warning/10 text-warning', label: 'Interrupted' },
};

const formatDuration = (s: number | null) => {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

interface Props {
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CallDetailSheet({ callId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [evalDecision, setEvalDecision] = useState<string>('');
  const [evalRating, setEvalRating] = useState(0);
  const [evalNotes, setEvalNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['call-detail', callId],
    queryFn: () => apiRequest<ApiResponse<CallDetail>>(`/api/calls/${callId}`),
    enabled: !!callId && open,
  });

  const retryMutation = useMutation({
    mutationFn: () => apiRequest(`/api/calls/${callId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Call retry initiated' });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: (e: Error) => toast({ title: 'Retry failed', description: e.message, variant: 'destructive' }),
  });

  const evalMutation = useMutation({
    mutationFn: (body: { application_id: string; decision: string; rating: number; notes: string }) =>
      apiRequest(`/api/calls/${callId}/evaluate`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: 'Evaluation submitted' });
      queryClient.invalidateQueries({ queryKey: ['call-detail', callId] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: 'Evaluation failed', description: e.message, variant: 'destructive' }),
  });

  const call = data?.data;

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const parseTranscript = (): { role: string; content: string }[] => {
    if (!call) return [];
    if (call.transcript_object?.length) return call.transcript_object;
    if (!call.transcript) return [];
    return call.transcript.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^(Agent|User|Candidate):\s*(.*)/i);
      return match ? { role: match[1].toLowerCase(), content: match[2] } : { role: 'agent', content: line };
    });
  };

  const candidateName = call?.candidates ? `${call.candidates.first_name} ${call.candidates.last_name}` : 'Unknown';
  const hasEval = (call?.call_evaluations?.length ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        {isLoading || !call ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-6 border-b space-y-3">
              <SheetTitle className="text-lg">{candidateName}</SheetTitle>
              <p className="text-sm text-muted-foreground">{call.applications?.jobs?.title ?? 'Unknown Job'}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  {call.direction === 'outbound' ? <PhoneOutgoing className="h-3 w-3" /> : <PhoneIncoming className="h-3 w-3" />}
                  {call.direction}
                </Badge>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[call.status]?.color ?? ''}`}>
                  {statusConfig[call.status]?.label ?? call.status}
                </span>
                <span className="text-xs text-muted-foreground">{formatDuration(call.duration_seconds)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(call.started_at || call.scheduled_at)}</span>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                {/* Transcript */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4" />Transcript</h3>
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                    {parseTranscript().length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No transcript available</p>
                    ) : (
                      parseTranscript().map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' || msg.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            msg.role === 'user' || msg.role === 'candidate'
                              ? 'bg-muted text-foreground'
                              : 'bg-primary/10 text-foreground'
                          }`}>
                            <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase">{msg.role}</p>
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Audio */}
                {call.recording_url && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium flex items-center gap-2"><Volume2 className="h-4 w-4" />Recording</h3>
                        <a href={call.recording_url} download className="text-xs text-primary hover:underline">Download</a>
                      </div>
                      <audio controls src={call.recording_url} className="w-full mt-2" />
                    </div>
                  </>
                )}

                {/* AI Analysis */}
                {call.call_analysis && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">AI Analysis</h3>
                      {call.call_analysis.call_summary && (
                        <p className="text-sm text-muted-foreground">{call.call_analysis.call_summary}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {call.call_analysis.user_sentiment && (
                          <Badge variant="outline" className={
                            call.call_analysis.user_sentiment === 'Positive' ? 'border-success/30 text-success' :
                            call.call_analysis.user_sentiment === 'Negative' ? 'border-destructive/30 text-destructive' :
                            'border-muted-foreground/30 text-muted-foreground'
                          }>
                            Sentiment: {call.call_analysis.user_sentiment}
                          </Badge>
                        )}
                        <Badge variant="outline" className={call.call_analysis.call_successful ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}>
                          {call.call_analysis.call_successful ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          {call.call_analysis.call_successful ? 'Successful' : 'Unsuccessful'}
                        </Badge>
                        {call.call_analysis.callback_requested && (
                          <Badge variant="outline" className="border-warning/30 text-warning">
                            Callback Requested {call.call_analysis.callback_time && `at ${call.call_analysis.callback_time}`}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Evaluation */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Evaluation</h3>
                  {hasEval ? (
                    call.call_evaluations!.map(ev => (
                      <div key={ev.id} className="space-y-2 bg-muted/50 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            ev.decision === 'advance' ? 'default' :
                            ev.decision === 'reject' ? 'destructive' : 'secondary'
                          } className="capitalize">{ev.decision}</Badge>
                          <div className="flex">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} className={`h-4 w-4 ${s <= ev.rating ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                            ))}
                          </div>
                        </div>
                        {ev.notes && <p className="text-sm text-muted-foreground">{ev.notes}</p>}
                        <p className="text-xs text-muted-foreground">
                          {ev.users?.full_name ?? 'Recruiter'} • {new Date(ev.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No evaluation recorded yet. Application decisions are managed from the Applications tab.</p>
                  )}
                </div>

                {/* Call chain */}
                {(call.is_resumption || (call.resumption_calls?.length ?? 0) > 0) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Call Chain</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {call.parent_call && (
                          <Badge variant="outline" className="text-xs">Original: {call.parent_call.status}</Badge>
                        )}
                        {call.parent_call && <span>→</span>}
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">Current: {call.status}</Badge>
                        {call.resumption_calls?.map(rc => (
                          <span key={rc.id} className="flex items-center gap-1">
                            <span>→</span>
                            <Badge variant="outline" className="text-xs">Resumed: {rc.status}</Badge>
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

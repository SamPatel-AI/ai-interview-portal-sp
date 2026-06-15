import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, Volume2, MessageSquare, Star, Phone, Clock, Mail } from 'lucide-react';
import type { CallDetail, EmailLog } from '@/domains/applications';
import { formatDate, formatDuration, parseTranscript } from './applicationDetailHelpers';

interface Props {
  calls: CallDetail[];
  invitationEmail: EmailLog | undefined;
  score: number | null;
}

export default function ApplicationCallsPanel({ calls, invitationEmail, score }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showTranscript, setShowTranscript] = useState(false);

  const completedCall = calls.find(c => c.status === 'completed');
  const latestCall = calls[0];
  const hasInvitation = !!invitationEmail;

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const otherCalls = calls.filter(c => c.id !== completedCall?.id);

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Phone className="h-4 w-4" /> Interview
        </h3>

        {hasInvitation ? (
          <div className="flex items-center gap-2 p-3 bg-accent/5 rounded-lg border border-accent/20">
            <Mail className="h-4 w-4 text-accent" />
            <div className="flex-1">
              <p className="text-sm font-medium text-accent">Invitation Sent</p>
              <p className="text-xs text-muted-foreground">{formatDate(invitationEmail!.sent_at)}</p>
            </div>
            <Badge variant="outline" className="text-xs capitalize">{invitationEmail!.status}</Badge>
          </div>
        ) : !completedCall && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {score !== null ? 'Awaiting approval to send interview invitation' : 'Complete AI screening first'}
            </p>
          </div>
        )}

        {latestCall && !completedCall && ['scheduled', 'in_progress'].includes(latestCall.status) && (
          <div className="flex items-center gap-2 p-3 bg-warning/5 rounded-lg border border-warning/20">
            <Phone className="h-4 w-4 text-warning animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning capitalize">
                {latestCall.status === 'scheduled' ? 'Call Scheduled' : 'Call In Progress'}
              </p>
              <p className="text-xs text-muted-foreground">{formatDate(latestCall.started_at)}</p>
            </div>
          </div>
        )}

        {hasInvitation && !latestCall && (
          <div className="flex items-center gap-2 p-3 bg-info/5 rounded-lg border border-info/20">
            <Clock className="h-4 w-4 text-info" />
            <p className="text-sm text-info">Waiting for candidate to book interview slot</p>
          </div>
        )}
      </div>

      {completedCall && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" /> Interview Completed
            </h3>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>Duration: {formatDuration(completedCall.duration_seconds)}</span>
              <span>{formatDate(completedCall.started_at)}</span>
            </div>

            {completedCall.recording_url && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" />Recording</p>
                  <div className="flex gap-1">
                    {[1, 1.5, 2].map(r => (
                      <Button key={r} size="sm" variant={playbackRate === r ? 'default' : 'outline'} className="h-6 px-2 text-xs" onClick={() => changeSpeed(r)}>
                        {r}x
                      </Button>
                    ))}
                  </div>
                </div>
                <audio ref={audioRef} controls src={completedCall.recording_url} className="w-full" />
              </div>
            )}

            {completedCall.call_analysis && (
              <div className="space-y-2 bg-muted/30 rounded-lg p-4">
                <p className="text-xs font-medium">AI Call Summary</p>
                {completedCall.call_analysis.call_summary && (
                  <p className="text-sm text-muted-foreground">{completedCall.call_analysis.call_summary}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {completedCall.call_analysis.user_sentiment && (
                    <Badge variant="outline" className={
                      completedCall.call_analysis.user_sentiment === 'Positive' ? 'border-success/30 text-success' :
                      completedCall.call_analysis.user_sentiment === 'Negative' ? 'border-destructive/30 text-destructive' :
                      'border-muted-foreground/30 text-muted-foreground'
                    }>
                      Sentiment: {completedCall.call_analysis.user_sentiment}
                    </Badge>
                  )}
                  <Badge variant="outline" className={completedCall.call_analysis.call_successful ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}>
                    {completedCall.call_analysis.call_successful ? 'Successful Call' : 'Unsuccessful Call'}
                  </Badge>
                </div>
              </div>
            )}

            <div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTranscript(!showTranscript)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                {showTranscript ? 'Hide Transcript' : 'View Full Transcript'}
              </Button>
              {showTranscript && (
                <div className="mt-3 max-h-80 overflow-y-auto space-y-2 pr-2 border rounded-lg p-3">
                  {parseTranscript(completedCall).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No transcript available</p>
                  ) : (
                    parseTranscript(completedCall).map((msg, i) => (
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
              )}
            </div>

            {completedCall.call_evaluations && completedCall.call_evaluations.length > 0 && (
              <div className="space-y-2 bg-muted/30 rounded-lg p-4">
                <p className="text-xs font-medium">Call Evaluation</p>
                {completedCall.call_evaluations.map(ev => (
                  <div key={ev.id} className="flex items-center gap-2">
                    <Badge variant={
                      ev.decision === 'advance' ? 'default' :
                      ev.decision === 'reject' ? 'destructive' : 'secondary'
                    } className="capitalize">{ev.decision}</Badge>
                    <div className="flex">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`h-3.5 w-3.5 ${s <= ev.rating ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                      ))}
                    </div>
                    {ev.notes && <span className="text-xs text-muted-foreground truncate flex-1">{ev.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {otherCalls.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Other Call Attempts ({otherCalls.length})</p>
            {otherCalls.map(call => (
              <div key={call.id} className="flex items-center justify-between p-2 border rounded-lg text-xs">
                <Badge variant="outline" className="capitalize text-xs">{call.status}</Badge>
                <span className="text-muted-foreground">{formatDate(call.started_at)}</span>
                {call.duration_seconds ? <span className="text-muted-foreground">{formatDuration(call.duration_seconds)}</span> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

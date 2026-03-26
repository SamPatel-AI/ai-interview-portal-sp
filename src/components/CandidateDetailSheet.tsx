import { useQuery } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Mail, Phone, MapPin, FileText, ChevronDown, ExternalLink } from 'lucide-react';

interface CandidateDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  location: string | null;
  work_authorization: string | null;
  source: string;
  resume_url: string | null;
  resume_text: string | null;
  created_at: string;
  applications?: {
    id: string;
    status: string;
    ai_screening_score: number | null;
    jobs?: { title: string };
  }[];
  calls?: {
    id: string;
    status: string;
    duration_seconds: number | null;
    started_at: string | null;
  }[];
}

const scoreColor = (s: number | null) => s === null ? 'text-muted-foreground' : s >= 7 ? 'text-success' : s >= 4 ? 'text-warning' : 'text-destructive';

interface Props {
  candidateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CandidateDetailSheet({ candidateId, open, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['candidate-detail', candidateId],
    queryFn: () => apiRequest<ApiResponse<CandidateDetail>>(`/api/candidates/${candidateId}`),
    enabled: !!candidateId && open,
  });

  const c = data?.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        {isLoading || !c ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="p-6 border-b space-y-2">
              <SheetTitle>{c.first_name} {c.last_name}</SheetTitle>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {c.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
                {c.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
                {c.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.location}</span>}
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">{c.source}</Badge>
                {c.work_authorization && <Badge variant="secondary">{c.work_authorization}</Badge>}
              </div>
            </div>
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                {/* Resume */}
                {(c.resume_url || c.resume_text) && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" />Resume</h3>
                    {c.resume_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={c.resume_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3 mr-1" />View Resume</a>
                      </Button>
                    )}
                    {c.resume_text && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-xs"><ChevronDown className="h-3 w-3 mr-1" />Preview Text</Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <p className="text-xs text-muted-foreground mt-2 p-3 bg-muted rounded-lg whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {c.resume_text.slice(0, 500)}{c.resume_text.length > 500 ? '...' : ''}
                          </p>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}

                <Separator />

                {/* Applications */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Applications ({c.applications?.length ?? 0})</h3>
                  {(c.applications?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No applications</p>
                  ) : (
                    <div className="space-y-2">
                      {c.applications!.map(app => (
                        <div key={app.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{app.jobs?.title ?? 'Unknown'}</p>
                            <Badge variant="outline" className="text-xs mt-1 capitalize">{app.status}</Badge>
                          </div>
                          {app.ai_screening_score !== null && (
                            <span className={`text-lg font-bold ${scoreColor(app.ai_screening_score)}`}>{app.ai_screening_score}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Call history */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Call History ({c.calls?.length ?? 0})</h3>
                  {(c.calls?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No calls</p>
                  ) : (
                    <div className="space-y-2">
                      {c.calls!.map(call => (
                        <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                          <Badge variant="outline" className="capitalize">{call.status}</Badge>
                          <span className="text-muted-foreground font-mono">
                            {call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '—'}
                          </span>
                          <span className="text-muted-foreground">
                            {call.started_at ? new Date(call.started_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

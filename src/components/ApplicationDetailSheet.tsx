import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, CheckCircle, XCircle, AlertTriangle, Trophy } from 'lucide-react';

interface ScreeningResult {
  candidate_strengths?: string[];
  candidate_weaknesses?: string[];
  risk_factor?: string;
  reward_factor?: string;
  overall_fit_rating?: number;
  justification_for_rating?: string;
}

interface AppDetail {
  id: string;
  status: string;
  ai_screening_score: number | null;
  ai_screening_result: ScreeningResult | null;
  created_at: string;
  candidates?: { first_name: string; last_name: string; email: string };
  jobs?: { title: string; client_companies?: { name: string } };
  calls?: { id: string; status: string; started_at: string | null }[];
}

const scoreColor = (s: number | null) => s === null ? 'text-muted-foreground' : s >= 7 ? 'text-success' : s >= 4 ? 'text-warning' : 'text-destructive';
const scoreBg = (s: number | null) => s === null ? 'bg-muted' : s >= 7 ? 'bg-success/10' : s >= 4 ? 'bg-warning/10' : 'bg-destructive/10';

interface Props {
  applicationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ApplicationDetailSheet({ applicationId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [screening, setScreening] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['application-detail', applicationId],
    queryFn: () => apiRequest<ApiResponse<AppDetail>>(`/api/applications/${applicationId}`),
    enabled: !!applicationId && open,
  });

  const screenMutation = useMutation({
    mutationFn: () => apiRequest(`/api/applications/${applicationId}/screen`, { method: 'POST' }),
    onMutate: () => setScreening(true),
    onSuccess: () => {
      toast({ title: 'AI screening complete' });
      queryClient.invalidateQueries({ queryKey: ['application-detail', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      setScreening(false);
    },
    onError: (e: Error) => {
      toast({ title: 'Screening failed', description: e.message, variant: 'destructive' });
      setScreening(false);
    },
  });

  const app = data?.data;
  const sr = app?.ai_screening_result;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {isLoading || !app ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="p-6 border-b space-y-2">
              <SheetTitle>
                {app.candidates ? `${app.candidates.first_name} ${app.candidates.last_name}` : 'Unknown'}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">{app.jobs?.title ?? 'Unknown Job'} • {app.jobs?.client_companies?.name ?? ''}</p>
              <Badge variant="outline" className="capitalize">{app.status}</Badge>
            </div>
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                {/* Score + Screen Button */}
                <div className="flex items-center gap-4">
                  <div className={`h-16 w-16 rounded-xl flex items-center justify-center ${scoreBg(app.ai_screening_score)}`}>
                    <span className={`text-2xl font-bold ${scoreColor(app.ai_screening_score)}`}>
                      {app.ai_screening_score ?? '?'}
                    </span>
                  </div>
                  {app.ai_screening_score === null && (
                    <Button onClick={() => screenMutation.mutate()} disabled={screening}>
                      {screening ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing resume...</> : <><Sparkles className="h-4 w-4 mr-2" />Screen with AI</>}
                    </Button>
                  )}
                </div>

                {/* Screening Results */}
                {sr && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">AI Screening Results</h3>
                      {sr.candidate_strengths?.length ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-success flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Strengths</p>
                          {sr.candidate_strengths.map((s, i) => (
                            <p key={i} className="text-sm text-muted-foreground pl-5">• {s}</p>
                          ))}
                        </div>
                      ) : null}
                      {sr.candidate_weaknesses?.length ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Weaknesses</p>
                          {sr.candidate_weaknesses.map((w, i) => (
                            <p key={i} className="text-sm text-muted-foreground pl-5">• {w}</p>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex gap-3">
                        {sr.risk_factor && (
                          <Badge variant="outline" className="border-warning/30 text-warning gap-1">
                            <AlertTriangle className="h-3 w-3" />Risk: {sr.risk_factor}
                          </Badge>
                        )}
                        {sr.reward_factor && (
                          <Badge variant="outline" className="border-success/30 text-success gap-1">
                            <Trophy className="h-3 w-3" />Reward: {sr.reward_factor}
                          </Badge>
                        )}
                      </div>
                      {sr.justification_for_rating && (
                        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{sr.justification_for_rating}</p>
                      )}
                    </div>
                  </>
                )}

                <Separator />

                {/* Calls */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Calls ({app.calls?.length ?? 0})</h3>
                  {(app.calls?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No calls yet</p>
                  ) : (
                    <div className="space-y-2">
                      {app.calls!.map(call => (
                        <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                          <Badge variant="outline" className="capitalize">{call.status}</Badge>
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

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, MapPin, Building2, Bot, User, Briefcase,
  FileCode, DollarSign, Globe, Clock, Hash,
} from 'lucide-react';
import { useJob, useUpdateJob } from '@/domains/jobs';
import { useAgents } from '@/domains/agents';
import { getScore, scoreColor } from '@/components/organisms/applications/applicationListHelpers';
import {
  JOB_STATUS_COLORS_BORDER,
  APPLICATION_STATUS_COLORS,
  EMPLOYMENT_TYPE_LABELS,
} from '@/lib/constants';

const DEFAULT_AGENT_VALUE = '__default__';

interface JobApplication {
  id: string;
  status: string;
  ai_screening_score: number | { score: number } | null;
  created_at: string;
  candidates?: { id: string; first_name: string; last_name: string; email: string };
}

interface JobDetail {
  id: string;
  ceipal_job_id: string | null;
  title: string;
  description: string;
  skills: string[];
  location: string | null;
  state: string | null;
  country: string | null;
  tax_terms: string | null;
  employment_type: string;
  status: string;
  created_at: string;
  synced_at: string | null;
  client_companies?: { id: string; name: string } | null;
  ai_agents?: { id: string; name: string; voice_id: string; interview_style: string } | null;
  users?: { id: string; full_name: string; email: string } | null;
  applications?: JobApplication[];
}

interface Props {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function JobDetailSheet({ jobId, open, onOpenChange }: Props) {
  const { data, isLoading } = useJob(open ? jobId : null);
  const job = data?.data as unknown as JobDetail | undefined;
  const applications = job?.applications ?? [];
  const locationParts = [job?.location, job?.state, job?.country].filter(Boolean);
  const { data: agentsData } = useAgents();
  const agents = (agentsData?.data ?? []) as Array<{ id: string; name: string }>;
  const updateJob = useUpdateJob();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        {isLoading || !job ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-6 border-b space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <SheetTitle className="text-xl">{job.title}</SheetTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {job.client_companies && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {job.client_companies.name}
                      </span>
                    )}
                    {job.ceipal_job_id && (
                      <span className="flex items-center gap-1 font-mono text-xs">
                        <Hash className="h-3.5 w-3.5" />
                        {job.ceipal_job_id}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 capitalize ${JOB_STATUS_COLORS_BORDER[job.status] || ''}`}>
                  {job.status?.replace('_', ' ')}
                </Badge>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">

                {/* Key Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {locationParts.length > 0 && (
                    <InfoItem icon={MapPin} label="Location" value={locationParts.join(', ')} />
                  )}
                  <InfoItem icon={Briefcase} label="Employment Type" value={EMPLOYMENT_TYPE_LABELS[job.employment_type] || job.employment_type} />
                  {job.tax_terms && (
                    <InfoItem icon={DollarSign} label="Tax Terms" value={job.tax_terms} />
                  )}
                  {job.users && (
                    <InfoItem icon={User} label="Recruiter" value={job.users.full_name} />
                  )}
                  {job.ai_agents && (
                    <InfoItem icon={Bot} label="AI Agent" value={`${job.ai_agents.name} (${job.ai_agents.interview_style})`} />
                  )}
                  <InfoItem
                    icon={Clock}
                    label="Created"
                    value={new Date(job.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  />
                </div>

                {/* Skills */}
                {job.skills?.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        Skills & Technologies
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {job.skills.map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Description */}
                {job.description && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Job Description</h3>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/50 p-4 rounded-lg">
                        {job.description}
                      </div>
                    </div>
                  </>
                )}

                {/* Applications */}
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Applications ({applications.length})
                  </h3>
                  {applications.length === 0 ? (
                    <p className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg text-center">
                      No applications yet for this job
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {applications.map((app) => {
                        const score = getScore(app.ai_screening_score as never);
                        return (
                          <div key={app.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {app.candidates ? `${app.candidates.first_name} ${app.candidates.last_name}` : 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {app.candidates?.email}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {score !== null && (
                                <span className={`text-sm font-bold ${scoreColor(score)}`}>
                                  {score}/10
                                </span>
                              )}
                              <Badge variant="outline" className={`text-xs capitalize ${APPLICATION_STATUS_COLORS[app.status] || ''}`}>
                                {app.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
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

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 bg-muted/50 rounded-lg">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

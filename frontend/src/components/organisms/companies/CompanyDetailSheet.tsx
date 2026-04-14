import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, MapPin, Bot, User, Briefcase, FileCode,
  DollarSign, Hash, ChevronDown, ChevronRight, Users,
} from 'lucide-react';
import JobDetailSheet from '@/components/organisms/jobs/JobDetailSheet';

interface CompanyJob {
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
  applications_count: number;
  ai_agents?: { id: string; name: string } | null;
  users?: { id: string; full_name: string } | null;
}

interface CompanyAgent {
  id: string;
  name: string;
  is_active: boolean;
  interview_style: string;
  voice_id: string;
}

interface CompanyDetail {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
  jobs: CompanyJob[];
  ai_agents: CompanyAgent[];
}

const statusColors: Record<string, string> = {
  open: 'bg-success/10 text-success border-success/20',
  closed: 'bg-destructive/10 text-destructive border-destructive/20',
  on_hold: 'bg-warning/10 text-warning border-warning/20',
  filled: 'bg-info/10 text-info border-info/20',
};

const employmentLabels: Record<string, string> = {
  full_time: 'Full Time',
  contract: 'Contract',
  c2c: 'C2C',
  w2: 'W2',
};

interface Props {
  companyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CompanyDetailSheet({ companyId, open, onOpenChange }: Props) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [drillJobId, setDrillJobId] = useState<string | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['company-detail', companyId],
    queryFn: () => apiRequest<ApiResponse<CompanyDetail>>(`/api/companies/${companyId}`),
    enabled: !!companyId && open,
  });

  const company = data?.data;
  const jobs = company?.jobs ?? [];
  const agents = company?.ai_agents ?? [];
  const openJobs = jobs.filter(j => j.status === 'open');
  const otherJobs = jobs.filter(j => j.status !== 'open');

  const toggleExpand = (id: string) => {
    setExpandedJobId(prev => prev === id ? null : id);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          {isLoading || !company ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-6 border-b space-y-3">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-2xl font-bold text-primary">{company.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-xl">{company.name}</SheetTitle>
                    {company.description && (
                      <p className="text-sm text-muted-foreground mt-1">{company.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {jobs.length} position{jobs.length !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bot className="h-3.5 w-3.5" />
                        {agents.length} AI agent{agents.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6">
                <div className="space-y-6">

                  {/* Active Positions */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-success" />
                      Active Positions ({openJobs.length})
                    </h3>
                    {openJobs.length === 0 ? (
                      <p className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg text-center">
                        No active positions
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {openJobs.map(job => (
                          <JobCard
                            key={job.id}
                            job={job}
                            expanded={expandedJobId === job.id}
                            onToggle={() => toggleExpand(job.id)}
                            onDrill={() => { setDrillJobId(job.id); setDrillOpen(true); }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Other Positions */}
                  {otherJobs.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                          <Briefcase className="h-4 w-4" />
                          Other Positions ({otherJobs.length})
                        </h3>
                        <div className="space-y-2">
                          {otherJobs.map(job => (
                            <JobCard
                              key={job.id}
                              job={job}
                              expanded={expandedJobId === job.id}
                              onToggle={() => toggleExpand(job.id)}
                              onDrill={() => { setDrillJobId(job.id); setDrillOpen(true); }}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* AI Agents */}
                  {agents.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          AI Agents ({agents.length})
                        </h3>
                        <div className="space-y-2">
                          {agents.map(agent => (
                            <div key={agent.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{agent.name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{agent.interview_style} style</p>
                              </div>
                              <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-xs">
                                {agent.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
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

      {/* Drill-down into full job detail */}
      <JobDetailSheet jobId={drillJobId} open={drillOpen} onOpenChange={setDrillOpen} />
    </>
  );
}

function JobCard({
  job,
  expanded,
  onToggle,
  onDrill,
}: {
  job: CompanyJob;
  expanded: boolean;
  onToggle: () => void;
  onDrill: () => void;
}) {
  const locationParts = [job.location, job.state, job.country].filter(Boolean);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Clickable header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{job.title}</p>
            {job.ceipal_job_id && (
              <span className="text-xs font-mono text-muted-foreground shrink-0">{job.ceipal_job_id}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {locationParts.length > 0 && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {locationParts.join(', ')}
              </span>
            )}
            <span>{employmentLabels[job.employment_type] || job.employment_type}</span>
            {job.tax_terms && <span>{job.tax_terms}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {job.applications_count}
          </span>
          <Badge variant="outline" className={`text-xs capitalize ${statusColors[job.status] || ''}`}>
            {job.status?.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t bg-muted/30 space-y-3">
          {/* Meta row */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {job.ai_agents && (
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3" />
                {job.ai_agents.name}
              </span>
            )}
            {job.users && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {job.users.full_name}
              </span>
            )}
            {job.tax_terms && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {job.tax_terms}
              </span>
            )}
          </div>

          {/* Skills */}
          {job.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {job.skills.map(skill => (
                <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
              ))}
            </div>
          )}

          {/* Description preview */}
          {job.description && (
            <p className="text-xs text-muted-foreground line-clamp-3">{job.description}</p>
          )}

          {/* View full detail */}
          <button
            onClick={(e) => { e.stopPropagation(); onDrill(); }}
            className="text-xs text-primary font-medium hover:underline"
          >
            View full job details &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

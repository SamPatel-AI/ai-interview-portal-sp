export interface PipelineStage {
  stage: string;
  count: number;
}

export interface TopJob {
  name: string;
  apps: number;
}

export interface ScheduledCall {
  candidate: string;
  job: string;
  time: string;
  source: string | null;
}

export interface RecentActivityDetails {
  candidate?: string;
  email?: string;
  [key: string]: unknown;
}

export interface RecentActivityItem {
  id: string;
  entity_type: string;
  action: string;
  details: RecentActivityDetails;
  created_at: string;
  user?: string;
  users?: { full_name: string };
}

export interface ChartPoint {
  date: string;
  calls: number;
}

export interface CallOutcome {
  name: string;
  value: number;
  color: string;
}

export interface AppByStatus {
  status: string;
  count: number;
}

export interface OverviewStats {
  total_candidates: number;
  open_jobs: number;
  total_calls: number;
  calls_today: number;
  pending_reviews: number;
  avg_screening_score?: number | null;
  hire_rate?: number | null;
  pipeline: PipelineStage[];
  application_stats?: PipelineStage[];
  top_jobs: TopJob[];
  scheduled_calls: ScheduledCall[];
  recent_activity: RecentActivityItem[];
  calls_over_time?: ChartPoint[];
  call_outcomes?: CallOutcome[];
  apps_by_status?: AppByStatus[];
}

export interface RecruiterEvaluation {
  decision: string;
  rating?: number;
  count?: number;
  created_at?: string;
}

export interface RecruiterStats {
  total_applications: number;
  total_calls: number;
  completed_calls: number;
  total_call_duration_minutes: number;
  avg_call_duration_minutes: number;
  avg_call_duration?: number;
  evaluations: RecruiterEvaluation[];
  call_success_rate: number;
}

export interface RecruiterWorkload {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  open_applications: number;
  total_calls: number;
  pending_evaluations: number;
}

export interface AgentCallsByStatus {
  name: string;
  value: number;
}

export interface AgentStats {
  agent_name: string;
  company_name?: string | null;
  total_calls: number;
  completed_calls: number;
  success_rate: number | null;
  avg_duration_minutes: number | null;
  calls_by_status?: AgentCallsByStatus[];
}

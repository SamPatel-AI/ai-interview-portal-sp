export interface OverviewStats {
  total_candidates: number;
  open_jobs: number;
  total_calls: number;
  calls_today: number;
  pending_reviews: number;
  pipeline: Array<{ stage: string; count: number }>;
  top_jobs: Array<{ name: string; apps: number }>;
  scheduled_calls: Array<{ candidate: string; job: string; time: string; source: string | null }>;
  recent_activity: Array<{ id: string; entity_type: string; action: string; details: Record<string, unknown>; created_at: string; users?: { full_name: string } }>;
}

export interface RecruiterStats {
  total_applications: number;
  total_calls: number;
  completed_calls: number;
  total_call_duration_minutes: number;
  avg_call_duration_minutes: number;
  evaluations: Array<{ decision: string; rating: number; created_at: string }>;
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

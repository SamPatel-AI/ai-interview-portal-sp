export type PipelineStage = 'new' | 'in_progress' | 'interviewed' | 'failed' | 'shortlisted' | 'archived';

export interface Application {
  id: string;
  org_id: string;
  candidate_id: string;
  job_id: string;
  status: 'new' | 'screening' | 'interviewed' | 'shortlisted' | 'rejected' | 'hired';
  pipeline_stage: PipelineStage;
  sub_status: string | null;
  ai_screening_score: number | null;
  ai_screening_result: Record<string, unknown> | null;
  mandate_questions: string[] | null;
  interview_questions: string[] | null;
  recruiter_notes: string | null;
  assigned_recruiter_id: string | null;
  invitation_sent?: boolean;
  created_at: string;
  updated_at: string;
  candidates?: { id: string; first_name: string; last_name: string; email: string; phone?: string };
  jobs?: { id: string; title: string; client_company_id?: string; status: string; interview_deadline?: string | null; client_companies?: { id: string; name: string } };
  calls?: { id: string; status: string; disconnection_reason: string | null; started_at: string | null }[];
}

export interface CreateApplicationInput {
  candidate_id: string;
  job_id: string;
  assigned_recruiter_id?: string;
}

// ─── Detail view types (used by ApplicationDetailSheet) ─────────────────

export interface ScreeningResult {
  candidate_strengths?: string[];
  candidate_weaknesses?: string[];
  risk_factor?: string | { score: string; explanation: string };
  reward_factor?: string | { score: string; explanation: string };
  overall_fit_rating?: number;
  justification_for_rating?: string;
}

export interface CallEvaluation {
  id: string;
  decision: string;
  rating: number;
  notes: string;
  evaluated_by: string;
  created_at: string;
}

export interface CallDetail {
  id: string;
  direction: string;
  status: string;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
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
  call_evaluations?: CallEvaluation[];
}

export interface EmailLog {
  id: string;
  type: string;
  status: string;
  sent_at: string;
}

export interface ApplicationDetail {
  id: string;
  status: string;
  pipeline_stage: PipelineStage;
  sub_status: string | null;
  assigned_recruiter_id: string | null;
  ai_screening_score: number | { score: number; explanation?: string } | null;
  ai_screening_result: ScreeningResult | null;
  recruiter_notes: string | null;
  created_at: string;
  candidates?: { first_name: string; last_name: string; email: string; phone?: string; resume_url?: string };
  jobs?: { title: string; client_companies?: { name: string } };
  calls?: CallDetail[];
  email_logs?: EmailLog[];
}

export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  work_authorization: string | null;
  resume_url: string | null;
  resume_text: string | null;
  source: string | null;
  flags: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  applications_count?: number;
}

export interface CandidateDetail extends Candidate {
  applications: Array<{
    id: string;
    job_id: string;
    status: string;
    ai_screening_score: number | null;
    created_at: string;
    jobs: { id: string; title: string; client_company_id: string; status: string };
  }>;
  calls: Array<{
    id: string;
    direction: string;
    status: string;
    duration_seconds: number | null;
    started_at: string | null;
    recording_url: string | null;
  }>;
}

export interface CreateCandidateInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  location?: string;
  work_authorization?: string;
  source?: string;
}

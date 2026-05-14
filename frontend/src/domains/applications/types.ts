export interface Application {
  id: string;
  org_id: string;
  candidate_id: string;
  job_id: string;
  status: 'new' | 'screening' | 'interviewed' | 'shortlisted' | 'rejected' | 'hired';
  ai_screening_score: number | null;
  ai_screening_result: Record<string, unknown> | null;
  mandate_questions: string[] | null;
  interview_questions: string[] | null;
  recruiter_notes: string | null;
  assigned_recruiter_id: string | null;
  created_at: string;
  updated_at: string;
  candidates?: { id: string; first_name: string; last_name: string; email: string; phone?: string };
  jobs?: { id: string; title: string; client_company_id?: string; status: string; client_companies?: { id: string; name: string } };
}

export interface CreateApplicationInput {
  candidate_id: string;
  job_id: string;
  assigned_recruiter_id?: string;
}

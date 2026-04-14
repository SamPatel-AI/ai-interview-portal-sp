export interface Job {
  id: string;
  org_id: string;
  client_company_id: string | null;
  ceipal_job_id: string | null;
  title: string;
  description: string;
  skills: string[];
  location: string | null;
  state: string | null;
  country: string | null;
  tax_terms: string | null;
  employment_type: 'full_time' | 'contract' | 'c2c' | 'w2';
  status: 'open' | 'closed' | 'on_hold' | 'filled';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  ai_agent_id: string | null;
  assigned_recruiter_id: string | null;
  scheduling_config: Record<string, unknown>;
  synced_at: string | null;
  created_at: string;
  client_companies?: { id: string; name: string };
  ai_agents?: { id: string; name: string };
  users?: { id: string; full_name: string };
}

export interface InterviewStage {
  id: string;
  job_id: string;
  stage_number: number;
  name: string;
  ai_agent_id: string | null;
  evaluation_criteria: Record<string, unknown>;
  is_eliminatory: boolean;
  created_at: string;
  ai_agents?: { id: string; name: string; interview_style: string };
}

export interface CreateJobInput {
  title: string;
  description?: string;
  client_company_id?: string;
  skills?: string[];
  location?: string;
  state?: string;
  country?: string;
  tax_terms?: string;
  employment_type?: 'full_time' | 'contract' | 'c2c' | 'w2';
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  ai_agent_id?: string;
  assigned_recruiter_id?: string;
}

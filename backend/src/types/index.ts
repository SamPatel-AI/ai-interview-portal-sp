import { Request } from 'express';

// Express augmentation - add user to Request globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Enums matching database
export type UserRole = 'admin' | 'recruiter' | 'viewer';
export type JobStatus = 'open' | 'closed' | 'on_hold' | 'filled';
export type EmploymentType = 'full_time' | 'contract' | 'c2c' | 'w2';
export type ApplicationStatus = 'new' | 'screening' | 'interviewed' | 'shortlisted' | 'rejected' | 'hired';
export type CallDirection = 'outbound' | 'inbound';
export type CallStatus = 'scheduled' | 'in_progress' | 'completed' | 'no_answer' | 'voicemail' | 'failed' | 'interrupted';
export type InterviewStyle = 'formal' | 'conversational' | 'technical';
export type EvaluationDecision = 'advance' | 'reject' | 'callback' | 'hold';
export type PhoneNumberType = 'inbound' | 'outbound' | 'both';
export type EmailType = 'invitation' | 'follow_up' | 'rejection' | 'custom';
export type EmailStatus = 'sent' | 'failed' | 'bounced';

// Auth context attached to requests
export interface AuthUser {
  id: string;
  email: string;
  org_id: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

// Database row types
export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ClientCompany {
  id: string;
  org_id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface AIAgent {
  id: string;
  org_id: string;
  client_company_id: string | null;
  name: string;
  retell_agent_id: string | null;
  system_prompt: string;
  voice_id: string;
  language: string;
  interview_style: InterviewStyle;
  max_call_duration_sec: number;
  evaluation_criteria: Record<string, unknown>;
  greeting_template: string | null;
  closing_template: string | null;
  fallback_behavior: Record<string, unknown>;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

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
  employment_type: EmploymentType;
  status: JobStatus;
  ai_agent_id: string | null;
  assigned_recruiter_id: string | null;
  synced_at: string | null;
  created_at: string;
}

export interface Candidate {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  work_authorization: string | null;
  resume_url: string | null;
  resume_text: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  org_id: string;
  candidate_id: string;
  job_id: string;
  status: ApplicationStatus;
  ai_screening_score: number | null;
  ai_screening_result: Record<string, unknown> | null;
  mandate_questions: string[] | null;
  interview_questions: string[] | null;
  recruiter_notes: string | null;
  assigned_recruiter_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  org_id: string;
  application_id: string;
  candidate_id: string;
  ai_agent_id: string;
  retell_call_id: string | null;
  direction: CallDirection;
  status: CallStatus;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_object: Record<string, unknown>[] | null;
  recording_url: string | null;
  disconnection_reason: string | null;
  call_analysis: Record<string, unknown> | null;
  call_cost: Record<string, unknown> | null;
  is_resumption: boolean;
  parent_call_id: string | null;
  context_passed: Record<string, unknown> | null;
  scheduled_at: string | null;
  created_at: string;
}

export interface CallEvaluation {
  id: string;
  call_id: string;
  application_id: string;
  evaluated_by: string;
  decision: EvaluationDecision;
  rating: number;
  notes: string | null;
  created_at: string;
}

export interface PhoneNumber {
  id: string;
  org_id: string;
  number: string;
  retell_phone_id: string;
  type: PhoneNumberType;
  assigned_agent_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface EmailLog {
  id: string;
  application_id: string | null;
  candidate_id: string;
  type: EmailType;
  subject: string;
  body: string;
  status: EmailStatus;
  sent_at: string;
}

export interface ActivityLog {
  id: string;
  org_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

// API response helpers
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

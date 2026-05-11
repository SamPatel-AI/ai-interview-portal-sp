export type ReengagementStatus = 'pending' | 'matching' | 'emailing' | 'completed' | 'failed';

export interface ReengagementCampaign {
  id: string;
  job_id: string;
  job_title?: string;
  status: ReengagementStatus;
  candidates_matched: number;
  candidates_emailed: number;
  candidates_responded: number;
  created_at: string;
  completed_at?: string | null;
}

export interface ReengagementCandidate {
  candidate_name: string;
  fit_score: number;
  fit_justification: string;
  email_sent: boolean;
  responded: boolean;
}

export interface ReengagementCampaignDetail {
  campaign: ReengagementCampaign;
  candidates: ReengagementCandidate[];
}

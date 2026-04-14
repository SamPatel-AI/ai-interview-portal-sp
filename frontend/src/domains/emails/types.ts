export interface EmailLog {
  id: string;
  application_id: string | null;
  candidate_id: string;
  type: 'invitation' | 'follow_up' | 'rejection' | 'custom';
  subject: string;
  body: string;
  status: 'sent' | 'failed' | 'bounced';
  sent_at: string;
  candidates?: { id: string; first_name: string; last_name: string; email: string };
  applications?: { id: string; jobs?: { id: string; title: string } };
}

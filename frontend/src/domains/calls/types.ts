export interface Call {
  id: string;
  org_id: string;
  application_id: string;
  candidate_id: string;
  ai_agent_id: string;
  retell_call_id: string | null;
  direction: 'outbound' | 'inbound';
  status: 'scheduled' | 'in_progress' | 'completed' | 'no_answer' | 'voicemail' | 'failed' | 'interrupted';
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
  stage_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  candidates?: { id: string; first_name: string; last_name: string; email: string; phone?: string };
  ai_agents?: { id: string; name: string };
  applications?: { id: string; jobs?: { id: string; title: string } };
  call_evaluations?: Array<{ id: string; decision: string; rating: number; notes: string | null; evaluated_by: string; created_at: string }>;
}

export interface CallEvaluationInput {
  application_id: string;
  decision: 'advance' | 'reject' | 'callback' | 'hold';
  rating: number;
  notes?: string;
}

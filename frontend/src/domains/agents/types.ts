export interface Agent {
  id: string;
  name: string;
  retell_agent_id: string | null;
  client_company_id: string | null;
  voice_id: string;
  language: string;
  interview_style: 'formal' | 'conversational' | 'technical';
  max_call_duration_sec: number;
  evaluation_criteria: Record<string, unknown>;
  greeting_template: string | null;
  closing_template: string | null;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client_companies?: { id: string; name: string };
  jobs?: Array<{ id: string; title: string }>;
}

export interface CreateAgentInput {
  name: string;
  client_company_id?: string;
  voice_id: string;
  language?: string;
  interview_style?: 'formal' | 'conversational' | 'technical';
  max_call_duration_sec?: number;
  evaluation_criteria?: Record<string, unknown>;
  greeting_template?: string;
  closing_template?: string;
  system_prompt?: string;
  is_active?: boolean;
}

export interface Voice {
  voice_id: string;
  voice_name: string;
  gender: string;
  accent: string;
  preview_audio_url?: string;
}

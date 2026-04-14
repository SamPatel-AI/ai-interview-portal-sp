export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'recruiter' | 'viewer';
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SchedulingConfig {
  business_hours?: {
    start: string;
    end: string;
    timezone: string;
    days: number[];
  };
  blackout_dates?: string[];
  custom_windows?: Array<{ start: string; end: string }>;
}

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: string;
}

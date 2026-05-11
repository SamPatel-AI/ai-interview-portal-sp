export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'recruiter' | 'viewer';
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DayHours {
  enabled: boolean;
  start: string;
  end: string;
}

export type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface SchedulingConfig {
  business_hours: Record<DayKey, DayHours>;
  blackout_dates: string[];
  timezone: string;
}

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: string;
}

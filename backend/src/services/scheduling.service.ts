import { supabaseAdmin } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export interface SchedulingConfig {
  business_hours?: {
    start: string;   // "09:00"
    end: string;     // "17:00"
    timezone: string; // "America/New_York"
    days: number[];   // [1,2,3,4,5] for Mon-Fri
  };
  blackout_dates?: string[]; // ["2026-12-25", "2026-01-01"]
  custom_windows?: Array<{
    start: string; // ISO datetime
    end: string;   // ISO datetime
  }>;
}

/**
 * Get effective scheduling config — job-level overrides org-level.
 */
export async function getSchedulingConfig(orgId: string, jobId?: string): Promise<SchedulingConfig> {
  // Fetch org config
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('scheduling_config')
    .eq('id', orgId)
    .single();

  let config: SchedulingConfig = (org?.scheduling_config as SchedulingConfig) || {};

  // If job has its own scheduling config, merge/override
  if (jobId) {
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('scheduling_config')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .single();

    const jobConfig = (job?.scheduling_config as SchedulingConfig) || {};
    if (Object.keys(jobConfig).length > 0) {
      config = { ...config, ...jobConfig };
    }
  }

  return config;
}

/**
 * Validate that a given datetime falls within scheduling restrictions.
 * Returns null if valid, or an error message if invalid.
 */
export function validateSchedulingTime(scheduledAt: string, config: SchedulingConfig): string | null {
  if (!config || Object.keys(config).length === 0) return null;

  const dt = new Date(scheduledAt);

  // Check blackout dates
  if (config.blackout_dates?.length) {
    const dateStr = dt.toISOString().split('T')[0];
    if (config.blackout_dates.includes(dateStr)) {
      return `The date ${dateStr} is a blackout date. Scheduling is not allowed.`;
    }
  }

  // Check custom windows (if any window is set, time must fall within at least one)
  if (config.custom_windows?.length) {
    const inWindow = config.custom_windows.some(w => {
      const start = new Date(w.start);
      const end = new Date(w.end);
      return dt >= start && dt <= end;
    });
    if (!inWindow) {
      return 'Scheduled time does not fall within any allowed scheduling window.';
    }
  }

  // Check business hours
  if (config.business_hours) {
    const bh = config.business_hours;

    // Convert to the configured timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: bh.timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = formatter.formatToParts(dt);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';

    // Map weekday string to number (0=Sun, 1=Mon, ..., 6=Sat)
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dayNum = dayMap[weekdayStr] ?? dt.getDay();

    // Check allowed days
    if (bh.days?.length && !bh.days.includes(dayNum)) {
      return `Scheduling is not allowed on this day. Allowed days: ${bh.days.map(d => Object.keys(dayMap).find(k => dayMap[k] === d)).join(', ')}`;
    }

    // Check time range
    if (bh.start && bh.end) {
      const [startH, startM] = bh.start.split(':').map(Number);
      const [endH, endM] = bh.end.split(':').map(Number);
      const timeMinutes = hour * 60 + minute;
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (timeMinutes < startMinutes || timeMinutes > endMinutes) {
        return `Scheduling is only allowed between ${bh.start} and ${bh.end} (${bh.timezone}).`;
      }
    }
  }

  return null;
}

/**
 * Validate scheduling for a call. Throws AppError if invalid.
 */
export async function validateCallScheduling(
  scheduledAt: string,
  orgId: string,
  jobId?: string
): Promise<void> {
  const config = await getSchedulingConfig(orgId, jobId);
  const error = validateSchedulingTime(scheduledAt, config);
  if (error) {
    throw new AppError(400, error);
  }
}

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSchedulingSettings, useUpdateSchedulingSettings } from '@/domains/settings';
import type { SchedulingConfig, DayKey, DayHours } from '@/domains/settings';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
];

// Generate 30-min increments from 06:00 to 22:00 inclusive
const TIME_OPTIONS = (() => {
  const out: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) continue;
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const hour12 = ((h + 11) % 12) + 1;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
      out.push({ value, label });
    }
  }
  return out;
})();

const DEFAULT_DAY = (enabled: boolean): DayHours => ({ enabled, start: '09:00', end: '17:00' });

const DEFAULT_CONFIG: SchedulingConfig = {
  business_hours: {
    monday: DEFAULT_DAY(true),
    tuesday: DEFAULT_DAY(true),
    wednesday: DEFAULT_DAY(true),
    thursday: DEFAULT_DAY(true),
    friday: DEFAULT_DAY(true),
    saturday: DEFAULT_DAY(false),
    sunday: DEFAULT_DAY(false),
  },
  blackout_dates: [],
  timezone: 'America/New_York',
};

export default function SchedulingSettings() {
  const { data: response, isLoading } = useSchedulingSettings();
  const update = useUpdateSchedulingSettings();

  const loaded: SchedulingConfig | null = useMemo(() => {
    const d = (response as any)?.data;
    if (!d) return null;
    return {
      business_hours: { ...DEFAULT_CONFIG.business_hours, ...(d.business_hours || {}) },
      blackout_dates: d.blackout_dates || [],
      timezone: d.timezone || 'America/New_York',
    };
  }, [response]);

  const [form, setForm] = useState<SchedulingConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (loaded) setForm(loaded);
  }, [loaded]);

  const setDay = (key: DayKey, patch: Partial<DayHours>) => {
    setForm({
      ...form,
      business_hours: {
        ...form.business_hours,
        [key]: { ...form.business_hours[key], ...patch },
      },
    });
  };

  const addBlackout = (date: Date | undefined) => {
    if (!date) return;
    const iso = format(date, 'yyyy-MM-dd');
    if (form.blackout_dates.includes(iso)) return;
    setForm({ ...form, blackout_dates: [...form.blackout_dates, iso].sort() });
  };

  const removeBlackout = (iso: string) => {
    setForm({ ...form, blackout_dates: form.blackout_dates.filter((d) => d !== iso) });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Business Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map(({ key, label }) => {
            const day = form.business_hours[key];
            const disabled = !day.enabled;
            return (
              <div key={key} className="flex items-center gap-3 py-1">
                <div className="flex items-center gap-3 w-40">
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={(v) => setDay(key, { enabled: v })}
                  />
                  <Label className={cn('font-medium', disabled && 'text-muted-foreground')}>{label}</Label>
                </div>
                <Select
                  value={day.start}
                  onValueChange={(v) => setDay(key, { start: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn('w-[140px]', disabled && 'opacity-50')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className={cn('text-sm text-muted-foreground', disabled && 'opacity-50')}>to</span>
                <Select
                  value={day.end}
                  onValueChange={(v) => setDay(key, { end: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn('w-[140px]', disabled && 'opacity-50')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}

          <div className="pt-4 space-y-2 border-t">
            <Label>Timezone</Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm({ ...form, timezone: v })}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Blackout Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">No AI calls will be placed on these dates.</p>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="h-4 w-4 mr-2" /> Add blackout date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                onSelect={addBlackout}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>

          {form.blackout_dates.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {form.blackout_dates.map((iso) => (
                <Badge key={iso} variant="secondary" className="gap-1 pr-1">
                  {new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                  <button
                    onClick={() => removeBlackout(iso)}
                    className="ml-1 rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => update.mutate(form)} disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save Scheduling Settings'}
      </Button>
    </div>
  );
}

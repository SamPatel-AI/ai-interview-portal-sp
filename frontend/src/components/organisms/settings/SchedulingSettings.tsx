import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Clock, Plus, X } from 'lucide-react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Detroit',
  'UTC',
  'Asia/Kolkata',
  'Europe/London',
];

interface SchedulingConfig {
  business_hours?: {
    start: string;
    end: string;
    timezone: string;
    days: number[];
  };
  blackout_dates?: string[];
}

export default function SchedulingSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: response, isLoading } = useQuery({
    queryKey: ['scheduling-config'],
    queryFn: () => apiRequest<ApiResponse<SchedulingConfig>>('/api/settings/scheduling'),
  });

  const config: SchedulingConfig = (response as any)?.data || {};

  const [form, setForm] = useState<SchedulingConfig | null>(null);

  // Initialize form from fetched config
  const currentForm: SchedulingConfig = form ?? {
    business_hours: config.business_hours ?? {
      start: '09:00',
      end: '17:00',
      timezone: 'America/New_York',
      days: [1, 2, 3, 4, 5],
    },
    blackout_dates: config.blackout_dates ?? [],
  };

  const [newBlackoutDate, setNewBlackoutDate] = useState('');

  const saveMutation = useMutation({
    mutationFn: (body: SchedulingConfig) =>
      apiRequest('/api/settings/scheduling', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: 'Scheduling settings saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    },
  });

  const updateForm = (updates: Partial<SchedulingConfig>) => {
    setForm({ ...currentForm, ...updates });
  };

  const toggleDay = (day: number) => {
    const days = currentForm.business_hours?.days || [];
    const updated = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
    updateForm({
      business_hours: { ...currentForm.business_hours!, days: updated },
    });
  };

  const addBlackout = () => {
    if (!newBlackoutDate) return;
    const dates = currentForm.blackout_dates || [];
    if (!dates.includes(newBlackoutDate)) {
      updateForm({ blackout_dates: [...dates, newBlackoutDate].sort() });
    }
    setNewBlackoutDate('');
  };

  const removeBlackout = (date: string) => {
    updateForm({ blackout_dates: (currentForm.blackout_dates || []).filter(d => d !== date) });
  };

  if (isLoading) {
    return <Card className="shadow-card"><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {/* Business Hours */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Business Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={currentForm.business_hours?.start || '09:00'}
                onChange={(e) => updateForm({
                  business_hours: { ...currentForm.business_hours!, start: e.target.value },
                })}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={currentForm.business_hours?.end || '17:00'}
                onChange={(e) => updateForm({
                  business_hours: { ...currentForm.business_hours!, end: e.target.value },
                })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select
              value={currentForm.business_hours?.timezone || 'America/New_York'}
              onValueChange={(v) => updateForm({
                business_hours: { ...currentForm.business_hours!, timezone: v },
              })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Allowed Days</Label>
            <div className="flex gap-2">
              {DAY_NAMES.map((name, idx) => (
                <Button
                  key={idx}
                  variant={currentForm.business_hours?.days?.includes(idx) ? 'default' : 'outline'}
                  size="sm"
                  className="w-12"
                  onClick={() => toggleDay(idx)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blackout Dates */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Blackout Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">No interviews will be scheduled on these dates.</p>
          <div className="flex gap-2">
            <Input
              type="date"
              value={newBlackoutDate}
              onChange={(e) => setNewBlackoutDate(e.target.value)}
              className="w-[200px]"
            />
            <Button variant="outline" size="sm" onClick={addBlackout} disabled={!newBlackoutDate}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
          {(currentForm.blackout_dates || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(currentForm.blackout_dates || []).map((date) => (
                <Badge key={date} variant="secondary" className="gap-1 pr-1">
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  <button onClick={() => removeBlackout(date)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate(currentForm)} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving...' : 'Save Scheduling Settings'}
      </Button>
    </div>
  );
}

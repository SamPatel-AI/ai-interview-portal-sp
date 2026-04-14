import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { settingsKeys } from './queryKeys';
import * as service from '../services/settings.service';
import type { InviteUserInput, SchedulingConfig } from '../types';
import { STALE } from '@/lib/constants';

export function useTeamMembers() {
  return useQuery({
    queryKey: settingsKeys.team(),
    queryFn: () => service.fetchTeamMembers(),
    staleTime: STALE.MEDIUM,
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: InviteUserInput) => service.inviteUser(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: settingsKeys.team() }); toast({ title: 'Invitation sent' }); },
    onError: (err: Error) => { toast({ title: 'Failed to invite', description: err.message, variant: 'destructive' }); },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; role?: string; is_active?: boolean }) => service.updateUser(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: settingsKeys.team() }); toast({ title: 'User updated' }); },
    onError: (err: Error) => { toast({ title: 'Update failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useSchedulingConfig() {
  return useQuery({
    queryKey: settingsKeys.scheduling(),
    queryFn: () => service.fetchSchedulingConfig(),
    staleTime: STALE.LONG,
  });
}

export function useUpdateSchedulingConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (config: SchedulingConfig) => service.updateSchedulingConfig(config),
    onSuccess: () => { qc.invalidateQueries({ queryKey: settingsKeys.scheduling() }); toast({ title: 'Scheduling settings saved' }); },
    onError: (err: Error) => { toast({ title: 'Failed to save', description: err.message, variant: 'destructive' }); },
  });
}

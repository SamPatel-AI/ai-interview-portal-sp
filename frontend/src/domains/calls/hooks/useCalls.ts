import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { callKeys } from './queryKeys';
import * as service from '../services/calls.service';
import type { CallEvaluationInput } from '../types';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useCalls(params: { page?: number; status?: string; direction?: string } = {}) {
  return useQuery({
    queryKey: callKeys.list(params),
    queryFn: () => service.fetchCalls({ ...params, limit: PAGE_SIZE.MD }),
    staleTime: STALE.MEDIUM,
  });
}

export function useCall(id: string | null) {
  return useQuery({
    queryKey: callKeys.detail(id!),
    queryFn: () => service.fetchCall(id!),
    enabled: !!id,
  });
}

export function useInitiateCall() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (applicationId: string) => service.initiateCall(applicationId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: callKeys.all }); toast({ title: 'Call initiated' }); },
    onError: (err: Error) => { toast({ title: 'Call failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useScheduleCall() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ applicationId, scheduledAt }: { applicationId: string; scheduledAt: string }) =>
      service.scheduleCall(applicationId, scheduledAt),
    onSuccess: () => { qc.invalidateQueries({ queryKey: callKeys.all }); toast({ title: 'Call scheduled' }); },
    onError: (err: Error) => { toast({ title: 'Scheduling failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useEvaluateCall() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ callId, ...input }: { callId: string } & CallEvaluationInput) =>
      service.evaluateCall(callId, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: callKeys.all }); toast({ title: 'Evaluation saved' }); },
    onError: (err: Error) => { toast({ title: 'Evaluation failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useRetryCall() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => service.retryCall(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: callKeys.all }); toast({ title: 'Retry initiated' }); },
    onError: (err: Error) => { toast({ title: 'Retry failed', description: err.message, variant: 'destructive' }); },
  });
}

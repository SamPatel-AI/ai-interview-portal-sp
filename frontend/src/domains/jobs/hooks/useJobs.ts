import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { jobKeys } from './queryKeys';
import * as service from '../services/jobs.service';
import type { CreateJobInput } from '../types';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useJobs(params: { page?: number; status?: string; company_id?: string; search?: string } = {}) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: () => service.fetchJobs({ ...params, limit: PAGE_SIZE.MD }),
    staleTime: STALE.MEDIUM,
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: jobKeys.detail(id!),
    queryFn: () => service.fetchJob(id!),
    enabled: !!id,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateJobInput) => service.createJob(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: jobKeys.all }); toast({ title: 'Job created' }); },
    onError: (err: Error) => { toast({ title: 'Failed to create job', description: err.message, variant: 'destructive' }); },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<CreateJobInput> & { status?: string }) => service.updateJob(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: jobKeys.all }); toast({ title: 'Job updated' }); },
    onError: (err: Error) => { toast({ title: 'Failed to update job', description: err.message, variant: 'destructive' }); },
  });
}

export function useSyncCeipal() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (companyId?: string) => service.syncCeipal(companyId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: jobKeys.all }); toast({ title: 'CEIPAL sync complete' }); },
    onError: (err: Error) => { toast({ title: 'Sync failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useJobStages(jobId: string | null) {
  return useQuery({
    queryKey: jobKeys.stages(jobId!),
    queryFn: () => service.fetchStages(jobId!),
    enabled: !!jobId,
  });
}

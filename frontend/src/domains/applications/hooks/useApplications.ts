import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { applicationKeys } from './queryKeys';
import * as service from '../services/applications.service';
import type { CreateApplicationInput } from '../types';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useApplications(params: { page?: number; job_id?: string; status?: string; recruiter_id?: string } = {}) {
  return useQuery({
    queryKey: applicationKeys.list(params),
    queryFn: () => service.fetchApplications({ ...params, limit: PAGE_SIZE.MD }),
    staleTime: STALE.MEDIUM,
  });
}

export function useApplication(id: string | null) {
  return useQuery({
    queryKey: applicationKeys.detail(id!),
    queryFn: () => service.fetchApplication(id!),
    enabled: !!id,
  });
}

export function useCreateApplication() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateApplicationInput) => service.createApplication(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: applicationKeys.all }); toast({ title: 'Application created' }); },
    onError: (err: Error) => { toast({ title: 'Failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useUpdateApplication() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; status?: string; recruiter_notes?: string }) => service.updateApplication(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: applicationKeys.all }); },
    onError: (err: Error) => { toast({ title: 'Update failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useApproveInterview() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => service.approveInterview(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: applicationKeys.all }); toast({ title: 'Invitation sent' }); },
    onError: (err: Error) => { toast({ title: 'Failed to send invitation', description: err.message, variant: 'destructive' }); },
  });
}

export function useScreenApplication() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => service.screenApplication(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: applicationKeys.all }); toast({ title: 'Screening complete' }); },
    onError: (err: Error) => { toast({ title: 'Screening failed', description: err.message, variant: 'destructive' }); },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { reengagementKeys } from './queryKeys';
import * as service from '../services/reengagement.service';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useReengagementCampaigns(params: { page?: number } = {}) {
  return useQuery({
    queryKey: reengagementKeys.list(params),
    queryFn: () => service.fetchCampaigns({ ...params, limit: PAGE_SIZE.MD }),
    staleTime: STALE.MEDIUM,
  });
}

export function useReengagementCampaign(id: string | null) {
  return useQuery({
    queryKey: reengagementKeys.detail(id!),
    queryFn: () => service.fetchCampaign(id!),
    enabled: !!id,
  });
}

export function useTriggerCampaign() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (jobId: string) => service.triggerCampaign(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reengagementKeys.all });
      toast({ title: 'Campaign launched', description: 'Matching candidates and sending emails…' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to launch campaign', description: err.message, variant: 'destructive' });
    },
  });
}

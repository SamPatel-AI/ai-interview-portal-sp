import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { candidateKeys } from './queryKeys';
import * as service from '../services/candidates.service';
import type { CreateCandidateInput } from '../types';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useCandidates(params: { page?: number; search?: string; source?: string } = {}) {
  return useQuery({
    queryKey: candidateKeys.list(params),
    queryFn: () => service.fetchCandidates({ ...params, limit: PAGE_SIZE.MD }),
    staleTime: STALE.MEDIUM,
  });
}

export function useCandidate(id: string | null) {
  return useQuery({
    queryKey: candidateKeys.detail(id!),
    queryFn: () => service.fetchCandidate(id!),
    enabled: !!id,
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateCandidateInput) => service.createCandidate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: candidateKeys.all });
      toast({ title: 'Candidate created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create candidate', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUploadResume() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ candidateId, file }: { candidateId: string; file: File }) =>
      service.uploadResume(candidateId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: candidateKeys.all });
      toast({ title: 'Resume uploaded' });
    },
    onError: (err: Error) => {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    },
  });
}

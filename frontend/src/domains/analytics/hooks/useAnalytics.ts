import { useQuery } from '@tanstack/react-query';
import { analyticsKeys } from './queryKeys';
import * as service from '../services/analytics.service';
import { STALE } from '@/lib/constants';

export function useOverview() {
  return useQuery({
    queryKey: analyticsKeys.overview(),
    queryFn: () => service.fetchOverview(),
    staleTime: STALE.FAST,
  });
}

export function useRecruiterStats(id: string | null) {
  return useQuery({
    queryKey: analyticsKeys.recruiter(id!),
    queryFn: () => service.fetchRecruiterStats(id!),
    enabled: !!id,
    staleTime: STALE.MEDIUM,
  });
}

export function useRecruiterWorkloads() {
  return useQuery({
    queryKey: analyticsKeys.recruiters(),
    queryFn: () => service.fetchRecruiterWorkloads(),
    staleTime: STALE.MEDIUM,
  });
}

export function useJobStats(id: string | null) {
  return useQuery({
    queryKey: analyticsKeys.job(id!),
    queryFn: () => service.fetchJobStats(id!),
    enabled: !!id,
    staleTime: STALE.MEDIUM,
  });
}

export function useAgentStats(id: string | null) {
  return useQuery({
    queryKey: analyticsKeys.agent(id!),
    queryFn: () => service.fetchAgentStats(id!),
    enabled: !!id,
    staleTime: STALE.MEDIUM,
  });
}

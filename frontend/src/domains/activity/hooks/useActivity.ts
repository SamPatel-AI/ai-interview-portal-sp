import { useQuery } from '@tanstack/react-query';
import { activityKeys } from './queryKeys';
import * as service from '../services/activity.service';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useActivity(params: { page?: number; user_id?: string; entity_type?: string; from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: activityKeys.list(params),
    queryFn: () => service.fetchActivity({ ...params, limit: PAGE_SIZE.LG }),
    staleTime: STALE.FAST,
  });
}

export function useActivityFilters() {
  return useQuery({
    queryKey: activityKeys.filters(),
    queryFn: () => service.fetchActivityFilters(),
    staleTime: STALE.STATIC,
  });
}

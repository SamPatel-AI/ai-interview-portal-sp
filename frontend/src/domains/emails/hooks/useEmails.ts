import { useQuery } from '@tanstack/react-query';
import { emailKeys } from './queryKeys';
import * as service from '../services/emails.service';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useEmails(params: { page?: number; type?: string; status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: emailKeys.list(params),
    queryFn: () => service.fetchEmails({ ...params, limit: PAGE_SIZE.MD }),
    staleTime: STALE.MEDIUM,
  });
}

export function useEmail(id: string | null) {
  return useQuery({
    queryKey: emailKeys.detail(id!),
    queryFn: () => service.fetchEmail(id!),
    enabled: !!id,
  });
}

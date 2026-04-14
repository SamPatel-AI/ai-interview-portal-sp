import { useQuery } from '@tanstack/react-query';
import { authKeys } from './queryKeys';
import * as service from '../services/auth.service';
import { STALE } from '@/lib/constants';

export function useAuthMe() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => service.fetchMe(),
    staleTime: STALE.LONG,
    retry: false,
  });
}

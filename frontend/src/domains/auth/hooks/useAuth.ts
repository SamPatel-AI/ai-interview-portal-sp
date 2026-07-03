import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authKeys } from './queryKeys';
import * as service from '../services/auth.service';
import { STALE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

export function useAuthMe() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => service.fetchMe(),
    staleTime: STALE.LONG,
    retry: false,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, full_name }: { id: string; full_name: string }) =>
      service.updateProfile(id, { full_name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: authKeys.me() });
      toast({ title: 'Profile updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });
}

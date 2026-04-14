import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { companyKeys } from './queryKeys';
import * as service from '../services/companies.service';
import type { CreateCompanyInput } from '../types';
import { STALE } from '@/lib/constants';

export function useCompanies(params: { search?: string } = {}) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: () => service.fetchCompanies(params),
    staleTime: STALE.LONG,
  });
}

export function useCompany(id: string | null) {
  return useQuery({
    queryKey: companyKeys.detail(id!),
    queryFn: () => service.fetchCompany(id!),
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateCompanyInput) => service.createCompany(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.all });
      toast({ title: 'Company created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create company', description: err.message, variant: 'destructive' });
    },
  });
}

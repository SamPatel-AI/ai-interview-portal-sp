import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { agentKeys } from './queryKeys';
import * as service from '../services/agents.service';
import type { CreateAgentInput } from '../types';
import { STALE } from '@/lib/constants';

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: () => service.fetchAgents(),
    staleTime: STALE.LONG,
  });
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: agentKeys.detail(id!),
    queryFn: () => service.fetchAgent(id!),
    enabled: !!id,
  });
}

export function useVoices() {
  return useQuery({
    queryKey: agentKeys.voices(),
    queryFn: () => service.fetchVoices(),
    staleTime: STALE.STATIC,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateAgentInput) => service.createAgent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      toast({ title: 'Agent created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create agent', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<CreateAgentInput>) =>
      service.updateAgent(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      toast({ title: 'Agent updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update agent', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => service.deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      toast({ title: 'Agent deleted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to delete agent', description: err.message, variant: 'destructive' });
    },
  });
}

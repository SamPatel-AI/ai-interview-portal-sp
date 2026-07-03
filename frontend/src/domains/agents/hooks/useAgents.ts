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
    onError: (err: Error) => toast({ title: 'Failed to create agent', description: err.message, variant: 'destructive' }),
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
    onError: (err: Error) => toast({ title: 'Failed to update agent', description: err.message, variant: 'destructive' }),
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
    onError: (err: Error) => toast({ title: 'Failed to delete agent', description: err.message, variant: 'destructive' }),
  });
}

export function useSyncAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => service.syncAgent(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(id) });
      toast({ title: 'Sync succeeded' });
    },
    onError: (err: Error) => toast({ title: 'Sync failed', description: err.message, variant: 'destructive' }),
  });
}

export function usePullAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => service.pullAgent(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(id) });
      toast({ title: 'Pulled latest from Retell' });
    },
    onError: (err: Error) => toast({ title: 'Pull failed', description: err.message, variant: 'destructive' }),
  });
}

export function useTestCallAgent() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, phone_number }: { id: string; phone_number: string }) =>
      service.testCallAgent(id, phone_number),
    onSuccess: (_d, vars) =>
      toast({ title: `Calling ${vars.phone_number} now — pick up to hear your agent.` }),
    onError: (err: Error) => {
      toast({ title: 'Test call failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useSetDefaultAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => service.setDefaultAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      toast({ title: 'Default agent updated' });
    },
    onError: (err: Error) => toast({ title: 'Failed to set default', description: err.message, variant: 'destructive' }),
  });
}

export function useImportAgents() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => service.importAgents(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      const { imported = 0, skipped = 0 } = res.data ?? {};
      toast({ title: `Imported ${imported}, skipped ${skipped}` });
    },
    onError: (err: Error) => toast({ title: 'Import failed', description: err.message, variant: 'destructive' }),
  });
}

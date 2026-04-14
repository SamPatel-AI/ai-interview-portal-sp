import { apiRequest, type ApiResponse } from '@/lib/api';
import type { Agent, CreateAgentInput, Voice } from '../types';

export async function fetchAgents() {
  return apiRequest<ApiResponse<Agent[]>>('/api/agents');
}

export async function fetchAgent(id: string) {
  return apiRequest<ApiResponse<Agent>>(`/api/agents/${id}`);
}

export async function fetchVoices() {
  return apiRequest<ApiResponse<Voice[]>>('/api/agents/voices');
}

export async function createAgent(input: CreateAgentInput) {
  return apiRequest<ApiResponse<Agent>>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAgent(id: string, input: Partial<CreateAgentInput>) {
  return apiRequest<ApiResponse<Agent>>(`/api/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteAgent(id: string) {
  return apiRequest<ApiResponse<void>>(`/api/agents/${id}`, { method: 'DELETE' });
}

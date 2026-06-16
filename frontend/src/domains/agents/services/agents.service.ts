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

export async function syncAgent(id: string) {
  return apiRequest<ApiResponse<Agent>>(`/api/agents/${id}/sync`, { method: 'POST' });
}

export async function pullAgent(id: string) {
  return apiRequest<ApiResponse<Agent>>(`/api/agents/${id}/pull`, { method: 'POST' });
}

export async function testCallAgent(id: string, phone_number: string) {
  return apiRequest<ApiResponse<unknown>>(`/api/agents/${id}/test-call`, {
    method: 'POST',
    body: JSON.stringify({ phone_number }),
  });
}

export async function setDefaultAgent(id: string) {
  return apiRequest<ApiResponse<Agent>>(`/api/agents/${id}/default`, { method: 'POST' });
}

export async function importAgents() {
  return apiRequest<ApiResponse<{ imported: number; skipped: number }>>('/api/agents/import', {
    method: 'POST',
  });
}

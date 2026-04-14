import { apiRequest, type ApiResponse } from '@/lib/api';
import type { Job, InterviewStage, CreateJobInput } from '../types';

export async function fetchJobs(params: { page?: number; limit?: number; status?: string; company_id?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
  return apiRequest<ApiResponse<Job[]>>(`/api/jobs?${qs}`);
}

export async function fetchJob(id: string) {
  return apiRequest<ApiResponse<Job>>(`/api/jobs/${id}`);
}

export async function createJob(input: CreateJobInput) {
  return apiRequest<ApiResponse<Job>>('/api/jobs', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateJob(id: string, input: Partial<CreateJobInput> & { status?: string }) {
  return apiRequest<ApiResponse<Job>>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function syncCeipal(clientCompanyId?: string) {
  return apiRequest<ApiResponse<unknown>>('/api/jobs/sync-ceipal', {
    method: 'POST',
    body: JSON.stringify({ client_company_id: clientCompanyId }),
  });
}

export async function fetchStages(jobId: string) {
  return apiRequest<ApiResponse<InterviewStage[]>>(`/api/jobs/${jobId}/stages`);
}

export async function createStage(jobId: string, input: { name: string; stage_number: number; ai_agent_id?: string; is_eliminatory?: boolean }) {
  return apiRequest<ApiResponse<InterviewStage>>(`/api/jobs/${jobId}/stages`, { method: 'POST', body: JSON.stringify(input) });
}

export async function deleteStage(jobId: string, stageId: string) {
  return apiRequest<ApiResponse<void>>(`/api/jobs/${jobId}/stages/${stageId}`, { method: 'DELETE' });
}

import { apiRequest, type ApiResponse } from '@/lib/api';
import type { Application, CreateApplicationInput } from '../types';

export async function fetchApplications(params: { page?: number; limit?: number; job_id?: string; status?: string; recruiter_id?: string; candidate_id?: string } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
  return apiRequest<ApiResponse<Application[]>>(`/api/applications?${qs}`);
}

export async function fetchApplication(id: string) {
  return apiRequest<ApiResponse<Application>>(`/api/applications/${id}`);
}

export async function createApplication(input: CreateApplicationInput) {
  return apiRequest<ApiResponse<Application>>('/api/applications', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateApplication(id: string, input: { status?: string; recruiter_notes?: string; assigned_recruiter_id?: string | null }) {
  return apiRequest<ApiResponse<Application>>(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function approveInterview(id: string) {
  return apiRequest<ApiResponse<{ message: string }>>(`/api/applications/${id}/approve-interview`, { method: 'POST' });
}

export async function screenApplication(id: string) {
  return apiRequest<ApiResponse<unknown>>(`/api/applications/${id}/screen`, { method: 'POST' });
}

export async function assignRecruiter(id: string, recruiterId: string) {
  return apiRequest<ApiResponse<Application>>(`/api/applications/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ recruiter_id: recruiterId }),
  });
}

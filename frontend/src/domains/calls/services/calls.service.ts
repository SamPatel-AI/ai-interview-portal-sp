import { apiRequest, type ApiResponse } from '@/lib/api';
import type { Call, CallEvaluationInput } from '../types';

export async function fetchCalls(params: { page?: number; limit?: number; status?: string; direction?: string; application_id?: string; candidate_id?: string } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
  return apiRequest<ApiResponse<Call[]>>(`/api/calls?${qs}`);
}

export async function fetchCall(id: string) {
  return apiRequest<ApiResponse<Call>>(`/api/calls/${id}`);
}

export async function initiateCall(applicationId: string) {
  return apiRequest<ApiResponse<Call>>('/api/calls/outbound', { method: 'POST', body: JSON.stringify({ application_id: applicationId }) });
}

export async function scheduleCall(applicationId: string, scheduledAt: string) {
  return apiRequest<ApiResponse<Call>>('/api/calls/schedule', { method: 'POST', body: JSON.stringify({ application_id: applicationId, scheduled_at: scheduledAt }) });
}

export async function batchCalls(applicationIds: string[], intervalMinutes?: number) {
  return apiRequest<ApiResponse<unknown>>('/api/calls/batch', { method: 'POST', body: JSON.stringify({ application_ids: applicationIds, interval_minutes: intervalMinutes }) });
}

export async function autoQueue(maxCalls?: number, intervalMinutes?: number) {
  return apiRequest<ApiResponse<{ queued: number; failed: number }>>('/api/calls/auto-queue', {
    method: 'POST',
    body: JSON.stringify({ max_calls: maxCalls, interval_minutes: intervalMinutes }),
  });
}

export async function retryCall(id: string) {
  return apiRequest<ApiResponse<Call>>(`/api/calls/${id}/retry`, { method: 'POST' });
}

export async function evaluateCall(id: string, input: CallEvaluationInput) {
  return apiRequest<ApiResponse<unknown>>(`/api/calls/${id}/evaluate`, { method: 'POST', body: JSON.stringify(input) });
}

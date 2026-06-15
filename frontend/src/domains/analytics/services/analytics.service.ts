import { apiRequest, type ApiResponse } from '@/lib/api';
import type { OverviewStats, RecruiterStats, RecruiterWorkload, AgentStats } from '../types';

export async function fetchOverview() {
  return apiRequest<ApiResponse<OverviewStats>>('/api/analytics/overview');
}

export async function fetchRecruiterStats(id: string) {
  return apiRequest<ApiResponse<RecruiterStats>>(`/api/analytics/recruiter/${id}`);
}

export async function fetchRecruiterWorkloads() {
  return apiRequest<ApiResponse<RecruiterWorkload[]>>('/api/analytics/recruiters');
}

export async function getRecruiterWorkload(): Promise<RecruiterWorkload[]> {
  const res = await apiRequest<ApiResponse<RecruiterWorkload[]>>('/api/analytics/recruiters');
  return res.data ?? [];
}

export async function fetchJobStats(id: string) {
  return apiRequest<ApiResponse<Record<string, unknown>>>(`/api/analytics/job/${id}`);
}

export async function fetchAgentStats(id: string) {
  return apiRequest<ApiResponse<AgentStats>>(`/api/analytics/agent/${id}`);
}

export async function exportData(type: 'candidates' | 'applications' | 'calls' | 'jobs') {
  return apiRequest<string>(`/api/reports/export?type=${type}`);
}

export async function exportReport(type: string) {
  return apiRequest<Blob>(`/api/reports/export?type=${type}`, { responseType: 'blob' });
}


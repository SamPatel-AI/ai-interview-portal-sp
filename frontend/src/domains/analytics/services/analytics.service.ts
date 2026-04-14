import { apiRequest, type ApiResponse } from '@/lib/api';
import type { OverviewStats, RecruiterStats, RecruiterWorkload } from '../types';

export async function fetchOverview() {
  return apiRequest<ApiResponse<OverviewStats>>('/api/analytics/overview');
}

export async function fetchRecruiterStats(id: string) {
  return apiRequest<ApiResponse<RecruiterStats>>(`/api/analytics/recruiter/${id}`);
}

export async function fetchRecruiterWorkloads() {
  return apiRequest<ApiResponse<RecruiterWorkload[]>>('/api/analytics/recruiters');
}

export async function fetchJobStats(id: string) {
  return apiRequest<ApiResponse<unknown>>(`/api/analytics/job/${id}`);
}

export async function fetchAgentStats(id: string) {
  return apiRequest<ApiResponse<unknown>>(`/api/analytics/agent/${id}`);
}

export async function exportData(type: 'candidates' | 'applications' | 'calls' | 'jobs') {
  return apiRequest<string>(`/api/reports/export?type=${type}`);
}

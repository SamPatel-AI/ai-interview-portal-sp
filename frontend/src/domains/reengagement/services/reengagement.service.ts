import { apiRequest, type ApiResponse } from '@/lib/api';
import type { ReengagementCampaign, ReengagementCampaignDetail } from '../types';

export async function fetchCampaigns(params: { page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
  return apiRequest<ApiResponse<{ campaigns: ReengagementCampaign[] } | ReengagementCampaign[]>>(`/api/reengagement/campaigns?${qs}`);
}

export async function fetchCampaign(id: string) {
  return apiRequest<ApiResponse<ReengagementCampaignDetail>>(`/api/reengagement/campaigns/${id}`);
}

export async function triggerCampaign(jobId: string) {
  return apiRequest<ApiResponse<ReengagementCampaign>>('/api/reengagement/trigger', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId }),
  });
}

import { apiRequest, type ApiResponse } from '@/lib/api';
import type { ActivityEntry, ActivityFilters } from '../types';

export async function fetchActivity(params: { page?: number; limit?: number; user_id?: string; entity_type?: string; from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
  return apiRequest<ApiResponse<ActivityEntry[]>>(`/api/activity?${qs}`);
}

export async function fetchActivityFilters() {
  return apiRequest<ApiResponse<ActivityFilters>>('/api/activity/filters');
}

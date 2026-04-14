import { apiRequest, type ApiResponse } from '@/lib/api';
import type { TeamMember, SchedulingConfig, InviteUserInput } from '../types';

export async function fetchTeamMembers() {
  return apiRequest<ApiResponse<TeamMember[]>>('/api/users');
}

export async function inviteUser(input: InviteUserInput) {
  return apiRequest<ApiResponse<TeamMember>>('/api/users/invite', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateUser(id: string, input: { role?: string; is_active?: boolean; full_name?: string }) {
  return apiRequest<ApiResponse<TeamMember>>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function fetchSchedulingConfig() {
  return apiRequest<ApiResponse<SchedulingConfig>>('/api/settings/scheduling');
}

export async function updateSchedulingConfig(config: SchedulingConfig) {
  return apiRequest<ApiResponse<SchedulingConfig>>('/api/settings/scheduling', { method: 'PATCH', body: JSON.stringify(config) });
}

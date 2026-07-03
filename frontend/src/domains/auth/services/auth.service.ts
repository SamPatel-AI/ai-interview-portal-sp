import { apiRequest, type ApiResponse } from '@/lib/api';
import type { AuthUser } from '../types';

export async function fetchMe() {
  return apiRequest<ApiResponse<AuthUser>>('/api/auth/me');
}

export async function updateProfile(userId: string, input: { full_name: string }) {
  return apiRequest<ApiResponse<AuthUser>>(`/api/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

import { apiRequest, type ApiResponse } from '@/lib/api';
import type { AuthUser } from '../types';

export async function fetchMe() {
  return apiRequest<ApiResponse<AuthUser>>('/api/auth/me');
}

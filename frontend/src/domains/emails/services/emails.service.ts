import { apiRequest, type ApiResponse } from '@/lib/api';
import type { EmailLog } from '../types';

export async function fetchEmails(params: { page?: number; limit?: number; type?: string; status?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
  return apiRequest<ApiResponse<EmailLog[]>>(`/api/emails?${qs}`);
}

export async function fetchEmail(id: string) {
  return apiRequest<ApiResponse<EmailLog>>(`/api/emails/${id}`);
}

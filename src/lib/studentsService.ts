import { apiFetch } from './api';
import type { StudentDetailResponse, StudentFilters, StudentsResponse } from './types';

/** Drops empty filters so the URL only carries what the user actually set. */
export const toQueryString = (filters: StudentFilters, page: number, limit: number): string => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set('page', String(page));
  params.set('limit', String(limit));

  return params.toString();
};

export const fetchStudents = async (
  filters: StudentFilters,
  page: number,
  limit = 25
): Promise<StudentsResponse> => {
  return apiFetch<StudentsResponse>(`/api/students?${toQueryString(filters, page, limit)}`);
};

export const fetchStudent = async (id: string): Promise<StudentDetailResponse> => {
  return apiFetch<StudentDetailResponse>(`/api/students/${id}`);
};

/** Req 10. Administrator only; the server enforces that. */
export const setAccountStatus = async (id: string, isActive: boolean) => {
  return apiFetch<{ message: string }>(`/api/students/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
};

export const formatDate = (value: string | Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** "3 days ago" style relative time, which reads faster than a date in a table. */
export const formatRelative = (value: string | Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDate(date);
};

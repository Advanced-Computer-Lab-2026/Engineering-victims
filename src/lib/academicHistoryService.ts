import { apiFetch } from './api';
import type { AcademicHistoryResponse } from './types';

/** Req 54, Advising Student: their own history, resolved from the token. */
export const fetchMyAcademicHistory = async (): Promise<AcademicHistoryResponse> =>
  apiFetch<AcademicHistoryResponse>('/api/academic-history/me');

/** Req 54, Advisor / Coordinator: any Advising Student by directory id. */
export const fetchStudentAcademicHistory = async (studentId: string): Promise<AcademicHistoryResponse> =>
  apiFetch<AcademicHistoryResponse>(`/api/academic-history/${encodeURIComponent(studentId)}`);

import { apiFetch } from './api';
import type { PreferenceEntry, SchedulingPreferencesResponse, StudentPreferencesResponse } from './types';

/** Req 57. The server reads the student from the token. */
export const fetchMyPreferences = async (): Promise<SchedulingPreferencesResponse> =>
  apiFetch<SchedulingPreferencesResponse>('/api/preferences/me');

/** Replaces the whole ranked list; list order is the priority. */
export const saveMyPreferences = async (preferences: PreferenceEntry[], note: string) =>
  apiFetch<SchedulingPreferencesResponse & { message: string }>('/api/preferences/me', {
    method: 'PUT',
    body: JSON.stringify({ preferences, note }),
  });

/** Req 58: Advisors and Coordinators read any Advising Student's latest preferences. */
export const fetchStudentPreferences = async (studentId: string): Promise<StudentPreferencesResponse> =>
  apiFetch<StudentPreferencesResponse>(`/api/preferences/students/${studentId}`);

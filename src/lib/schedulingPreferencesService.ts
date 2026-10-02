import { apiFetch } from './api';
import type { PreferenceEntry, SchedulingPreferencesResponse } from './types';

/** Req 57. The server reads the student from the token. */
export const fetchMyPreferences = async (): Promise<SchedulingPreferencesResponse> =>
  apiFetch<SchedulingPreferencesResponse>('/api/preferences/me');

/** Replaces the whole ranked list; list order is the priority. */
export const saveMyPreferences = async (preferences: PreferenceEntry[], note: string) =>
  apiFetch<SchedulingPreferencesResponse & { message: string }>('/api/preferences/me', {
    method: 'PUT',
    body: JSON.stringify({ preferences, note }),
  });

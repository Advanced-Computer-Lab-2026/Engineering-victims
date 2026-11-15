import { apiFetch } from './api';
import type { SwapGroupScheduleResponse, WeeklyScheduleResponse } from './types';

/** Req 31, student: their own schedule, resolved from the token. */
export const fetchMySchedule = async (): Promise<WeeklyScheduleResponse> =>
  apiFetch<WeeklyScheduleResponse>('/api/schedules/me');

/** Req 31, staff: a student's schedule by directory id. */
export const fetchStudentSchedule = async (studentId: string): Promise<WeeklyScheduleResponse> =>
  apiFetch<WeeklyScheduleResponse>(`/api/schedules/${encodeURIComponent(studentId)}`);

/**
 * Req 34, student: the complete weekly schedule of one eligible swap group.
 * The API re-checks the group against the caller's own course set, so a group
 * that is not a real destination answers 403 rather than showing a schedule.
 */
export const fetchSwapGroupSchedule = async (group: string): Promise<SwapGroupScheduleResponse> =>
  apiFetch<SwapGroupScheduleResponse>(
    `/api/students/eligible-swap-groups/${encodeURIComponent(group)}`
  );

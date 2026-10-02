import { apiFetch } from './api';
import type { WeeklyScheduleResponse } from './types';

/** Req 31, student: their own schedule, resolved from the token. */
export const fetchMySchedule = async (): Promise<WeeklyScheduleResponse> =>
  apiFetch<WeeklyScheduleResponse>('/api/schedules/me');

/** Req 31, staff: a student's schedule by directory id. */
export const fetchStudentSchedule = async (studentId: string): Promise<WeeklyScheduleResponse> =>
  apiFetch<WeeklyScheduleResponse>(`/api/schedules/${encodeURIComponent(studentId)}`);

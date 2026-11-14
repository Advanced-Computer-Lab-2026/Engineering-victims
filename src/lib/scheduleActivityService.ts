import { apiFetch } from './api';

export type ScheduleActivityAction = 'Processed' | 'Reopened';

export interface ScheduleActivityEntry {
  id: string;
  studentObjectId: string;
  studentId: string;
  studentName: string;
  action: ScheduleActivityAction;
  scheduleVersion: number;
  staffName: string;
  staffEmail: string;
  staffRole: 'Advisor' | 'Coordinator' | 'Administrator';
  reason: string | null;
  occurredAt: string;
}

export interface ScheduleHistoryFilterParams {
  action?: ScheduleActivityAction | '';
  startDate?: string;
  endDate?: string;
  search?: string;
}

export async function getGlobalScheduleHistory(params: ScheduleHistoryFilterParams = {}) {
  const query = new URLSearchParams();
  if (params.action) query.set('action', params.action);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.search?.trim()) query.set('search', params.search.trim());
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<{ logs: ScheduleActivityEntry[]; total: number; matched: number }>(
    `/api/schedule-history${qs}`
  );
}

export async function getStudentScheduleHistory(
  studentObjectId: string,
  params: Omit<ScheduleHistoryFilterParams, 'search'> = {}
) {
  const query = new URLSearchParams();
  if (params.action) query.set('action', params.action);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<{
    student: { id: string; studentId: string; fullName: string; workflowStatus: string };
    logs: ScheduleActivityEntry[];
  }>(`/api/schedule-history/student/${encodeURIComponent(studentObjectId)}${qs}`);
}

export async function processAdvisingStudentSchedule(studentObjectId: string) {
  return apiFetch<{
    message: string;
    log: ScheduleActivityEntry;
    workflowStatus: string;
  }>(`/api/schedule-history/student/${encodeURIComponent(studentObjectId)}/process`, {
    method: 'POST',
  });
}

export async function reopenAdvisingStudentSchedule(studentObjectId: string, reason: string) {
  return apiFetch<{
    message: string;
    log: ScheduleActivityEntry;
    workflowStatus: string;
  }>(`/api/schedule-history/student/${encodeURIComponent(studentObjectId)}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

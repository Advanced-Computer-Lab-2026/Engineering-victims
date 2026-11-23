import { apiFetch, apiUrl, authHeaders } from './api';
import {
  scheduleHistoryQuery,
  type ScheduleActivityAction,
  type ScheduleHistoryFilterParams,
} from './scheduleHistoryQuery';

export type { ScheduleActivityAction, ScheduleHistoryFilterParams };

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

export async function getGlobalScheduleHistory(params: ScheduleHistoryFilterParams = {}) {
  return apiFetch<{ logs: ScheduleActivityEntry[]; total: number; matched: number }>(
    `/api/schedule-history${scheduleHistoryQuery(params)}`
  );
}

/** Req 126: downloads the CSV of the displayed history (same filters and search as the list). */
export async function exportGlobalScheduleHistory(params: ScheduleHistoryFilterParams = {}) {
  const response = await fetch(apiUrl(`/api/schedule-history/export${scheduleHistoryQuery(params)}`), {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Could not export the schedule activity history.');
  }
  const name =
    /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] ||
    'schedule-activity-history.csv';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

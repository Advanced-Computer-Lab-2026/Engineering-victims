import { apiFetch } from './api';
import type { MandatoryRemovalRequestSummary, StudentRemovalRequestsResponse } from './types';

export const REMOVAL_NOTE_LIMIT = 1000;
export const RESTRICTED_PAIR_CATEGORY = 'Restricted course pair in the same term';

/** One student's removal requests, the valid cases and whether the caller may submit one. */
export const fetchStudentRemovalRequests = async (studentId: string): Promise<StudentRemovalRequestsResponse> =>
  apiFetch(`/api/mandatory-removal-requests/student/${encodeURIComponent(studentId)}`);

/** Req 64: the assigned Advisor asks for a mandatory course to be removed. */
export const submitRemovalRequest = async (input: {
  studentId: string;
  courseId: string;
  category: string;
  pairedCourseId?: string;
  reason: string;
}): Promise<{ message: string; request: MandatoryRemovalRequestSummary }> =>
  apiFetch('/api/mandatory-removal-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });

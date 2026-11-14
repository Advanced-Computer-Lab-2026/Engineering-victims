import { apiFetch } from './api';
import type { ExitExamRequestSummary } from './types';

export const EXIT_EXAM_NOTE_LIMIT = 1000;

/** Req 108: submit an exit-exam request from the Advisor's draft plan. */
export const submitExitExamRequest = async (input: {
  planId: string;
  courseId: string;
  reason: string;
}): Promise<{ message: string; request: ExitExamRequestSummary }> =>
  apiFetch('/api/exit-exam-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });

/** The plan's creating Advisor sees its request status and Coordinator note. */
export const fetchExitExamRequestsForPlan = async (
  planId: string
): Promise<{ requests: ExitExamRequestSummary[] }> =>
  apiFetch(`/api/exit-exam-requests/plan/${planId}`);

/** Req 109: Coordinators review pending requests. */
export const fetchPendingExitExamRequests = async (): Promise<{ requests: ExitExamRequestSummary[] }> =>
  apiFetch('/api/exit-exam-requests');

/** Req 109: approve or reject with a note visible to the Advisor and student. */
export const decideExitExamRequest = async (
  requestId: string,
  decision: 'approve' | 'reject',
  note: string
): Promise<{ message: string; request: ExitExamRequestSummary }> =>
  apiFetch(`/api/exit-exam-requests/${requestId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });

/** Req 115: the signed-in Advising Student's own request history. */
export const fetchMyExitExamRequests = async (): Promise<{ requests: ExitExamRequestSummary[] }> =>
  apiFetch('/api/exit-exam-requests/mine');

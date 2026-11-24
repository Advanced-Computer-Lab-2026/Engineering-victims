import { apiFetch } from './api';
import type {
  MandatoryRemovalDecisionResponse,
  MandatoryRemovalListResponse,
  MandatoryRemovalQuery,
  MandatoryRemovalRequestSummary,
  StudentRemovalRequestsResponse,
} from './types';

export const REMOVAL_NOTE_LIMIT = 1000;
export const RESTRICTED_PAIR_CATEGORY = 'Restricted course pair in the same term';

/** One student's removal requests, the valid cases and whether the caller may submit one. */
export const fetchStudentRemovalRequests = async (studentId: string): Promise<StudentRemovalRequestsResponse> =>
  apiFetch(`/api/mandatory-removal-requests/student/${encodeURIComponent(studentId)}`);

export const REMOVAL_SEARCH_LIMIT = 80;

export const NO_REMOVAL_QUERY: MandatoryRemovalQuery = {
  search: '',
  status: '',
  advisor: '',
  submittedFrom: '',
  submittedTo: '',
};

/**
 * Req 65-67: a Coordinator's list of every removal request. `search` matches a
 * student ID, a course code, or an Advisor's name or GUC email; the filters are
 * the Advisor who asked, the status and the submission dates. Blank values are
 * left out of the request.
 */
export const fetchMandatoryRemovalRequests = async (
  query: MandatoryRemovalQuery = NO_REMOVAL_QUERY
): Promise<MandatoryRemovalListResponse> => {
  const params = new URLSearchParams();
  (Object.keys(NO_REMOVAL_QUERY) as Array<keyof MandatoryRemovalQuery>).forEach((key) => {
    const value = query[key].trim();
    if (value) params.set(key, value);
  });
  const queryString = params.toString();
  return apiFetch(`/api/mandatory-removal-requests${queryString ? `?${queryString}` : ''}`);
};

/** Req 68: one request, opened from the list, read fresh. */
export const fetchMandatoryRemovalRequest = async (
  id: string
): Promise<{ request: MandatoryRemovalRequestSummary }> =>
  apiFetch(`/api/mandatory-removal-requests/${encodeURIComponent(id)}`);

/** Req 69: a Coordinator approves or rejects a Pending request, with a response note. */
export const decideRemovalRequest = async (
  id: string,
  decision: 'approve' | 'reject',
  note: string
): Promise<MandatoryRemovalDecisionResponse> =>
  apiFetch(`/api/mandatory-removal-requests/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });

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

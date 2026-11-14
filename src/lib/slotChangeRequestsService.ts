import { apiFetch } from './api';
import type {
  SlotChangeComparison,
  SlotChangeDecisionResult,
  SlotChangeEligibility,
  SlotChangeRequestInput,
  SlotChangeRequestItem,
  SlotChangeRequestSummary,
  StaffSlotChangeFilterOptions,
  StaffSlotChangeRequestDetails,
  StaffSlotChangeRequestList,
} from './types';

/** The longest preference note the API accepts. */
export const SLOT_CHANGE_NOTE_LIMIT = 500;

/** Req 40: whether the signed-in Advising Student may request a slot change now. */
export const fetchSlotChangeEligibility = async (): Promise<SlotChangeEligibility> =>
  apiFetch<SlotChangeEligibility>('/api/slot-change-requests/me/eligibility');

/**
 * Req 40: request a change to one assigned slot. The student comes from the
 * token; the API re-checks the status, deadline and slot ownership.
 */
export const submitSlotChangeRequest = async (
  input: SlotChangeRequestInput
): Promise<{ message: string; request: SlotChangeRequestSummary }> =>
  apiFetch('/api/slot-change-requests/me', { method: 'POST', body: JSON.stringify(input) });

/**
 * Req 41: the signed-in Advising Student's own requests from every term,
 * newest first, with any Advisor or Coordinator response.
 */
export const fetchMySlotChangeRequests = async (): Promise<SlotChangeRequestItem[]> =>
  (await apiFetch<{ requests: SlotChangeRequestItem[] }>('/api/slot-change-requests/me')).requests;

/**
 * Req 42: withdraw one of the signed-in student's own Pending requests. The
 * API checks ownership and the Pending status atomically and returns the
 * updated request in the Req 41 list format.
 */
export const withdrawSlotChangeRequest = async (
  id: string
): Promise<{ message: string; request: SlotChangeRequestItem }> =>
  apiFetch(`/api/slot-change-requests/me/${encodeURIComponent(id)}/withdraw`, { method: 'PATCH' });

/**
 * Req 43: the requests the signed-in Advisor (assigned students only) or
 * Coordinator (all) may see, every status, newest first. The API derives the
 * scope from the session alone. Req 44 adds an optional search and req 45
 * the filters; blank values are left out of the URL.
 */
export const fetchStaffSlotChangeRequests = async (
  options: StaffSlotChangeRequestQuery = {}
): Promise<StaffSlotChangeRequestList> => {
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed) params.set(key, trimmed);
  });
  const query = params.toString();
  return apiFetch<StaffSlotChangeRequestList>(`/api/slot-change-requests${query ? `?${query}` : ''}`);
};

/**
 * Req 46: one request's details, read fresh. The API only finds it inside the
 * caller's scope, so a request from another Advisor's student answers 404.
 */
export const fetchStaffSlotChangeRequest = async (id: string): Promise<StaffSlotChangeRequestDetails> =>
  apiFetch<StaffSlotChangeRequestDetails>(`/api/slot-change-requests/${encodeURIComponent(id)}`);

/**
 * Req 47: the request's current slot beside the other groups of the same
 * course offering and component, with remaining seats and timetable clashes.
 * Scoped like the details: another Advisor's request answers 404.
 */
export const fetchSlotChangeAlternatives = async (id: string): Promise<SlotChangeComparison> =>
  apiFetch<SlotChangeComparison>(`/api/slot-change-requests/${encodeURIComponent(id)}/alternatives`);

/**
 * Req 48: approve a Pending request into the exact replacement group. The
 * server re-checks seats and clashes and moves the student in one
 * transaction; a 409 means it changed meanwhile (e.g. the last seat went).
 */
export const approveSlotChangeRequest = async (
  id: string,
  input: { replacementSlotId: string; responseNote?: string }
): Promise<SlotChangeDecisionResult> =>
  apiFetch<SlotChangeDecisionResult>(`/api/slot-change-requests/${encodeURIComponent(id)}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

/** Req 48: reject a Pending request; the student keeps their current group. */
export const rejectSlotChangeRequest = async (
  id: string,
  input: { responseNote?: string }
): Promise<SlotChangeDecisionResult> =>
  apiFetch<SlotChangeDecisionResult>(`/api/slot-change-requests/${encodeURIComponent(id)}/reject`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

/** Req 45: Advisor and course choices for the filters, within the caller's scope. */
export const fetchStaffSlotChangeFilterOptions = async (): Promise<StaffSlotChangeFilterOptions> =>
  apiFetch<StaffSlotChangeFilterOptions>('/api/slot-change-requests/filter-options');

/** The longest search term the staff list accepts (req 44). */
export const STAFF_SEARCH_LIMIT = 100;

/** Req 45: the Advisor filter value for students with no Advisor. */
export const UNASSIGNED_ADVISOR = 'none';

/**
 * Req 44/45: optional narrowing of the staff list. `search` matches a student
 * ID (with or without the hyphen), a student name or a course code. `status`,
 * `advisor` (an Advisor id or UNASSIGNED_ADVISOR), `course` (a course id) and
 * the submission dates (YYYY-MM-DD, inclusive) filter further. The API always
 * applies all of them inside the caller's own scope.
 */
export interface StaffSlotChangeRequestQuery {
  search?: string;
  status?: string;
  advisor?: string;
  course?: string;
  submittedFrom?: string;
  submittedTo?: string;
}

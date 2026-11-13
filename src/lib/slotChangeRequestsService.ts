import { apiFetch } from './api';
import type {
  SlotChangeEligibility,
  SlotChangeRequestInput,
  SlotChangeRequestItem,
  SlotChangeRequestSummary,
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
 * scope from the session alone. Req 44 adds an optional search.
 */
export const fetchStaffSlotChangeRequests = async (
  options: StaffSlotChangeRequestQuery = {}
): Promise<StaffSlotChangeRequestList> => {
  const params = new URLSearchParams();
  const search = options.search?.trim();
  if (search) params.set('search', search);
  const query = params.toString();
  return apiFetch<StaffSlotChangeRequestList>(`/api/slot-change-requests${query ? `?${query}` : ''}`);
};

/** The longest search term the staff list accepts (req 44). */
export const STAFF_SEARCH_LIMIT = 100;

/**
 * Req 44: optional narrowing of the staff list. `search` matches a student ID
 * (with or without the hyphen), a student name or a course code; the API
 * always applies it inside the caller's own scope.
 */
export interface StaffSlotChangeRequestQuery {
  search?: string;
}

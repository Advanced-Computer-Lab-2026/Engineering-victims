import { apiFetch } from './api';
import {
  EMPTY_ADVISING_FILTERS,
  type AdvisingOverviewResponse,
  type AdvisingStudentFilters,
  type AdvisingStudentRow,
  type AdvisingStudentsResponse,
} from './types';

/**
 * Req 50, 51, 52. Advisor only; the server enforces that.
 *
 * Blank filter values are dropped rather than sent empty, so the API never has
 * to tell "" apart from "not chosen".
 */
export const fetchAdvisingStudents = async (
  filters: AdvisingStudentFilters = EMPTY_ADVISING_FILTERS
): Promise<AdvisingStudentsResponse> => {
  const params = new URLSearchParams();
  Object.entries({ ...EMPTY_ADVISING_FILTERS, ...filters }).forEach(([key, value]) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed) params.set(key, trimmed);
  });

  const query = params.toString();
  return apiFetch<AdvisingStudentsResponse>(`/api/advisors/advising-students${query ? `?${query}` : ''}`);
};

/** Req 53 — one student's advising details, opened from the list. */
export interface AdvisingStudentDetailResponse {
  student: AdvisingStudentRow;
  availableStatuses: string[];
}

export const fetchAdvisingStudent = async (studentId: string): Promise<AdvisingStudentDetailResponse> =>
  apiFetch<AdvisingStudentDetailResponse>(`/api/advisors/advising-students/${studentId}`);

/** Req 59 — advising reason, credit-hour allowance, schedule status and bachelor-project eligibility. */
export const fetchAdvisingOverview = async (studentId: string): Promise<AdvisingOverviewResponse> =>
  apiFetch<AdvisingOverviewResponse>(`/api/advisors/advising-students/${encodeURIComponent(studentId)}/overview`);

import { apiFetch } from './api';
import type {
  GraduationPlanDetail,
  GraduationPlanPlacement,
  GraduationPlanSummary,
} from './types';

/**
 * Req 103-114. The server scopes every call by role: an Advisor sees their own
 * plans, a Coordinator sees plans that have left the draft stage, and an
 * Advising Student only their accepted plan.
 */

/** Req 111/112 — the Coordinator's review filters. Blank values are omitted. */
export interface GraduationPlanFilters {
  status?: string;
  advisor?: string;
  submittedFrom?: string;
  submittedTo?: string;
  search?: string;
}

export const fetchGraduationPlans = async (
  filters: GraduationPlanFilters = {}
): Promise<{ plans: GraduationPlanSummary[] }> => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed) params.set(key, trimmed);
  });

  const query = params.toString();
  return apiFetch<{ plans: GraduationPlanSummary[] }>(
    `/api/graduation-plans${query ? `?${query}` : ''}`
  );
};

/** Req 103/106 — start a plan, or reopen the Advisor's existing draft. */
export const createGraduationPlan = async (studentId: string): Promise<{ plan: GraduationPlanDetail }> =>
  apiFetch('/api/graduation-plans', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  });

/** Req 103-107/110 — the owner Advisor or a reviewing Coordinator. */
export const fetchGraduationPlan = async (planId: string): Promise<{ plan: GraduationPlanDetail }> =>
  apiFetch(`/api/graduation-plans/${planId}`);

/** Req 104 — save a draft, finished or not. */
export const saveGraduationPlan = async (
  planId: string,
  placements: GraduationPlanPlacement[]
): Promise<{ plan: GraduationPlanDetail }> =>
  apiFetch(`/api/graduation-plans/${planId}`, {
    method: 'PUT',
    body: JSON.stringify({ placements }),
  });

/** Req 107 — validate and submit; the server rejects an incomplete plan. */
export const submitGraduationPlan = async (
  planId: string
): Promise<{ message: string; plan: GraduationPlanDetail }> =>
  apiFetch(`/api/graduation-plans/${planId}/submit`, { method: 'POST' });

/** Req 105 — delete a draft. Submitted plans cannot be deleted. */
export const deleteGraduationPlan = async (planId: string): Promise<void> =>
  apiFetch(`/api/graduation-plans/${planId}`, { method: 'DELETE' });

/** Req 113 — the Coordinator accepts or rejects with a response note. */
export const decideGraduationPlan = async (
  planId: string,
  decision: 'accept' | 'reject',
  note: string
): Promise<{ message: string; plan: GraduationPlanDetail }> =>
  apiFetch(`/api/graduation-plans/${planId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });

/** Req 114 — an Advising Student's accepted plan, or null before acceptance. */
export const fetchMyGraduationPlan = async (): Promise<{ plan: GraduationPlanDetail | null }> =>
  apiFetch('/api/graduation-plans/me');

import { apiFetch } from './api';
import type {
  GraduationPlanDetail,
  GraduationPlanPlacement,
  GraduationPlanSummary,
} from './types';

/**
 * Req 103-107. Advisor only; the server enforces it and scopes every call to
 * the signed-in Advisor, so drafts never leave their creator (req 106).
 */
export const fetchGraduationPlans = async (): Promise<{ plans: GraduationPlanSummary[] }> =>
  apiFetch('/api/graduation-plans');

/** Req 103/106 — start a plan, or reopen the Advisor's existing draft. */
export const createGraduationPlan = async (studentId: string): Promise<{ plan: GraduationPlanDetail }> =>
  apiFetch('/api/graduation-plans', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  });

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

import { apiFetch } from './api';

export interface ExtraHoursSummary {
  id: string; reference: string;
  student: { id: string; name: string; studentId: string; email: string } | null;
  requestingAdvisor: { id: string; name: string; email: string } | null;
  term: { id: string; label: string } | null;
  requestedHours: number; totalCost: number; currency: string;
  decision: string; settlementOption: string | null; settlementStatus: string; submittedAt: string;
}
export interface ExtraHoursDetail extends ExtraHoursSummary {
  items: { courseId: string; code: string; name: string; creditHours: number; requestedHours: number; classification: string; ratePerHour: number; subtotal: number }[];
  eligibility: { standardHours: number; allowedHours: number; selectedHours: number; maximumTotalHours: number; gpa: number | null;
    graduationBasis: string; graduationSource: string | null; checks: { code: string; passed: boolean; message: string }[] };
  eligibilityRecordedAt: string; responseNote: string | null; decidedAt: string | null;
}
export interface ExtraHoursFilters { advisor?: string; decision?: string; settlementOption?: string; settlementStatus?: string }
export const fetchExtraHoursAdvisors = () => apiFetch<{ advisors: { id: string; name: string; email: string }[] }>('/api/extra-hours/review/filter-options');
export const fetchExtraHoursRequests = (page = 1, search = '', filters: ExtraHoursFilters = {}) => apiFetch<{
  requests: ExtraHoursSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number };
}>(`/api/extra-hours/review?${new URLSearchParams({ page: String(page), limit: '20', search, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) })}`);
export const fetchExtraHoursRequest = (id: string) => apiFetch<{ request: ExtraHoursDetail }>(`/api/extra-hours/review/${encodeURIComponent(id)}`);
export const decideExtraHoursRequest = (id: string, decision: 'Approved' | 'Rejected', responseNote: string) => apiFetch<{ message: string }>(`/api/extra-hours/review/${encodeURIComponent(id)}/decision`, {
  method: 'POST', body: JSON.stringify({ decision, responseNote }),
});
export type StudentExtraHoursRequest = Pick<ExtraHoursDetail, 'id' | 'reference' | 'decision' | 'decidedAt' | 'settlementStatus' | 'requestedHours' | 'totalCost' | 'currency' | 'items'> & { term: string };
export const fetchMyExtraHoursRequests = (page = 1) => apiFetch<{ requests: StudentExtraHoursRequest[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/extra-hours/mine?page=${page}`);

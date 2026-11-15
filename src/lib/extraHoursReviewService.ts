import { apiFetch } from './api';
import { apiUrl, authHeaders } from './api';
export interface ExtraHoursDocument { kind: 'Paid' | 'Deferred'; title: string; reference: string; requestReference: string; date: string; totalCost: number; paymentMethod?: string; transactionReference?: string; notice: string; amountDue?: number; chargeStatus?: string; installment?: { reference: string; label: string; dueDate: string } }
export const fetchExtraHoursDocument = (id: string) => apiFetch<{ document: ExtraHoursDocument }>(`/api/extra-hours/mine/${id}/document`);
export const downloadExtraHoursDocument = async (id: string) => {
  const response = await fetch(apiUrl(`/api/extra-hours/mine/${id}/document?format=pdf`), { headers: authHeaders() });
  if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Could not download document.'); }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = `extra-hours-${id}.pdf`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

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
export type SettlementPreference = 'Pay Now' | 'Next Installment';
export interface InstallmentSummary { id: string; reference: string; label: string; dueDate: string }
export interface DeferredCharge { reference: string; amount: number; currency: string; status: string; confirmedAt: string; installment: InstallmentSummary }
export interface DeferralPreview { version: number; amount: number; currency: string; installment: InstallmentSummary }
export const previewExtraHoursDeferral = (id: string) => apiFetch<DeferralPreview>(`/api/extra-hours/mine/${id}/next-installment`);
export const confirmExtraHoursDeferral = (id: string, installmentId: string, version: number) => apiFetch<{ message: string; charge: DeferredCharge }>(`/api/extra-hours/mine/${id}/defer`, { method: 'POST', body: JSON.stringify({ installmentId, version }) });
export type StudentExtraHoursRequest = Pick<ExtraHoursDetail, 'id' | 'reference' | 'decision' | 'decidedAt' | 'settlementStatus' | 'requestedHours' | 'totalCost' | 'currency' | 'items'> & { term: string; version: number; settlementPreference: SettlementPreference | null; gatewayAttempt: string | null; gatewayStatus: string | null; gatewayGeneration: number; paymentReference: string | null; activatedAt: string | null; activatedHours: number; deferredCharge: DeferredCharge | null };
export const retryExtraHoursCheckout = (id: string) => apiFetch<{ url: string | null; paymentId: string }>(`/api/extra-hours/mine/${id}/retry-stripe`, { method: 'POST', body: '{}' });
export const cancelExtraHoursCheckout = (id: string, generation: number) => apiFetch<{ message: string }>(`/api/extra-hours/mine/payments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ generation }) });
export const payExtraHoursWallet = (id: string) => apiFetch<{ message: string }>(`/api/extra-hours/mine/${id}/pay-wallet`, { method: 'POST', body: '{}' });
export const openExtraHoursCheckout = (id: string) => apiFetch<{ url: string | null; paymentId: string }>(`/api/extra-hours/mine/${id}/stripe-checkout`, { method: 'POST', body: '{}' });
export const confirmExtraHoursCheckout = (id: string) => apiFetch<{ message: string }>(`/api/extra-hours/mine/payments/${id}/confirm`, { method: 'POST', body: '{}' });
export const saveExtraHoursPreference = (id: string, preference: SettlementPreference, version: number) => apiFetch<{ message: string }>(`/api/extra-hours/mine/${encodeURIComponent(id)}/preference`, { method: 'POST', body: JSON.stringify({ preference, version }) });
export const fetchMyExtraHoursRequests = (page = 1) => apiFetch<{ requests: StudentExtraHoursRequest[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/extra-hours/mine?page=${page}`);

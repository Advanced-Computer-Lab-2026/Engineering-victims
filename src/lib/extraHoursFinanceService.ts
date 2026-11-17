import { apiFetch, apiUrl, authHeaders } from './api';

/** Reqs 95, 97-102, 127: extra-hours financial records and request history. */
export type FinanceKind = 'payment' | 'deferred';
export interface FinanceRecord {
  id: string; kind: FinanceKind;
  student: { id: string; name: string; studentId: string; email: string } | null;
  request: { id: string; reference: string } | null;
  amount: number; currency: string; settlementOption: string; reference: string; date: string; status: string;
}
export interface FinanceFilters { search?: string; from?: string; to?: string; settlementOption?: string; status?: string }
export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export interface HistoryEvent { action: string; label: string; note: string | null; at: string; actor: { name: string; role: string } | null }
export interface RequestHistory {
  id: string; reference: string; decision: string; responseNote: string | null; decidedAt: string | null; decidedBy: string | null;
  settlementStatus: string; settlementOption: string | null; submittedAt: string; events: HistoryEvent[];
}
export interface FinanceDetail {
  record: FinanceRecord & { createdAt: string; paidAt: string | null; refundReference: string | null;
    installment: { reference: string; label: string; dueDate: string } | null };
  request: {
    id: string; reference: string; term: string | null; advisor: { name: string; email: string } | null;
    requestedHours: number; activatedHours: number; totalCost: number; decision: string; settlementStatus: string;
    items: { code: string; name: string; requestedHours: number; ratePerHour: number; subtotal: number }[];
    reversal: { kind: string; reason: string; at: string; by: string | null; amount: number; removedSchedules: number; restoredDrafts: number } | null;
  } | null;
  reversal: { eligible: boolean; action?: 'Refund' | 'Cancel'; reason: string | null };
  history: HistoryEvent[];
}

const query = (filters: FinanceFilters, extra: Record<string, string> = {}) =>
  new URLSearchParams({ ...extra, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }).toString();

export const fetchFinanceOptions = () => apiFetch<{ settlementOptions: string[]; statuses: string[] }>('/api/extra-hours/finance/options');
export const fetchFinanceRecords = (page: number, filters: FinanceFilters) =>
  apiFetch<{ records: FinanceRecord[]; pagination: Pagination }>(`/api/extra-hours/finance?${query(filters, { page: String(page), limit: '20' })}`);
export const fetchFinanceRecord = (kind: FinanceKind, id: string) =>
  apiFetch<FinanceDetail>(`/api/extra-hours/finance/${kind}/${encodeURIComponent(id)}`);
export const reverseFinanceRecord = (kind: FinanceKind, id: string, reason: string) =>
  apiFetch<{ message: string }>(`/api/extra-hours/finance/${kind}/${encodeURIComponent(id)}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });

/** Req 127: downloads the CSV for the current search and filters. */
export const exportFinanceRecords = async (filters: FinanceFilters) => {
  const response = await fetch(apiUrl(`/api/extra-hours/finance/export?${query(filters)}`), { headers: authHeaders() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Could not export the financial records.');
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'extra-hours-financial-records.csv';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Req 97: the signed-in student's own records.
export const fetchMyFinanceRecords = (page = 1) => apiFetch<{ records: FinanceRecord[]; pagination: Pagination }>(`/api/extra-hours/mine/finance?page=${page}`);
// Req 95: history per role.
export const fetchMyRequestHistory = (id: string) => apiFetch<{ history: RequestHistory }>(`/api/extra-hours/mine/${encodeURIComponent(id)}/history`);
export const fetchAdvisorRequestHistory = (id: string) => apiFetch<{ history: RequestHistory }>(`/api/extra-hours/${encodeURIComponent(id)}/history`);

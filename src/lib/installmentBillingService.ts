import { apiFetch } from './api';
export interface BillingPlan { id: string; name: string; academicYear: string; entries: { label: string; dueDate: string; baseAmount: number }[] }
export interface BillingStudent { id: string; name: string; studentId: string; email: string }
export interface BillingInstallment { id: string; reference: string; label: string; academicYear: string; dueDate: string; baseAmount: number; adjustments: number; deferredAmount: number; total: number; paid: number; amountDue: number; status: string;
  entries: { id: string; kind: string; amount: number; reason: string; externalReference: string | null; recordedAt: string }[];
  charges: { reference: string; amount: number; status: string; confirmedAt: string }[] }
export const listBillingPlans = () => apiFetch<{ plans: BillingPlan[] }>('/api/billing/plans');
export const createBillingPlan = (body: Omit<BillingPlan, 'id'>) => apiFetch<{ message: string }>('/api/billing/plans', { method: 'POST', body: JSON.stringify(body) });
export const searchBillingStudents = (search: string) => apiFetch<{ students: BillingStudent[] }>(`/api/billing/students?${new URLSearchParams({ search })}`);
export const assignBillingPlan = (studentId: string, planId: string) => apiFetch<{ message: string }>('/api/billing/assign', { method: 'POST', body: JSON.stringify({ studentId, planId }) });
export const listBillingInstallments = (studentId?: string) => apiFetch<{ installments: BillingInstallment[] }>(`/api/billing/installments${studentId ? `?studentId=${studentId}` : ''}`);
export const recordBillingEntry = (id: string, body: { kind: 'Adjustment' | 'Payment'; amount: number; reason: string; externalReference?: string; submissionKey: string }) => apiFetch<{ message: string }>(`/api/billing/installments/${id}/entries`, { method: 'POST', body: JSON.stringify(body) });

import { apiFetch } from './api';
import type { AcademicTerm, AcademicTermDraft, AcademicTermsResponse } from './types';

export const fetchAcademicTerms = async (): Promise<AcademicTermsResponse> => {
  return apiFetch<AcademicTermsResponse>('/api/terms');
};

export const createAcademicTerm = async (payload: AcademicTermDraft): Promise<{ term: AcademicTerm }> => {
  return apiFetch<{ term: AcademicTerm }>('/api/terms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const updateAcademicTerm = async (
  id: string,
  payload: Partial<AcademicTermDraft>
): Promise<{ term: AcademicTerm }> => {
  return apiFetch<{ term: AcademicTerm }>(`/api/terms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
};

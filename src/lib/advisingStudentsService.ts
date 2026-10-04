import { apiFetch } from './api';
import type { AdvisingStudentsResponse } from './types';

/** Req 50, 51. Advisor only; the server enforces that. */
export const fetchAdvisingStudents = async (search = ''): Promise<AdvisingStudentsResponse> => {
  const term = search.trim();
  const query = term ? `?${new URLSearchParams({ search: term }).toString()}` : '';
  return apiFetch<AdvisingStudentsResponse>(`/api/advisors/advising-students${query}`);
};

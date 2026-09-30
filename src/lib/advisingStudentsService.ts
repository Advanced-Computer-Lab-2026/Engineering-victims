import { apiFetch } from './api';
import type { AdvisingStudentsResponse } from './types';

/** Req 50. Advisor only; the server enforces that. */
export const fetchAdvisingStudents = async (): Promise<AdvisingStudentsResponse> =>
  apiFetch<AdvisingStudentsResponse>('/api/advisors/advising-students');

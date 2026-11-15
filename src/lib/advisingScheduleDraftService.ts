import { apiFetch } from './api';
import type { AdvisingScheduleDraftResponse } from './types';

const endpoint = (studentId: string) => `/api/advising-schedules/students/${encodeURIComponent(studentId)}`;
const withTerm = (path: string, termId?: string) =>
  termId ? `${path}?termId=${encodeURIComponent(termId)}` : path;

export const fetchAdvisingScheduleDraft = (
  studentId: string,
  termId?: string
): Promise<AdvisingScheduleDraftResponse> =>
  apiFetch<AdvisingScheduleDraftResponse>(withTerm(endpoint(studentId), termId));

export const createAdvisingScheduleDraft = (
  studentId: string,
  termId?: string
): Promise<AdvisingScheduleDraftResponse> =>
  apiFetch<AdvisingScheduleDraftResponse>(endpoint(studentId), {
    method: 'POST',
    body: JSON.stringify({ termId }),
  });

export const addAdvisingScheduleCourse = (studentId: string, courseId: string, termId?: string) =>
  apiFetch<{ draft: AdvisingScheduleDraftResponse['draft'] }>(
    withTerm(`${endpoint(studentId)}/courses`, termId),
    {
      method: 'POST',
      body: JSON.stringify({ courseId }),
    }
  );

export const removeAdvisingScheduleCourse = (studentId: string, courseId: string, termId?: string) => {
  return apiFetch<{ draft: AdvisingScheduleDraftResponse['draft'] }>(
    withTerm(`${endpoint(studentId)}/courses/${encodeURIComponent(courseId)}`, termId),
    { method: 'DELETE' }
  );
};

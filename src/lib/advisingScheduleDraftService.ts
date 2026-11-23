import { apiFetch } from './api';
import type {
  AdvisingScheduleDraftResponse,
  AdvisingScheduleValidationResponse,
  BachelorProjectSeason,
} from './types';

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

/** Req 60 — add the bachelor project to the draft, or change its season. */
export const setAdvisingScheduleBachelorProject = (
  studentId: string,
  season: BachelorProjectSeason,
  termId?: string
): Promise<AdvisingScheduleDraftResponse> =>
  apiFetch<AdvisingScheduleDraftResponse>(`${endpoint(studentId)}/bachelor-project`, {
    method: 'PUT',
    body: JSON.stringify({ season, termId }),
  });

/** Req 60 — take the bachelor project off the draft. */
export const removeAdvisingScheduleBachelorProject = (
  studentId: string,
  termId?: string
): Promise<AdvisingScheduleDraftResponse> =>
  apiFetch<AdvisingScheduleDraftResponse>(withTerm(`${endpoint(studentId)}/bachelor-project`, termId), {
    method: 'DELETE',
  });

export const addAdvisingScheduleCourse =(studentId: string, courseId: string, termId?: string) =>
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

export const fetchAdvisingScheduleValidation = (
  studentId: string,
  termId: string
): Promise<AdvisingScheduleValidationResponse> =>
  apiFetch<AdvisingScheduleValidationResponse>(withTerm(`${endpoint(studentId)}/validation`, termId));

export const assignAdvisingScheduleSlot = (
  studentId: string,
  courseId: string,
  termId: string,
  slotType: 'Lecture' | 'Tutorial' | 'Lab',
  slotId: string
) =>
  apiFetch<{ message: string }>(`${endpoint(studentId)}/courses/${encodeURIComponent(courseId)}/slots`, {
    method: 'POST',
    body: JSON.stringify({ termId, slotType, slotId }),
  });

export const changeAdvisingScheduleSlot = (
  studentId: string,
  scheduleId: string,
  termId: string,
  slotId: string
) =>
  apiFetch<{ message: string }>(`${endpoint(studentId)}/slots/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ termId, slotId }),
  });

export const removeAdvisingScheduleSlot = (
  studentId: string,
  scheduleId: string,
  termId: string
) =>
  apiFetch<{ message: string }>(withTerm(`${endpoint(studentId)}/slots/${encodeURIComponent(scheduleId)}`, termId), {
    method: 'DELETE',
  });

export const markAdvisingScheduleReadyForReview = (studentId: string, termId: string) =>
  apiFetch<{ message: string; workflowStatus: string }>(`${endpoint(studentId)}/ready`, {
    method: 'POST',
    body: JSON.stringify({ termId }),
  });

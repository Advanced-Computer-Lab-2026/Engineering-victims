import { apiFetch } from './api';
import type { Course, CourseDraft, CoursesResponse } from './types';

/** Sends numbers as numbers; blanks go as empty strings so the server reports them. */
const toPayload = (draft: CourseDraft) => {
  const number = (value: string) => (value.trim() === '' ? '' : Number(value));

  return {
    ...draft,
    creditHours: number(draft.creditHours),
    lectureHours: number(draft.lectureHours),
    tutorialHours: number(draft.tutorialHours),
    labHours: number(draft.labHours),
    recommendedSemester: number(draft.recommendedSemester),
  };
};

export const fetchCourses = async (): Promise<CoursesResponse> => {
  return apiFetch<CoursesResponse>('/api/courses');
};

export const createCourse = async (draft: CourseDraft): Promise<{ course: Course }> => {
  return apiFetch<{ course: Course }>('/api/courses', {
    method: 'POST',
    body: JSON.stringify(toPayload(draft)),
  });
};

export const updateCourse = async (id: string, draft: CourseDraft): Promise<{ course: Course }> => {
  return apiFetch<{ course: Course }>(`/api/courses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(toPayload(draft)),
  });
};

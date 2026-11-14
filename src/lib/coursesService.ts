import { apiFetch } from './api';
import type { Course, CourseDraft, CourseImportResult, CoursesResponse } from './types';

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

// Req 128: the file's text goes as JSON; on a 422 the ApiError's `data` holds the row errors.
export const importCourses = async (csv: string): Promise<CourseImportResult> => {
  return apiFetch<CourseImportResult>('/api/courses/import', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
};

// Req 21: soft-deletes the course on the server (it is flagged inactive, not dropped).
export const deleteCourse = async (id: string): Promise<{ message: string }> => {
  return apiFetch<{ message: string }>(`/api/courses/${id}`, {
    method: 'DELETE',
  });
};

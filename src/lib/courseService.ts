import { apiFetch } from './api';
import { Course, CoursesResponse } from './types';

export const courseService = {
  async fetchCourses(): Promise<CoursesResponse> {
    return apiFetch<CoursesResponse>('/api/courses');
  },

  async deleteCourse(id: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/api/courses/' + id, {
      method: 'DELETE',
    });
  },
};

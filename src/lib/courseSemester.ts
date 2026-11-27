import type { Course, CourseMajor } from './types';

export const recommendedSemesterFor = (course: Course, major: CourseMajor): number =>
  course.recommendedSemesterByMajor?.find((entry) => entry.major === major)?.semester ?? course.recommendedSemester;

export const recommendedSemesterLabel = (course: Course): string => {
  if (!course.recommendedSemesterByMajor?.length) return `Semester ${course.recommendedSemester}`;
  return course.majors
    .map((major) => `${major}: ${recommendedSemesterFor(course, major)}`)
    .join(' · ');
};

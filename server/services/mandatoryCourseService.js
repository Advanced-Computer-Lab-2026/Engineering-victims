const Course = require('../models/Course');
const CourseRecord = require('../models/CourseRecord');
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');
const { requiredCourseFilter, FAIL } = require('./academicHistoryService');

const FAILED = 'Failed';
const UNATTENDED = 'Unattended';

/**
 * Req 61: the courses an Advising Student owes, as mandatory-course candidates.
 *
 * - Failed: some attempt is graded F and no attempt was passed. One candidate
 *   per course however many times it was failed. A course being retaken this
 *   term stays a candidate, flagged inProgress, until the retake is graded.
 * - Unattended: a required course of the student's major (the same curriculum
 *   req 54 lists as remaining) from a semester the student has already moved
 *   past, with no attempt recorded at all. Current and future semesters are
 *   never unattended, and electives are not required courses, so neither is
 *   guessed at.
 *
 * Every candidate is mandatory unless an approved removal applies. Req 69 says
 * approval removes the course from the mandatory list, so a removed course is
 * filtered out rather than returned as not mandatory.
 */

/**
 * The course ids with an approved mandatory-course removal for this student
 * (req 69). A Rejected or Pending request leaves the course mandatory, so only
 * Approved ones count.
 */
const approvedRemovalsFor = async (student) => {
  const courseIds = await MandatoryRemovalRequest.distinct('course', {
    student: student._id,
    status: 'Approved',
  });
  return new Set(courseIds.map(String));
};

const courseSummary = (course) => ({
  id: course._id,
  code: course.code,
  name: course.name,
  creditHours: course.creditHours,
});

/** The later of two attempts: higher semester first, then later in the list. */
const isLaterAttempt = (row, current) => !current || row.semester >= current.semester;

/**
 * The pure rule, kept apart from the database so it can be tested directly.
 * `records` are CourseRecord rows with `course` populated; `catalogue` is the
 * student's required courses.
 */
const deriveCandidates = ({ student, records, catalogue, approvedRemovals = new Set() }) => {
  const attempts = new Map();
  records
    .filter((row) => row.course)
    .forEach((row) => {
      const id = String(row.course._id);
      attempts.set(id, [...(attempts.get(id) ?? []), row]);
    });

  const failed = [];
  attempts.forEach((rows) => {
    const completed = rows.filter((row) => row.status === 'Completed');
    if (completed.some((row) => row.grade !== FAIL)) return;

    const lastFail = completed
      .filter((row) => row.grade === FAIL)
      .reduce((latest, row) => (isLaterAttempt(row, latest) ? row : latest), null);
    if (!lastFail) return;

    failed.push({
      course: courseSummary(lastFail.course),
      reason: FAILED,
      semester: lastFail.semester,
      term: lastFail.term,
      inProgress: rows.some((row) => row.status === 'In Progress'),
    });
  });

  // Without a current semester there is no "already moved past", so nothing
  // is called unattended rather than guessing.
  const unattended = Number.isInteger(student.currentSemester)
    ? catalogue
        .filter(
          (course) =>
            Number.isInteger(course.recommendedSemester) &&
            course.recommendedSemester < student.currentSemester &&
            !attempts.has(String(course._id))
        )
        .map((course) => ({
          course: courseSummary(course),
          reason: UNATTENDED,
          semester: course.recommendedSemester,
          // Never taken, so there is no term to show.
          term: null,
          inProgress: false,
        }))
    : [];

  return [...failed, ...unattended]
    .filter((candidate) => !approvedRemovals.has(String(candidate.course.id)))
    .map((candidate) => ({ ...candidate, mandatory: true }))
    .sort((a, b) => a.semester - b.semester || a.course.code.localeCompare(b.course.code));
};

/** Req 61: loads the student's attempts and curriculum and derives the candidates. */
const buildMandatoryCandidates = async (student) => {
  const [records, catalogue, approvedRemovals] = await Promise.all([
    CourseRecord.find({ student: student._id }).populate('course', 'code name creditHours').lean(),
    Course.find(requiredCourseFilter(student)).select('code name creditHours recommendedSemester').lean(),
    approvedRemovalsFor(student),
  ]);

  return deriveCandidates({ student, records, catalogue, approvedRemovals });
};

module.exports = {
  FAILED,
  UNATTENDED,
  approvedRemovalsFor,
  deriveCandidates,
  buildMandatoryCandidates,
};

const Course = require('../models/Course');
const CourseRecord = require('../models/CourseRecord');
const { recommendedSemesterFor } = require('./courseSemester');

const { GRADE_POINTS } = CourseRecord;
const FAIL = 'F';

const courseSummary = (course) => ({
  id: course._id,
  code: course.code,
  name: course.name,
  creditHours: course.creditHours,
});

/**
 * The courses a student's major requires: active, listed for the major and not
 * elective. Electives are left out because a student picks a few of them, not
 * all of them. Shared with the req 61 mandatory-course candidates so both read
 * the curriculum the same way.
 */
const requiredCourseFilter = (student) => ({
  isActive: true,
  majors: student.major,
  courseType: { $ne: 'Elective' },
});

/**
 * Req 54: builds a student's academic history from their course records and
 * the catalogue.
 *
 * - GPA is the credit-hour-weighted average of every graded attempt, fails
 *   included, on the GUC scale (lower is better). null until something is graded.
 * - Completed hours only count passed courses.
 * - Remaining courses are the non-elective catalogue courses for the student's
 *   major that are neither passed nor in progress. A failed course is therefore
 *   both in the history (with its F) and in the remaining list (to retake).
 *   Electives are left out because a student picks a few of them, not all ten.
 */
const buildAcademicHistory = async (student) => {
  const records = await CourseRecord.find({ student: student._id })
    .populate('course', 'code name creditHours')
    .sort({ semester: 1, createdAt: 1 })
    .lean();

  const completedRows = records.filter((row) => row.status === 'Completed' && row.course);
  const currentRows = records.filter((row) => row.status === 'In Progress' && row.course);

  const passedIds = new Set(
    completedRows.filter((row) => row.grade !== FAIL).map((row) => String(row.course._id))
  );
  const currentIds = new Set(currentRows.map((row) => String(row.course._id)));

  const gradedHours = completedRows.reduce((sum, row) => sum + row.course.creditHours, 0);
  const weightedPoints = completedRows.reduce(
    (sum, row) => sum + GRADE_POINTS[row.grade] * row.course.creditHours,
    0
  );
  const gpa = gradedHours ? Math.round((weightedPoints / gradedHours) * 100) / 100 : null;

  const completedHours = completedRows
    .filter((row) => row.grade !== FAIL)
    .reduce((sum, row) => sum + row.course.creditHours, 0);
  const currentHours = currentRows.reduce((sum, row) => sum + row.course.creditHours, 0);

  const catalogue = await Course.find(requiredCourseFilter(student))
    .populate('prerequisites', 'code name')
    .sort({ recommendedSemester: 1, code: 1 })
    .lean();

  const failedIds = new Set(
    completedRows.filter((row) => row.grade === FAIL).map((row) => String(row.course._id))
  );

  const remaining = catalogue
    .filter((course) => !passedIds.has(String(course._id)) && !currentIds.has(String(course._id)))
    .map((course) => ({
      ...courseSummary(course),
      courseType: course.courseType,
      recommendedSemester: recommendedSemesterFor(course, student.major),
      offeringSeasons: course.offeringSeasons,
      prerequisites: (course.prerequisites ?? []).map((prerequisite) => ({
        id: prerequisite._id,
        code: prerequisite.code,
        name: prerequisite.name,
        // Lets the page show which prerequisites are already cleared.
        passed: passedIds.has(String(prerequisite._id)),
      })),
      isRetake: failedIds.has(String(course._id)),
    }))
    .sort((a, b) => a.recommendedSemester - b.recommendedSemester || a.code.localeCompare(b.code));

  return {
    summary: {
      gpa,
      completedHours,
      currentHours,
      remainingHours: remaining.reduce((sum, course) => sum + course.creditHours, 0),
    },
    completed: completedRows.map((row) => ({
      id: row._id,
      course: courseSummary(row.course),
      grade: row.grade,
      gradePoints: GRADE_POINTS[row.grade],
      passed: row.grade !== FAIL,
      term: row.term,
      semester: row.semester,
    })),
    current: currentRows.map((row) => ({
      id: row._id,
      course: courseSummary(row.course),
      term: row.term,
      semester: row.semester,
    })),
    remaining,
  };
};

/**
 * Req 55: the sessions of an academic year, in transcript order. Course records
 * carry them in their term label, e.g. "2025/2026 First Makeup".
 */
const SESSIONS = ['Winter', 'Spring', 'Summer', 'First Makeup', 'Second Makeup'];

const YEAR_PATTERN = /^(\d{4})[/-](\d{4})$/;
const TERM_PATTERN = new RegExp(`^(\\d{4}[/-]\\d{4})\\s+(${SESSIONS.join('|')})$`);

/**
 * "2025/2026" or "2025-2026" → "2025/2026". null unless the second year is the
 * first plus one, so "2025/2027" and free text are both rejected.
 */
const parseAcademicYear = (value) => {
  const match = YEAR_PATTERN.exec(String(value ?? '').trim());
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  return `${match[1]}/${match[2]}`;
};

/** "2025/2026 Second Makeup" → { academicYear: "2025/2026", session: "Second Makeup" }, or null. */
const parseTerm = (term) => {
  const match = TERM_PATTERN.exec(String(term ?? '').trim());
  if (!match) return null;
  const academicYear = parseAcademicYear(match[1]);
  return academicYear ? { academicYear, session: match[2] } : null;
};

/**
 * Req 55: one academic year of a student's course records, grouped by session.
 *
 * The attended years are the ones any of the student's records falls in, newest
 * first. Without `academicYear` the newest is shown. Sessions with no records
 * are left out, and in-progress courses are listed without a grade. Records
 * whose term label cannot be parsed are skipped rather than guessed at.
 *
 * Returns null when `academicYear` is given but the student did not attend it.
 */
const buildTranscript = async (student, academicYear) => {
  const records = await CourseRecord.find({ student: student._id })
    .populate('course', 'code name creditHours')
    .sort({ semester: 1, createdAt: 1 })
    .lean();

  const rows = records
    .filter((row) => row.course)
    .map((row) => ({ row, parsed: parseTerm(row.term) }))
    .filter(({ parsed }) => parsed);

  const years = [...new Set(rows.map(({ parsed }) => parsed.academicYear))].sort((a, b) => b.localeCompare(a));

  if (academicYear && !years.includes(academicYear)) return null;
  const selected = academicYear ?? years[0] ?? null;

  const sessions = SESSIONS.map((session) => {
    const inSession = rows.filter(
      ({ parsed }) => parsed.academicYear === selected && parsed.session === session
    );
    return {
      session,
      term: `${selected} ${session}`,
      courses: inSession.map(({ row }) => {
        const graded = row.status === 'Completed';
        return {
          id: row._id,
          course: courseSummary(row.course),
          status: row.status,
          grade: graded ? row.grade : null,
          gradePoints: graded ? GRADE_POINTS[row.grade] : null,
          passed: graded ? row.grade !== FAIL : null,
          semester: row.semester,
        };
      }),
    };
  }).filter((session) => session.courses.length > 0);

  return { years, academicYear: selected, sessions };
};

module.exports = {
  buildAcademicHistory,
  buildTranscript,
  parseAcademicYear,
  parseTerm,
  SESSIONS,
  requiredCourseFilter,
  FAIL,
};

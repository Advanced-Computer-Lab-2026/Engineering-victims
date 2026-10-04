const Course = require('../models/Course');
const CourseRecord = require('../models/CourseRecord');

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
      recommendedSemester: course.recommendedSemester,
      offeringSeasons: course.offeringSeasons,
      prerequisites: (course.prerequisites ?? []).map((prerequisite) => ({
        id: prerequisite._id,
        code: prerequisite.code,
        name: prerequisite.name,
        // Lets the page show which prerequisites are already cleared.
        passed: passedIds.has(String(prerequisite._id)),
      })),
      isRetake: failedIds.has(String(course._id)),
    }));

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

module.exports = { buildAcademicHistory, requiredCourseFilter, FAIL };

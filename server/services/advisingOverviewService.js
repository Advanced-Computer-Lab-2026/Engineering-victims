const Course = require('../models/Course');
const CourseRecord = require('../models/CourseRecord');
const { buildAcademicHistory, requiredCourseFilter, FAIL } = require('./academicHistoryService');
const { recommendedSemesterFor } = require('./courseSemester');

/**
 * Req 59: what an Advisor, Coordinator or Administrator needs to know about an
 * Advising Student before a schedule is built — the credit-hour allowance and
 * whether the student may take the bachelor project.
 *
 * Both are calculated here from the student's records every time they are
 * asked for. Neither is stored, so neither can drift from the grades, and
 * nobody can type one in.
 */

/** On the GUC scale lower is better; 3.70 or above is probation. */
const PROBATION_GPA = 3.7;
/** A probation student receives 25% fewer hours than a normal student. */
const PROBATION_REDUCTION_PERCENT = 25;

/**
 * The workbook's standard allowances. It starts at semester 3, so semesters 1
 * and 2 are given the semester 3-4 allowance rather than left without one.
 */
const ALLOWANCE_BANDS = [
  { upTo: 4, hours: 34, label: 'Semesters 3-4' },
  { upTo: 6, hours: 30, label: 'Semesters 5-6' },
  { upTo: 7, hours: 28, label: 'Semester 7' },
  { upTo: Infinity, hours: 24, label: 'Semester 8 onward' },
];

const standardAllowanceFor = (semester) => {
  const value = Number.isInteger(semester) && semester > 0 ? semester : 1;
  return ALLOWANCE_BANDS.find((band) => value <= band.upTo);
};

/**
 * Probation is the finalized standing (req 118) or, when no semester has been
 * finalized yet, a cumulative GPA already at 3.70 or above.
 */
const isOnProbation = ({ academicStanding, gpa }) =>
  academicStanding === 'Probation' || (typeof gpa === 'number' && gpa >= PROBATION_GPA);

/** The pure allowance rule. `gpa` may be null when nothing is graded yet. */
const deriveAllowance = ({ student, gpa = null }) => {
  const band = standardAllowanceFor(student.currentSemester);
  const probation = isOnProbation({ academicStanding: student.academicStanding, gpa });

  return {
    semester: student.currentSemester ?? null,
    band: band.label,
    standardHours: band.hours,
    // 25% less, with any fraction rounded up: 34 -> 26, 30 -> 23, 28 -> 21, 24 -> 18.
    allowedHours: probation
      ? Math.ceil((band.hours * (100 - PROBATION_REDUCTION_PERCENT)) / 100)
      : band.hours,
    gpa,
    isProbation: probation,
    reductionPercent: probation ? PROBATION_REDUCTION_PERCENT : 0,
    // A probation student cannot receive an increase.
    canReceiveIncrease: !probation,
  };
};

/** English for Academic Purposes, Scientific Methods, RPW and CPS. */
const ENGLISH_CODES = new Set(['AS 102', 'SM 101', 'RPW 401', 'CPS 402']);
const isEnglish = (course) => ENGLISH_CODES.has(course.code);

/** The bachelor project needs every course of the first six semesters. */
const BACHELOR_LAST_SEMESTER = 6;
/** ...except that one or two failed ones are tolerated. */
const TOLERATED_FAILURES = 2;

const courseSummary = (course) => ({
  id: course._id,
  code: course.code,
  name: course.name,
  creditHours: course.creditHours,
});

/**
 * The pure eligibility rule.
 *
 * `records` are CourseRecord rows with `course` populated; `catalogue` is the
 * student's required courses with their recommended semester.
 *
 * Eligible when every English course (RPW included) is passed and either
 * - every semester 1-6 course is passed, or
 * - the only ones missing are one or two courses the student failed.
 * A course never attempted, or still in progress with no failed attempt, is
 * not a "failed course", so it is not covered by that exception.
 */
const deriveBachelorEligibility = ({ records, catalogue, major }) => {
  const passed = new Set();
  const failed = new Set();
  const inProgress = new Set();
  records
    .filter((row) => row.course)
    .forEach((row) => {
      const id = String(row.course._id);
      if (row.status === 'In Progress') inProgress.add(id);
      else if (row.grade === FAIL) failed.add(id);
      else passed.add(id);
    });

  const stateOf = (id) => {
    if (failed.has(id)) return 'Failed';
    return inProgress.has(id) ? 'In progress' : 'Not attended';
  };

  const outstanding = catalogue
    .filter((course) => !passed.has(String(course._id)))
    .filter((course) => isEnglish(course) || recommendedSemesterFor(course, major) <= BACHELOR_LAST_SEMESTER)
    .map((course) => ({
      course: courseSummary(course),
      semester: recommendedSemesterFor(course, major),
      state: stateOf(String(course._id)),
      english: isEnglish(course),
    }))
    .sort((a, b) => a.semester - b.semester || a.course.code.localeCompare(b.course.code));

  const outstandingEnglish = outstanding.filter((entry) => entry.english);
  const outstandingCourses = outstanding.filter((entry) => !entry.english);
  const onlyFailures = outstandingCourses.every((entry) => entry.state === 'Failed');

  const englishComplete = outstandingEnglish.length === 0;
  const eligible =
    englishComplete &&
    (outstandingCourses.length === 0 ||
      (outstandingCourses.length <= TOLERATED_FAILURES && onlyFailures));

  let explanation;
  if (!englishComplete) {
    explanation = 'Not eligible: every English course, including RPW, must be completed first.';
  } else if (outstandingCourses.length === 0) {
    explanation = 'Eligible: every course from semesters 1-6 and every English course is completed.';
  } else if (eligible) {
    explanation = `Eligible: only ${outstandingCourses.length} failed course${
      outstandingCourses.length === 1 ? '' : 's'
    } from semesters 1-6 remain${outstandingCourses.length === 1 ? 's' : ''} and every English course is completed.`;
  } else if (onlyFailures) {
    explanation = `Not eligible: ${outstandingCourses.length} failed courses from semesters 1-6 remain; at most ${TOLERATED_FAILURES} are allowed.`;
  } else {
    explanation = 'Not eligible: courses from semesters 1-6 are still not completed.';
  }

  return {
    eligible,
    explanation,
    englishComplete,
    outstandingEnglish: outstandingEnglish.map(({ english, ...entry }) => entry),
    outstandingCourses: outstandingCourses.map(({ english, ...entry }) => entry),
  };
};

/** Req 59: loads the student's records and derives both answers. */
const buildAdvisingOverview = async (student) => {
  const [history, records, catalogue] = await Promise.all([
    buildAcademicHistory(student),
    CourseRecord.find({ student: student._id }).populate('course', 'code name creditHours').lean(),
    Course.find(requiredCourseFilter(student)).select('code name creditHours recommendedSemester recommendedSemesterByMajor').lean(),
  ]);

  return {
    advisingReason: student.advisingReason ?? null,
    allowance: deriveAllowance({ student, gpa: history.summary.gpa }),
    // Derived by the workflow service from completed actions, never chosen by hand.
    schedule: {
      status: student.workflowStatus,
      blockingStep: student.blockingStep ?? null,
      lastUpdateAt: student.lastUpdateAt,
    },
    completedHours: history.summary.completedHours,
    bachelorProject: deriveBachelorEligibility({ records, catalogue, major: student.major }),
  };
};

module.exports = {
  PROBATION_GPA,
  PROBATION_REDUCTION_PERCENT,
  ENGLISH_CODES,
  standardAllowanceFor,
  isOnProbation,
  deriveAllowance,
  deriveBachelorEligibility,
  buildAdvisingOverview,
};

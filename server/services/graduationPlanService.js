const { buildAcademicHistory } = require('./academicHistoryService');

/**
 * Req 103-107: the rules a graduation plan has to satisfy.
 *
 * The calculation is kept out of the controller so it can be tested directly:
 * `validatePlan` is a pure function over the remaining courses, the plan's
 * three terms and the placements.
 */

/** Req 103: the standard semester load. Extra hours can raise it when approved. */
const STANDARD_CREDIT_LIMIT = 18;
const SEASONS = ['Winter', 'Spring', 'Summer'];

/**
 * Req 103: the next Winter, Spring and Summer terms after the one running now.
 *
 * The academic year starts with Winter (Sep), then Spring (Jan) and Summer
 * (Jun). Starting from the season after the current one means a plan never
 * points at a term that has already begun.
 */
const planningTerms = (now = new Date()) => {
  const month = now.getMonth() + 1;
  let currentIndex;
  let academicStart;

  if (month >= 9) {
    // Sep-Dec: the Winter term is running.
    currentIndex = 0;
    academicStart = now.getFullYear();
  } else if (month >= 6) {
    // Jun-Aug: the Summer term is running.
    currentIndex = 2;
    academicStart = now.getFullYear() - 1;
  } else {
    // Jan-May: the Spring term is running.
    currentIndex = 1;
    academicStart = now.getFullYear() - 1;
  }

  const terms = [];
  for (let step = 0; step < 3; step += 1) {
    currentIndex = (currentIndex + 1) % 3;
    // Wrapping back to Winter starts the next academic year.
    if (currentIndex === 0) academicStart += 1;
    terms.push({
      season: SEASONS[currentIndex],
      academicYear: `${academicStart}/${academicStart + 1}`,
    });
  }
  return terms;
};

const termLabel = (term) => `${term.academicYear} ${term.season}`;

/**
 * Req 103: "separately approved credit-hour limit".
 *
 * Extra-hours approvals (req 89+) do not exist in this sprint, so no student
 * has a separately approved limit yet and the standard load applies. When the
 * approval flow lands, only this function has to read it.
 */
const approvedCreditLimitFor = async () => null;

/**
 * Req 103/107: an approved exit exam may stand in for the single failed course
 * it covers, leaving that course unassigned in the plan.
 *
 * Exit-exam requests (req 108-109) do not exist in this sprint, so the set is
 * always empty. When they land, only this function has to read them.
 */
const approvedExitExamCourseIdsFor = async () => new Set();

/** Req 103-107: the courses a complete plan still has to place. */
const remainingCoursesFor = async (student) => (await buildAcademicHistory(student)).remaining;

/** Turns a mongoose plan (or a plain object) into the ids and indexes the rules use. */
const normalizePlacements = (placements) => {
  if (placements == null) return [];
  if (!Array.isArray(placements)) return null;

  return placements.map((entry) => ({
    courseId: String(entry?.courseId ?? entry?.course ?? '').trim(),
    termIndex: entry?.termIndex,
  }));
};

/**
 * Req 103: every rule the workbook lists, as plain messages the Advisor can act
 * on. `requireComplete` is what separates saving a draft (req 106) from
 * submitting it (req 107).
 */
const validatePlan = ({
  placements,
  remaining,
  terms,
  creditLimit = STANDARD_CREDIT_LIMIT,
  approvedExitExamCourseIds = new Set(),
  requireComplete = false,
}) => {
  const errors = [];
  const byId = new Map(remaining.map((course) => [String(course.id), course]));
  const placed = new Map(); // course id -> term index
  const seen = new Set();

  placements.forEach((placement) => {
    const course = byId.get(placement.courseId);
    if (!course) {
      errors.push(`That course is not one of this student's remaining courses.`);
      return;
    }
    if (seen.has(placement.courseId)) {
      errors.push(`${course.code} is assigned more than once.`);
      return;
    }
    seen.add(placement.courseId);

    const { termIndex } = placement;
    if (!Number.isInteger(termIndex) || termIndex < 0 || termIndex >= terms.length) {
      errors.push(`Choose a term for ${course.code}.`);
      return;
    }

    placed.set(placement.courseId, termIndex);

    const term = terms[termIndex];
    const seasons = course.offeringSeasons ?? [];
    if (seasons.length && !seasons.includes(term.season)) {
      errors.push(
        `${course.code} is offered in ${seasons.join(' or ')}, not in ${termLabel(term)}.`
      );
    }
  });

  // Req 103: the plan may not overload a term.
  const hoursByTerm = terms.map((term) => ({ term, hours: 0 }));
  placed.forEach((termIndex, courseId) => {
    hoursByTerm[termIndex].hours += byId.get(courseId)?.creditHours ?? 0;
  });
  hoursByTerm.forEach(({ term, hours }) => {
    if (hours > creditLimit) {
      errors.push(`${termLabel(term)} has ${hours} credit hours, over the ${creditLimit}-hour limit.`);
    }
  });

  // Req 103: a prerequisite that is still owed has to come in an earlier term.
  placed.forEach((termIndex, courseId) => {
    const course = byId.get(courseId);
    (course.prerequisites ?? []).forEach((prerequisite) => {
      if (prerequisite.passed) return;
      const prerequisiteId = String(prerequisite.id);
      // In-progress prerequisites are not in `remaining`; the current term
      // clears them before any planned term starts.
      if (!byId.has(prerequisiteId)) return;

      const prerequisiteTerm = placed.get(prerequisiteId);
      if (prerequisiteTerm === undefined) {
        if (requireComplete) {
          errors.push(`${course.code} needs ${prerequisite.code}, which is not assigned to a term.`);
        }
        return;
      }
      if (prerequisiteTerm >= termIndex) {
        errors.push(`${prerequisite.code} must be placed in an earlier term than ${course.code}.`);
      }
    });
  });

  // Req 107: a plan is submitted complete — except for one failed course with
  // an approved exit exam, which may stay unassigned.
  const unassigned = remaining.filter((course) => !placed.has(String(course.id)));
  if (requireComplete && unassigned.length) {
    const coveredByExitExam =
      unassigned.length === 1 &&
      unassigned[0].isRetake &&
      approvedExitExamCourseIds.has(String(unassigned[0].id));

    if (!coveredByExitExam) {
      errors.push(
        `Assign every remaining course before submitting. Still unassigned: ${unassigned
          .map((course) => course.code)
          .join(', ')}.`
      );
    }
  }

  return {
    errors: [...new Set(errors)],
    assignedCount: placed.size,
    totalCourses: remaining.length,
    termHours: hoursByTerm.map(({ term, hours }) => ({
      season: term.season,
      academicYear: term.academicYear,
      hours,
    })),
    creditLimit,
  };
};

module.exports = {
  STANDARD_CREDIT_LIMIT,
  SEASONS,
  planningTerms,
  termLabel,
  approvedCreditLimitFor,
  approvedExitExamCourseIdsFor,
  remainingCoursesFor,
  normalizePlacements,
  validatePlan,
};

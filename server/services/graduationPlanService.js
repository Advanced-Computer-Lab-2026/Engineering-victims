const { buildAcademicHistory } = require('./academicHistoryService');
const { deriveAllowance } = require('./advisingOverviewService');
const ExitExamRequest = require('../models/ExitExamRequest');

/**
 * Req 103-107: the rules a graduation plan has to satisfy.
 *
 * The calculation is kept out of the controller so it can be tested directly:
 * `validatePlan` is a pure function over the remaining courses, the plan's
 * three terms, the placements and the credit-hour limits of those terms.
 *
 * The limits are no longer one flat semester load. Req 59 fixes the allowance
 * to the semester the student will be in, so a plan spanning three terms has
 * three limits, each taken from `advisingOverviewService` — the same place the
 * advising overview reads them from, so the two screens can never disagree.
 */

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
 * Req 59/103: the semester each of the plan's terms lands in.
 *
 * The catalogue teaches odd semesters in Winter and even ones in Spring, so
 * every Winter or Spring term the student reaches is one semester further on
 * from `currentSemester`. Summer is a break term — no course is offered in it
 * and req 59 gives it no allowance of its own — so it keeps the term's
 * semester instead of consuming one, which would push the later terms onto the
 * wrong band.
 */
const termSemestersFor = (terms, currentSemester) => {
  let semester = Number.isInteger(currentSemester) && currentSemester > 0 ? currentSemester : 1;
  return terms.map((term) => {
    if (term.season !== 'Summer') semester += 1;
    return semester;
  });
};

/**
 * Req 59 + 103: one credit-hour limit per term of the plan.
 *
 * Req 59's allowance belongs to a semester (34 for 3-4, 30 for 5-6, 28 for 7,
 * 24 from 8 on, semesters 1-2 taking the 3-4 band), and is 25% less rounded up
 * while the student is on probation. `gpa` is the same input req 59 passes to
 * `deriveAllowance`, so a probation student sees the same numbers here as on
 * the advising overview.
 *
 * A separately approved limit (req 103's "separately approved credit-hour
 * limit", raised by the extra-hours flow of req 89+) applies to every term of
 * the plan — except on probation, because req 59 says a probation student
 * cannot receive an increase.
 */
const creditLimitsFor = ({ student, terms, gpa = null, approvedLimit = null }) => {
  const semesters = termSemestersFor(terms, student?.currentSemester);
  const allowances = semesters.map((semester) =>
    deriveAllowance({
      student: { currentSemester: semester, academicStanding: student?.academicStanding },
      gpa,
    })
  );

  // Req 59: a probation student cannot receive an increase, so an approved
  // limit only overrides the allowance for a student who may receive one.
  const onProbation = allowances.some(({ isProbation }) => isProbation);
  if (approvedLimit != null && Number.isFinite(approvedLimit) && !onProbation) {
    return terms.map(() => approvedLimit);
  }
  return allowances.map(({ allowedHours }) => allowedHours);
};

/**
 * Req 103: "separately approved credit-hour limit".
 *
 * Extra-hours approvals (req 89+) do not exist in this sprint, so no student
 * has a separately approved limit yet and the req 59 allowance applies. When
 * the approval flow lands, only this function has to read it.
 */
const approvedCreditLimitFor = async () => null;

/**
 * Req 103/107: an approved exit exam may stand in for the single failed course
 * it covers, leaving that course unassigned in the plan.
 *
 * Only Coordinator-approved requests release the failed course from term
 * placement. Pending and rejected requests leave it as a required retake.
 */
const approvedExitExamCourseIdsFor = async (student) => {
  const courseIds = await ExitExamRequest.distinct('course', {
    student: student._id,
    status: 'Approved',
  });
  return new Set(courseIds.map(String));
};

/**
 * Req 103-107: everything the plan rules need about the student.
 *
 * The remaining courses and the GPA come from one academic-history read, so
 * validating a plan never costs more queries than reading it did.
 */
const planInputsFor = async (student) => {
  const history = await buildAcademicHistory(student);
  return { remaining: history.remaining, gpa: history.summary.gpa };
};

/** Req 103-107: the courses a complete plan still has to place. */
const remainingCoursesFor = async (student) => (await planInputsFor(student)).remaining;

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
 * Req 59: exactly one finite limit per term.
 *
 * Guessing a limit here would silently decide whether a plan may overload, so
 * a missing or misaligned `creditLimits` throws instead — every caller builds
 * it with `creditLimitsFor`.
 */
const normalizeCreditLimits = (terms, creditLimits) => {
  const valid =
    Array.isArray(creditLimits) &&
    creditLimits.length === terms.length &&
    creditLimits.every((limit) => Number.isFinite(limit) && limit > 0);
  if (!valid) {
    throw new Error('A graduation plan needs one credit-hour limit per term (req 59).');
  }
  return creditLimits;
};

/**
 * Req 103: every rule the workbook lists, as plain messages the Advisor can act
 * on. `requireComplete` is what separates saving a draft (req 106) from
 * submitting it (req 107).
 *
 * `creditLimits` carries one req 59 allowance per entry of `terms`; the caller
 * builds it with `creditLimitsFor`. A limit is never guessed here — a missing
 * one is a programming mistake, not a plan that is allowed to overload.
 */
const validatePlan = ({
  placements,
  remaining,
  terms,
  creditLimits,
  approvedExitExamCourseIds = new Set(),
  requireComplete = false,
}) => {
  const limits = normalizeCreditLimits(terms, creditLimits);
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

  // Req 103/59: a term may not exceed its own semester's allowance.
  const hoursByTerm = terms.map((term) => ({ term, hours: 0 }));
  placed.forEach((termIndex, courseId) => {
    hoursByTerm[termIndex].hours += byId.get(courseId)?.creditHours ?? 0;
  });
  hoursByTerm.forEach(({ term, hours }, index) => {
    const limit = limits[index];
    if (hours > limit) {
      errors.push(`${termLabel(term)} has ${hours} credit hours, over the ${limit}-hour limit.`);
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
    // Req 59: the allowance each term was checked against, in term order.
    creditLimits: limits,
  };
};

/** Req 113: the largest Coordinator response note the workflow accepts. */
const RESPONSE_NOTE_LIMIT = 1000;

/** Req 110-112: the only statuses a Coordinator may list or filter on. */
const SUBMITTED_STATUSES = ['Submitted', 'Accepted'];

const DECISION_STATUS = { accept: 'Accepted', reject: 'Draft' };

/**
 * Req 113: apply the Coordinator's decision to a submitted plan.
 *
 * Mutates the plan and returns `null`, or returns the message explaining why
 * the decision cannot be applied. Rejection deliberately turns the plan back
 * into a Draft: that is what makes it private to its Advisor again and lets it
 * be corrected and resubmitted.
 */
const applyDecision = (plan, { decision, note, coordinatorId, now = new Date() }) => {
  if (!Object.prototype.hasOwnProperty.call(DECISION_STATUS, decision)) {
    return 'Choose whether to accept or reject the plan.';
  }
  if (plan.status !== 'Submitted') {
    return 'Only a submitted plan can be accepted or rejected.';
  }

  const responseNote = typeof note === 'string' ? note.trim() : '';
  if (!responseNote) return 'Add a response note for the Advisor.';
  if (responseNote.length > RESPONSE_NOTE_LIMIT) {
    return `Keep the response note under ${RESPONSE_NOTE_LIMIT} characters.`;
  }

  plan.status = DECISION_STATUS[decision];
  plan.responseNote = responseNote;
  plan.decidedAt = now;
  plan.decidedBy = coordinatorId ?? null;
  // A rejected plan is no longer awaiting a decision, so it has no submission
  // date until the Advisor submits the corrected draft again.
  if (decision === 'reject') plan.submittedAt = null;
  return null;
};

/**
 * Req 107/113: a resubmission starts a fresh review, so the previous
 * Coordinator response is cleared rather than shown against the new attempt.
 */
const clearDecision = (plan) => {
  plan.responseNote = '';
  plan.decidedAt = null;
  plan.decidedBy = null;
};

/**
 * Req 112: a Coordinator search matches the student ID or the creating
 * Advisor's name or GUC email. Blank searches match everything.
 */
const matchesPlanSearch = (plan, search) => {
  const term = String(search ?? '').trim().toLowerCase();
  if (!term) return true;

  const student = plan.student ?? {};
  const advisor = plan.advisor ?? {};
  return [student.studentId, advisor.fullName, advisor.email].some((value) =>
    String(value ?? '').toLowerCase().includes(term)
  );
};

module.exports = {
  SEASONS,
  RESPONSE_NOTE_LIMIT,
  SUBMITTED_STATUSES,
  planningTerms,
  termLabel,
  termSemestersFor,
  creditLimitsFor,
  approvedCreditLimitFor,
  approvedExitExamCourseIdsFor,
  planInputsFor,
  remainingCoursesFor,
  normalizePlacements,
  normalizeCreditLimits,
  validatePlan,
  applyDecision,
  clearDecision,
  matchesPlanSearch,
};

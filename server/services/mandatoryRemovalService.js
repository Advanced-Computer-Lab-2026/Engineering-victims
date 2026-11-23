const NOTE_LIMIT = 1000;

const FIRST_MAKEUP = 'First-makeup eligibility';
const SECOND_MAKEUP = 'Second-makeup eligibility';
const OVER_HOURS = 'Completed more than 157 hours';
const RESTRICTED_PAIR = 'Restricted course pair in the same term';

/** A student who completed more than this many hours may defer a mandatory course. */
const DEFERRAL_HOURS = 157;
/** A second makeup exists only for a student with one or two failed courses. */
const SECOND_MAKEUP_MAX_FAILED = 2;

/**
 * Req 64: the valid cases, with the sentence the Advisor reads next to each.
 * Kept here, beside the checks, so the wording and the rule cannot drift.
 */
const CATEGORY_OPTIONS = [
  {
    value: FIRST_MAKEUP,
    description: 'The course was failed and the student still has the first makeup, so it is not mandatory yet.',
  },
  {
    value: SECOND_MAKEUP,
    description: 'The course was failed and the student has one or two failed courses, so a second makeup applies.',
  },
  {
    value: OVER_HOURS,
    description: `The student completed more than ${DEFERRAL_HOURS} hours, so the course may be deferred.`,
  },
  {
    value: RESTRICTED_PAIR,
    description: 'Taking it would put a restricted pair of CS, Math or Physics courses in the same term.',
  },
];

/** The subject families whose courses may not be paired in one term. */
const FAMILIES = [
  { name: 'CS', prefixes: ['CSEN', 'CSIS'] },
  { name: 'Math', prefixes: ['MATH'] },
  { name: 'Physics', prefixes: ['PHYS', 'PHYSp', 'PHYSt'] },
];

/** "CSEN 301" -> "CS", "PHYSt 301" -> "Physics", anything else -> null. */
const familyOf = (code) => {
  const prefix = String(code ?? '').trim().split(/\s+/)[0];
  return FAMILIES.find((family) => family.prefixes.includes(prefix))?.name ?? null;
};

/**
 * The pure rule for req 64. `candidates` is the student's current mandatory
 * list (req 61) and `completedHours` their passed credit hours.
 *
 * Returns the message to answer with, or null when the request is valid.
 */
const validateRemovalRequest = ({ candidates, completedHours, courseId, category, pairedCourseId, reason }) => {
  const candidate = candidates.find((entry) => String(entry.course.id) === String(courseId));
  if (!candidate) return 'That course is not one of the student\'s mandatory courses.';

  if (!CATEGORY_OPTIONS.some((option) => option.value === category)) {
    return 'Choose one of the valid cases for removing a mandatory course.';
  }

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason) return 'Explain why the course should be removed from the mandatory list.';
  if (cleanReason.length > NOTE_LIMIT) return `Keep the reason under ${NOTE_LIMIT} characters.`;

  const failedCount = candidates.filter((entry) => entry.reason === 'Failed').length;

  if (category === FIRST_MAKEUP || category === SECOND_MAKEUP) {
    if (candidate.reason !== 'Failed') {
      return 'A makeup applies only to a failed course; this course was never attended.';
    }
    if (category === SECOND_MAKEUP && failedCount > SECOND_MAKEUP_MAX_FAILED) {
      return `A second makeup is available only with one or two failed courses; this student has ${failedCount}.`;
    }
  }

  if (category === OVER_HOURS && !(completedHours > DEFERRAL_HOURS)) {
    return `Deferral needs more than ${DEFERRAL_HOURS} completed hours; this student has ${completedHours}.`;
  }

  if (category === RESTRICTED_PAIR) {
    const family = familyOf(candidate.course.code);
    if (!family) return 'Restricted pairs apply only to CS, Math or Physics courses.';
    if (!pairedCourseId) return 'Choose the other course of the restricted pair.';
    if (String(pairedCourseId) === String(courseId)) return 'Choose a different course as the other half of the pair.';

    const paired = candidates.find((entry) => String(entry.course.id) === String(pairedCourseId));
    if (!paired) return 'The other course of the pair must also be one of the student\'s mandatory courses.';
    if (familyOf(paired.course.code) !== family) {
      return `Both courses of a restricted pair must be ${family} courses.`;
    }
  }

  return null;
};

/**
 * Req 69: a Coordinator approves or rejects a removal request and provides a
 * response note. Same shape as the exit-exam decision (req 109), which the
 * sheet words the same way: only a Pending request can be decided, and the
 * note is required (req 48's "optional response note" is worded differently).
 *
 * On success it sets the decision on `request` (not saved here) and returns
 * null; otherwise it returns the message to answer with and changes nothing.
 * Approving also takes the course off the mandatory list and out of any
 * unprocessed schedule; that is the caller's job, because it touches other
 * records.
 */
const applyDecision = ({ request, decision, note, coordinatorId, now = new Date() }) => {
  if (decision !== 'approve' && decision !== 'reject') {
    return 'Choose whether to approve or reject the removal request.';
  }
  if (request.status !== 'Pending') {
    return 'Only a pending removal request can be decided.';
  }

  const responseNote = typeof note === 'string' ? note.trim() : '';
  if (!responseNote) return 'Add a response note for the Advisor.';
  if (responseNote.length > NOTE_LIMIT) {
    return `Keep the response note under ${NOTE_LIMIT} characters.`;
  }

  request.status = decision === 'approve' ? 'Approved' : 'Rejected';
  request.responseNote = responseNote;
  request.decidedBy = coordinatorId;
  request.decidedAt = now;
  return null;
};

module.exports = {
  NOTE_LIMIT,
  applyDecision,
  DEFERRAL_HOURS,
  FIRST_MAKEUP,
  SECOND_MAKEUP,
  OVER_HOURS,
  RESTRICTED_PAIR,
  CATEGORY_OPTIONS,
  familyOf,
  validateRemovalRequest,
};

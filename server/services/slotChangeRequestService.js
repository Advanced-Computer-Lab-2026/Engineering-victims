const mongoose = require('mongoose');
const AcademicTerm = require('../models/AcademicTerm');
const Student = require('../models/Student');
const Course = require('../models/Course');
const StudentSchedule = require('../models/StudentSchedule');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const { deadlineEnd } = require('./schedulingPreferenceService');
const { escapeRegex, studentIdVariants } = require('./studentQueryService');

const { SLOT_TYPES, NOTE_LIMIT } = SlotChangeRequest;

/** The only workflow status in which a student may ask for a slot change. */
const REVIEW_STATUS = 'Ready for Student Review';

/**
 * Req 40: whether this Advising Student may submit a slot-change request now,
 * and against which term.
 *
 * The term is the one the student's completed schedule belongs to — the term
 * of their latest Active rows — not whichever term has the next advising
 * deadline, so the deadline checked is the deadline of the schedule being
 * reviewed. Returns { term, isOpen, reason }: `reason` says why it is closed,
 * and `status` is the HTTP status to answer a submission with in that case.
 */
const reviewWindowFor = async (student, now = new Date()) => {
  if (student.workflowStatus !== REVIEW_STATUS) {
    return {
      term: null,
      isOpen: false,
      status: 409,
      reason: 'Slot-change requests can only be made while your schedule is Ready for Student Review.',
    };
  }

  const latest = await StudentSchedule.findOne({ studentId: student._id, status: 'Active' })
    .sort({ createdAt: -1 })
    .select('termId')
    .lean();
  const term = latest ? await AcademicTerm.findById(latest.termId).lean() : null;
  if (!term) {
    return {
      term: null,
      isOpen: false,
      status: 409,
      reason: 'You have no completed schedule to request a change in.',
    };
  }

  if (deadlineEnd(term) < now) {
    return {
      term,
      isOpen: false,
      status: 403,
      reason: `The advising deadline for ${term.academicYear} ${term.season} has passed, so slot-change requests can no longer be made.`,
    };
  }

  return { term, isOpen: true, status: 200, reason: null };
};

/**
 * Cleans and checks a submitted request body. Only the four known fields are
 * read, so nothing else in the body can reach the database. Returns the clean
 * values, or { error } with a message the student can act on.
 */
const validateRequestInput = (body) => {
  const { courseId, slotType, slotId, preferenceNote } = body ?? {};

  if (!courseId || !mongoose.isValidObjectId(courseId)) return { error: 'Choose the course the slot belongs to.' };
  if (!SLOT_TYPES.includes(slotType)) return { error: 'Component type must be Lecture, Tutorial or Lab.' };
  if (!slotId || !mongoose.isValidObjectId(slotId)) return { error: 'Choose the slot you want changed.' };

  if (preferenceNote != null && typeof preferenceNote !== 'string') {
    return { error: 'The preference note must be text.' };
  }
  const note = (preferenceNote ?? '').trim();
  if (note.length > NOTE_LIMIT) return { error: `The preference note can be at most ${NOTE_LIMIT} characters.` };

  return { courseId: String(courseId), slotType, slotId: String(slotId), preferenceNote: note };
};

/**
 * Req 43: which slot-change requests a staff member may see, derived only from
 * the authenticated user (never from query parameters), so later search,
 * filter, details and decision routes (44-48) can combine it with their own
 * conditions without ever widening it.
 *
 * - A Coordinator sees every request: { scope: 'all', filter: {} }.
 * - An Advisor sees requests from the Advising Students currently assigned to
 *   them; a reassigned student's requests follow the new Advisor. `filter` is
 *   null when they have nobody assigned, meaning there is nothing to query.
 * - Anyone else gets null.
 */
const staffRequestScope = async (user) => {
  if (user?.role === 'Coordinator') return { scope: 'all', filter: {} };
  if (user?.role !== 'Advisor') return null;

  if (!mongoose.isValidObjectId(user.userId)) return { scope: 'assigned', filter: null };
  const assigned = await Student.find({ assignedAdvisor: user.userId, studentType: 'Advising Student' })
    .select('_id')
    .lean();
  return {
    scope: 'assigned',
    filter: assigned.length ? { student: { $in: assigned.map((student) => student._id) } } : null,
  };
};

/** The longest search term the staff list accepts. */
const SEARCH_LIMIT = 100;

/**
 * Req 44: reads the `search` query parameter. A missing or blank term means
 * "no search". Anything that is not a single string (?search=a&search=b, or
 * ?search[$ne]=x) is refused rather than guessed at, so it can never become
 * a query operator. Returns { term } or { error }.
 */
const parseStaffSearch = (raw) => {
  if (raw === undefined) return { term: '' };
  if (typeof raw !== 'string') return { error: 'Search must be a single text value.' };
  const term = raw.trim();
  if (term.length > SEARCH_LIMIT) return { error: `Search can be at most ${SEARCH_LIMIT} characters.` };
  return { term };
};

/**
 * A partial, case-insensitive course-code pattern that ignores spaces, so
 * "csen501", "CSEN 501" and "sen 50" all find "CSEN 501". Every character is
 * escaped first, then optional whitespace is allowed between characters.
 */
const courseCodePattern = (term) =>
  Array.from(term.replace(/\s+/g, ''))
    .map(escapeRegex)
    .join('\\s*');

/**
 * Req 44: the request condition for one search term, matching a student ID
 * (exact, with or without the hyphen), a student name (partial,
 * case-insensitive) or a course code (partial, case-insensitive, spaces
 * ignored). Course names are deliberately not searched.
 *
 * Returns {} for no search, null when no student or course matches (so the
 * caller can skip the request query), or an { $or } on request fields.
 */
const staffSearchCondition = async (term) => {
  if (!term) return {};

  const [students, courses] = await Promise.all([
    Student.find({
      $or: [
        { fullName: { $regex: escapeRegex(term), $options: 'i' } },
        { studentId: { $in: studentIdVariants(term) } },
      ],
    })
      .select('_id')
      .lean(),
    Course.find({ code: { $regex: courseCodePattern(term), $options: 'i' } })
      .select('_id')
      .lean(),
  ]);

  const or = [];
  if (students.length) or.push({ student: { $in: students.map((student) => student._id) } });
  if (courses.length) or.push({ course: { $in: courses.map((course) => course._id) } });
  return or.length ? { $or: or } : null;
};

/**
 * Req 44: the final request filter for a staff list: the caller's access
 * scope (req 43) AND every requested condition. The scope is always the first
 * `$and` clause and is never replaced, so no condition can widen it. Later
 * list conditions (req 45 filters) belong in `conditions` the same way.
 *
 * Returns null when nothing can match (no scope, or a search that matched no
 * student or course), meaning the request query can be skipped.
 */
const buildStaffRequestFilter = async (scopeFilter, { search = '' } = {}) => {
  if (!scopeFilter) return null;

  const conditions = [];
  const searchCondition = await staffSearchCondition(search);
  if (searchCondition === null) return null;
  if (Object.keys(searchCondition).length) conditions.push(searchCondition);

  return conditions.length ? { $and: [scopeFilter, ...conditions] } : scopeFilter;
};

module.exports = {
  reviewWindowFor,
  validateRequestInput,
  staffRequestScope,
  parseStaffSearch,
  courseCodePattern,
  buildStaffRequestFilter,
  REVIEW_STATUS,
  SEARCH_LIMIT,
};

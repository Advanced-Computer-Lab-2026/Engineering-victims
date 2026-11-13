const mongoose = require('mongoose');
const AcademicTerm = require('../models/AcademicTerm');
const Student = require('../models/Student');
const Course = require('../models/Course');
const User = require('../models/User');
const StudentSchedule = require('../models/StudentSchedule');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const { deadlineEnd } = require('./schedulingPreferenceService');
const { escapeRegex, studentIdVariants } = require('./studentQueryService');

const { SLOT_TYPES, NOTE_LIMIT, STATUSES } = SlotChangeRequest;

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

/** The Advisor filter value for requests whose student has no Advisor. */
const UNASSIGNED_ADVISOR = 'none';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Req 45: a submission-date bound, read the same way as the graduation-plan
 * date filters: a calendar date (YYYY-MM-DD, UTC) or a full ISO timestamp.
 * Returns a Date, or null when the value is not a real date (e.g. 2026-02-30).
 */
const parseDateBound = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (DATE_ONLY.test(value) && date.toISOString().slice(0, 10) !== value) return null;
  return date;
};

/**
 * Req 44/45: reads every list parameter (search, status, Advisor, course and
 * submission dates) from the query string. Blank values mean "not filtered".
 * Anything that is not a single string, or not a value the list knows, is
 * refused with a message rather than guessed at, so no parameter can turn
 * into a query operator or quietly match everything.
 *
 * Returns { values } (all strings, '' when not set) or { error }.
 */
const parseStaffListQuery = (query = {}) => {
  const search = parseStaffSearch(query.search);
  if (search.error) return { error: search.error };

  const values = { search: search.term };
  for (const key of ['status', 'advisor', 'course', 'submittedFrom', 'submittedTo']) {
    const raw = query[key];
    if (raw === undefined) {
      values[key] = '';
    } else if (typeof raw !== 'string') {
      return { error: 'Each filter must be a single value.' };
    } else {
      values[key] = raw.trim();
    }
  }

  if (values.status && !STATUSES.includes(values.status)) {
    return { error: `Status must be one of ${STATUSES.join(', ')}.` };
  }
  if (values.advisor && values.advisor !== UNASSIGNED_ADVISOR && !mongoose.isValidObjectId(values.advisor)) {
    return { error: 'That Advisor filter is not valid.' };
  }
  if (values.course && !mongoose.isValidObjectId(values.course)) {
    return { error: 'That course filter is not valid.' };
  }

  const from = values.submittedFrom ? parseDateBound(values.submittedFrom) : null;
  const to = values.submittedTo ? parseDateBound(values.submittedTo) : null;
  if ((values.submittedFrom && !from) || (values.submittedTo && !to)) {
    return { error: 'Enter a valid submission date.' };
  }
  if (from && to && from > to) {
    return { error: 'The submission start date must be on or before the end date.' };
  }

  return { values };
};

/** Req 45: the createdAt range for the submission-date filter, or null. */
const submittedCondition = ({ submittedFrom, submittedTo }) => {
  if (!submittedFrom && !submittedTo) return null;
  const range = {};
  if (submittedFrom) range.$gte = parseDateBound(submittedFrom);
  if (submittedTo) {
    const to = parseDateBound(submittedTo);
    // A date-only upper bound includes that whole day.
    if (DATE_ONLY.test(submittedTo)) range.$lt = new Date(to.getTime() + DAY_MS);
    else range.$lte = to;
  }
  return { createdAt: range };
};

/**
 * Req 45: requests from students whose current Advisor is `advisor` (or who
 * have none, for UNASSIGNED_ADVISOR). The Advisor is read from the student,
 * so a reassigned student's requests follow their new Advisor, matching the
 * req 43 scope. Returns null when no student matches.
 */
const advisorCondition = async (advisor) => {
  const students = await Student.find({ assignedAdvisor: advisor === UNASSIGNED_ADVISOR ? null : advisor })
    .select('_id')
    .lean();
  return students.length ? { student: { $in: students.map((student) => student._id) } } : null;
};

/**
 * Req 44/45: the final request filter for a staff list: the caller's access
 * scope (req 43) AND every requested condition. The scope is always the first
 * `$and` clause and is never replaced, so no search or filter can widen it;
 * an Advisor filtering by another Advisor simply gets nothing.
 *
 * `options` are the parsed values from parseStaffListQuery. Returns null when
 * nothing can match (no scope, or a search or Advisor that matched no
 * student or course), meaning the request query can be skipped.
 */
const buildStaffRequestFilter = async (scopeFilter, options = {}) => {
  if (!scopeFilter) return null;
  const { search = '', status = '', advisor = '', course = '' } = options;

  // Plain field conditions first; they need no lookups.
  const conditions = [];
  if (status) conditions.push({ status });
  if (course) conditions.push({ course: new mongoose.Types.ObjectId(course) });
  const submitted = submittedCondition(options);
  if (submitted) conditions.push(submitted);

  if (advisor) {
    const byAdvisor = await advisorCondition(advisor);
    if (!byAdvisor) return null;
    conditions.push(byAdvisor);
  }

  const searchCondition = await staffSearchCondition(search);
  if (searchCondition === null) return null;
  if (Object.keys(searchCondition).length) conditions.push(searchCondition);

  return conditions.length ? { $and: [scopeFilter, ...conditions] } : scopeFilter;
};

/**
 * Req 45: the choices for the Advisor and course filters, limited to what the
 * caller may see. A Coordinator gets every Advisor plus "Unassigned"; an
 * Advisor gets only themselves. Courses are those that appear in requests in
 * the caller's scope, so the list never reveals anything outside it.
 */
const staffFilterOptions = async (access, user) => {
  const isAll = access.scope === 'all';
  const canListSelf = mongoose.isValidObjectId(user?.userId);
  const [advisors, courseIds] = await Promise.all([
    isAll || canListSelf
      ? User.find(isAll ? { role: 'Advisor' } : { _id: user.userId, role: 'Advisor' })
          .select('fullName email')
          .sort({ fullName: 1 })
          .lean()
      : Promise.resolve([]),
    access.filter ? SlotChangeRequest.distinct('course', access.filter) : Promise.resolve([]),
  ]);
  const courses = courseIds.length
    ? await Course.find({ _id: { $in: courseIds } }).select('code name').sort({ code: 1 }).lean()
    : [];

  return {
    statuses: STATUSES,
    advisors: advisors.map((advisor) => ({ id: advisor._id, fullName: advisor.fullName, email: advisor.email })),
    includesUnassigned: isAll,
    courses: courses.map((course) => ({ id: course._id, code: course.code, name: course.name })),
  };
};

module.exports = {
  reviewWindowFor,
  validateRequestInput,
  staffRequestScope,
  parseStaffSearch,
  parseStaffListQuery,
  courseCodePattern,
  buildStaffRequestFilter,
  staffFilterOptions,
  REVIEW_STATUS,
  SEARCH_LIMIT,
  UNASSIGNED_ADVISOR,
};

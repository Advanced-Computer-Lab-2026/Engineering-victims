const mongoose = require('mongoose');
const AcademicTerm = require('../models/AcademicTerm');
const Student = require('../models/Student');
const Course = require('../models/Course');
const User = require('../models/User');
const CourseSlot = require('../models/CourseSlot');
const StudentSchedule = require('../models/StudentSchedule');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const { deadlineEnd } = require('./schedulingPreferenceService');
const { escapeRegex, studentIdVariants } = require('./studentQueryService');
const { slotsOverlap } = require('./conflictService');
const { publishStudentNotification } = require('./studentNotificationService');

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
/**
 * Req 43/48: THE definition of an Advisor's students (the Advising Students
 * currently assigned to them). staffRequestScope queries with it and
 * canDecideFor checks one student against it, so the list, details and
 * decision routes cannot drift apart.
 */
const advisorStudentCriteria = (advisorId) => ({ assignedAdvisor: advisorId, studentType: 'Advising Student' });

const staffRequestScope = async (user) => {
  if (user?.role === 'Coordinator') return { scope: 'all', filter: {} };
  if (user?.role !== 'Advisor') return null;

  if (!mongoose.isValidObjectId(user.userId)) return { scope: 'assigned', filter: null };
  const assigned = await Student.find(advisorStudentCriteria(user.userId))
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

/** Schedule rows that count as the student's assigned timetable (not an unfinished draft). */
const ASSIGNED_ROW_STATUSES = ['Active', 'Processed'];

/**
 * Seats left in a slot: maxCapacity - assignedCount, never negative (an
 * over-assigned slot is simply full) and never above capacity (a negative
 * or missing assigned count is treated as 0).
 */
const remainingSeats = (slot) => {
  const capacity = Math.max(0, Number(slot.maxCapacity) || 0);
  const assigned = Math.max(0, Number(slot.assignedCount) || 0);
  return Math.max(0, capacity - assigned);
};

const slotTimes = (slot) => ({
  groupNumber: slot.groupNumber,
  dayOfWeek: slot.dayOfWeek,
  startTime: slot.startTime,
  endTime: slot.endTime,
  room: slot.roomId ?? slot.room,
});

/** Attaches the transaction session to a query when there is one (req 48). */
const inSession = (query, session) => (session ? query.session(session) : query);

/**
 * Req 47/48: the student's assigned timetable in a term (Active/Processed
 * rows, not an unfinished draft), minus `excludeSlotId` (the slot a change
 * would replace), as slots with course labels for clash messages. Two
 * queries however many rows there are. With `session`, the reads happen
 * inside that transaction's snapshot.
 */
const loadAssignedTimetable = async ({ studentId, termId, excludeSlotId, session = null }) => {
  const rows = await inSession(
    StudentSchedule.find({
      studentId,
      termId,
      status: { $in: ASSIGNED_ROW_STATUSES },
      slotId: { $ne: excludeSlotId },
    })
      .select('slotId')
      .lean(),
    session
  );
  if (!rows.length) return [];
  return inSession(
    CourseSlot.find({ _id: { $in: rows.map((row) => row.slotId) } })
      .select('offeringId slotType groupNumber dayOfWeek startTime endTime')
      .populate({ path: 'offeringId', select: 'courseId', populate: { path: 'courseId', select: 'code name' } })
      .lean(),
    session
  );
};

/**
 * Req 47/48: the verdict for one candidate slot against the student's other
 * assigned slots. The comparison drawer shows it and approval enforces it, so
 * a group the drawer calls available is exactly one approval accepts.
 */
const judgeAlternative = (slot, assignedSlots, timetableChecked) => {
  const clashes = assignedSlots
    .filter((other) => String(other._id) !== String(slot._id) && slotsOverlap(slot, other))
    .map((other) => ({
      slotId: other._id,
      course: other.offeringId?.courseId
        ? { code: other.offeringId.courseId.code, name: other.offeringId.courseId.name }
        : null,
      slotType: other.slotType,
      ...slotTimes(other),
    }));
  const seats = remainingSeats(slot);
  const alreadyAssigned = assignedSlots.some((other) => String(other._id) === String(slot._id));
  const reasons = [];
  if (seats === 0) reasons.push('full');
  if (clashes.length) reasons.push('clash');
  if (alreadyAssigned) reasons.push('already-assigned');
  if (!timetableChecked) reasons.push('timetable-unavailable');
  return {
    id: slot._id,
    ...slotTimes(slot),
    maxCapacity: slot.maxCapacity,
    assignedCount: slot.assignedCount,
    remainingSeats: seats,
    isFull: seats === 0,
    clashes,
    isEligible: reasons.length === 0,
    reasons,
  };
};

/**
 * Req 47: the student's current slot beside every other group of the same
 * course offering (so the same course and term) and the same component, with
 * remaining seats and clashes against the rest of the student's timetable.
 *
 * `request` is a lean SlotChangeRequest the caller has already found inside
 * the staff scope; nothing here takes a course, student or slot from the
 * client. Read-only: no schedule row, capacity or request is touched.
 *
 * Clashes use the student's Active/Processed rows in the request's term,
 * excluding the current slot (which the change would replace). A slot the
 * student already holds is never offered. When the student record is gone
 * the timetable cannot be checked, so no alternative is marked eligible.
 */
const compareSlotAlternatives = async (request) => {
  const studentId = request.student?._id ?? request.student;
  const currentSlotId = String(request.currentSlot);

  // One query for every group of this component in this offering (current included).
  const [groupSlots, studentExists] = await Promise.all([
    CourseSlot.find({ offeringId: request.offering, slotType: request.slotType })
      .select('offeringId slotType groupNumber dayOfWeek startTime endTime roomId maxCapacity assignedCount')
      .sort({ groupNumber: 1, _id: 1 })
      .lean(),
    studentId ? Student.exists({ _id: studentId }) : Promise.resolve(null),
  ]);

  const assignedSlots = studentExists
    ? await loadAssignedTimetable({ studentId, termId: request.term, excludeSlotId: request.currentSlot })
    : [];

  const current = groupSlots.find((slot) => String(slot._id) === currentSlotId);
  const alternatives = groupSlots
    .filter((slot) => String(slot._id) !== currentSlotId)
    .map((slot) => judgeAlternative(slot, assignedSlots, Boolean(studentExists)));

  return {
    requestId: request._id,
    status: request.status,
    slotType: request.slotType,
    timetableChecked: Boolean(studentExists),
    current: current
      ? {
          id: current._id,
          missing: false,
          ...slotTimes(current),
          maxCapacity: current.maxCapacity,
          assignedCount: current.assignedCount,
          remainingSeats: remainingSeats(current),
        }
      : {
          // The slot was deleted since the request was made; show what was asked about.
          id: request.currentSlot,
          missing: true,
          ...slotTimes(request.currentSlotSnapshot ?? {}),
          maxCapacity: null,
          assignedCount: null,
          remainingSeats: null,
        },
    alternatives,
    summary: {
      total: alternatives.length,
      eligible: alternatives.filter((alt) => alt.isEligible).length,
      full: alternatives.filter((alt) => alt.isFull).length,
      clashing: alternatives.filter((alt) => alt.clashes.length > 0).length,
    },
  };
};

/**
 * Req 48: a refusal with the HTTP status and the message staff should see.
 * Thrown inside the approval transaction, it aborts every write made so far.
 */
class SlotChangeDecisionError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SlotChangeDecisionError';
    this.status = status;
  }
}

const NOT_FOUND = 'Slot-change request not found.';

/**
 * Req 48: a strict ObjectId string, exactly 24 hex characters.
 * (mongoose.isValidObjectId also accepts any 12-character string.)
 */
const isObjectIdString = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);

/**
 * Req 48: cleans a decision body. Only `responseNote` (both decisions) and
 * `replacementSlotId` (approval) are read; anything else is ignored. Returns
 * the clean values or { error }.
 */
const validateDecisionInput = (body, { approve }) => {
  const { responseNote, replacementSlotId } = body ?? {};
  if (responseNote != null && typeof responseNote !== 'string') return { error: 'The response note must be text.' };
  const note = (responseNote ?? '').trim();
  if (note.length > NOTE_LIMIT) return { error: `The response note can be at most ${NOTE_LIMIT} characters.` };
  if (!approve) return { responseNote: note };
  if (!isObjectIdString(replacementSlotId)) {
    return { error: 'Choose the replacement group to approve.' };
  }
  return { responseNote: note, replacementSlotId };
};

/**
 * Req 48: the req 43 scope (staffRequestScope) applied to one student, for
 * checks made inside the decision transaction: a Coordinator may decide any
 * request, an Advisor only those of their own students, matched field by
 * field against the same advisorStudentCriteria the list queries with.
 */
const canDecideFor = (user, student) => {
  if (user?.role === 'Coordinator') return true;
  if (user?.role !== 'Advisor' || !student) return false;
  return Object.entries(advisorStudentCriteria(user.userId)).every(
    ([field, value]) => String(student[field]) === String(value)
  );
};

/** Fields of the student a decision reads: everything canDecideFor checks, plus the workflow status. */
const DECISION_STUDENT_FIELDS = 'studentType assignedAdvisor workflowStatus';

const TRANSACTION_OPTIONS = { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };

/**
 * Req 48: runs `work(session)` in one transaction and returns its result.
 * withTransaction retries the whole callback on a transient conflict, so
 * every read and check in `work` is repeated against the committed state.
 */
const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      result = null;
      result = await work(session);
    }, TRANSACTION_OPTIONS);
    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Req 48: steps shared by both decisions, inside their transaction: re-read
 * the request and its student, check the caller's scope, that the request is
 * Pending and that the student is Ready for Student Review.
 */
const loadDecidableRequest = async ({ user, requestId, session }) => {
  const request = await SlotChangeRequest.findById(requestId).session(session).lean();
  if (!request) throw new SlotChangeDecisionError(404, NOT_FOUND);
  const student = await Student.findById(request.student).select(DECISION_STUDENT_FIELDS).session(session).lean();
  // Out of scope reads exactly like missing, so its existence is not revealed.
  // (An Advisor's scope needs the student, so a deleted student is out of it.)
  if (!canDecideFor(user, student)) throw new SlotChangeDecisionError(404, NOT_FOUND);
  if (!student) throw new SlotChangeDecisionError(409, 'The student record for this request no longer exists.');
  if (request.status !== 'Pending') {
    throw new SlotChangeDecisionError(409, `This request is already ${request.status.toLowerCase()}.`);
  }
  if (student.workflowStatus !== REVIEW_STATUS) {
    throw new SlotChangeDecisionError(
      409,
      `Requests can only be decided while the student's schedule is ${REVIEW_STATUS}; it is now ${student.workflowStatus}.`
    );
  }
  return { request, student };
};

/**
 * Req 48: the per-student lock. Writing the student document inside the
 * transaction means any other write to that student (another decision, or a
 * workflow-status change such as processing the schedule) conflicts with
 * this transaction: one of them retries and re-reads, so a decision can never
 * commit against a workflow status that has already changed.
 */
const lockStudent = (studentId, now, session) =>
  Student.updateOne({ _id: studentId }, { $set: { lastUpdateAt: now } }, { session });

/** Req 48: an E11000 from the schedule's unique (studentId, slotId) index, and only that index. */
const isScheduleDuplicateError = (error) => {
  if (error?.code !== 11000) return false;
  const key = error.keyPattern ? Object.keys(error.keyPattern).sort().join(',') : '';
  if (key) return key === 'slotId,studentId';
  return /studentschedules.*studentId_1_slotId_1/.test(String(error.message ?? ''));
};

const describeClashes = (clashes) =>
  clashes
    .map((c) => `${c.course?.code ?? 'another course'} ${c.slotType} G${c.groupNumber} (${c.dayOfWeek} ${c.startTime}-${c.endTime})`)
    .join(', ');

/**
 * Req 48: approve a Pending request, moving the student into the exact
 * replacement slot. Everything happens in ONE transaction, so the request,
 * the schedule row and both seat counts change together or not at all:
 *
 *  1. Re-read the request and student and re-check the scope, the Pending
 *     status and that the student is Ready for Student Review.
 *  2. Write the student's lastUpdateAt (lockStudent). Two decisions for the
 *     same student, or a decision and a workflow-status change, therefore
 *     write the same document, so MongoDB lets only one commit; the other is
 *     retried and re-validates against the committed state, which is what
 *     stops two approvals creating a clash together.
 *     Known limit: code that changes a StudentSchedule row WITHOUT writing
 *     the Student document does not take this lock, so it could still race
 *     an approval's clash check. Every such writer would need to call
 *     lockStudent (or equivalent) to be covered.
 *  3. Claim the request (Pending -> Approved, conditional on Pending), so a
 *     second decision or a withdrawal cannot also win.
 *  4. Take the seat with a conditional $inc (only while assignedCount <
 *     maxCapacity). Concurrent approvals into the same slot write the same
 *     slot document, so the last seat can only be taken once.
 *  5. Re-count the slot's schedule rows (the counter can be stale) and
 *     re-check clashes with the same rule the req 47 comparison shows.
 *  6. Move the student's schedule row and free a seat in the old slot.
 *
 * Any refusal or failure aborts the transaction. withTransaction retries only
 * transient conflicts, re-running every check. The workflow status is never
 * changed. Returns the approved request's id.
 */
const approveSlotChangeRequest = async ({ user, requestId, replacementSlotId, responseNote }) => {
  try {
    return await runInTransaction(async (session) => {
      const now = new Date();

      // (1) Re-read and re-check the request and student.
      const { request, student } = await loadDecidableRequest({ user, requestId, session });
      if (String(replacementSlotId) === String(request.currentSlot)) {
        throw new SlotChangeDecisionError(400, 'Choose a group other than the current one.');
      }

      // (2) Serialise every decision and workflow change for this student.
      await lockStudent(student._id, now, session);

      // (3) Only one decision can claim the request.
      const claimed = await SlotChangeRequest.updateOne(
        { _id: request._id, status: 'Pending' },
        {
          $set: {
            status: 'Approved',
            replacementSlot: new mongoose.Types.ObjectId(replacementSlotId),
            responseNote,
            respondedBy: new mongoose.Types.ObjectId(user.userId),
            respondedAt: now,
          },
        },
        { session }
      );
      if (claimed.modifiedCount !== 1) {
        throw new SlotChangeDecisionError(409, 'This request was decided or withdrawn a moment ago.');
      }

      const replacement = await CourseSlot.findById(replacementSlotId).session(session).lean();
      if (!replacement) throw new SlotChangeDecisionError(409, 'That replacement group no longer exists.');
      if (String(replacement.offeringId) !== String(request.offering) || replacement.slotType !== request.slotType) {
        throw new SlotChangeDecisionError(
          400,
          `The replacement must be another ${request.slotType} group of the same course offering.`
        );
      }

      const row = await StudentSchedule.findOne({
        _id: request.scheduleEntry,
        studentId: student._id,
        slotId: request.currentSlot,
        termId: request.term,
        status: 'Active',
      })
        .session(session)
        .lean();
      if (!row) {
        throw new SlotChangeDecisionError(409, "The student's schedule no longer holds the slot this request is about.");
      }

      // (4) Take the seat, only while one is free.
      const taken = await CourseSlot.updateOne(
        { _id: replacement._id, $expr: { $lt: ['$assignedCount', '$maxCapacity'] } },
        { $inc: { assignedCount: 1 } },
        { session }
      );
      if (taken.modifiedCount !== 1) throw new SlotChangeDecisionError(409, 'That replacement group is full.');

      // (5) The schedule rows are the source of truth; never overfill even if the counter drifted.
      const holders = await StudentSchedule.countDocuments({
        slotId: replacement._id,
        status: { $in: ASSIGNED_ROW_STATUSES },
      }).session(session);
      if (holders >= replacement.maxCapacity) throw new SlotChangeDecisionError(409, 'That replacement group is full.');

      const timetable = await loadAssignedTimetable({
        studentId: student._id,
        termId: request.term,
        excludeSlotId: request.currentSlot,
        session,
      });
      const verdict = judgeAlternative(replacement, timetable, true);
      if (verdict.reasons.includes('already-assigned')) {
        throw new SlotChangeDecisionError(409, 'The student already has that group in their schedule.');
      }
      if (verdict.clashes.length) {
        throw new SlotChangeDecisionError(409, `That group clashes with the student's ${describeClashes(verdict.clashes)}.`);
      }

      // (6) Move the row and free the old seat.
      const moved = await StudentSchedule.updateOne(
        { _id: row._id, slotId: request.currentSlot, status: 'Active' },
        { $set: { slotId: replacement._id } },
        { session }
      );
      if (moved.modifiedCount !== 1) {
        throw new SlotChangeDecisionError(409, "The student's schedule no longer holds the slot this request is about.");
      }
      await CourseSlot.updateOne(
        { _id: request.currentSlot, assignedCount: { $gt: 0 } },
        { $inc: { assignedCount: -1 } },
        { session }
      );

      // FR 117: notify the student that their slot-change request was approved
      await publishStudentNotification(
        'slot_change.decided',
        {
          entityId: request._id,
          occurrence: `decided-${now.getTime()}`,
          decision: 'Approved',
          studentId: student._id,
        },
        { session }
      );

      return request._id;
    });
  } catch (error) {
    // The schedule's unique (student, slot) index caught a row the checks
    // could not see, e.g. a draft row. Any other duplicate key is a real failure.
    if (isScheduleDuplicateError(error)) {
      throw new SlotChangeDecisionError(409, 'The student already has that group in their schedule.');
    }
    throw error;
  }
};

/**
 * Req 48: reject a Pending request with an optional note. Only the request is
 * decided: schedule rows and seat counts are never touched, and the workflow
 * status is not changed.
 *
 * It runs in a transaction for one reason: the Pending and Ready for Student
 * Review checks live on two documents (request and student), and a single
 * conditional update can only guard one. Inside the transaction the student
 * is locked exactly as an approval locks it (lastUpdateAt is written), so a
 * concurrent workflow-status change or decision conflicts and the loser
 * re-reads; a rejection never commits once the student has left review.
 * Returns the rejected request's id.
 */
const rejectSlotChangeRequest = async ({ user, requestId, responseNote }) =>
  runInTransaction(async (session) => {
    const now = new Date();
    const { request, student } = await loadDecidableRequest({ user, requestId, session });

    await lockStudent(student._id, now, session);

    const rejected = await SlotChangeRequest.updateOne(
      { _id: request._id, status: 'Pending' },
      {
        $set: {
          status: 'Rejected',
          replacementSlot: null,
          responseNote,
          respondedBy: new mongoose.Types.ObjectId(user.userId),
          respondedAt: now,
        },
      },
      { session }
    );
    if (rejected.modifiedCount !== 1) {
      throw new SlotChangeDecisionError(409, 'This request was decided or withdrawn a moment ago.');
    }

    // FR 117: notify the student that their slot-change request was rejected
    await publishStudentNotification(
      'slot_change.decided',
      {
        entityId: request._id,
        occurrence: `decided-${now.getTime()}`,
        decision: 'Rejected',
        studentId: student._id,
      },
      { session }
    );

    return request._id;
  });

module.exports = {
  SlotChangeDecisionError,
  validateDecisionInput,
  approveSlotChangeRequest,
  rejectSlotChangeRequest,
  isObjectIdString,
  isScheduleDuplicateError,
  canDecideFor,
  advisorStudentCriteria,
  loadAssignedTimetable,
  judgeAlternative,
  compareSlotAlternatives,
  remainingSeats,
  reviewWindowFor,
  validateRequestInput,
  staffRequestScope,
  parseStaffSearch,
  parseStaffListQuery,
  parseDateBound,
  submittedCondition,
  courseCodePattern,
  buildStaffRequestFilter,
  staffFilterOptions,
  REVIEW_STATUS,
  SEARCH_LIMIT,
  UNASSIGNED_ADVISOR,
};

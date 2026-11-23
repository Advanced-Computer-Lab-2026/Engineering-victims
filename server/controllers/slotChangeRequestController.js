const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const CourseSlot = require('../models/CourseSlot');
const Course = require('../models/Course');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const { deadlineEnd } = require('../services/schedulingPreferenceService');
const {
  reviewWindowFor,
  validateRequestInput,
  staffRequestScope,
  parseStaffListQuery,
  buildStaffRequestFilter,
  staffFilterOptions,
  compareSlotAlternatives,
  validateDecisionInput,
  approveSlotChangeRequest,
  rejectSlotChangeRequest,
  SlotChangeDecisionError,
  isObjectIdString,
} = require('../services/slotChangeRequestService');
const { supportsTransactions, isTransactionUnsupportedError } = require('../services/transactionSupport');
const { createPendingSlotChangeRequest } = require('../services/advisingScheduleWorkflowService');
const { notify, notifyRole } = require('../services/notificationService');
const { publishNotificationEvent } = require('../services/notificationEventService');

/**
 * Resolves the signed-in Advising Student from the token, or sends the right
 * error. There is no student id in the URL or body, so a request can only ever
 * be made for the caller's own schedule.
 */
const resolveStudent = async (req, res) => {
  const user = await User.findById(req.user.userId).select('email').lean();
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return null;
  }
  const student = await Student.findOne({ email: user.email });
  if (!student) {
    res.status(404).json({ message: 'No student record is linked to this account.' });
    return null;
  }
  if (student.studentType !== 'Advising Student') {
    res.status(403).json({
      message: 'Slot-change requests are only for Advising Students. Normal Students use whole-schedule swaps.',
    });
    return null;
  }
  return student;
};

const serializeTerm = (term) =>
  term
    ? {
        id: term._id,
        label: `${term.academicYear} ${term.season}`,
        advisingDeadline: term.advisingDeadline,
        closesAt: deadlineEnd(term),
      }
    : null;

/**
 * The held slot as recorded on the request. Fields are copied one by one: a
 * document created inside a transaction keeps its live session in Mongoose's
 * internals, and spreading the subdocument would pull those into the JSON
 * (circular structure → a 500 after the request was already saved).
 */
const serializeCurrentSlot = (doc) => {
  const snapshot = doc.currentSlotSnapshot ?? {};
  return {
    id: doc.currentSlot,
    groupNumber: snapshot.groupNumber,
    dayOfWeek: snapshot.dayOfWeek,
    startTime: snapshot.startTime,
    endTime: snapshot.endTime,
    room: snapshot.room,
  };
};

const serializeRequest = (doc, course) => ({
  id: doc._id,
  status: doc.status,
  course: { id: course._id, code: course.code, name: course.name },
  slotType: doc.slotType,
  currentSlot: serializeCurrentSlot(doc),
  preferenceNote: doc.preferenceNote,
  submittedAt: doc.createdAt,
});

/** A populated CourseSlot as the student sees it, or null when it is gone. */
const serializeSlot = (slot) =>
  slot
    ? {
        id: slot._id,
        groupNumber: slot.groupNumber,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.roomId,
      }
    : null;

/** Only an Advisor or Coordinator decision (req 48) carries a response. */
const RESOLVED_STATUSES = ['Approved', 'Rejected'];

/**
 * Req 41: one of the student's own requests with the staff response, if any.
 * The response identifies the approved replacement slot; it is null while the
 * request is Pending or after the student withdrew it.
 */
const serializeListItem = (doc) => ({
  id: doc._id,
  status: doc.status,
  course: doc.course ? { id: doc.course._id, code: doc.course.code, name: doc.course.name } : null,
  term: doc.term ? { id: doc.term._id, label: `${doc.term.academicYear} ${doc.term.season}` } : null,
  slotType: doc.slotType,
  currentSlot: serializeCurrentSlot(doc),
  preferenceNote: doc.preferenceNote ?? '',
  submittedAt: doc.createdAt,
  withdrawnAt: doc.withdrawnAt ?? null,
  response: RESOLVED_STATUSES.includes(doc.status)
    ? {
        note: doc.responseNote ?? '',
        respondedBy: doc.respondedBy ? { name: doc.respondedBy.fullName, role: doc.respondedBy.role } : null,
        respondedAt: doc.respondedAt ?? null,
        replacementSlot: doc.status === 'Approved' ? serializeSlot(doc.replacementSlot) : null,
      }
    : null,
});

/** The references the Req 41 list shows, loaded onto a request query. */
const withListDetails = (query) =>
  query
    .populate('course', 'code name')
    .populate('term', 'academicYear season')
    .populate('replacementSlot', 'groupNumber dayOfWeek startTime endTime roomId')
    .populate('respondedBy', 'fullName role')
    .lean();

/**
 * Req 41: the signed-in Advising Student's own slot-change requests from every
 * term, newest first, with their statuses and any Advisor or Coordinator
 * response. The student comes from the token only, so no one can list another
 * student's requests.
 */
exports.listMyRequests = async (req, res) => {
  try {
    const student = await resolveStudent(req, res);
    if (!student) return;

    const requests = await withListDetails(
      SlotChangeRequest.find({ student: student._id }).sort({ createdAt: -1, _id: -1 })
    );

    res.status(200).json({ requests: requests.map(serializeListItem) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load your slot-change requests', error: error.message });
  }
};

/** Side effect only: a failed notification must never fail the withdrawal. */
const notifyRequestWithdrawn = async (student, doc) => {
  // Req 119 names the assigned Advisor only; with no Advisor nobody is told.
  if (!student.assignedAdvisor) return;
  try {
    const snapshot = doc.currentSlotSnapshot;
    const slotLabel = `${doc.course?.code ?? 'a course'} ${doc.slotType} group ${snapshot.groupNumber} (${snapshot.dayOfWeek} ${snapshot.startTime}-${snapshot.endTime})`;
    await publishNotificationEvent({
      name: 'slot_change.withdrawn',
      entityId: doc._id,
      occurrence: 'withdrawn',
      studentId: student._id,
      title: 'Slot-change request withdrawn',
      message: `${student.fullName} (${student.studentId}) withdrew their request to change ${slotLabel}.`,
      // Req 43: the Advisor's review list shows withdrawn requests too.
      link: '/slot-change-review',
    });
  } catch (error) {
    console.error('[slot-change] Could not send withdrawal notification:', error.message);
  }
};

/**
 * Req 42: withdraw one of the signed-in Advising Student's own Pending
 * requests. Ownership and the Pending status are part of the update filter, so
 * the check and the change happen in one atomic step: a second withdrawal, or
 * one racing an Advisor or Coordinator decision, cannot both succeed.
 *
 * Only the status and withdrawal time change. The schedule, seat counts,
 * workflow status and response fields are left alone — a request never
 * reserved anything, so there is nothing to release.
 */
exports.withdrawMyRequest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid slot-change request id.' });
    }

    const student = await resolveStudent(req, res);
    if (!student) return;

    const withdrawn = await withListDetails(
      SlotChangeRequest.findOneAndUpdate(
        { _id: id, student: student._id, status: 'Pending' },
        { $set: { status: 'Withdrawn', withdrawnAt: new Date() } },
        { new: true }
      )
    );

    if (!withdrawn) {
      // Another student's request is reported as not found, so its existence is not revealed.
      const existing = await SlotChangeRequest.findOne({ _id: id, student: student._id }).select('status').lean();
      if (!existing) return res.status(404).json({ message: 'Slot-change request not found.' });
      return res.status(409).json({
        message: `This request is already ${existing.status} and cannot be withdrawn. Only a Pending request can be withdrawn.`,
      });
    }

    await notifyRequestWithdrawn(student, withdrawn);

    res.status(200).json({
      message: 'Your slot-change request was withdrawn.',
      request: serializeListItem(withdrawn),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not withdraw your slot-change request', error: error.message });
  }
};

/**
 * Req 43: a request as staff see it in the list: the student's own view
 * (req 41) plus who asked and their current Advisor. A request whose student
 * record was deleted keeps `student: null` so it stays visible.
 */
/**
 * Req 43/46: the references a staff row shows (the req 41 ones plus the
 * student and their current Advisor), shared by the list and the details.
 */
const withStaffDetails = (query) =>
  withListDetails(
    query.populate({
      path: 'student',
      select: 'fullName studentId assignedAdvisor',
      populate: { path: 'assignedAdvisor', select: 'fullName' },
    })
  );

const serializeStaffItem = (doc) => {
  const student = doc.student && typeof doc.student === 'object' && doc.student._id ? doc.student : null;
  const advisor = student?.assignedAdvisor?._id ? student.assignedAdvisor : null;
  return {
    ...serializeListItem(doc),
    student: student ? { id: student._id, studentId: student.studentId, fullName: student.fullName } : null,
    advisor: advisor ? { id: advisor._id, fullName: advisor.fullName } : null,
  };
};

/**
 * Req 43: the slot-change requests an Advisor or Coordinator may see, every
 * status, newest first. The scope comes only from the token (see
 * staffRequestScope); nothing in the query string can widen it.
 *
 * Req 44: `?search=` narrows the list by student ID, student name or course
 * code, always ANDed with that scope (see buildStaffRequestFilter). A blank
 * search lists exactly what req 43 lists.
 *
 * Req 45: `?status=`, `?advisor=` (an Advisor id, or "none"), `?course=` and
 * `?submittedFrom=` / `?submittedTo=` narrow it further. Every filter and the
 * search combine with AND, inside the same scope.
 */
exports.listStaffRequests = async (req, res) => {
  try {
    const access = await staffRequestScope(req.user);
    if (!access) {
      return res.status(403).json({ message: 'Only Advisors and Coordinators can view slot-change requests.' });
    }

    const parsed = parseStaffListQuery(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const filter = await buildStaffRequestFilter(access.filter, parsed.values);
    const requests = filter
      ? await withStaffDetails(SlotChangeRequest.find(filter).sort({ createdAt: -1, _id: -1 }))
      : [];

    res.status(200).json({ scope: access.scope, requests: requests.map(serializeStaffItem) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load slot-change requests', error: error.message });
  }
};

/**
 * Req 46: one request, opened from the staff list (plain, searched or
 * filtered). The id comes from the client, so it is only ever looked up
 * inside the caller's req 43 scope: an Advisor asking for a request from a
 * student who is not currently assigned to them gets the same 404 as a
 * request that does not exist, so its existence is not revealed. The body is
 * exactly a staff list row (serializeStaffItem), read fresh from the database.
 */
/**
 * Req 46/47: finds the request named by `:id` inside the caller's req 43
 * scope, or answers the error itself and returns null. `load` turns the
 * scoped query into the document (populated for details, plain for the
 * comparison). Out-of-scope and missing requests share one 404.
 */
const findScopedRequest = async (req, res, load) => {
  const access = await staffRequestScope(req.user);
  if (!access) {
    res.status(403).json({ message: 'Only Advisors and Coordinators can view slot-change requests.' });
    return null;
  }

  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: 'That slot-change request id is not valid.' });
    return null;
  }

  const doc = access.filter
    ? await load(SlotChangeRequest.findOne({ $and: [access.filter, { _id: new mongoose.Types.ObjectId(id) }] }))
    : null;
  if (!doc) {
    res.status(404).json({ message: 'Slot-change request not found.' });
    return null;
  }
  return { access, doc };
};

exports.getStaffRequest = async (req, res) => {
  try {
    const found = await findScopedRequest(req, res, withStaffDetails);
    if (!found) return;
    res.status(200).json({ scope: found.access.scope, request: serializeStaffItem(found.doc) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the slot-change request', error: error.message });
  }
};

/** Req 48: a decided request, re-read with the list's references for the response. */
const decidedResponse = async (res, id, message) => {
  let request = null;
  try {
    const doc = await withStaffDetails(SlotChangeRequest.findById(id));
    request = doc ? serializeStaffItem(doc) : null;
  } catch {
    // The decision is already saved; the drawer re-reads it if this read fails.
  }
  res.status(200).json({ message, request });
};

/**
 * Req 48: checks shared by both decisions, before anything is read: the
 * role, the id, the body and (for an Advisor) that anyone is assigned at
 * all. Answers the error itself and returns null, or returns the clean body.
 */
const decisionPreflight = async (req, res, { approve }) => {
  const access = await staffRequestScope(req.user);
  if (!access) {
    res.status(403).json({ message: 'Only Advisors and Coordinators can decide slot-change requests.' });
    return null;
  }
  if (!isObjectIdString(req.params.id)) {
    res.status(400).json({ message: 'That slot-change request id is not valid.' });
    return null;
  }
  const input = validateDecisionInput(req.body, { approve });
  if (input.error) {
    res.status(400).json({ message: input.error });
    return null;
  }
  if (!access.filter) {
    res.status(404).json({ message: 'Slot-change request not found.' });
    return null;
  }
  return { input };
};

const TRANSACTIONS_UNAVAILABLE =
  'Deciding requests needs a database that supports transactions (a replica set), and this one does not. Nothing was changed.';
const TRANSACTIONS_UNCHECKED =
  'Could not reach the database to start the decision. Nothing was changed. Please try again shortly.';

/**
 * Req 48: whether a decision may start. Answers 503 itself and returns false
 * when it may not, telling apart a database that cannot run transactions
 * from one that could not be asked.
 */
const transactionsReady = async (res) => {
  let supported;
  try {
    supported = await supportsTransactions();
  } catch (error) {
    console.error('[slot-change] Could not check transaction support:', error);
    res.status(503).json({ message: TRANSACTIONS_UNCHECKED });
    return false;
  }
  if (!supported) {
    res.status(503).json({ message: TRANSACTIONS_UNAVAILABLE });
    return false;
  }
  return true;
};

/**
 * Req 48: runs one decision end to end. Refusals answer with their own
 * status and message; anything else is logged on the server and answered
 * with a fixed message, never the internal error text.
 */
const decide = async (req, res, { approve, run, done, failed }) => {
  try {
    const ready = await decisionPreflight(req, res, { approve });
    if (!ready) return;
    if (!(await transactionsReady(res))) return;

    const id = await run({ user: req.user, requestId: req.params.id, ...ready.input });
    await decidedResponse(res, id, done);
  } catch (error) {
    if (error instanceof SlotChangeDecisionError) return res.status(error.status).json({ message: error.message });
    if (isTransactionUnsupportedError(error)) return res.status(503).json({ message: TRANSACTIONS_UNAVAILABLE });
    console.error(`[slot-change] ${approve ? 'Approval' : 'Rejection'} failed:`, error);
    res.status(500).json({ message: failed });
  }
};

/**
 * Req 48: approve a Pending request into the exact replacement group. The
 * whole change runs in one MongoDB transaction (approveSlotChangeRequest);
 * without transaction support it is refused up front, never done partially.
 */
exports.approveRequest = (req, res) =>
  decide(req, res, {
    approve: true,
    run: approveSlotChangeRequest,
    done: 'Request approved. The student was moved to the replacement group.',
    failed: 'Could not approve the slot-change request. Nothing was changed.',
  });

/**
 * Req 48: reject a Pending request with an optional note. Only the request
 * changes; the schedule and seat counts are untouched. It also runs in a
 * transaction, so it cannot commit after the student has left review
 * (see rejectSlotChangeRequest).
 */
exports.rejectRequest = (req, res) =>
  decide(req, res, {
    approve: false,
    run: rejectSlotChangeRequest,
    done: 'Request rejected. The student keeps their current group.',
    failed: 'Could not reject the slot-change request. Nothing was changed.',
  });

/**
 * Req 47: the request's current slot beside the other groups of the same
 * course offering and component, with remaining seats and clashes against
 * the student's timetable. The request is found inside the caller's scope
 * first; the course, term, component, slot and student all come from it,
 * never from the client. Comparison only: nothing is written.
 */
exports.getRequestAlternatives = async (req, res) => {
  try {
    const found = await findScopedRequest(req, res, (query) =>
      query.select('student offering course term slotType currentSlot currentSlotSnapshot status').lean()
    );
    if (!found) return;
    res.status(200).json(await compareSlotAlternatives(found.doc));
  } catch (error) {
    res.status(500).json({ message: 'Could not compare the alternative slots', error: error.message });
  }
};

/**
 * Req 45: the choices for the Advisor and course filters, within the same
 * token-derived scope as the list, so an Advisor is never shown other
 * Advisors or courses only other students requested.
 */
exports.listStaffFilterOptions = async (req, res) => {
  try {
    const access = await staffRequestScope(req.user);
    if (!access) {
      return res.status(403).json({ message: 'Only Advisors and Coordinators can view slot-change requests.' });
    }
    res.status(200).json(await staffFilterOptions(access, req.user));
  } catch (error) {
    res.status(500).json({ message: 'Could not load the slot-change filters', error: error.message });
  }
};

/**
 * Req 40: whether the signed-in Advising Student may request a slot change
 * right now, and which of their slots already have a pending request, so the
 * page can offer the action only where it would be accepted. The submission
 * route re-checks everything; this is a convenience for the UI.
 */
exports.getMyEligibility = async (req, res) => {
  try {
    const student = await resolveStudent(req, res);
    if (!student) return;

    const window = await reviewWindowFor(student);
    const pending = window.term
      ? await SlotChangeRequest.find({ student: student._id, term: window.term._id, status: 'Pending' })
          .select('currentSlot')
          .lean()
      : [];

    res.status(200).json({
      canRequest: window.isOpen,
      reason: window.reason,
      workflowStatus: student.workflowStatus,
      term: serializeTerm(window.term),
      pendingSlotIds: pending.map((entry) => String(entry.currentSlot)),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not check slot-change requests', error: error.message });
  }
};

const SUBMISSION_TRANSACTIONS_UNAVAILABLE =
  'Your request was not sent: submitting a slot-change request needs a database that supports transactions (a replica set), and this one does not. Nothing was changed; please contact the system administrator.';

/** Side effect only: a failed notification must never fail the request. */
const notifyRequestSubmitted = async ({ userId, student, course, slotType, snapshot }) => {
  try {
    const slotLabel = `${course.code} ${slotType} group ${snapshot.groupNumber} (${snapshot.dayOfWeek} ${snapshot.startTime}-${snapshot.endTime})`;

    await notify(userId, {
      type: 'schedule',
      title: 'Slot-change request submitted',
      message: `Your request to change ${slotLabel} was sent for review. Your schedule stays as it is until it is resolved.`,
      link: '/my-courses',
    });

    if (student.assignedAdvisor) {
      await publishNotificationEvent({
        name: 'slot_change.submitted',
        entityId: snapshot.requestId,
        occurrence: 'submitted',
        studentId: student._id,
        title: 'New slot-change request',
        message: `${student.fullName} (${student.studentId}) asked to change ${slotLabel}.`,
        // Req 43-44: the page where the Advisor approves or rejects it.
        link: '/slot-change-review',
      });
    } else {
      await notifyRole('Coordinator', {
        type: 'approval',
        title: 'New slot-change request',
        message: `${student.fullName} (${student.studentId}) asked to change ${slotLabel}.`,
        link: `/schedule/${student._id}`,
      });
    }
  } catch (error) {
    console.error('[slot-change] Could not send notifications:', error.message);
  }
};

/**
 * Req 40: request a change to one assigned lecture, tutorial or lab slot.
 *
 * Only a request is recorded: the student's StudentSchedule rows and the
 * CourseSlot seat counts are never touched here, and the workflow status stays
 * Ready for Student Review — pending requests are tracked by this collection
 * rather than by a status change, so several slots may be requested at once.
 */
exports.createMyRequest = async (req, res) => {
  try {
    const student = await resolveStudent(req, res);
    if (!student) return;

    // Status and deadline first: a closed window is the answer whatever was sent.
    const window = await reviewWindowFor(student);
    if (!window.isOpen) return res.status(window.status).json({ message: window.reason });
    const { term } = window;

    const input = validateRequestInput(req.body);
    if (input.error) return res.status(400).json({ message: input.error });

    // The slot must be one the student actually holds in the schedule under review.
    const entry = await StudentSchedule.findOne({
      studentId: student._id,
      slotId: input.slotId,
      termId: term._id,
      status: 'Active',
    })
      .select('_id slotId')
      .lean();
    if (!entry) {
      return res.status(404).json({ message: 'That slot is not part of your schedule under review.' });
    }

    const slot = await CourseSlot.findById(input.slotId).populate('offeringId', 'courseId termId').lean();
    if (!slot || !slot.offeringId) {
      return res.status(404).json({ message: 'That slot is no longer available.' });
    }
    if (String(slot.offeringId.courseId) !== input.courseId) {
      return res.status(400).json({ message: 'That slot does not belong to the selected course.' });
    }
    if (slot.slotType !== input.slotType) {
      return res.status(400).json({ message: `That slot is a ${slot.slotType}, not a ${input.slotType}.` });
    }

    const course = await Course.findById(input.courseId).select('code name').lean();
    if (!course) return res.status(404).json({ message: 'Course not found.' });

    const duplicate = await SlotChangeRequest.exists({ student: student._id, currentSlot: slot._id, status: 'Pending' });
    if (duplicate) {
      return res.status(409).json({ message: 'You already have a pending change request for this slot.' });
    }

    const snapshot = {
      groupNumber: slot.groupNumber,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.roomId,
    };

    let created;
    try {
      created = await createPendingSlotChangeRequest({
        studentId: student._id,
        termId: term._id,
        request: {
          student: student._id,
          term: term._id,
          scheduleEntry: entry._id,
          course: course._id,
          offering: slot.offeringId._id,
          slotType: slot.slotType,
          currentSlot: slot._id,
          currentSlotSnapshot: snapshot,
          preferenceNote: input.preferenceNote,
        },
      });
    } catch (error) {
      // The partial unique index catches a simultaneous duplicate submission.
      if (error?.code === 11000) {
        return res.status(409).json({ message: 'You already have a pending change request for this slot.' });
      }
      if (error.status) return res.status(error.status).json({ message: error.message });
      // Req 48 pattern: submission re-checks and inserts in one transaction, so a
      // standalone MongoDB refuses it. Say so plainly; nothing was written.
      if (isTransactionUnsupportedError(error)) {
        console.error('[slot-change] Submission needs a replica set:', error.message);
        return res.status(503).json({ message: SUBMISSION_TRANSACTIONS_UNAVAILABLE });
      }
      throw error;
    }

    await notifyRequestSubmitted({
      userId: req.user.userId, student, course, slotType: slot.slotType,
      snapshot: { ...snapshot, requestId: created._id },
    });

    res.status(201).json({
      message: 'Your slot-change request was submitted. Your schedule stays as it is until it is reviewed.',
      request: serializeRequest(created, course),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not submit your slot-change request', error: error.message });
  }
};

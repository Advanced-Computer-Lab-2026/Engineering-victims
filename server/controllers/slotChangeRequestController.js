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
  parseStaffSearch,
  buildStaffRequestFilter,
} = require('../services/slotChangeRequestService');
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

const serializeRequest = (doc, course) => ({
  id: doc._id,
  status: doc.status,
  course: { id: course._id, code: course.code, name: course.name },
  slotType: doc.slotType,
  currentSlot: { id: doc.currentSlot, ...doc.currentSlotSnapshot },
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
  currentSlot: { id: doc.currentSlot, ...doc.currentSlotSnapshot },
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
      link: `/schedule/${student._id}`,
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
 */
exports.listStaffRequests = async (req, res) => {
  try {
    const access = await staffRequestScope(req.user);
    if (!access) {
      return res.status(403).json({ message: 'Only Advisors and Coordinators can view slot-change requests.' });
    }

    const search = parseStaffSearch(req.query.search);
    if (search.error) return res.status(400).json({ message: search.error });

    const filter = await buildStaffRequestFilter(access.filter, { search: search.term });
    const requests = filter
      ? await withListDetails(
          SlotChangeRequest.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .populate({
              path: 'student',
              select: 'fullName studentId assignedAdvisor',
              populate: { path: 'assignedAdvisor', select: 'fullName' },
            })
        )
      : [];

    res.status(200).json({ scope: access.scope, requests: requests.map(serializeStaffItem) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load slot-change requests', error: error.message });
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
        link: `/schedule/${student._id}`,
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
      created = await SlotChangeRequest.create({
        student: student._id,
        term: term._id,
        scheduleEntry: entry._id,
        course: course._id,
        offering: slot.offeringId._id,
        slotType: slot.slotType,
        currentSlot: slot._id,
        currentSlotSnapshot: snapshot,
        preferenceNote: input.preferenceNote,
      });
    } catch (error) {
      // The partial unique index catches a simultaneous duplicate submission.
      if (error?.code === 11000) {
        return res.status(409).json({ message: 'You already have a pending change request for this slot.' });
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

const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Course = require('../models/Course');
const GraduationPlan = require('../models/GraduationPlan');
const ExitExamRequest = require('../models/ExitExamRequest');
const { remainingCoursesFor } = require('../services/graduationPlanService');
const { validateRequest, applyDecision } = require('../services/exitExamRequestService');
const { notify } = require('../services/notificationService');
const { publishNotificationEvent } = require('../services/notificationEventService');
const { publishStudentNotification } = require('../services/studentNotificationService');

const requestSummary = (request) => ({
  id: request._id,
  status: request.status,
  student: request.student
    ? {
        id: request.student._id,
        fullName: request.student.fullName,
        studentId: request.student.studentId,
        major: request.student.major,
      }
    : null,
  advisor: request.advisor
    ? { id: request.advisor._id, fullName: request.advisor.fullName, email: request.advisor.email }
    : null,
  course: request.course
    ? { id: request.course._id, code: request.course.code, name: request.course.name }
    : null,
  reason: request.reason,
  responseNote: request.responseNote,
  submittedAt: request.createdAt,
  decidedAt: request.decidedAt,
  decidedBy: request.decidedBy
    ? { id: request.decidedBy._id, fullName: request.decidedBy.fullName }
    : null,
});

const requestPopulations = (query) =>
  query
    .populate('student', 'fullName studentId major')
    .populate('advisor', 'fullName email')
    .populate('course', 'code name')
    .populate('decidedBy', 'fullName');

const getStudentForUser = async (userId) => {
  const user = await User.findById(userId).select('email').lean();
  if (!user) return { error: { status: 404, message: 'User not found.' } };

  const student = await Student.findOne({ email: user.email });
  if (!student) return { error: { status: 404, message: 'No student record is linked to this account.' } };
  if (student.studentType !== 'Advising Student') {
    return { error: { status: 403, message: 'Exit-exam requests are only available to Advising Students.' } };
  }
  return { student };
};

/** Req 108: an Advisor requests an exit exam for the single failed course. */
exports.createRequest = async (req, res) => {
  try {
    const { planId, courseId, reason } = req.body ?? {};
    if (!mongoose.isValidObjectId(planId) || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Choose a valid graduation plan and failed course.' });
    }

    const plan = await GraduationPlan.findById(planId);
    if (!plan || String(plan.advisor) !== String(req.user.userId)) {
      return res.status(404).json({ message: 'Graduation plan not found.' });
    }
    if (plan.status !== 'Draft') {
      return res.status(409).json({ message: 'An exit-exam request can only be made from a draft plan.' });
    }

    const student = await Student.findById(plan.student);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const remaining = await remainingCoursesFor(student);
    const validationError = validateRequest({ student, remaining, courseId, reason });
    if (validationError) return res.status(400).json({ message: validationError });

    const course = await Course.findById(courseId).select('code name').lean();
    if (!course) return res.status(404).json({ message: 'Course not found.' });

    const existing = await ExitExamRequest.findOne({
      student: student._id,
      course: course._id,
    }).lean();
    if (existing) {
      return res.status(409).json({
        message:
          existing.status === 'Pending'
            ? 'An exit-exam request for this course is already awaiting a decision.'
            : existing.status === 'Rejected'
              ? 'This failed course was rejected for an exit exam; place it in a valid term.'
              : 'An exit exam for this course has already been approved.',
      });
    }

    const created = await ExitExamRequest.create({
      student: student._id,
      advisor: req.user.userId,
      course: course._id,
      reason: reason.trim(),
    });

    try {
      await publishNotificationEvent({
        name: 'exit_exam.action_required',
        entityId: created._id,
        occurrence: 'submitted',
        studentId: student._id,
        title: 'Exit-exam request needs review',
        message: `${student.fullName} (${student.studentId}) has an exit-exam request for ${course.code}.`,
        link: '/exit-exam-requests',
      });
    } catch (error) {
      console.error('[exit-exam] Could not queue Coordinator notification:', error.message);
    }

    res.status(201).json({
      message: 'The exit-exam request was submitted to the Coordinator.',
      request: requestSummary({
        ...created.toObject(),
        student,
        advisor: await User.findById(req.user.userId).select('fullName email').lean(),
        course,
      }),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'An exit-exam request for this failed course already exists.' });
    }
    res.status(500).json({ message: 'Could not submit the exit-exam request', error: error.message });
  }
};

/** The Advisor sees request status and Coordinator feedback in their plan. */
exports.listForPlan = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.planId)) {
      return res.status(404).json({ message: 'Graduation plan not found.' });
    }
    const plan = await GraduationPlan.findById(req.params.planId);
    if (!plan || String(plan.advisor) !== String(req.user.userId)) {
      return res.status(404).json({ message: 'Graduation plan not found.' });
    }

    const requests = await requestPopulations(
      ExitExamRequest.find({ student: plan.student }).sort({ createdAt: -1 })
    ).lean();
    res.status(200).json({ requests: requests.map(requestSummary) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load exit-exam requests', error: error.message });
  }
};

/** Req 109: the Coordinator's pending exit-exam review queue. */
exports.listPending = async (_req, res) => {
  try {
    const requests = await requestPopulations(
      ExitExamRequest.find({ status: 'Pending' }).sort({ createdAt: 1 })
    ).lean();
    res.status(200).json({ requests: requests.map(requestSummary) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load pending exit-exam requests', error: error.message });
  }
};

/** Req 109/115: decision notes are visible to the Advisor and requesting student. */
exports.decideRequest = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.requestId)) {
      return res.status(404).json({ message: 'Exit-exam request not found.' });
    }
    const request = await ExitExamRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Exit-exam request not found.' });

    const now = new Date();
    const error = applyDecision({
      request,
      decision: req.body?.decision,
      note: req.body?.note,
      coordinatorId: req.user.userId,
      now,
    });
    if (error) {
      return res.status(request.status === 'Pending' ? 400 : 409).json({ message: error });
    }

    const updated = await ExitExamRequest.findOneAndUpdate(
      { _id: request._id, status: 'Pending' },
      {
        $set: {
          status: request.status,
          responseNote: request.responseNote,
          decidedBy: request.decidedBy,
          decidedAt: request.decidedAt,
        },
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({ message: 'This exit-exam request has already been reviewed.' });
    }

    const [student, course] = await Promise.all([
      Student.findById(updated.student).select('fullName studentId email').lean(),
      Course.findById(updated.course).select('code').lean(),
    ]);
    if (student) {
      const decision = updated.status === 'Approved' ? 'approved' : 'rejected';
      const notice = {
        type: updated.status === 'Approved' ? 'success' : 'warning',
        title: `Exit-exam request ${decision}`,
        message: `The Coordinator ${decision} the request for ${course?.code ?? 'the failed course'}. ${updated.responseNote}`,
      };
      await notify(updated.advisor, { ...notice, link: '/graduation-plans' });
      try {
        await publishStudentNotification('exit_exam.decided', {
          entityId: updated._id,
          occurrence: updated.decidedAt.toISOString(),
          studentId: updated.student,
          decision: updated.status,
          reference: course?.code,
        });
      } catch (error) {
        console.error('[exit-exam] Could not queue student decision notification:', error.message);
      }
    }

    const populated = await requestPopulations(ExitExamRequest.findById(updated._id)).lean();
    res.status(200).json({
      message: `The exit-exam request was ${updated.status.toLowerCase()}.`,
      request: requestSummary(populated),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not record the exit-exam decision', error: error.message });
  }
};

/** Req 115: an Advising Student sees only their own request history. */
exports.listMine = async (req, res) => {
  try {
    const result = await getStudentForUser(req.user.userId);
    if (result.error) return res.status(result.error.status).json({ message: result.error.message });

    const requests = await requestPopulations(
      ExitExamRequest.find({ student: result.student._id }).sort({ createdAt: -1 })
    ).lean();
    res.status(200).json({ requests: requests.map(requestSummary) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load your exit-exam requests', error: error.message });
  }
};

const mongoose = require('mongoose');
const Student = require('../models/Student');
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');
const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const { CATEGORY_OPTIONS, applyDecision, validateRemovalRequest } = require('../services/mandatoryRemovalService');
const { parseListQuery, buildListFilter, advisorFilterOptions } = require('../services/mandatoryRemovalListService');
const { runInTransaction, removeCourseFromUnprocessedSchedule } = require('../services/advisingScheduleWorkflowService');
const { supportsTransactions, isTransactionUnsupportedError } = require('../services/transactionSupport');
const { publishNotificationEvent } = require('../services/notificationEventService');

const courseSummary = (course) =>
  course ? { id: course._id, code: course.code, name: course.name, creditHours: course.creditHours } : null;

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
  course: courseSummary(request.course),
  category: request.category,
  pairedCourse: courseSummary(request.pairedCourse),
  reason: request.reason,
  responseNote: request.responseNote,
  submittedAt: request.createdAt,
  decidedAt: request.decidedAt,
  decidedBy: request.decidedBy ? { id: request.decidedBy._id, fullName: request.decidedBy.fullName } : null,
});

const requestPopulations = (query) =>
  query
    .populate('student', 'fullName studentId major')
    .populate('advisor', 'fullName email')
    .populate('course', 'code name creditHours')
    .populate('pairedCourse', 'code name creditHours')
    .populate('decidedBy', 'fullName');

/** The advising student behind an id, or the error to answer with instead. */
const findAdvisingStudent = async (studentId) => {
  if (!mongoose.isValidObjectId(studentId)) {
    return { status: 400, message: 'That student link is not valid.' };
  }
  const student = await Student.findById(studentId);
  if (!student) return { status: 404, message: 'Student not found' };
  if (student.studentType !== 'Advising Student') {
    return { status: 400, message: 'Mandatory courses are only kept for Advising Students.' };
  }
  return { student };
};

const isAssignedTo = (student, userId) => String(student.assignedAdvisor ?? '') === String(userId);

/**
 * Req 64: an Advisor requests the removal of a mandatory course and provides
 * the reason.
 *
 * Only the student's assigned Advisor may ask, the course must be on the
 * student's mandatory list right now, and the stated case is checked against
 * the student's own record rather than taken on trust. The course stays
 * mandatory until a Coordinator approves the request (req 69).
 */
exports.createRequest = async (req, res) => {
  try {
    const { studentId, courseId, category, pairedCourseId, reason } = req.body ?? {};

    const { student, status, message } = await findAdvisingStudent(studentId);
    if (!student) return res.status(status).json({ message });

    if (!isAssignedTo(student, req.user.userId)) {
      return res
        .status(403)
        .json({ message: 'Only the student\'s assigned Advisor can request a mandatory-course removal.' });
    }

    if (!mongoose.isValidObjectId(courseId) || (pairedCourseId && !mongoose.isValidObjectId(pairedCourseId))) {
      return res.status(400).json({ message: 'Choose a valid mandatory course.' });
    }

    const [candidates, history] = await Promise.all([
      buildMandatoryCandidates(student),
      buildAcademicHistory(student),
    ]);

    const validationError = validateRemovalRequest({
      candidates,
      completedHours: history.summary.completedHours,
      courseId,
      category,
      pairedCourseId,
      reason,
    });
    if (validationError) return res.status(400).json({ message: validationError });

    const pending = await MandatoryRemovalRequest.findOne({
      student: student._id,
      course: courseId,
      status: 'Pending',
    }).lean();
    if (pending) {
      return res
        .status(409)
        .json({ message: 'A removal request for this course is already awaiting the Coordinator\'s decision.' });
    }

    const created = await MandatoryRemovalRequest.create({
      student: student._id,
      course: courseId,
      advisor: req.user.userId,
      category,
      pairedCourse: category === 'Restricted course pair in the same term' ? pairedCourseId : null,
      reason: reason.trim(),
    });

    const populated = await requestPopulations(MandatoryRemovalRequest.findById(created._id)).lean();

    // Req 120: the new Pending request needs a Coordinator decision. A durable
    // event keyed on this request, so a retried enqueue never notifies twice.
    // A side effect: a queueing failure never fails the saved request.
    try {
      await publishNotificationEvent({
        name: 'mandatory_removal.action_required',
        entityId: created._id,
        occurrence: 'submitted',
        studentId: student._id,
        title: 'Mandatory-course removal needs review',
        message: `${student.fullName} (${student.studentId}): removal of ${populated.course?.code ?? 'a mandatory course'} was requested (${category}).`,
        link: `/academic-history/${student._id}`,
      });
    } catch (error) {
      console.error('[mandatory-removal] Could not queue Coordinator notification:', error.message);
    }

    res.status(201).json({
      message: 'The removal request was sent to the Coordinator. The course stays mandatory until it is approved.',
      request: requestSummary(populated),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: 'A removal request for this course is already awaiting the Coordinator\'s decision.' });
    }
    res.status(500).json({ message: 'Could not submit the removal request', error: error.message });
  }
};

/**
 * One student's removal requests, newest first, with what the request form
 * needs: the valid cases and whether the caller may submit one. Advisors and
 * Coordinators can read it for any advising student, like the mandatory list
 * itself (req 61).
 */
exports.listForStudent = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId);
    if (!student) return res.status(status).json({ message });

    const requests = await requestPopulations(
      MandatoryRemovalRequest.find({ student: student._id }).sort({ createdAt: -1 })
    ).lean();

    res.status(200).json({
      requests: requests.map(requestSummary),
      categories: CATEGORY_OPTIONS,
      canRequest: req.user.role === 'Advisor' && isAssignedTo(student, req.user.userId),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the removal requests', error: error.message });
  }
};

/**
 * Req 65: a Coordinator views the list of mandatory-course removal requests,
 * newest first, whoever asked and whatever the student.
 *
 * Req 66: `?search=` narrows it to requests whose student ID or course code, or
 * whose Advisor's name or GUC email, contains the text (any case).
 *
 * Req 67: `?advisor=` (the Advisor who asked), `?status=` and
 * `?submittedFrom=` / `?submittedTo=` narrow it further. The search and every
 * filter combine with AND. The response also carries the Advisors the filter
 * offers, taken from all requests so choosing one does not shrink the choices.
 */
exports.listAll = async (req, res) => {
  try {
    const parsed = parseListQuery(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const { values } = parsed;

    const filter = await buildListFilter(values);
    const [requests, advisors] = await Promise.all([
      requestPopulations(MandatoryRemovalRequest.find(filter).sort({ createdAt: -1 })).lean(),
      advisorFilterOptions(),
    ]);

    res.status(200).json({
      requests: requests.map(requestSummary),
      search: values.search,
      filters: {
        status: values.status,
        advisor: values.advisor,
        submittedFrom: values.submittedFrom,
        submittedTo: values.submittedTo,
      },
      advisors,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the removal requests', error: error.message });
  }
};

/**
 * Req 68: one request, opened from the list (plain, searched or filtered). The
 * body is exactly a list row, read fresh from the database.
 */
exports.getOne = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That removal request id is not valid.' });
    }
    const request = await requestPopulations(MandatoryRemovalRequest.findById(req.params.id)).lean();
    if (!request) return res.status(404).json({ message: 'Removal request not found.' });

    res.status(200).json({ request: requestSummary(request) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the removal request', error: error.message });
  }
};

const TRANSACTIONS_UNAVAILABLE =
  'Approving a removal needs a database that supports transactions (a replica set), and this one does not. Nothing was changed.';
const TRANSACTIONS_UNCHECKED =
  'Could not reach the database to start the approval. Nothing was changed. Please try again shortly.';

/** A refusal that carries the status to answer with. */
class DecisionRefusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** The request as the screens show it, re-read after a decision (null if that read fails). */
const decidedRequest = async (id) => {
  try {
    const request = await requestPopulations(MandatoryRemovalRequest.findById(id)).lean();
    return request ? requestSummary(request) : null;
  } catch {
    return null;
  }
};

const decisionFields = (request) => ({
  status: request.status,
  responseNote: request.responseNote,
  decidedBy: request.decidedBy,
  decidedAt: request.decidedAt,
});

/**
 * Req 69: a Coordinator approves or rejects a Pending request and provides a
 * response note.
 *
 * Rejection changes only the request, so it is one guarded update (a request
 * decided meanwhile is refused, not overwritten). Approval also takes the
 * course off the mandatory list and out of any unprocessed schedule, which is
 * several records, so it runs in one transaction. Like req 48's decisions, it is
 * refused up front on a database without transactions and is never done partly.
 */
exports.decide = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Removal request not found.' });

    const request = await MandatoryRemovalRequest.findById(id);
    if (!request) return res.status(404).json({ message: 'Removal request not found.' });

    const wasPending = request.status === 'Pending';
    const error = applyDecision({
      request,
      decision: req.body?.decision,
      note: req.body?.note,
      coordinatorId: req.user.userId,
    });
    if (error) return res.status(wasPending ? 400 : 409).json({ message: error });

    const approve = request.status === 'Approved';
    if (approve) {
      let supported;
      try {
        supported = await supportsTransactions();
      } catch (checkError) {
        console.error('[mandatory-removal] Could not check transaction support:', checkError);
        return res.status(503).json({ message: TRANSACTIONS_UNCHECKED });
      }
      if (!supported) return res.status(503).json({ message: TRANSACTIONS_UNAVAILABLE });
    }

    const alreadyDecided = new DecisionRefusal(409, 'This removal request has already been decided.');
    if (approve) {
      await runInTransaction(async (session) => {
        const saved = await MandatoryRemovalRequest.findOneAndUpdate(
          { _id: request._id, status: 'Pending' },
          { $set: decisionFields(request) },
          { new: true, session }
        );
        if (!saved) throw alreadyDecided;
        await removeCourseFromUnprocessedSchedule({ studentId: saved.student, courseId: saved.course, session });
      });
    } else {
      const saved = await MandatoryRemovalRequest.findOneAndUpdate(
        { _id: request._id, status: 'Pending' },
        { $set: decisionFields(request) },
        { new: true }
      );
      if (!saved) throw alreadyDecided;
    }

    res.status(200).json({
      message: approve
        ? 'Removal approved. The course is no longer mandatory for this student.'
        : 'Removal rejected. The course stays mandatory for this student.',
      request: await decidedRequest(request._id),
    });
  } catch (error) {
    // DecisionRefusal here, or a refusal raised by the schedule workflow (e.g. the student is gone).
    if (Number.isInteger(error?.status)) return res.status(error.status).json({ message: error.message });
    if (isTransactionUnsupportedError(error)) return res.status(503).json({ message: TRANSACTIONS_UNAVAILABLE });
    console.error('[mandatory-removal] Decision failed:', error);
    res.status(500).json({ message: 'Could not save the decision. Nothing was changed.' });
  }
};

exports.requestSummary = requestSummary;
exports.requestPopulations = requestPopulations;

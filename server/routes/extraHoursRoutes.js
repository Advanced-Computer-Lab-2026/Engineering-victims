const router = require('express').Router();
const { z } = require('zod');
const mongoose = require('mongoose');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Request = require('../models/ExtraHoursRequest');
const { loadContext, evaluateSelection, submitRequest } = require('../services/extraHoursSubmissionService');
const { withdrawRequest } = require('../services/extraHoursWithdrawalService');
const { requestCancellation } = require('../services/extraHoursCancellationService');
const { requestHistory } = require('../services/extraHoursFinanceService');
const objectId = z.string().refine((value) => mongoose.isValidObjectId(value));
const selection = z.object({ studentId: objectId, termId: objectId,
  items: z.array(z.object({ courseId: objectId, requestedHours: z.number().int().min(1).max(12) }).strict()).min(1).max(34),
}).strict();
const submission = selection.extend({ submissionKey: z.string().uuid() });
// Coordinator review endpoints have their own role/account checks. Register
// before the Advisor-only submission middleware so FR 83 stays restricted.
router.use('/review', require('./extraHoursReviewRoutes'));
router.use('/mine', require('./extraHoursStudentRoutes'));
// Reqs 98-102, 127: Coordinator/Administrator financial records.
router.use('/finance', require('./extraHoursFinanceRoutes'));
router.use(authenticate, requireRole('Advisor'));
router.use(async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('role isActive');
    if (!user?.isActive || user.role !== 'Advisor') return res.status(403).json({ message: 'An active Advisor account is required.' });
    res.set('Cache-Control', 'no-store'); next();
  } catch { res.status(500).json({ message: 'Could not verify advisor access.' }); }
});
const handle = (action) => async (req, res) => {
  try { await action(req, res); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not complete the extra-hours request.', issues: error.issues }); }
};
router.get('/context/:studentId', handle(async (req, res) => {
  const parsed = z.object({ studentId: objectId, termId: objectId.optional() }).safeParse({ studentId: req.params.studentId, termId: req.query.termId });
  if (!parsed.success) return res.status(400).json({ message: 'Valid student and term identifiers are required.' });
  const context = await loadContext(parsed.data.studentId, parsed.data.termId);
  const requests = await Request.find({ student: req.params.studentId, requestingAdvisor: req.user.userId, term: context.term._id }).sort({ createdAt: -1 }).limit(10).lean();
  res.json({ student: { name: context.student.fullName, studentId: context.student.studentId }, termId: context.term._id,
    terms: context.terms.map((term) => ({ id: term._id, label: `${term.academicYear} ${term.season}` })),
    deadlinePassed: context.deadlinePassed, advisingDeadline: context.term.advisingDeadline,
    graduationVerified: Boolean(context.graduationAssessment), selectedHours: context.selectedCourses.reduce((sum, course) => sum + course.creditHours, 0),
    courses: [...context.courses.values()].map((course) => ({ id: course._id, code: course.code, name: course.name, creditHours: course.creditHours,
      alreadySelected: context.selectedCourses.some((selected) => String(selected._id) === String(course._id)) })),
    requests: requests.map((request) => ({ id: request._id, reference: request.reference, requestedHours: request.requestedHours, totalCost: request.totalCost, decision: request.decision,
      settlementStatus: request.settlementStatus, reversed: Boolean(request.reversal?.kind), cancellationRequestedAt: request.cancellationRequest?.requestedAt ?? null })),
  });
}));
router.post('/quote', handle(async (req, res) => {
  const parsed = selection.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Select valid courses and whole requested hours.' });
  const context = await loadContext(parsed.data.studentId, parsed.data.termId);
  res.json(evaluateSelection(context, parsed.data.items).quote);
}));
// Req 95: status and decision history of a request this Advisor submitted.
router.get('/:id/history', handle(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(400).json({ message: 'Invalid extra-hours request ID.' });
  res.json({ history: await requestHistory({ _id: req.params.id, requestingAdvisor: req.user.userId }) });
}));
router.post('/:id/withdraw', handle(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success || !z.object({}).strict().safeParse(req.body).success) {
    return res.status(400).json({ message: 'A valid request identifier and an empty body are required.' });
  }
  const request = await withdrawRequest(req.params.id, req.user.userId);
  res.json({ request: { id: request._id, decision: request.decision }, message: 'Request withdrawn. No hours were activated and no payment was taken.' });
}));
// Reqs 96, 102, 120: ask a Coordinator to refund or cancel an approved, settled request.
router.post('/:id/request-cancellation', handle(async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(5).max(1000) }).strict().safeParse(req.body);
  if (!objectId.safeParse(req.params.id).success || !parsed.success) {
    return res.status(400).json({ message: 'Give a reason of 5 to 1000 characters for cancelling this request.' });
  }
  const { request, replay } = await requestCancellation(req.params.id, req.user.userId, parsed.data.reason);
  res.status(replay ? 200 : 201).json({
    request: { id: request._id, decision: request.decision, settlementStatus: request.settlementStatus, cancellationRequestedAt: request.cancellationRequest.requestedAt },
    message: replay ? 'Cancellation was already requested. A Coordinator will refund or cancel the charge.'
      : 'Cancellation requested. A Coordinator will refund or cancel the charge; nothing changes until then.',
  });
}));
router.post('/', handle(async (req, res) => {
  const parsed = submission.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Valid request details and a submission key are required.' });
  const result = await submitRequest(req.user.userId, parsed.data);
  res.status(result.replay ? 200 : 201).json({ request: { id: result.request._id, reference: result.request.reference,
    requestedHours: result.request.requestedHours, totalCost: result.request.totalCost, decision: result.request.decision },
    message: 'Request submitted for coordinator review. No hours activated and no payment taken.' });
}));
module.exports = router;

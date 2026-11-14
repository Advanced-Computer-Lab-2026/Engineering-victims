const router = require('express').Router();
const { z } = require('zod');
const mongoose = require('mongoose');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Request = require('../models/ExtraHoursRequest');
const { loadContext, evaluateSelection, submitRequest } = require('../services/extraHoursSubmissionService');
const objectId = z.string().refine((value) => mongoose.isValidObjectId(value));
const selection = z.object({ studentId: objectId, termId: objectId,
  items: z.array(z.object({ courseId: objectId, requestedHours: z.number().int().min(1).max(12) }).strict()).min(1).max(34),
}).strict();
const submission = selection.extend({ submissionKey: z.string().uuid() });
// Coordinator read-only endpoints have their own role/account checks. Register
// before the Advisor-only submission middleware so FR 83 stays restricted.
router.use('/review', require('./extraHoursReviewRoutes'));
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
    requests: requests.map((request) => ({ id: request._id, reference: request.reference, requestedHours: request.requestedHours, totalCost: request.totalCost, decision: request.decision })),
  });
}));
router.post('/quote', handle(async (req, res) => {
  const parsed = selection.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Select valid courses and whole requested hours.' });
  const context = await loadContext(parsed.data.studentId, parsed.data.termId);
  res.json(evaluateSelection(context, parsed.data.items).quote);
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

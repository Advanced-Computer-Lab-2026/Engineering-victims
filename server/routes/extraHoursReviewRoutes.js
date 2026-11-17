const router = require('express').Router();
const mongoose = require('mongoose');
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Student = require('../models/Student');
const Request = require('../models/ExtraHoursRequest');
const { decideRequest } = require('../services/extraHoursDecisionService');
const { historyEvents } = require('../services/extraHoursFinanceService');

router.use(authenticate, requireRole('Coordinator'));
router.use(async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('role isActive');
    if (!user?.isActive || user.role !== 'Coordinator') return res.status(403).json({ message: 'An active Coordinator account is required.' });
    res.set('Cache-Control', 'no-store'); next();
  } catch { res.status(500).json({ message: 'Could not verify coordinator access.' }); }
});
const populate = (query) => query.populate('student', 'fullName email studentId')
  .populate('requestingAdvisor', 'fullName email').populate('term', 'academicYear season');
const summary = (request) => ({
  id: request._id, reference: request.reference,
  student: request.student ? { id: request.student._id, name: request.student.fullName, studentId: request.student.studentId, email: request.student.email } : null,
  requestingAdvisor: request.requestingAdvisor ? { id: request.requestingAdvisor._id, name: request.requestingAdvisor.fullName, email: request.requestingAdvisor.email } : null,
  term: request.term ? { id: request.term._id, label: `${request.term.academicYear} ${request.term.season}` } : null,
  requestedHours: request.requestedHours, totalCost: request.totalCost, currency: request.currency,
  decision: request.decision, settlementOption: request.settlementOption, settlementStatus: request.settlementStatus,
  submittedAt: request.createdAt,
});
router.get('/filter-options', async (req, res) => {
  try {
    const rows = await Request.find({}).select('requestingAdvisor').populate('requestingAdvisor', 'fullName email').lean();
    const advisors = new Map();
    for (const row of rows) if (row.requestingAdvisor) {
      const advisor = row.requestingAdvisor;
      advisors.set(String(advisor._id), { id: advisor._id, name: advisor.fullName, email: advisor.email });
    }
    res.json({ advisors: [...advisors.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  } catch { res.status(500).json({ message: 'Could not load requesting Advisors.' }); }
});
router.get('/', async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(32).regex(/^[0-9-]*$/).default(''),
    advisor: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
    decision: z.enum(['Pending', 'Approved', 'Rejected', 'Withdrawn']).optional(),
    settlementOption: z.enum(['Wallet', 'Gateway', 'Next Installment', 'Not selected']).optional(),
    settlementStatus: z.enum(['Not Applicable', 'Awaiting Payment Choice', 'Paid', 'Deferred to Next Installment', 'Failed', 'Cancelled', 'Refunded']).optional(),
  }).strict().safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Use valid pagination, student ID and filter values.' });
  try {
    const { page, limit, search } = parsed.data;
    const filter = {};
    const { advisor, decision, settlementOption, settlementStatus } = parsed.data;
    if (advisor) filter.requestingAdvisor = advisor;
    if (decision) filter.decision = decision;
    if (settlementOption) filter.settlementOption = settlementOption === 'Not selected' ? null : settlementOption;
    if (settlementStatus) filter.settlementStatus = settlementStatus;
    if (search) {
      // Digits/hyphens only: the search is literal, never arbitrary user regex.
      // Filter before pagination so totals and every page use the same scope.
      const students = await Student.find({ studentId: { $regex: search } }).select('_id').lean();
      filter.student = { $in: students.map((student) => student._id) };
    }
    // FR 84 includes every request, not just Pending or the coordinator's roster.
    const [requests, total] = await Promise.all([
      populate(Request.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
      Request.countDocuments(filter),
    ]);
    res.json({ requests: requests.map(summary), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch { res.status(500).json({ message: 'Could not load extra-hours requests.' }); }
});
router.post('/:requestId/decision', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.requestId)) return res.status(400).json({ message: 'Invalid extra-hours request ID.' });
  const parsed = z.object({ decision: z.enum(['Approved', 'Rejected']), responseNote: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Choose approve or reject and provide a response note of 1–2000 characters.' });
  try {
    const request = await decideRequest(req.params.requestId, req.user.userId, parsed.data);
    res.json({ request: { id: request._id, decision: request.decision, responseNote: request.responseNote,
      decidedAt: request.decidedAt, settlementStatus: request.settlementStatus },
      message: request.decision === 'Approved' ? 'Approved for settlement. Extra hours are not activated and no courses have been added.' : 'Request rejected.' });
  } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not record the decision.' }); }
});
router.get('/:requestId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.requestId)) return res.status(400).json({ message: 'Invalid extra-hours request ID.' });
  try {
    const request = await populate(Request.findById(req.params.requestId)).populate('history.actor', 'fullName role').lean();
    if (!request) return res.status(404).json({ message: 'Extra-hours request not found.' });
    res.json({ request: { ...summary(request),
      items: request.items.map((item) => ({ courseId: item.course, code: item.code, name: item.name,
        creditHours: item.creditHours, requestedHours: item.requestedHours, classification: item.classification,
        ratePerHour: item.ratePerHour, subtotal: item.subtotal })),
      // Historical snapshot, deliberately not relabelled as a current approval.
      eligibility: request.eligibility, eligibilityRecordedAt: request.createdAt,
      responseNote: request.responseNote, decidedAt: request.decidedAt,
      // Req 95: status and decision history.
      history: historyEvents(request.history),
    } });
  } catch { res.status(500).json({ message: 'Could not load extra-hours request details.' }); }
});
module.exports = router;

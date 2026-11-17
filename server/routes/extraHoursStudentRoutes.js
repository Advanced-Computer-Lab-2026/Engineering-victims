const router = require('express').Router();
const { z } = require('zod');
const mongoose = require('mongoose');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Student = require('../models/Student');
const Request = require('../models/ExtraHoursRequest');
const { payWallet, startCheckout, confirmCheckout, cancelCheckout } = require('../services/extraHoursPaymentService');
const { previewDeferral, confirmDeferral, serializeCharge } = require('../services/extraHoursDeferralService');
const { getDocument, renderDocument } = require('../services/extraHoursDocumentService');
const { listRecords, requestHistory } = require('../services/extraHoursFinanceService');

router.use(authenticate, requireRole('Student'));
router.use(async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('email role isActive').lean();
    if (!user?.isActive || user.role !== 'Student') return res.status(403).json({ message: 'An active Student account is required.' });
    const student = await Student.findOne({ email: user.email }).select('studentType isActive').lean();
    if (!student) return res.status(404).json({ message: 'No student record is linked to this account.' });
    if (!student.isActive || student.studentType !== 'Advising Student') return res.status(403).json({ message: 'Extra-hours requests are only available to active Advising Students.' });
    req.extraHoursStudent = student;
    res.set('Cache-Control', 'no-store'); next();
  } catch { res.status(500).json({ message: 'Could not verify your student account.' }); }
});
router.get('/', async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Use a valid page number.' });
  try {
    const student = req.extraHoursStudent;
    const { page } = parsed.data, limit = 20;
    const filter = { student: student._id, decision: 'Approved' };
    const [rows, total] = await Promise.all([
      Request.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('term', 'academicYear season')
        .populate({ path: 'deferredCharge', match: { student: student._id }, select: 'reference amount currency status confirmedAt installment installmentReference installmentLabel dueDate' })
        .populate({ path: 'gatewayAttempt', match: { student: student._id }, select: 'status checkoutGeneration' }).lean(),
      Request.countDocuments(filter),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ requests: rows.map((row) => ({ id: row._id, reference: row.reference, version: row.__v,
      term: row.term ? `${row.term.academicYear} ${row.term.season}` : 'Term unavailable',
      decision: row.decision, decidedAt: row.decidedAt, settlementStatus: row.settlementStatus,
      settlementPreference: row.settlementPreference ?? null,
      gatewayAttempt: row.gatewayAttempt?._id ?? row.gatewayAttempt ?? null, gatewayStatus: row.gatewayAttempt?.status ?? null,
      gatewayGeneration: row.gatewayAttempt?.checkoutGeneration ?? 0,
      paymentReference: row.paymentReference ?? null, activatedAt: row.activatedAt ?? null, activatedHours: row.activatedHours ?? 0,
      deferredCharge: row.deferredCharge?.reference ? serializeCharge(row.deferredCharge) : null,
      requestedHours: row.requestedHours, totalCost: row.totalCost, currency: row.currency,
      items: row.items.map((item) => ({ courseId: item.course, code: item.code, name: item.name,
        creditHours: item.creditHours, requestedHours: item.requestedHours, classification: item.classification,
        ratePerHour: item.ratePerHour, subtotal: item.subtotal })),
    })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch { res.status(500).json({ message: 'Could not load your approved extra-hours requests.' }); }
});
// Req 97: the signed-in student's own payments and deferred charges. The
// student comes from the session only, never from the query.
router.get('/finance', async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Use a valid page number.' });
  try { res.json(await listRecords({ student: req.extraHoursStudent._id }, { page: parsed.data.page, limit: 20 })); }
  catch { res.status(500).json({ message: 'Could not load your payment and deferred-charge history.' }); }
});
// Req 95: status and decision history of one of the student's own requests.
// Students only see requests after Coordinator approval (Req 88), so the same applies here.
router.get('/:id/history', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid extra-hours request ID.' });
  try { res.json({ history: await requestHistory({ _id: req.params.id, student: req.extraHoursStudent._id, decision: 'Approved' }) }); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not load the request history.' }); }
});
router.post('/:requestId/preference', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.requestId)) return res.status(400).json({ message: 'Invalid extra-hours request ID.' });
  const parsed = z.object({ preference: z.enum(['Pay Now', 'Next Installment']), version: z.number().int().min(0) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Choose a valid settlement preference and request version.' });
  try {
    const filter = { _id: req.params.requestId, student: req.extraHoursStudent._id, decision: 'Approved' };
    const row = await Request.findOne(filter).lean();
    if (!row) return res.status(404).json({ message: 'Approved extra-hours request not found.' });
    if (row.settlementStatus !== 'Awaiting Payment Choice' || row.settlementOption != null) return res.status(409).json({ message: 'This request is no longer awaiting a payment choice. Refresh to see its status.' });
    if (row.gatewayAttempt) return res.status(409).json({ message: 'A Stripe checkout already exists. Check that payment before changing your preference.' });
    if (row.__v !== parsed.data.version) return res.status(409).json({ message: 'The request changed. Refresh before choosing again.' });
    const preference = parsed.data.preference;
    if (row.settlementPreference !== preference) {
      const now = new Date();
      const updated = await Request.findOneAndUpdate({ ...filter, __v: row.__v, settlementStatus: 'Awaiting Payment Choice', settlementOption: null }, {
        $set: { settlementPreference: preference, settlementPreferenceAt: now }, $inc: { __v: 1 },
        $push: { history: { action: 'SettlementPreferenceSelected', actor: req.user.userId, note: preference, at: now } },
      }, { new: true, runValidators: true }).lean();
      if (!updated) return res.status(409).json({ message: 'The request changed. Refresh before choosing again.' });
    }
    res.json({ message: 'Preference saved. No payment or installment charge has been confirmed; your request remains Awaiting Payment Choice.' });
  } catch { res.status(500).json({ message: 'Could not save your settlement preference.' }); }
});
const paymentAction = (action) => async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !z.object({}).strict().safeParse(req.body).success) return res.status(400).json({ message: 'Use a valid payment link. Payment details are determined by the server.' });
  try { res.json(await action(req.params.id, req.extraHoursStudent._id, req.user.userId)); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not complete payment. Refresh and check its status before retrying.' }); }
};
router.post('/:id/pay-wallet', paymentAction(payWallet));
router.post('/:id/stripe-checkout', paymentAction((id, studentId) => startCheckout(id, studentId)));
router.post('/:id/retry-stripe', paymentAction((id, studentId) => startCheckout(id, studentId, true)));
router.post('/payments/:id/confirm', paymentAction((id, studentId) => confirmCheckout(id, studentId)));
router.post('/payments/:id/cancel', async (req, res) => {
  const parsed = z.object({ generation: z.number().int().min(0) }).strict().safeParse(req.body);
  if (!mongoose.isValidObjectId(req.params.id) || !parsed.success) return res.status(400).json({ message: 'Use a valid checkout attempt.' });
  try { res.json(await cancelCheckout(req.params.id, req.extraHoursStudent._id, parsed.data.generation)); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not check checkout cancellation. Refresh and check its status.' }); }
});
router.get('/:id/next-installment', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid extra-hours request ID.' });
  try { res.json(await previewDeferral(req.params.id, req.extraHoursStudent._id)); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not load the next installment.' }); }
});
router.post('/:id/defer', async (req, res) => {
  const parsed = z.object({ installmentId: z.string().regex(/^[a-fA-F0-9]{24}$/), version: z.number().int().min(0) }).strict().safeParse(req.body);
  if (!mongoose.isValidObjectId(req.params.id) || !parsed.success) return res.status(400).json({ message: 'Review a valid installment and request version before confirming.' });
  try { res.json(await confirmDeferral(req.params.id, req.extraHoursStudent._id, req.user.userId, parsed.data)); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not confirm deferral. Refresh and check its status before retrying.' }); }
});
router.get('/:id/document', async (req, res) => {
  const parsed = z.object({ format: z.enum(['json', 'pdf']).default('json') }).strict().safeParse(req.query);
  if (!mongoose.isValidObjectId(req.params.id) || !parsed.success) return res.status(400).json({ message: 'Use a valid document link and format.' });
  try {
    const document = await getDocument(req.params.id, req.extraHoursStudent._id);
    if (parsed.data.format === 'json') return res.json({ document });
    const pdf = await renderDocument(document);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="extra-hours-${document.kind.toLowerCase()}-${req.params.id}.pdf"` });
    res.send(pdf);
  } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not create the extra-hours document.' }); }
});
module.exports = router;

const router = require('express').Router();
const mongoose = require('mongoose');
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User'), Student = require('../models/Student');
const Plan = require('../models/InstallmentPlan'), Installment = require('../models/UniversityInstallment');
const { installmentDetails, assignPlan, recordEntry } = require('../services/installmentBillingService');
const id = z.string().regex(/^[a-fA-F0-9]{24}$/);
const money = z.number().finite().min(-10000000).max(10000000).refine((value) => (value === 0 || Math.abs(value) >= 0.01) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use at most two decimal places.');
const handle = (action) => async (req, res) => {
  try { await action(req, res); }
  catch (error) { res.status(error.code === 11000 ? 409 : error.status || 500).json({ message: error.code === 11000 ? 'This assignment or external payment reference already exists.' : error.status ? error.message : 'Could not complete the billing action.' }); }
};
router.use(authenticate, requireRole('Student', 'Coordinator', 'Administrator'));
// Recheck current account data; a stale JWT does not preserve staff privileges.
router.use(async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('role isActive email').lean();
    if (!user?.isActive || user.role !== req.user.role) return res.status(403).json({ message: 'An active account with the current role is required.' });
    if (user.role === 'Student') {
      const student = await Student.findOne({ email: user.email, isActive: true }).select('_id').lean();
      if (!student) return res.status(403).json({ message: 'An active student record is required.' });
      req.billingStudent = student._id;
    }
    res.set('Cache-Control', 'no-store'); next();
  } catch { res.status(500).json({ message: 'Could not verify billing access.' }); }
});
const staff = requireRole('Coordinator', 'Administrator');
router.get('/plans', staff, handle(async (req, res) => {
  const plans = await Plan.find({}).sort({ createdAt: -1 }).limit(100).select('name academicYear currency entries').lean();
  res.json({ plans: plans.map((plan) => ({ ...plan, id: plan._id })) });
}));
router.post('/plans', staff, handle(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), academicYear: z.string().regex(/^\d{4}\/\d{4}$/).refine((year) => Number(year.slice(5)) === Number(year.slice(0, 4)) + 1),
    entries: z.array(z.object({ label: z.string().trim().min(1).max(120), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date), baseAmount: money.refine((value) => value >= 0) }).strict()).min(1).max(12),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Provide a plan name, consecutive academic year, and 1–12 installments with valid dates and nonnegative amounts (two decimals maximum).' });
  const entries = parsed.data.entries;
  if (entries.some((entry, index) => index > 0 && entry.dueDate <= entries[index - 1].dueDate)) return res.status(400).json({ message: 'Installment dates must be in strictly increasing order.' });
  const plan = await Plan.create({ ...parsed.data, createdBy: req.user.userId });
  res.status(201).json({ id: plan._id, message: 'Installment plan created. Assign it to students to create their installments.' });
}));
router.get('/students', staff, handle(async (req, res) => {
  const parsed = z.object({ search: z.string().trim().min(2).max(80) }).strict().safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Enter at least two characters of the student ID, name or email.' });
  const literal = parsed.data.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await Student.find({ isActive: true, $or: ['studentId', 'fullName', 'email'].map((field) => ({ [field]: { $regex: literal, $options: 'i' } })) }).select('fullName studentId email').sort({ studentId: 1 }).limit(20).lean();
  res.json({ students: rows.map((row) => ({ id: row._id, name: row.fullName, studentId: row.studentId, email: row.email })) });
}));
router.post('/assign', staff, handle(async (req, res) => {
  const parsed = z.object({ studentId: id, planId: id }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Choose a valid student and plan.' });
  res.json(await assignPlan(parsed.data.studentId, parsed.data.planId, req.user.userId));
}));
router.get('/installments', handle(async (req, res) => {
  const parsed = z.object({ studentId: id.optional() }).strict().safeParse(req.query);
  if (!parsed.success || (req.billingStudent && parsed.data.studentId)) return res.status(400).json({ message: 'Use the signed-in student account or a valid staff student selection.' });
  const studentId = req.billingStudent || parsed.data.studentId;
  if (!studentId) return res.status(400).json({ message: 'Choose a student first.' });
  const rows = await Installment.find({ student: studentId }).sort({ dueDate: 1, _id: 1 }).lean();
  const installments = [];
  for (const row of rows) installments.push(await installmentDetails(row));
  res.json({ installments });
}));
router.post('/installments/:id/entries', staff, handle(async (req, res) => {
  const parsed = z.object({ kind: z.enum(['Adjustment', 'Payment']), amount: money.refine((value) => value !== 0), reason: z.string().trim().min(1).max(1000), externalReference: z.string().trim().min(1).max(120).optional(), submissionKey: z.string().uuid() }).strict().safeParse(req.body);
  if (!mongoose.isValidObjectId(req.params.id) || !parsed.success || (parsed.data.kind === 'Payment' && (!parsed.data.externalReference || parsed.data.amount <= 0)) || (parsed.data.kind === 'Adjustment' && parsed.data.externalReference)) return res.status(400).json({ message: 'Provide a nonzero amount (two decimals maximum), reason and submission key. Payments also require a positive amount and external payment reference.' });
  res.json(await recordEntry(req.params.id, req.user.userId, parsed.data));
}));
module.exports = router;

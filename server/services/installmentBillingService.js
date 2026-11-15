const { createHash } = require('crypto');
const Plan = require('../models/InstallmentPlan');
const Assignment = require('../models/InstallmentPlanAssignment');
const Installment = require('../models/UniversityInstallment');
const Ledger = require('../models/InstallmentLedgerEntry');
const Charge = require('../models/DeferredExtraHoursCharge');
const Student = require('../models/Student');
const { atomic } = require('./extraHoursPaymentService');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const cents = (value) => Math.round(value * 100);
async function lockBillingStudent(id, session) {
  const result = await Student.updateOne({ _id: id, isActive: true }, { $inc: { __v: 1 } }, { session });
  if (!result.matchedCount) throw fail('An active student is required.', 404);
}
async function installmentDetails(installment, session = null) {
  const entries = await Ledger.find({ installment: installment._id }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
  const charges = await Charge.find({ installment: installment._id }).sort({ confirmedAt: 1 }).session(session).lean();
  const adjustments = entries.filter((entry) => entry.kind === 'Adjustment').reduce((sum, entry) => sum + cents(entry.amount), 0);
  const paid = entries.filter((entry) => entry.kind === 'Payment').reduce((sum, entry) => sum + cents(entry.amount), 0);
  const deferred = charges.filter((charge) => charge.status !== 'Cancelled').reduce((sum, charge) => sum + cents(charge.amount), 0);
  const total = cents(installment.baseAmount || 0) + adjustments + deferred;
  return { id: installment._id, reference: installment.reference, label: installment.label, academicYear: installment.academicYear,
    dueDate: installment.dueDate, currency: installment.currency, baseAmount: installment.baseAmount || 0,
    adjustments: adjustments / 100, deferredAmount: deferred / 100, total: total / 100, paid: paid / 100,
    amountDue: installment.status === 'Cancelled' ? 0 : Math.max(0, total - paid) / 100,
    status: installment.status === 'Cancelled' ? 'Cancelled' : paid >= total ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Outstanding',
    entries: entries.map((entry) => ({ id: entry._id, kind: entry.kind, amount: entry.amount, reason: entry.reason, externalReference: entry.externalReference, recordedAt: entry.createdAt })),
    charges: charges.map((charge) => ({ reference: charge.reference, amount: charge.amount, status: charge.status, confirmedAt: charge.confirmedAt })),
  };
}
async function assignPlan(studentId, planId, actor) {
  return atomic(async (session) => {
    await lockBillingStudent(studentId, session);
    const plan = await Plan.findById(planId).session(session).lean();
    if (!plan) throw fail('Installment plan not found.', 404);
    const existing = await Assignment.findOne({ student: studentId, academicYear: plan.academicYear }).session(session).lean();
    if (existing) {
      if (String(existing.plan) !== planId) throw fail('This student already has a different plan for that academic year.');
      return { message: 'This plan is already assigned. Tuition was not duplicated.' };
    }
    const [assignment] = await Assignment.create([{ student: studentId, plan: plan._id, academicYear: plan.academicYear, assignedBy: actor }], { session });
    await Installment.create(plan.entries.map((entry, index) => ({ student: studentId, assignment: assignment._id, academicYear: plan.academicYear,
      sequence: index + 1, label: entry.label, dueDate: entry.dueDate, baseAmount: entry.baseAmount, createdBy: actor,
      status: entry.baseAmount === 0 ? 'Paid' : 'Scheduled' })), { session, ordered: true });
    return { message: 'Plan assigned. The student installments are ready.' };
  });
}
async function recordEntry(installmentId, actor, body) {
  const fingerprint = createHash('sha256').update(JSON.stringify({ installmentId, kind: body.kind, amount: body.amount, reason: body.reason, externalReference: body.externalReference || null })).digest('hex');
  return atomic(async (session) => {
    const existing = await Ledger.findOne({ actor, submissionKey: body.submissionKey }).session(session).lean();
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw fail('This submission key was already used for different billing details.');
      return { message: 'This entry was already recorded. It was not duplicated.' };
    }
    const installment = await Installment.findById(installmentId).session(session).lean();
    if (!installment) throw fail('Installment not found.', 404);
    if (installment.status === 'Cancelled') throw fail('A cancelled installment cannot receive entries.');
    await lockBillingStudent(installment.student, session);
    const before = await installmentDetails(installment, session);
    if (body.kind === 'Payment' && (body.amount <= 0 || cents(body.amount) > cents(before.amountDue))) throw fail('Payment must be positive and cannot exceed the outstanding installment balance.', 422);
    const newTotal = cents(before.total) + (body.kind === 'Adjustment' ? cents(body.amount) : 0);
    const newPaid = cents(before.paid) + (body.kind === 'Payment' ? cents(body.amount) : 0);
    if (newTotal < newPaid || newTotal < 0) throw fail('The adjustment cannot reduce the installment below payments already received.', 422);
    await Ledger.create([{ installment: installmentId, ...body, actor, fingerprint }], { session });
    await Installment.updateOne({ _id: installmentId }, { $set: { status: newPaid >= newTotal ? 'Paid' : 'Scheduled' }, $inc: { __v: 1 } }, { session });
    if (newPaid >= newTotal) await Charge.updateMany({ installment: installmentId, status: 'Outstanding' }, { $set: { status: 'Paid' } }, { session });
    return { message: body.kind === 'Payment' ? 'External installment payment recorded. No wallet or card was charged.' : 'Student-specific adjustment recorded.' };
  });
}
module.exports = { installmentDetails, assignPlan, recordEntry, lockBillingStudent };

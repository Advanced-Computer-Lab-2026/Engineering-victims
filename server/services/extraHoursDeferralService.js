const Installment = require('../models/UniversityInstallment');
const Charge = require('../models/DeferredExtraHoursCharge');
const Payment = require('../models/ExtraHoursPayment');
const Request = require('../models/ExtraHoursRequest');
const { atomic, owned, payable, lockStudent } = require('./extraHoursPaymentService');
const { prepareActivation, applyActivation } = require('./extraHoursActivationService');
const { publishStudentNotification } = require('./studentNotificationService');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const serializeCharge = (charge) => ({ reference: charge.reference, amount: charge.amount, currency: charge.currency,
  status: charge.status, confirmedAt: charge.confirmedAt,
  installment: { id: charge.installment, reference: charge.installmentReference, label: charge.installmentLabel, dueDate: charge.dueDate } });
async function nextInstallment(studentId, session = null) {
  return Installment.findOne({ student: studentId, status: 'Scheduled', dueDate: { $gt: new Date() } }).sort({ dueDate: 1, _id: 1 }).session(session).lean();
}
async function previewDeferral(requestId, studentId) {
  const row = await owned(requestId, studentId, null); payable(row);
  if (row.gatewayAttempt) throw fail('A Stripe checkout already exists. Check that payment before changing settlement method.');
  const installment = await nextInstallment(studentId);
  if (!installment) throw fail('No upcoming university installment is configured. Ask the Coordinator to add your next installment before confirming.');
  return { version: row.__v, amount: row.totalCost, currency: row.currency,
    installment: { id: installment._id, reference: installment.reference, label: installment.label, dueDate: installment.dueDate } };
}
async function confirmDeferral(requestId, studentId, actor, { installmentId, version }) {
  return atomic(async (session) => {
    const row = await owned(requestId, studentId, session);
    if (row.settlementStatus === 'Deferred to Next Installment') {
      const charge = await Charge.findOne({ request: row._id, student: studentId }).session(session).lean();
      if (!charge || String(charge.installment) !== installmentId) throw fail('This request already has a different deferred charge. Refresh to see its details.');
      return { message: 'This request is already deferred. No additional charge was created.', charge: serializeCharge(charge) };
    }
    payable(row);
    if (row.__v !== version || row.settlementPreference !== 'Next Installment') throw fail('The request changed. Select Next installment and review the confirmation again.');
    if (row.gatewayAttempt) throw fail('A Stripe checkout already exists. Check that payment before deferring.');
    await lockStudent(studentId, session);
    if (await Payment.exists({ request: row._id }).session(session)) throw fail('A payment for this request already exists. Deferral cannot also charge a payment.');
    const installment = await nextInstallment(studentId, session);
    if (!installment || String(installment._id) !== installmentId) throw fail('The next installment changed or is unavailable. Review the confirmation again.');
    const plan = await prepareActivation(row, session);
    // Serialize against closing this installment or scheduling an earlier one.
    const touched = await Installment.updateOne({ _id: installment._id, status: 'Scheduled', dueDate: { $gt: new Date() }, __v: installment.__v }, { $inc: { __v: 1 } }, { session });
    if (!touched.modifiedCount) throw fail('The installment changed. Review the confirmation again.');
    const now = new Date();
    const [charge] = await Charge.create([{ request: row._id, student: studentId, installment: installment._id,
      installmentReference: installment.reference, installmentLabel: installment.label, dueDate: installment.dueDate,
      amount: row.totalCost, currency: row.currency, confirmedAt: now, confirmedBy: actor }], { session });
    await applyActivation(row, plan, session);
    const updated = await Request.updateOne({ _id: row._id, settlementStatus: 'Awaiting Payment Choice', __v: version }, {
      $set: { settlementStatus: 'Deferred to Next Installment', settlementOption: 'Next Installment', deferredCharge: charge._id,
        activatedAt: now, activatedHours: row.requestedHours }, $inc: { __v: 1 },
      $push: { history: { action: 'Deferred to Next Installment', actor, at: now, note: `${charge.reference}: ${installment.reference}` } },
    }, { session });
    if (!updated.modifiedCount) throw fail('The request changed while confirming. Please refresh.');
    await publishStudentNotification('charge.deferred', { entityId: charge._id, occurrence: 'confirmed', studentId, amount: charge.amount, reference: charge.reference }, { session });
    return { message: 'Amount added to your next installment. Your approved extra hours and courses are active. No wallet or gateway payment was taken.', charge: serializeCharge(charge) };
  });
}
module.exports = { nextInstallment, previewDeferral, confirmDeferral, serializeCharge };

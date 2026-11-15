const Student = require('../models/Student');
const WalletTransaction = require('../models/WalletTransaction');
const { publishNotificationEvent } = require('./notificationEventService');

// FR 117: templates own wording and destinations. Internal workflow producers
// must authorize their action and derive ownership from the persisted request.
// There is intentionally no endpoint accepting event names or recipients.
const TEMPLATES = Object.freeze({
  'swap.opened': { title: 'Your group swap is open', message: 'Your group-based schedule swap request is open and waiting for a matching partner.', link: '/schedule' },
  'swap.completed': { title: 'Group swap completed', message: 'Your group-based schedule swap is complete. Your updated schedule is available.', link: '/schedule' },
  'schedule.review_ready': { title: 'Your advising schedule is ready for review', message: 'Your advisor has completed your schedule. Open My Schedule to review it.', link: '/schedule' },
  'slot_change.decided': { title: 'Slot-change decision', message: 'Your slot-change request has been {decision}.', link: '/schedule', decision: true },
  'schedule.processed': { title: 'Your schedule has been processed', message: 'Your processed schedule is ready to view in My Schedule.', link: '/schedule' },
  'schedule.reopened': { title: 'Your schedule has been reopened', message: 'Your schedule was reopened for changes. Your advisor will prepare it again.', link: '/schedule' },
  'extra_hours.decided': { title: 'Extra-hours decision', message: 'Your extra-hours request has been {decision}.', link: '/wallet', decision: true },
  'payment.completed': { title: 'Payment completed', message: 'Your payment of {amount} EGP has been recorded.', link: '/wallet', money: true },
  'charge.deferred': { title: 'Charge deferred', message: 'Your charge of {amount} EGP has been deferred to the next installment.', link: '/wallet', money: true },
  'refund.completed': { title: 'Refund credited to your wallet', message: 'Your refund of {amount} EGP has been credited to your wallet.', link: '/wallet', money: true },
  'graduation_plan.decided': { title: 'Graduation-plan decision', message: 'Your graduation-plan request has been {decision}.', link: '/notifications', decision: true },
  'exit_exam.decided': { title: 'Exit-exam decision', message: 'Your exit-exam request has been {decision}.', link: '/notifications', decision: true },
});

function buildStudentNotification(name, { entityId, occurrence, decision, amount, reference } = {}) {
  if (!Object.hasOwn(TEMPLATES, name)) throw new Error('Unknown FR 117 student event');
  if (!entityId || occurrence == null || !String(occurrence).trim()) throw new Error('A persisted entity and action occurrence are required');
  const template = TEMPLATES[name];
  let message = template.message;
  if (template.decision) {
    if (!['Approved', 'Rejected'].includes(decision)) throw new Error('A final Approved or Rejected decision is required');
    message = message.replace('{decision}', decision.toLowerCase());
  }
  if (template.money) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new Error('A positive finite amount is required');
    message = message.replace('{amount}', amount.toFixed(2));
  }
  if (reference != null) {
    if (typeof reference !== 'string' || !reference.trim() || reference.length > 100 || /[\r\n]/.test(reference)) throw new Error('Invalid request reference');
    message += ` Reference: ${reference.trim()}.`;
  }
  return { name, entityId: String(entityId), occurrence: String(occurrence), title: template.title, message, link: template.link };
}

// For future request models, enqueue in the same transaction as the successful
// decision/action. The owner must come from that model, never an HTTP body.
async function publishStudentNotification(name, source, { session } = {}) {
  const event = buildStudentNotification(name, source);
  return publishNotificationEvent({ ...event, studentId: source.studentId }, { session });
}

// Persist this alongside an existing Student mutation on standalone MongoDB.
// No notification is delivered until that student's save succeeds.
function queueStudentNotification(student, name, source) {
  const event = buildStudentNotification(name, source);
  if (!student.pendingNotificationEvents) student.pendingNotificationEvents = [];
  student.pendingNotificationEvents.push(event);
  return event;
}

// A crash between publishing and acknowledging simply republishes the same key.
// Never rerun a financial or scheduling mutation to retry its notification.
async function flushStudentNotifications({ onError = console.error } = {}) {
  const students = await Student.find({ 'pendingNotificationEvents.0': { $exists: true } })
    .select('pendingNotificationEvents').limit(25);
  for (const student of students) {
    for (const pending of student.pendingNotificationEvents.slice(0, 25)) {
      try {
        await publishNotificationEvent({
          name: pending.name, entityId: pending.entityId, occurrence: pending.occurrence,
          title: pending.title, message: pending.message, link: pending.link, studentId: student._id,
        });
        await Student.updateOne({ _id: student._id }, { $pull: { pendingNotificationEvents: { _id: pending._id } } });
      } catch { onError('[notifications] Student event remains pending:', String(pending._id)); }
    }
  }
  const transactions = await WalletTransaction.find({ notificationPending: true }).limit(25);
  for (const transaction of transactions) {
    try {
      await publishStudentNotification(transaction.type === 'Refund' ? 'refund.completed' : 'payment.completed', {
        entityId: transaction._id, occurrence: 'recorded', studentId: transaction.student,
        amount: transaction.amount, reference: transaction.requestReference || transaction.paymentReference || undefined,
      });
      await WalletTransaction.updateOne({ _id: transaction._id }, { $set: { notificationPending: false } });
    } catch { onError('[notifications] Wallet event remains pending:', String(transaction._id)); }
  }
}

module.exports = { TEMPLATES, buildStudentNotification, publishStudentNotification, queueStudentNotification, flushStudentNotifications };

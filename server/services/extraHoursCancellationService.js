const Request = require('../models/ExtraHoursRequest');
const Payment = require('../models/ExtraHoursPayment');
const Student = require('../models/Student');
const User = require('../models/User');
const { publishNotificationEvent } = require('./notificationEventService');

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const SETTLED = ['Paid', 'Deferred to Next Installment'];
const money = (amount) => `EGP ${Number(amount).toLocaleString('en-US')}`;

/**
 * Req 120: the Req 102 finance record a Coordinator must act on. Paid requests
 * are refunded through their successful payment; deferred requests are
 * cancelled through their outstanding charge.
 */
async function reversalTarget(request) {
  if (request.settlementStatus === 'Paid') {
    const payment = await Payment.findOne({ request: request._id, status: 'Succeeded' }).select('_id').lean();
    return payment ? { kind: 'payment', id: payment._id } : null;
  }
  return request.deferredCharge ? { kind: 'deferred', id: request.deferredCharge } : null;
}

/**
 * Req 120: tell active Coordinators that a financial reversal needs action.
 * The occurrence is the persisted request time, so retries and replays reuse
 * one event key and never produce a second notification.
 */
async function notifyCoordinatorsOfCancellation(request) {
  const [student, advisor, target] = await Promise.all([
    Student.findById(request.student).select('fullName studentId').lean(),
    User.findById(request.cancellationRequest.requestedBy).select('fullName').lean(),
    reversalTarget(request),
  ]);
  const action = request.settlementStatus === 'Paid'
    ? `refund ${money(request.totalCost)} to the student's wallet`
    : `remove the ${money(request.totalCost)} deferred charge from the next installment`;
  return publishNotificationEvent({
    name: 'financial_reversal.action_required',
    entityId: request._id,
    occurrence: `cancellation:${new Date(request.cancellationRequest.requestedAt).toISOString()}`,
    studentId: request.student,
    title: 'Extra-hours refund or cancellation needs action',
    message: `${advisor?.fullName ?? 'An Advisor'} asked to cancel ${request.reference} for ${student?.fullName ?? 'a student'}`
      + `${student?.studentId ? ` (${student.studentId})` : ''}. Review it and ${action}.`,
    link: target ? `/extra-hours-finance?recordKind=${target.kind}&recordId=${target.id}` : '/extra-hours-finance',
  });
}

/**
 * Req 96 + 102 + 120: the requesting Advisor asks for an approved, settled
 * request to be cancelled. Nothing financial changes here; a Coordinator or
 * Administrator performs the refund or charge cancellation afterwards.
 * Repeating the request is a safe replay: same record, same notification key.
 */
async function requestCancellation(requestId, advisorId, reason) {
  const now = new Date();
  let request = await Request.findOneAndUpdate({
    _id: requestId, requestingAdvisor: advisorId, decision: 'Approved',
    settlementStatus: { $in: SETTLED }, 'reversal.kind': null, 'cancellationRequest.requestedAt': null,
  }, {
    $set: { cancellationRequest: { reason, requestedBy: advisorId, requestedAt: now } },
    $inc: { __v: 1 },
    $push: { history: { action: 'CancellationRequested', actor: advisorId, at: now, note: reason } },
  }, { new: true, runValidators: true }).lean();
  let replay = false;
  if (!request) {
    const current = await Request.findOne({ _id: requestId, requestingAdvisor: advisorId }).lean();
    if (!current) throw fail('Extra-hours request not found.', 404);
    if (current.reversal?.kind) throw fail('This request has already been refunded or cancelled.');
    if (!current.cancellationRequest?.requestedAt) {
      throw fail(`Only an approved request that is Paid or Deferred to Next Installment can be cancelled. This request is ${current.decision}, ${current.settlementStatus}.`);
    }
    request = current;
    replay = true;
  }
  let notified = true;
  try {
    await notifyCoordinatorsOfCancellation(request);
  } catch (error) {
    notified = false;
    console.error('[extra-hours] Could not queue Coordinator reversal notification:', error.message);
  }
  return { request, replay, notified };
}

module.exports = { requestCancellation, notifyCoordinatorsOfCancellation, reversalTarget };

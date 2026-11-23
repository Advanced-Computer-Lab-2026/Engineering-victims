const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Payment = require('../models/ExtraHoursPayment');
const Charge = require('../models/DeferredExtraHoursCharge');
const Request = require('../models/ExtraHoursRequest');
const Student = require('../models/Student');
const Schedule = require('../models/StudentSchedule');
const Slot = require('../models/CourseSlot');
const { recordTransaction } = require('./walletService');
const { atomic } = require('./extraHoursPaymentService');

/**
 * Reqs 97-102, 127: extra-hours financial records.
 *
 * A "financial record" is one payment (Wallet or Gateway) or one deferred
 * charge (Next Installment). Both collections are merged into one list so
 * the list (98), search (99), filter (100), export (127) and the student's
 * own history (97) all use the exact same query.
 */
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const OPTIONS = ['Wallet', 'Gateway', 'Next Installment'];
const PAYMENT_STATUSES = ['Pending', 'Succeeded', 'Failed', 'Cancelled', 'RefundRequired', 'Refunded'];
const CHARGE_STATUSES = ['Outstanding', 'Paid', 'Cancelled'];
const STATUSES = [...new Set([...PAYMENT_STATUSES, ...CHARGE_STATUSES])];
const KINDS = { payment: Payment, deferred: Charge };
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pipeline({ student, search, from, to, settlementOption, status } = {}) {
  const base = (kind, option, date) => [
    ...(student ? [{ $match: { student: new mongoose.Types.ObjectId(String(student)) } }] : []),
    { $project: { kind: { $literal: kind }, student: 1, request: 1, amount: 1, currency: 1, reference: 1, status: 1,
      settlementOption: option, date } },
  ];
  const stages = [
    ...base('payment', '$method', { $ifNull: ['$paidAt', '$createdAt'] }),
    { $unionWith: { coll: Charge.collection.name, pipeline: base('deferred', { $literal: 'Next Installment' }, '$confirmedAt') } },
  ];
  const match = {};
  if (settlementOption) match.settlementOption = settlementOption;
  if (status) match.status = status;
  if (from || to) match.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (Object.keys(match).length) stages.push({ $match: match });
  stages.push(
    { $lookup: { from: Student.collection.name, localField: 'student', foreignField: '_id', as: 'studentDoc' } },
    { $lookup: { from: Request.collection.name, localField: 'request', foreignField: '_id', as: 'requestDoc' } },
    { $set: { studentDoc: { $first: '$studentDoc' }, requestDoc: { $first: '$requestDoc' } } },
    { $project: { kind: 1, student: 1, request: 1, amount: 1, currency: 1, reference: 1, status: 1, settlementOption: 1, date: 1,
      'studentDoc._id': 1, 'studentDoc.fullName': 1, 'studentDoc.studentId': 1, 'studentDoc.email': 1,
      'requestDoc._id': 1, 'requestDoc.reference': 1 } },
  );
  if (search) {
    // Literal text only. Request ID = the request's EHR reference or its database id.
    const text = new RegExp(escape(search), 'i');
    const or = [{ 'studentDoc.studentId': text }, { 'requestDoc.reference': text }, { reference: text }];
    if (mongoose.isValidObjectId(search)) or.push({ request: new mongoose.Types.ObjectId(search) });
    stages.push({ $match: { $or: or } });
  }
  stages.push({ $sort: { date: -1, _id: -1 } });
  return stages;
}

const serialize = (row) => ({
  id: row._id, kind: row.kind,
  student: row.studentDoc ? { id: row.studentDoc._id, name: row.studentDoc.fullName, studentId: row.studentDoc.studentId, email: row.studentDoc.email } : null,
  request: row.requestDoc ? { id: row.requestDoc._id, reference: row.requestDoc.reference } : null,
  amount: row.amount, currency: row.currency, settlementOption: row.settlementOption,
  reference: row.reference, date: row.date, status: row.status,
});

async function listRecords(query, { page = 1, limit = 20 } = {}) {
  const [result] = await Payment.aggregate([...pipeline(query), { $facet: {
    rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } }]);
  const total = result.count[0]?.total ?? 0;
  return { records: result.rows.map(serialize), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// Req 127: every matching row, same query as the list, capped to keep the file sane.
const EXPORT_LIMIT = 5000;
async function exportRecords(query) {
  const rows = await Payment.aggregate([...pipeline(query), { $limit: EXPORT_LIMIT + 1 }]);
  if (rows.length > EXPORT_LIMIT) throw fail(`More than ${EXPORT_LIMIT} records match. Narrow the filters before exporting.`, 422);
  return rows.map(serialize);
}
const csvCell = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // stop spreadsheet formulas
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
function toCsv(records) {
  const head = ['Student name', 'Student ID', 'Request ID', 'Amount', 'Currency', 'Settlement option', 'Transaction or deferred-charge reference', 'Date', 'Status'];
  const lines = records.map((r) => [r.student?.name, r.student?.studentId, r.request?.reference, r.amount, r.currency, r.settlementOption, r.reference,
    r.date ? new Date(r.date).toISOString() : '', r.status].map(csvCell).join(','));
  return `﻿${[head.join(','), ...lines].join('\r\n')}\r\n`;
}

// Req 95: readable history of a request, oldest first.
const ACTION_LABELS = {
  Submitted: 'Submitted by the Advisor', Approved: 'Approved by the Coordinator', Rejected: 'Rejected by the Coordinator',
  Withdrawn: 'Withdrawn by the Advisor', SettlementPreferenceSelected: 'Payment choice selected', Paid: 'Paid',
  'Deferred to Next Installment': 'Deferred to next installment', StripePaymentFailed: 'Gateway payment failed',
  StripePaymentCancelled: 'Gateway payment cancelled', StripePaymentRetried: 'Gateway payment retried',
  PaymentRefunded: 'Gateway payment refunded automatically', Cancelled: 'Request cancelled', Refunded: 'Refunded to wallet',
  'Deferred Charge Cancelled': 'Deferred charge removed from installment',
  CancellationRequested: 'Cancellation requested by the Advisor',
};
// Expects `history.actor` populated with fullName and role.
const historyEvents = (history = []) => history.slice().sort((a, b) => new Date(a.at) - new Date(b.at)).map((entry) => ({
  action: entry.action, label: ACTION_LABELS[entry.action] || entry.action, note: entry.note || null, at: entry.at,
  actor: entry.actor?.fullName ? { name: entry.actor.fullName, role: entry.actor.role } : null,
}));
async function requestHistory(filter) {
  const request = await Request.findOne(filter).populate('history.actor', 'fullName role').populate('decidedBy', 'fullName').lean();
  if (!request) throw fail('Extra-hours request not found.', 404);
  return {
    id: request._id, reference: request.reference, decision: request.decision, responseNote: request.responseNote,
    decidedAt: request.decidedAt, decidedBy: request.decidedBy?.fullName ?? null,
    settlementStatus: request.settlementStatus, settlementOption: request.settlementOption, submittedAt: request.createdAt,
    events: historyEvents(request.history),
  };
}

// Req 102: why a record can or cannot be refunded or cancelled.
function reversalCheck(kind, record, request) {
  if (!request) return { eligible: false, reason: 'The related request no longer exists.' };
  if (request.reversal?.kind) return { eligible: false, reason: `Already reversed (${request.reversal.kind}).` };
  if (kind === 'payment') {
    if (record.status === 'Refunded') return { eligible: false, reason: 'This payment has already been refunded.' };
    if (record.status !== 'Succeeded') return { eligible: false, reason: `Only a successful payment can be refunded. This payment is ${record.status}.` };
    if (request.settlementStatus !== 'Paid') return { eligible: false, reason: `The request is ${request.settlementStatus}, not Paid.` };
    return { eligible: true, action: 'Refund', reason: null };
  }
  if (record.status === 'Paid') return { eligible: false, reason: 'This deferred charge was already paid through the installment, so it cannot be cancelled.' };
  if (record.status !== 'Outstanding') return { eligible: false, reason: `Only an unpaid (Outstanding) deferred charge can be cancelled. This charge is ${record.status}.` };
  if (request.settlementStatus !== 'Deferred to Next Installment') return { eligible: false, reason: `The request is ${request.settlementStatus}, not deferred.` };
  return { eligible: true, action: 'Cancel', reason: null };
}

// Req 101: one record with its request, history and refund/cancel eligibility.
async function recordDetails(kind, id) {
  const Model = KINDS[kind];
  if (!Model || !mongoose.isValidObjectId(id)) throw fail('Invalid financial record.', 400);
  const record = await Model.findById(id).populate('student', 'fullName studentId email').lean();
  if (!record) throw fail('Financial record not found.', 404);
  const request = await Request.findById(record.request).populate('term', 'academicYear season').populate('requestingAdvisor', 'fullName email')
    .populate('reversal.by', 'fullName').lean();
  return {
    record: {
      id: record._id, kind, reference: record.reference, amount: record.amount, currency: record.currency, status: record.status,
      settlementOption: kind === 'payment' ? record.method : 'Next Installment',
      date: kind === 'payment' ? (record.paidAt || record.createdAt) : record.confirmedAt,
      createdAt: record.createdAt, paidAt: record.paidAt ?? null, refundReference: record.refundReference ?? null,
      installment: kind === 'deferred' ? { reference: record.installmentReference, label: record.installmentLabel, dueDate: record.dueDate } : null,
      student: record.student ? { id: record.student._id, name: record.student.fullName, studentId: record.student.studentId, email: record.student.email } : null,
    },
    request: request ? {
      id: request._id, reference: request.reference,
      term: request.term ? `${request.term.academicYear} ${request.term.season}` : null,
      advisor: request.requestingAdvisor ? { name: request.requestingAdvisor.fullName, email: request.requestingAdvisor.email } : null,
      requestedHours: request.requestedHours, activatedHours: request.activatedHours, totalCost: request.totalCost,
      decision: request.decision, settlementStatus: request.settlementStatus,
      items: request.items.map((item) => ({ code: item.code, name: item.name, requestedHours: item.requestedHours, ratePerHour: item.ratePerHour, subtotal: item.subtotal })),
      cancellationRequest: request.cancellationRequest?.requestedAt ? { reason: request.cancellationRequest.reason, at: request.cancellationRequest.requestedAt } : null,
      reversal: request.reversal?.kind ? { kind: request.reversal.kind, reason: request.reversal.reason, at: request.reversal.at,
        by: request.reversal.by?.fullName ?? null, amount: request.reversal.amount,
        removedSchedules: request.reversal.removedSchedules, restoredDrafts: request.reversal.restoredDrafts } : null,
    } : null,
    reversal: reversalCheck(kind, record, request),
    history: request ? (await requestHistory({ _id: request._id })).events : [],
  };
}

// Undo the schedule changes of an activation. Only rows that are still Active
// (not yet Processed, i.e. "unapplied") are touched; processed rows are kept.
async function revokeSchedule(request, session) {
  let removed = 0, restored = 0;
  const added = request.activation?.addedSchedules || [];
  const drafts = request.activation?.activatedDrafts || [];
  if (added.length || drafts.length) {
    for (const id of added) {
      const row = await Schedule.findOneAndDelete({ _id: id, status: 'Active' }, { session });
      if (!row) continue;
      removed += 1;
      await Slot.updateOne({ _id: row.slotId, assignedCount: { $gt: 0 } }, { $inc: { assignedCount: -1 } }, { session });
    }
    if (drafts.length) restored = (await Schedule.updateMany({ _id: { $in: drafts }, status: 'Active' }, { $set: { status: 'Draft' } }, { session })).modifiedCount;
    return { removed, restored };
  }
  // Older activations did not record their rows. Without that record, the
  // safest undo is to return the request's Active course rows to Draft so
  // the Advisor can adjust them; nothing is deleted.
  const rows = await Schedule.find({ studentId: request.student, termId: request.term, status: 'Active' })
    .populate({ path: 'slotId', select: 'offeringId', populate: { path: 'offeringId', select: 'courseId' } }).session(session).lean();
  const courses = new Set(request.items.map((item) => String(item.course)));
  const ids = rows.filter((row) => courses.has(String(row.slotId?.offeringId?.courseId))).map((row) => row._id);
  if (ids.length) restored = (await Schedule.updateMany({ _id: { $in: ids }, status: 'Active' }, { $set: { status: 'Draft' } }, { session })).modifiedCount;
  return { removed, restored };
}

// Req 102: cancel the request and refund a paid charge to the wallet, or
// remove an unpaid deferred charge from the next installment. One transaction.
async function reverseRecord(kind, id, actor, reason) {
  const Model = KINDS[kind];
  if (!Model || !mongoose.isValidObjectId(id)) throw fail('Invalid financial record.', 400);
  return atomic(async (session) => {
    const record = await Model.findById(id).session(session).lean();
    if (!record) throw fail('Financial record not found.', 404);
    const request = await Request.findById(record.request).session(session).lean();
    const check = reversalCheck(kind, record, request);
    if (!check.eligible) throw fail(check.reason);
    const now = new Date();
    let walletTransaction = null, refundReference = null;
    if (kind === 'payment') {
      refundReference = `REF-${randomUUID()}`;
      // The status condition is what makes a second refund impossible.
      const marked = await Payment.updateOne({ _id: record._id, status: 'Succeeded' }, { $set: { status: 'Refunded', refundReference } }, { session });
      if (!marked.modifiedCount) throw fail('This payment has already been refunded.');
      ({ transaction: walletTransaction } = await recordTransaction(record.student, { type: 'Refund', amount: record.amount,
        requestReference: request.reference, paymentReference: record.reference, description: 'Extra-hours refund (request cancelled)' }, { session }));
    } else {
      // A Cancelled charge is left out of the installment total by installmentBillingService.
      const marked = await Charge.updateOne({ _id: record._id, status: 'Outstanding' }, { $set: { status: 'Cancelled' } }, { session });
      if (!marked.modifiedCount) throw fail('This deferred charge is no longer outstanding.');
    }
    const { removed, restored } = await revokeSchedule(request, session);
    const refunded = kind === 'payment';
    const reversalKind = refunded ? 'Refund' : 'Deferred Charge Cancelled';
    const updated = await Request.updateOne({ _id: request._id, __v: request.__v, 'reversal.kind': null }, {
      $set: { settlementStatus: refunded ? 'Refunded' : 'Cancelled', activatedAt: null, activatedHours: 0,
        reversal: { kind: reversalKind, reason, by: actor, at: now, amount: record.amount, walletTransaction: walletTransaction?._id ?? null,
          removedSchedules: removed, restoredDrafts: restored } },
      $inc: { __v: 1 },
      $push: { history: { $each: [
        { action: 'Cancelled', actor, at: now, note: reason },
        { action: reversalKind === 'Refund' ? 'Refunded' : 'Deferred Charge Cancelled', actor, at: now,
          note: refunded ? `EGP ${record.amount.toLocaleString()} credited to wallet (${refundReference}) for ${record.reference}. Extra hours revoked; ${removed} added slot(s) removed, ${restored} slot(s) returned to draft.`
            : `${record.reference} removed from the next installment; no wallet credit. Extra hours revoked; ${removed} added slot(s) removed, ${restored} slot(s) returned to draft.` },
      ] } },
    }, { session });
    if (!updated.modifiedCount) throw fail('The request changed while reversing. Refresh and try again.');
    return {
      message: refunded
        ? `Refunded EGP ${record.amount.toLocaleString()} to the student's wallet. The request is cancelled and its extra hours are revoked.`
        : `Removed EGP ${record.amount.toLocaleString()} from the next installment (no wallet credit). The request is cancelled and its extra hours are revoked.`,
    };
  });
}

module.exports = { OPTIONS, STATUSES, EXPORT_LIMIT, listRecords, exportRecords, toCsv, historyEvents, requestHistory, recordDetails, reverseRecord, reversalCheck };

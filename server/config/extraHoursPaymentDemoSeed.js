const CourseOffering = require('../models/CourseOffering');
const CourseRecord = require('../models/CourseRecord');
const CourseSlot = require('../models/CourseSlot');
const ExtraHoursRequest = require('../models/ExtraHoursRequest');
const Payment = require('../models/ExtraHoursPayment');
const Charge = require('../models/DeferredExtraHoursCharge');
const InstallmentPlan = require('../models/InstallmentPlan');
const UniversityInstallment = require('../models/UniversityInstallment');
const StudentSchedule = require('../models/StudentSchedule');
const Notification = require('../models/Notification');
const NotificationEvent = require('../models/NotificationEvent');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { loadContext, evaluateSelection } = require('../services/extraHoursSubmissionService');
const { evaluateExtraHoursRequest, prepareExtraHoursRequest } = require('../services/extraHoursService');
const { decideRequest } = require('../services/extraHoursDecisionService');
const { payWallet } = require('../services/extraHoursPaymentService');
const { previewDeferral, confirmDeferral } = require('../services/extraHoursDeferralService');
const { reverseRecord } = require('../services/extraHoursFinanceService');
const { assignPlan } = require('../services/installmentBillingService');
const { buildStudentNotification } = require('../services/studentNotificationService');
const { eventKey } = require('../services/notificationEventService');
const { requiredCount } = require('../services/advisingScheduleValidation');
const { EVENTS } = require('../services/notificationEvents');

/**
 * Reqs 95, 97-102, 127 demo settlement data.
 *
 * The display-only requests in extraHoursDemoSeed.js are Rejected or Withdrawn,
 * so without these the coordinator's financial-records list, the student's own
 * history and every filter, export and reversal on them start out empty. Four
 * requests are built from the students' real drafts and then settled through
 * the real services — decideRequest, payWallet, confirmDeferral, reverseRecord —
 * so the rows are exactly what the application writes: activated schedules,
 * wallet debits, seat counters and history included. Three more are built the
 * same way and deliberately stopped early, so the states *before* a settlement
 * are on screen too:
 *
 *   EHR-DEMO-008  Submitted, Pending               Coordinator queue
 *   EHR-DEMO-009  Approved, Awaiting Payment       wallet covers the cost
 *   EHR-DEMO-010  Approved, Awaiting Payment       wallet cannot cover it
 *
 * What the demo ends up with, one row per screen state that matters:
 *
 *   EHR-DEMO-004  Wallet payment, Succeeded            refundable (Req 102)
 *   EHR-DEMO-005  Next Installment, Outstanding        cancellable (Req 102)
 *   EHR-DEMO-006  Wallet payment, then refunded        Refunded, money credited
 *   EHR-DEMO-007  Gateway payment, Failed              retryable from the student
 *
 * Every approval re-runs loadContext() + evaluateSelection() (decideRequest,
 * and again inside prepareActivation at settlement), and the quote only passes
 * when the draft plus the requested course sits in (standard, standard + 3]
 * credit hours. Each spec therefore first tops the student's draft up to a
 * window where its item course makes the excess billable:
 *
 *   tamer  D 20 -> 32 (std 30)   item CSEN 701 already in the draft   -> 2h
 *   hana   D 19 -> 31 (std 28)   item CSEN 701 already in the draft   -> 3h
 *   rana   D 20 -> 26 (std 30)   item CSEN 501 added by activation    -> 2h
 *   omar   D 10 -> 26 (std 30)   item CSEN 701 added by activation    -> 1h
 *
 * The top-up rows are ordinary StudentSchedule rows for published offerings
 * of the student's major: every lecture/tutorial/lab slot the offering has
 * (exactly the required counts), clash-free against the draft, with a free
 * seat. Real seat occupancy and the course's own qualification are checked
 * while inserting; CourseSlot.assignedCount is left to the seed's reconcile
 * pass, which runs before any settlement so activation sees true counters.
 *
 * Two things are deliberately *not* left to the services:
 *
 *   1. References are stamped (PAY-DEMO-004, DEF-DEMO-005, ...) because the
 *      models generate them from randomUUID: scripts/verify-seed-state.cjs
 *      proves the shared demo database still matches a fresh seed, and a
 *      random reference written into wallet history would never match. The
 *      history notes that quote a reference are rewritten to the stamped one.
 *   2. FR 117 notifications are written directly instead of through
 *      NotificationEvent: those events key on the generated payment/charge id,
 *      so a delivered row differs from a fresh seed too. The text comes from
 *      the same template the application uses, and the pending event
 *      confirmDeferral enqueues is dropped, so the notification worker finds
 *      nothing to deliver later and the database stays seed-exact.
 */
const APPROVAL_NOTE = 'Approved for the demo: current eligibility and itemized cost verified.';

const DEMO_SETTLEMENTS = [
  { reference: 'EHR-DEMO-004', studentEmail: 'tamer.lotfy@student.guc.edu.eg',
    topUpCourses: ['CSEN 102', 'CSEN 501'], itemCourse: 'CSEN 701',
    settlement: 'wallet', paymentReference: 'PAY-DEMO-004' },
  { reference: 'EHR-DEMO-005', studentEmail: 'hana.mahmoud@student.guc.edu.eg',
    topUpCourses: ['CSEN 503', 'CSEN 605'], itemCourse: 'CSEN 701',
    settlement: 'deferred', chargeReference: 'DEF-DEMO-005', installmentReference: 'INST-DEMO-005' },
  { reference: 'EHR-DEMO-006', studentEmail: 'rana.adel@student.guc.edu.eg',
    topUpCourses: ['CSEN 301', 'CSEN 701', 'CSEN 703'], itemCourse: 'CSEN 701',
    settlement: 'wallet', paymentReference: 'PAY-DEMO-006', refundReference: 'REF-DEMO-006',
    reversalNote: 'Demo refund: the payment was returned to the wallet and the extra hours revoked again.' },
  { reference: 'EHR-DEMO-007', studentEmail: 'omar.nabil@student.guc.edu.eg',
    topUpCourses: ['CSEN 301', 'CSEN 501', 'CSEN 605'], itemCourse: 'CSEN 701',
    settlement: 'gateway-failed', paymentReference: 'PAY-DEMO-007' },

  // The three request states that exist before any money moves, so the
  // coordinator's queue, the student's settlement choice and both wallet
  // outcomes are on screen too. Their drafts already sit in the billable
  // window, so none of them needs a top-up:
  //
  //   EHR-DEMO-008  Pending                      decided by the Coordinator
  //   EHR-DEMO-009  Approved, Awaiting Payment   wallet EGP 10000 >= 2400
  //   EHR-DEMO-010  Approved, Awaiting Payment   wallet EGP 0 < 800
  { reference: 'EHR-DEMO-008', studentEmail: 'rana.adel@student.guc.edu.eg',
    topUpCourses: [], itemCourse: 'CSEN 701', settlement: 'pending' },
  { reference: 'EHR-DEMO-009', studentEmail: 'hana.mahmoud@student.guc.edu.eg',
    topUpCourses: [], itemCourse: 'CSEN 701', settlement: 'awaiting' },
  { reference: 'EHR-DEMO-010', studentEmail: 'omar.nabil@student.guc.edu.eg',
    topUpCourses: [], itemCourse: 'CSEN 701', settlement: 'awaiting' },
];

// The demo timeline, so the screens read like a settled week rather than "now".
const submittedAt = new Date('2026-10-30T10:00:00.000Z');
const decidedAt = new Date('2026-11-10T10:00:00.000Z');
const settledAt = new Date('2026-11-11T11:30:00.000Z');

// Fixed installment dates for the demo plan: both stay ahead of the Winter
// 2026/2027 term, and nextInstallment() needs an upcoming Scheduled row.
const PLAN_INSTALLMENTS = [
  { label: 'Demo installment 1', dueDate: new Date('2027-02-15T00:00:00.000Z'), baseAmount: 20000 },
  { label: 'Demo installment 2', dueDate: new Date('2027-03-15T00:00:00.000Z'), baseAmount: 20000 },
];
const DEMO_PLAN_NAME = 'Extra-hours demo tuition plan';

const UUID_REF = /[A-Z]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const overlaps = (a, b) => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime;

/** One notification the way the application words it, without the event key. */
const notify = async (user, name, source) => {
  const { title, message, link } = buildStudentNotification(name, source);
  await Notification.create({ user: user._id, type: EVENTS[name].type, title, message, link, isRead: false });
};

const latestWinterTerm = (terms) =>
  [...terms]
    .filter((term) => term.season === 'Winter')
    .sort((a, b) => new Date(b.termStartDate) - new Date(a.termStartDate))[0];

/**
 * Adds the spec's top-up courses to the student's draft: one row per slot of
 * the published offering, exactly the lecture/tutorial/lab counts the course
 * requires, so the draft stays something validateAdvisingDraft and the audit
 * accept. Rows carry the same status the student's other rows already have,
 * and seats are checked against the real StudentSchedule rows (the audit and
 * activation both count rows, never the denormalised counter).
 */
const topUpDraft = async ({ student, term, codes, offeringsByCode, records }) => {
  const rows = await StudentSchedule.find({ studentId: student._id, termId: term._id })
    .populate({ path: 'slotId', populate: { path: 'offeringId', populate: { path: 'courseId' } } })
    .lean();
  if (!rows.length) {
    throw new Error(`The extra-hours payment demo needs an existing draft for ${student.email} to top up.`);
  }
  const statuses = [...new Set(rows.map((row) => row.status))];
  if (statuses.length !== 1) {
    throw new Error(`The extra-hours payment demo cannot top up mixed draft statuses for ${student.email}.`);
  }
  const heldSlots = rows.map((row) => row.slotId).filter(Boolean);
  const passed = new Set(
    records
      .filter((record) => record.status === 'Completed' && record.grade && record.grade !== 'F' && record.course)
      .map((record) => String(record.course._id))
  );

  const additions = [];
  for (const code of codes) {
    const offering = offeringsByCode.get(code);
    if (!offering) {
      throw new Error(`The extra-hours payment demo needs a published offering for ${code} in the demo term.`);
    }
    const course = offering.courseId;
    const slots = await CourseSlot.find({ offeringId: offering._id }).sort({ groupNumber: 1, _id: 1 }).lean();
    for (const type of ['Lecture', 'Tutorial', 'Lab']) {
      const need = requiredCount(course, type);
      const have = slots.filter((slot) => slot.slotType === type).length;
      if (have !== need) {
        throw new Error(`The extra-hours payment demo needs ${code} to offer exactly ${need} ${type} slot(s), found ${have}.`);
      }
    }
    if ((course.prerequisites || []).some((id) => !passed.has(String(id)))) {
      throw new Error(`The extra-hours payment demo top-up ${code} has unmet prerequisites for ${student.email}.`);
    }
    for (const slot of slots) {
      if (heldSlots.some((other) => overlaps(slot, other)) || additions.some((other) => overlaps(slot, other))) {
        throw new Error(`The extra-hours payment demo top-up ${code} clashes with ${student.email}'s draft.`);
      }
      const occupants = await StudentSchedule.countDocuments({ slotId: slot._id });
      if (occupants >= slot.maxCapacity) {
        throw new Error(`The extra-hours payment demo top-up ${code} has no free seat in group ${slot.groupNumber}.`);
      }
      additions.push(slot);
    }
  }

  if (additions.length) {
    await StudentSchedule.insertMany(
      additions.map((slot) => ({ studentId: student._id, termId: term._id, slotId: slot._id, status: statuses[0] }))
    );
  }
  return additions.length;
};

/**
 * Builds the request one spec describes, from the student's actual draft:
 * loadContext() + evaluateSelection() — the exact check decideRequest and
 * prepareActivation re-run — with requested hours derived from the excess the
 * draft plus the item course creates over the standard allowance.
 *
 * A `pending` spec stops after saving the submission: the coordinator's queue
 * needs a request nobody has decided yet. Every other spec is approved through
 * decideRequest(), which also moves settlementStatus to 'Awaiting Payment
 * Choice'; the settlement steps below then either settle it or leave it there.
 */
const buildSettledRequest = async ({ spec, student, coordinator, term }) => {
  const context = await loadContext(String(student._id), String(term._id));
  const item = [...context.courses.values()].find((course) => course.code === spec.itemCourse);
  if (!item) {
    throw new Error(`The extra-hours payment demo item ${spec.itemCourse} is not eligible for ${student.email}.`);
  }
  const inDraft = context.selectedCourses.some((course) => String(course._id) === String(item._id));
  const draftHours = context.selectedCourses.reduce((sum, course) => sum + course.creditHours, 0);
  const baseline = evaluateExtraHoursRequest({ student: context.student, records: context.records });
  const selectedHours = draftHours + (inDraft ? 0 : item.creditHours);
  const requestedHours = selectedHours - baseline.standardHours;
  if (!Number.isInteger(requestedHours) || requestedHours < 1 || requestedHours > baseline.maximumTotalHours - baseline.standardHours) {
    throw new Error(
      `The extra-hours payment demo window for ${student.email} is out of range ` +
      `(draft ${draftHours}h, item ${item.code} ${item.creditHours}h, standard ${baseline.standardHours}h, ` +
      `requested ${requestedHours}h, maximum ${baseline.maximumTotalHours}h).`
    );
  }

  const { input, quote } = evaluateSelection(context, [{ courseId: String(item._id), requestedHours }]);
  if (!quote.eligible) {
    throw new Error(`The extra-hours payment demo request for ${student.email} failed checks: ${quote.issues.map((issue) => issue.message).join(' ')}`);
  }

  const request = prepareExtraHoursRequest({ ...input, termId: context.term._id, requestingAdvisorId: student.assignedAdvisor });
  request.reference = spec.reference;
  request.history.push({ action: 'Submitted', actor: student.assignedAdvisor, at: submittedAt });
  await request.save();

  // The submitted-only demo request: the Coordinator's queue reads it as
  // Pending, and nothing here approves it.
  if (spec.settlement === 'pending') return ExtraHoursRequest.findById(request._id).lean();

  // The coordinator approves through the real decision service, so the request
  // passes its eligibility and price re-check exactly as on screen.
  await decideRequest(String(request._id), coordinator._id, { decision: 'Approved', responseNote: APPROVAL_NOTE });
  await ExtraHoursRequest.updateOne({ _id: request._id, 'history.action': 'Approved' }, {
    $set: { decidedAt, 'history.$.at': decidedAt },
  });
  return ExtraHoursRequest.findById(request._id).lean();
};

/** Rewrites the reference a history note quotes, so the demo reads stamped. */
const stampHistoryNote = async (requestId, action, pattern, reference) => {
  const doc = await ExtraHoursRequest.findById(requestId).lean();
  const entry = (doc.history || []).find((row) => row.action === action);
  if (!entry?.note || !pattern.test(entry.note)) return;
  await ExtraHoursRequest.updateOne({ _id: requestId, 'history.action': action }, {
    $set: { 'history.$.note': entry.note.replace(pattern, reference) },
  });
};

const settleFromWallet = async ({ spec, request, student, actor, coordinator }) => {
  const wallet = await Wallet.findOne({ student: student._id }).lean();
  if (!wallet || wallet.balance < request.totalCost) {
    throw new Error(
      `The extra-hours payment demo needs ${student.email} to hold EGP ${request.totalCost} in the wallet ` +
      `(found ${wallet ? `EGP ${wallet.balance}` : 'no wallet'}). Pick a student the wallet seed covers.`
    );
  }
  await payWallet(String(request._id), student._id, actor._id);

  // Random PAY id -> the reference the screens, docs and CSV export show, and
  // the same value the ledger row and the request itself now carry.
  const payment = await Payment.findOne({ request: request._id }).lean();
  await Payment.updateOne({ _id: payment._id }, { $set: { reference: spec.paymentReference, paidAt: settledAt } });
  await ExtraHoursRequest.updateOne({ _id: request._id }, { $set: { paymentReference: spec.paymentReference } });
  await stampHistoryNote(request._id, 'Paid', UUID_REF, spec.paymentReference);
  const debit = await WalletTransaction.findOne({ student: student._id, requestReference: request.reference, type: 'Payment' })
    .sort({ createdAt: -1 }).lean();
  await WalletTransaction.updateOne({ _id: debit._id }, {
    $set: { paymentReference: spec.paymentReference, notificationPending: false, occurredAt: settledAt },
  });
  await notify(actor, 'payment.completed', {
    entityId: debit._id, occurrence: 'recorded', studentId: student._id,
    amount: payment.amount, reference: request.reference,
  });

  if (!spec.reversalNote) return;
  // The refund transaction copies the payment reference, so stamp first.
  await reverseRecord('payment', String(payment._id), coordinator._id, spec.reversalNote);
  await Payment.updateOne({ _id: payment._id }, { $set: { refundReference: spec.refundReference } });
  await stampHistoryNote(request._id, 'Refunded', UUID_REF, spec.refundReference);
  const credit = await WalletTransaction.findOne({ student: student._id, requestReference: request.reference, type: 'Refund' })
    .sort({ createdAt: -1 }).lean();
  await WalletTransaction.updateOne({ _id: credit._id }, { $set: { notificationPending: false, occurredAt: settledAt } });
  await notify(actor, 'refund.completed', {
    entityId: credit._id, occurrence: 'recorded', studentId: student._id,
    amount: credit.amount, reference: request.reference,
  });
};

const settleByDeferral = async ({ spec, request, student, actor, coordinator, term }) => {
  const existingPlan = await InstallmentPlan.findOne({ name: DEMO_PLAN_NAME }).lean();
  const plan = existingPlan ?? await InstallmentPlan.create({
    name: DEMO_PLAN_NAME,
    academicYear: term.academicYear,
    createdBy: coordinator._id,
    entries: PLAN_INSTALLMENTS,
  });
  await assignPlan(String(student._id), String(plan._id), coordinator._id);
  const installment = await UniversityInstallment
    .findOne({ student: student._id, status: 'Scheduled', dueDate: { $gt: new Date() } })
    .sort({ dueDate: 1, _id: 1 }).lean();
  if (!installment) throw new Error(`The extra-hours payment demo found no upcoming installment for ${student.email}.`);
  await UniversityInstallment.updateOne({ _id: installment._id }, { $set: { reference: spec.installmentReference } });

  // The service confirms the choice the student recorded first, exactly as the
  // screen does: preference, then preview, then confirmation against __v.
  await ExtraHoursRequest.updateOne({ _id: request._id, __v: request.__v }, {
    $set: { settlementPreference: 'Next Installment', settlementPreferenceAt: decidedAt }, $inc: { __v: 1 },
  });
  const saved = await ExtraHoursRequest.findById(request._id).lean();
  const preview = await previewDeferral(String(request._id), student._id);
  await confirmDeferral(String(request._id), student._id, actor._id, {
    installmentId: String(preview.installment.id), version: saved.__v,
  });

  const charge = await Charge.findOne({ request: request._id }).lean();
  await Charge.updateOne({ _id: charge._id }, { $set: { reference: spec.chargeReference, confirmedAt: settledAt } });
  await stampHistoryNote(request._id, 'Deferred to Next Installment', UUID_REF, spec.chargeReference);
  // confirmDeferral enqueued the FR 117 event keyed on the generated charge id;
  // drop it and word the notification from the template with the stamped
  // reference instead, so nothing a worker delivers later can drift.
  await NotificationEvent.deleteMany({ name: 'charge.deferred', entityId: String(charge._id) });
  await Notification.deleteMany({
    eventKey: eventKey('charge.deferred', String(charge._id), 'confirmed', String(student._id)),
  });
  await notify(actor, 'charge.deferred', {
    entityId: charge._id, occurrence: 'confirmed', studentId: student._id,
    amount: charge.amount, reference: spec.chargeReference,
  });
};

/** A checkout the student abandoned: closed as Failed, nothing activated. */
const settleFailedGateway = async ({ spec, request, student }) => {
  const [payment] = await Payment.create([{
    request: request._id, student: student._id, method: 'Gateway',
    amount: request.totalCost, currency: request.currency,
    status: 'Failed', closedAt: settledAt, checkoutGeneration: 0,
    stripeSessionId: `cs_test_${spec.reference.toLowerCase().replace(/-/g, '')}`,
  }]);
  await Payment.updateOne({ _id: payment._id }, { $set: { reference: spec.paymentReference } });
  // The same records the checkout flow writes: startCheckout records the
  // attempt and the student's choice, markCheckoutClosed reports the failure,
  // so the student's screen offers "Retry Stripe payment" and the finance list
  // shows a Gateway row that cannot be refunded.
  await ExtraHoursRequest.updateOne({ _id: request._id }, {
    $set: { gatewayAttempt: payment._id, settlementPreference: 'Pay Now', settlementPreferenceAt: decidedAt,
      settlementStatus: 'Failed' },
    $inc: { __v: 1 },
    $push: { history: { action: 'StripePaymentFailed', note: `${spec.paymentReference}: attempt 1`, at: settledAt } },
  });
};

const seedExtraHoursPayments = async ({ students, users, terms, reconcileAssignedCounts }) => {
  const coordinator = users.find((user) => user.role === 'Coordinator');
  const term = latestWinterTerm(terms);
  if (!coordinator || !term) {
    throw new Error('The extra-hours payment demo requires a seeded Coordinator and Winter term.');
  }

  const targets = DEMO_SETTLEMENTS.map((spec) => {
    const student = students.find((candidate) => candidate.email === spec.studentEmail);
    if (!student?.isActive || student.studentType !== 'Advising Student' || !student.assignedAdvisor) {
      throw new Error(`The extra-hours payment demo requires an assigned, active Advising Student: ${spec.studentEmail}.`);
    }
    const actor = users.find((user) => user.email === student.email);
    if (!actor) throw new Error(`The extra-hours payment demo requires a login for ${spec.studentEmail}.`);
    return { spec, student, actor };
  });

  const offerings = await CourseOffering.find({ termId: term._id, publicationStatus: 'Published' }).populate('courseId').lean();
  const offeringsByCode = new Map(offerings.map((offering) => [offering.courseId?.code, offering]));
  const records = await CourseRecord
    .find({ student: { $in: targets.map(({ student }) => student._id) } })
    .populate('course').lean();
  const recordsByStudent = new Map();
  for (const record of records) {
    const key = String(record.student);
    recordsByStudent.set(key, [...(recordsByStudent.get(key) ?? []), record]);
  }

  // Top every draft up first, then reconcile CourseSlot.assignedCount from the
  // real rows: activation filters and reserves seats against that counter, so
  // it must match the rows (the capacity constants seed 48/24/16 on top of
  // which the schedule seeders $inc their own cohorts).
  let addedRows = 0;
  for (const { spec, student } of targets) {
    addedRows += await topUpDraft({
      student,
      term,
      codes: spec.topUpCourses,
      offeringsByCode,
      records: recordsByStudent.get(String(student._id)) ?? [],
    });
  }
  await reconcileAssignedCounts();

  const outcomes = { settled: 0, pending: 0, awaiting: 0 };
  for (const { spec, student, actor } of targets) {
    const request = await buildSettledRequest({ spec, student, coordinator, term });
    // These requests deliberately stop before any money moves: one waits on
    // the Coordinator's decision, the others wait for the student to choose a
    // payment method. Both states are where the demo leaves them on screen.
    if (spec.settlement === 'pending') {
      outcomes.pending += 1;
      continue;
    }
    if (spec.settlement === 'awaiting') {
      outcomes.awaiting += 1;
      continue;
    }
    const context = { spec, request, student, actor, coordinator, term };
    if (spec.settlement === 'wallet') await settleFromWallet(context);
    else if (spec.settlement === 'deferred') await settleByDeferral(context);
    else if (spec.settlement === 'gateway-failed') await settleFailedGateway(context);
    else throw new Error(`Unknown extra-hours demo settlement: ${spec.settlement}`);
    outcomes.settled += 1;
  }
  return { ...outcomes, addedRows };
};

module.exports = { seedExtraHoursPayments, DEMO_SETTLEMENTS };

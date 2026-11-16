jest.setTimeout(180000);
process.env.JWT_SECRET = 'payment-integration-test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.PAYMENT_APP_ORIGIN = 'http://localhost:5173';
jest.mock('stripe', () => jest.fn());
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const express = require('express'), http = require('supertest'), jwt = require('jsonwebtoken');
const User = require('../models/User'), Student = require('../models/Student'), Term = require('../models/AcademicTerm');
const Course = require('../models/Course'), Offering = require('../models/CourseOffering'), Slot = require('../models/CourseSlot');
const Schedule = require('../models/StudentSchedule'), Request = require('../models/ExtraHoursRequest');
const Wallet = require('../models/Wallet'), Ledger = require('../models/WalletTransaction'), Payment = require('../models/ExtraHoursPayment');
require('../models/GraduationPlan'); require('../models/ExitExamRequest'); require('../models/CourseRecord');
const { prepareExtraHoursRequest } = require('../services/extraHoursService');
const app = express(); app.use(express.json()); app.use('/api/extra-hours', require('../routes/extraHoursRoutes'));
app.use('/api/billing', require('../routes/installmentBillingRoutes'));
app.use('/api/wallet', require('../routes/walletRoutes'));
const Installment = require('../models/UniversityInstallment'), Deferred = require('../models/DeferredExtraHoursCharge'), BillingLedger = require('../models/InstallmentLedgerEntry');
let repl, student, user, advisor, term, request, token, extraSlot, stripe, checkout, intent;
const walletUrl = () => `/api/extra-hours/mine/${request._id}/pay-wallet`;
const checkoutUrl = () => `/api/extra-hours/mine/${request._id}/stripe-checkout`;
const confirmUrl = (id) => `/api/extra-hours/mine/payments/${id}/confirm`;
const withdrawUrl = () => `/api/extra-hours/${request._id}/withdraw`;
const advisorToken = () => `Bearer ${jwt.sign({ userId: String(advisor._id), role: 'Advisor' }, process.env.JWT_SECRET)}`;
async function makePending() {
  await Request.updateOne({ _id: request._id }, { $set: { decision: 'Pending', settlementStatus: 'Not Applicable', decidedAt: null } });
}
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'fr91_test' });
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); if (repl) await repl.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  advisor = await User.create({ fullName: 'Advisor', email: 'advisor@guc.edu.eg', password: 'test', role: 'Advisor' });
  student = await Student.create({ fullName: 'Student', email: 'own@student.guc.edu.eg', studentId: '64-99995', studentType: 'Advising Student', currentSemester: 7, academicStanding: 'Good Standing', major: 'Computer Science', workflowStatus: 'Draft' });
  user = await User.create({ fullName: student.fullName, email: student.email, password: 'test', role: 'Student' });
  token = `Bearer ${jwt.sign({ userId: String(user._id), role: 'Student' }, process.env.JWT_SECRET)}`;
  const now = Date.now();
  term = await Term.create({ academicYear: '2026/2027', season: 'Winter', termStartDate: new Date(now - 86400000), termEndDate: new Date(now + 60 * 86400000), teachingStartDate: new Date(now), teachingEndDate: new Date(now + 50 * 86400000), advisingDeadline: new Date(now + 86400000), swapDeadline: new Date(now + 86400000) });
  const courses = [];
  for (const [i, creditHours] of [12, 12, 4, 3].entries()) {
    const course = await Course.create({ code: `TEST ${701 + i}`, name: `Course ${i}`, creditHours, lectureHours: 2, courseType: 'Core', majors: ['Computer Science'], recommendedSemester: 7, offeringSeasons: ['Winter'] });
    courses.push(course);
    const offering = await Offering.create({ courseId: course._id, termId: term._id, publicationStatus: 'Published' });
    const slot = await Slot.create({ offeringId: offering._id, instructorId: advisor._id, slotType: 'Lecture', groupNumber: 1, dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'][i], startTime: '08:00', endTime: '10:00', roomId: `R${i}`, maxCapacity: 20, assignedCount: i < 3 ? 1 : 0 });
    if (i < 3) await Schedule.create({ studentId: student._id, termId: term._id, slotId: slot._id, status: 'Draft' });
    else extraSlot = slot;
  }
  request = prepareExtraHoursRequest({ student, termId: term._id, requestingAdvisorId: advisor._id, selectedCourses: courses.slice(0, 3), courseRequests: [{ course: courses[3], requestedHours: 3 }], records: [] });
  request.decision = 'Approved'; request.settlementStatus = 'Awaiting Payment Choice'; request.decidedAt = new Date(); await request.save();
  await Wallet.create({ student: student._id, balance: 3000, currency: 'EGP' });
  checkout = null;
  intent = { id: 'pi_mock', amount: 240000, currency: 'egp', livemode: false, status: 'requires_payment_method', last_payment_error: null };
  const sessions = new Map(), idempotency = new Map();
  stripe = { checkout: { sessions: {
    create: jest.fn(async (data, options) => {
      if (idempotency.has(options.idempotencyKey)) return idempotency.get(options.idempotencyKey);
      const suffix = Number(data.metadata.generation || 0) ? `_${data.metadata.generation}` : '';
      checkout = { id: `cs_test_mock${suffix}`, mode: 'payment', livemode: false, status: 'open', payment_status: 'unpaid', amount_total: 240000, currency: 'egp', metadata: data.metadata, payment_intent: 'pi_mock', url: `https://checkout.stripe.com/c/pay/cs_test_mock${suffix}` };
      sessions.set(checkout.id, checkout); idempotency.set(options.idempotencyKey, checkout); return checkout;
    }),
    retrieve: jest.fn(async (id) => sessions.get(id)),
    expire: jest.fn(async (id) => { const session = sessions.get(id); if (session.payment_status === 'paid') throw new Error('Already paid'); session.status = 'expired'; return session; }),
  } }, paymentIntents: { retrieve: jest.fn(async () => intent) }, refunds: { create: jest.fn(async () => ({ id: 're_mock', status: 'succeeded' })) } };
  require('stripe').mockReturnValue(stripe);
});
async function beginStripe() {
  const result = await http(app).post(checkoutUrl()).set('Authorization', token).send({});
  expect(result.status).toBe(200); return result.body.paymentId;
}

test('FR83–94 complete Advisor submission, Coordinator review and student settlement preserve the approval/payment boundary', async () => {
  const input = { studentId: String(student._id), termId: String(term._id),
    items: [{ courseId: String(request.items[0].course), requestedHours: 3 }] };
  const quote = await http(app).post('/api/extra-hours/quote').set('Authorization', advisorToken()).send(input);
  expect(quote.status).toBe(200); expect(quote.body).toMatchObject({ eligible: true, totalCost: 2400 });
  const submitted = await http(app).post('/api/extra-hours').set('Authorization', advisorToken()).send({ ...input, submissionKey: require('crypto').randomUUID() });
  expect(submitted.status).toBe(201); expect(submitted.body.request.decision).toBe('Pending');
  request = await Request.findById(submitted.body.request.id);
  const coordinator = await User.create({ fullName: 'Coordinator', email: 'coordinator@guc.edu.eg', password: 'test', role: 'Coordinator' });
  const coordinatorToken = `Bearer ${jwt.sign({ userId: String(coordinator._id), role: 'Coordinator' }, process.env.JWT_SECRET)}`;
  const review = await http(app).get(`/api/extra-hours/review?search=${student.studentId}&advisor=${advisor._id}&decision=Pending&settlementOption=Not%20selected&settlementStatus=Not%20Applicable`).set('Authorization', coordinatorToken);
  expect(review.status).toBe(200); expect(review.body.pagination.total).toBe(1); expect(review.body.requests[0].id).toBe(String(request._id));
  const details = await http(app).get(`/api/extra-hours/review/${request._id}`).set('Authorization', coordinatorToken);
  expect(details.body.request.items[0]).toMatchObject({ requestedHours: 3, ratePerHour: 800, subtotal: 2400 });
  expect(details.body.request.eligibility.checks.every((check) => check.passed)).toBe(true);
  const beforeApproval = await http(app).get('/api/extra-hours/mine').set('Authorization', token);
  expect(beforeApproval.body.requests.some((row) => row.id === String(request._id))).toBe(false);
  const approved = await http(app).post(`/api/extra-hours/review/${request._id}/decision`).set('Authorization', coordinatorToken).send({ decision: 'Approved', responseNote: 'Eligibility and itemized price checked.' });
  expect(approved.status).toBe(200); expect(approved.body.request.settlementStatus).toBe('Awaiting Payment Choice');
  expect(await Payment.countDocuments()).toBe(0); expect(await Schedule.countDocuments()).toBe(3);
  const listed = await http(app).get('/api/extra-hours/mine').set('Authorization', token);
  const visible = listed.body.requests.find((row) => row.id === String(request._id));
  expect(visible).toMatchObject({ totalCost: 2400, requestedHours: 3, activatedAt: null });
  const preference = await http(app).post(`/api/extra-hours/mine/${request._id}/preference`).set('Authorization', token).send({ preference: 'Pay Now', version: visible.version });
  expect(preference.status).toBe(200);
  expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
  expect(await Payment.countDocuments()).toBe(0); expect(await Schedule.countDocuments()).toBe(3);
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(200);
  const wallet = await http(app).get('/api/wallet/me').set('Authorization', token);
  expect(wallet.status).toBe(200); expect(wallet.body.wallet.balance).toBe(600);
  expect(wallet.body.transactions[0]).toMatchObject({ type: 'Payment', amount: 2400, balanceAfter: 600, requestReference: request.reference });
  const receipt = await http(app).get(`/api/extra-hours/mine/${request._id}/document`).set('Authorization', token);
  expect(receipt.body.document).toMatchObject({ kind: 'Paid', paymentMethod: 'Wallet', totalCost: 2400 });
  expect(await Schedule.countDocuments({ studentId: student._id, slotId: extraSlot._id, status: 'Active' })).toBe(1);
});

test('FR96 concurrent withdrawals record one actor/date entry and leave finances and schedule unchanged', async () => {
  await makePending();
  const results = await Promise.all([1, 2].map(() => http(app).post(withdrawUrl()).set('Authorization', advisorToken()).send({})));
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  const saved = await Request.findById(request._id);
  expect(saved.decision).toBe('Withdrawn'); expect(saved.settlementStatus).toBe('Not Applicable');
  const entries = saved.history.filter((entry) => entry.action === 'Withdrawn');
  expect(entries).toHaveLength(1); expect(String(entries[0].actor)).toBe(String(advisor._id)); expect(entries[0].at).toBeInstanceOf(Date);
  expect(saved.activatedAt).toBeNull(); expect(saved.activatedHours).toBe(0);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000);
  expect(await Ledger.countDocuments()).toBe(0); expect(await Payment.countDocuments()).toBe(0); expect(await Deferred.countDocuments()).toBe(0);
  expect(await Schedule.countDocuments()).toBe(3); expect((await Slot.findById(extraSlot._id)).assignedCount).toBe(0);
  const context = await http(app).get(`/api/extra-hours/context/${student._id}`).set('Authorization', advisorToken());
  expect(context.body.requests.find((row) => row.id === String(request._id)).decision).toBe('Withdrawn');
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(404);
});

test.each([
  ['Approved', 'Awaiting Payment Choice'], ['Rejected', 'Not Applicable'],
  ['Approved', 'Paid'], ['Approved', 'Deferred to Next Installment'],
  ['Approved', 'Failed'], ['Approved', 'Cancelled'], ['Approved', 'Refunded'],
])('FR96 refuses %s / %s without changing the request', async (decision, settlementStatus) => {
  await Request.updateOne({ _id: request._id }, { $set: { decision, settlementStatus } });
  const before = await Request.findById(request._id).lean();
  expect((await http(app).post(withdrawUrl()).set('Authorization', advisorToken()).send({})).status).toBe(409);
  expect(await Request.findById(request._id).lean()).toEqual(before);
});

test('FR96 validates identity, current account status, ownership, identifier and body', async () => {
  await makePending();
  expect((await http(app).post(withdrawUrl()).send({})).status).toBe(401);
  expect((await http(app).post(withdrawUrl()).set('Authorization', token).send({})).status).toBe(403);
  for (const role of ['Coordinator', 'Administrator']) {
    const forged = `Bearer ${jwt.sign({ userId: String(advisor._id), role }, process.env.JWT_SECRET)}`;
    expect((await http(app).post(withdrawUrl()).set('Authorization', forged).send({})).status).toBe(403);
  }
  const other = await User.create({ fullName: 'Other Advisor', email: 'other.advisor@guc.edu.eg', password: 'test', role: 'Advisor' });
  const otherToken = `Bearer ${jwt.sign({ userId: String(other._id), role: 'Advisor' }, process.env.JWT_SECRET)}`;
  expect((await http(app).post(withdrawUrl()).set('Authorization', otherToken).send({})).status).toBe(404);
  expect((await http(app).post('/api/extra-hours/invalid/withdraw').set('Authorization', advisorToken()).send({})).status).toBe(400);
  expect((await http(app).post(withdrawUrl()).set('Authorization', advisorToken()).send({ requestingAdvisor: other._id, decision: 'Withdrawn' })).status).toBe(400);
  await User.updateOne({ _id: advisor._id }, { $set: { isActive: false } });
  expect((await http(app).post(withdrawUrl()).set('Authorization', advisorToken()).send({})).status).toBe(403);
  expect((await Request.findById(request._id)).decision).toBe('Pending');
});

test('FR96 withdrawal and Coordinator approval race has exactly one winner', async () => {
  await makePending();
  const coordinator = await User.create({ fullName: 'Coordinator', email: 'coordinator@guc.edu.eg', password: 'test', role: 'Coordinator' });
  const coordinatorToken = `Bearer ${jwt.sign({ userId: String(coordinator._id), role: 'Coordinator' }, process.env.JWT_SECRET)}`;
  const results = await Promise.all([
    http(app).post(withdrawUrl()).set('Authorization', advisorToken()).send({}),
    http(app).post(`/api/extra-hours/review/${request._id}/decision`).set('Authorization', coordinatorToken).send({ decision: 'Approved', responseNote: 'Checked eligibility.' }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const saved = await Request.findById(request._id);
  expect(['Approved', 'Withdrawn']).toContain(saved.decision);
  expect(saved.history.filter((entry) => ['Approved', 'Withdrawn'].includes(entry.action))).toHaveLength(1);
  expect(saved.settlementStatus).toBe(saved.decision === 'Approved' ? 'Awaiting Payment Choice' : 'Not Applicable');
});
test('wallet debit, ledger, paid status and usable course commit together; repeat is idempotent', async () => {
  const results = await Promise.all([1, 2].map(() => http(app).post(walletUrl()).set('Authorization', token).send({})));
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(600);
  const ledger = await Ledger.find({}); expect(ledger).toHaveLength(1); expect(ledger[0].balanceAfter).toBe(600); expect(ledger[0].amount).toBe(2400);
  const saved = await Request.findById(request._id); expect(saved.settlementStatus).toBe('Paid'); expect(saved.activatedHours).toBe(3); expect(saved.activatedAt).toBeTruthy();
  expect(await Schedule.countDocuments({ studentId: student._id, slotId: extraSlot._id, status: 'Active' })).toBe(1);
  expect((await Slot.findById(extraSlot._id)).assignedCount).toBe(1);
  expect(await Payment.countDocuments({ status: 'Succeeded' })).toBe(1);
});
test('insufficient wallet never partially pays or activates', async () => {
  await Wallet.updateOne({ student: student._id }, { $set: { balance: 100 } });
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(422);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(100); expect(await Ledger.countDocuments()).toBe(0);
  expect(await Schedule.countDocuments()).toBe(3); expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
});
test('failure after debit rolls back wallet and ledger as well as activation', async () => {
  jest.spyOn(Schedule, 'create').mockRejectedValueOnce(new Error('activation failed'));
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(500);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000); expect(await Ledger.countDocuments()).toBe(0); expect(await Payment.countDocuments()).toBe(0);
  expect((await Slot.findById(extraSlot._id)).assignedCount).toBe(0); expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
});
test.each(['capacity', 'clash', 'probation', 'price'])('%s blocks payment before debit', async (kind) => {
  if (kind === 'capacity') await Slot.updateOne({ _id: extraSlot._id }, { $set: { assignedCount: 20 } });
  if (kind === 'clash') await Slot.updateOne({ _id: extraSlot._id }, { $set: { dayOfWeek: 'Monday' } });
  if (kind === 'probation') await Student.updateOne({ _id: student._id }, { $set: { academicStanding: 'Probation' } });
  if (kind === 'price') await Course.updateOne({ _id: request.items[0].course }, { $set: { name: 'Changed' } });
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(409);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000); expect(await Ledger.countDocuments()).toBe(0);
});
test('client cannot supply amount or paid state', async () => {
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({ amount: 1, paid: true })).status).toBe(400);
  expect(await Payment.countDocuments()).toBe(0);
});
test('another student cannot pay or inspect the request', async () => {
  const other = await User.create({ fullName: 'Other', email: 'other@student.guc.edu.eg', password: 'test', role: 'Student' });
  await Student.create({ fullName: 'Other', email: other.email, studentId: '64-99994', studentType: 'Advising Student' });
  const otherToken = `Bearer ${jwt.sign({ userId: String(other._id), role: 'Student' }, process.env.JWT_SECRET)}`;
  expect((await http(app).post(walletUrl()).set('Authorization', otherToken).send({})).status).toBe(404);
});
test('Stripe checkout only sends approved amount; open/return URL does not activate', async () => {
  const id = await beginStripe();
  const data = stripe.checkout.sessions.create.mock.calls[0][0]; expect(data.line_items[0].price_data.unit_amount).toBe(240000);
  expect(JSON.stringify(data)).not.toMatch(/card_number|cvv|password/);
  const result = await http(app).post(confirmUrl(id)).set('Authorization', token).send({}); expect(result.status).toBe(200);
  expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice'); expect(await Schedule.countDocuments()).toBe(3);
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(409);
});
test('Stripe paid session activates once without debiting wallet; duplicates are safe', async () => {
  const id = await beginStripe(); checkout.payment_status = 'paid'; checkout.status = 'complete';
  const responses = await Promise.all([1, 2].map(() => http(app).post(confirmUrl(id)).set('Authorization', token).send({})));
  expect(responses.map((result) => result.status)).toEqual([200, 200]);
  expect((await Request.findById(request._id)).settlementStatus).toBe('Paid'); expect((await Request.findById(request._id)).settlementOption).toBe('Gateway');
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000); expect(await Ledger.countDocuments()).toBe(0);
  expect(await Schedule.countDocuments({ slotId: extraSlot._id })).toBe(1); expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test('tampered provider amount is rejected without activation', async () => {
  const id = await beginStripe(); checkout.payment_status = 'paid'; checkout.amount_total = 1;
  expect((await http(app).post(confirmUrl(id)).set('Authorization', token).send({})).status).toBe(502);
  expect(await Schedule.countDocuments()).toBe(3);
});
test.each(['probation', 'unpublished offering'])('%s after checkout causes idempotent Stripe refund and no activation', async (change) => {
  const id = await beginStripe(); checkout.payment_status = 'paid';
  if (change === 'probation') await Student.updateOne({ _id: student._id }, { $set: { academicStanding: 'Probation' } });
  else await Offering.updateOne({ _id: extraSlot.offeringId }, { $set: { publicationStatus: 'Draft' } });
  expect((await http(app).post(confirmUrl(id)).set('Authorization', token).send({})).status).toBe(200);
  expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_mock' }, { idempotencyKey: `extra-hours-refund-${id}` });
  expect((await Payment.findById(id)).status).toBe('Refunded'); expect((await Request.findById(request._id)).settlementStatus).toBe('Failed');
  expect(await Schedule.countDocuments()).toBe(3); expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000);
});
test('live Stripe keys are refused before checkout or DB mutation', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_live_refused';
  expect((await http(app).post(checkoutUrl()).set('Authorization', token).send({})).status).toBe(503); expect(await Payment.countDocuments()).toBe(0);
});
test('two students cannot buy the same final seat; the loser is not charged', async () => {
  await Slot.updateOne({ _id: extraSlot._id }, { $set: { maxCapacity: 1 } });
  const other = await Student.create({ fullName: 'Other', email: 'other@student.guc.edu.eg', studentId: '64-99994', studentType: 'Advising Student', currentSemester: 7, academicStanding: 'Good Standing', major: 'Computer Science', workflowStatus: 'Draft' });
  const otherUser = await User.create({ fullName: 'Other', email: other.email, password: 'test', role: 'Student' });
  const otherToken = `Bearer ${jwt.sign({ userId: String(otherUser._id), role: 'Student' }, process.env.JWT_SECRET)}`;
  for (const row of await Schedule.find({ studentId: student._id }).lean()) await Schedule.create({ studentId: other._id, termId: term._id, slotId: row.slotId, status: 'Draft' });
  const copy = request.toObject(); delete copy._id; delete copy.reference; delete copy.createdAt; delete copy.updatedAt;
  const otherRequest = await Request.create({ ...copy, student: other._id });
  await Wallet.create({ student: other._id, balance: 3000 });
  const results = await Promise.all([
    http(app).post(walletUrl()).set('Authorization', token).send({}),
    http(app).post(`/api/extra-hours/mine/${otherRequest._id}/pay-wallet`).set('Authorization', otherToken).send({}),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(await Ledger.countDocuments()).toBe(1); expect(await Schedule.countDocuments({ slotId: extraSlot._id })).toBe(1);
  expect((await Slot.findById(extraSlot._id)).assignedCount).toBe(1);
  expect((await Wallet.find({}).lean()).map((wallet) => wallet.balance).sort((a, b) => a - b)).toEqual([600, 3000]);
});
test('verified webhook recovers a session ID not persisted before a process crash', async () => {
  const id = await beginStripe(); checkout.payment_status = 'paid';
  await Payment.updateOne({ _id: id }, { $set: { stripeSessionId: null } });
  const { confirmCheckout } = require('../services/extraHoursPaymentService');
  await confirmCheckout(id, null, checkout.id);
  expect((await Payment.findById(id)).status).toBe('Succeeded');
  expect((await Payment.findById(id)).stripeSessionId).toBe('cs_test_mock');
});
test('another request cannot charge again for an already activated course', async () => {
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(200);
  const copy = request.toObject(); delete copy._id; delete copy.reference; delete copy.createdAt; delete copy.updatedAt;
  const duplicate = await Request.create(copy);
  await Wallet.updateOne({ student: student._id }, { $set: { balance: 3000 } });
  const result = await http(app).post(`/api/extra-hours/mine/${duplicate._id}/pay-wallet`).set('Authorization', token).send({});
  expect(result.status).toBe(409); expect(await Ledger.countDocuments()).toBe(1); expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000);
});
test('standalone database blocks payment before any financial mutation', async () => {
  jest.spyOn(mongoose.connection.db, 'admin').mockReturnValue({ command: async () => ({ isWritablePrimary: true }) });
  expect((await http(app).post(walletUrl()).set('Authorization', token).send({})).status).toBe(503);
  expect(await Ledger.countDocuments()).toBe(0); expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000);
});
async function setupBilling() {
  const coordinator = await User.create({ fullName: 'Coordinator', email: 'billing@guc.edu.eg', password: 'test', role: 'Coordinator' });
  const staffToken = `Bearer ${jwt.sign({ userId: String(coordinator._id), role: 'Coordinator' }, process.env.JWT_SECRET)}`;
  const entries = [30, 60].map((days, index) => ({ label: `Installment ${index + 1}`, dueDate: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10), baseAmount: index === 0 ? 20000 : 10000 }));
  const plan = await http(app).post('/api/billing/plans').set('Authorization', staffToken).send({ name: 'Official tuition plan', academicYear: '2026/2027', entries });
  expect(plan.status).toBe(201);
  const assigned = await http(app).post('/api/billing/assign').set('Authorization', staffToken).send({ studentId: String(student._id), planId: plan.body.id });
  expect(assigned.status).toBe(200);
  const rows = await http(app).get('/api/billing/installments').set('Authorization', token);
  expect(rows.status).toBe(200);
  return { staffToken, coordinator, planId: plan.body.id, installments: rows.body.installments };
}
async function deferralPreview() {
  await http(app).post(`/api/extra-hours/mine/${request._id}/preference`).set('Authorization', token).send({ preference: 'Next Installment', version: 0 });
  const result = await http(app).get(`/api/extra-hours/mine/${request._id}/next-installment`).set('Authorization', token);
  expect(result.status).toBe(200);
  return { installmentId: result.body.installment.id, version: result.body.version };
}
const deferUrl = () => `/api/extra-hours/mine/${request._id}/defer`;
test('billing assignment snapshots tuition and repeating it never duplicates installments', async () => {
  const fixture = await setupBilling();
  expect(fixture.installments.map((item) => item.baseAmount)).toEqual([20000, 10000]);
  const repeated = await http(app).post('/api/billing/assign').set('Authorization', fixture.staffToken).send({ studentId: String(student._id), planId: fixture.planId });
  expect(repeated.status).toBe(200); expect(await Installment.countDocuments()).toBe(2);
  const another = await http(app).post('/api/billing/plans').set('Authorization', fixture.staffToken).send({ name: 'Other plan', academicYear: '2026/2027', entries: [{ label: 'Other', dueDate: '2099-01-01', baseAmount: 5 }] });
  expect((await http(app).post('/api/billing/assign').set('Authorization', fixture.staffToken).send({ studentId: String(student._id), planId: another.body.id })).status).toBe(409);
});
test('billing adjustments and external payments derive partial/paid balances with idempotent history', async () => {
  const { randomUUID } = require('crypto'); const fixture = await setupBilling(), id = fixture.installments[0].id;
  const add = (body) => http(app).post(`/api/billing/installments/${id}/entries`).set('Authorization', fixture.staffToken).send(body);
  expect((await add({ kind: 'Adjustment', amount: -500, reason: 'Approved tuition discount', submissionKey: randomUUID() })).status).toBe(200);
  const body = { kind: 'Payment', amount: 1000, reason: 'Bank payment verified', externalReference: 'BANK-001', submissionKey: randomUUID() };
  expect((await add(body)).status).toBe(200); expect((await add(body)).status).toBe(200);
  let result = await http(app).get('/api/billing/installments').set('Authorization', token);
  expect(result.body.installments[0]).toMatchObject({ total: 19500, paid: 1000, amountDue: 18500, status: 'Partially Paid' });
  expect(await BillingLedger.countDocuments()).toBe(2);
  expect((await add({ ...body, submissionKey: randomUUID() })).status).toBe(409);
  expect((await add({ ...body, amount: 19000, externalReference: 'BANK-002', submissionKey: randomUUID() })).status).toBe(422);
  expect((await add({ ...body, amount: 18500, externalReference: 'BANK-003', submissionKey: randomUUID() })).status).toBe(200);
  result = await http(app).get('/api/billing/installments').set('Authorization', token);
  expect(result.body.installments[0]).toMatchObject({ amountDue: 0, status: 'Paid' });
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000); expect(await Ledger.countDocuments()).toBe(0);
});
test('student billing actions and ownership overrides are blocked', async () => {
  await setupBilling();
  expect((await http(app).get(`/api/billing/installments?studentId=${student._id}`).set('Authorization', token)).status).toBe(400);
  expect((await http(app).get('/api/billing/plans').set('Authorization', token)).status).toBe(403);
  expect((await http(app).post('/api/billing/assign').set('Authorization', token).send({ studentId: String(student._id), planId: String(term._id) })).status).toBe(403);
  expect((await http(app).get('/api/billing/installments')).status).toBe(401);
});
test('stale staff tokens cannot manage billing', async () => {
  const fixture = await setupBilling(); await User.updateOne({ _id: fixture.coordinator._id }, { $set: { isActive: false } });
  expect((await http(app).get('/api/billing/plans').set('Authorization', fixture.staffToken)).status).toBe(403);
});
test('FR92 confirmation links a real installment and activates once without wallet/gateway payment', async () => {
  const fixture = await setupBilling(), body = await deferralPreview();
  expect(body.installmentId).toBe(fixture.installments[0].id);
  const results = await Promise.all([1, 2].map(() => http(app).post(deferUrl()).set('Authorization', token).send(body)));
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  expect(await Deferred.countDocuments()).toBe(1); const charge = await Deferred.findOne({});
  expect(String(charge.installment)).toBe(body.installmentId); expect(charge.amount).toBe(2400); expect(charge.status).toBe('Outstanding');
  const saved = await Request.findById(request._id); expect(saved.settlementStatus).toBe('Deferred to Next Installment'); expect(saved.activatedHours).toBe(3);
  expect(await Schedule.countDocuments({ slotId: extraSlot._id, status: 'Active' })).toBe(1);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000); expect(await Payment.countDocuments()).toBe(0); expect(await Ledger.countDocuments()).toBe(0);
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  const billing = await http(app).get('/api/billing/installments').set('Authorization', token);
  expect(billing.body.installments[0]).toMatchObject({ baseAmount: 20000, deferredAmount: 2400, total: 22400, paid: 0, amountDue: 22400 });
  const list = await http(app).get('/api/extra-hours/mine').set('Authorization', token);
  expect(list.body.requests[0].deferredCharge.reference).toBe(charge.reference);
});
test('FR92 missing installment blocks confirmation without guessing a date', async () => {
  const result = await http(app).get(`/api/extra-hours/mine/${request._id}/next-installment`).set('Authorization', token);
  expect(result.status).toBe(409); expect(await Deferred.countDocuments()).toBe(0); expect(await Schedule.countDocuments()).toBe(3);
});
test('FR92 stale installment selection and client-supplied amount are rejected', async () => {
  const fixture = await setupBilling(), body = await deferralPreview();
  expect((await http(app).post(deferUrl()).set('Authorization', token).send({ ...body, installmentId: fixture.installments[1].id })).status).toBe(409);
  expect((await http(app).post(deferUrl()).set('Authorization', token).send({ ...body, amount: 1 })).status).toBe(400);
  expect(await Deferred.countDocuments()).toBe(0);
});
test('FR92 activation failure rolls back charge, request and installment together', async () => {
  await setupBilling(); const body = await deferralPreview();
  const before = await Installment.findById(body.installmentId).lean();
  jest.spyOn(Schedule, 'create').mockRejectedValueOnce(new Error('activation failure'));
  expect((await http(app).post(deferUrl()).set('Authorization', token).send(body)).status).toBe(500);
  expect(await Deferred.countDocuments()).toBe(0); expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
  expect((await Installment.findById(body.installmentId)).__v).toBe(before.__v); expect((await Slot.findById(extraSlot._id)).assignedCount).toBe(0);
});
test('FR92 wallet payment racing deferral never creates two settlement methods', async () => {
  await setupBilling(); const body = await deferralPreview();
  const results = await Promise.all([http(app).post(deferUrl()).set('Authorization', token).send(body), http(app).post(walletUrl()).set('Authorization', token).send({})]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(await Deferred.countDocuments() + await Payment.countDocuments()).toBe(1);
  expect(await Schedule.countDocuments({ slotId: extraSlot._id })).toBe(1);
});
test('billing supports Normal Students and isolates their installments from other students', async () => {
  const fixture = await setupBilling();
  const normal = await Student.create({ fullName: 'Normal Student', email: 'normal@student.guc.edu.eg', studentId: '64-99994', studentType: 'Normal Student', workflowStatus: 'Schedule Assigned' });
  const normalUser = await User.create({ fullName: normal.fullName, email: normal.email, password: 'test', role: 'Student' });
  const normalToken = `Bearer ${jwt.sign({ userId: String(normalUser._id), role: 'Student' }, process.env.JWT_SECRET)}`;
  let result = await http(app).get('/api/billing/installments').set('Authorization', normalToken); expect(result.body.installments).toEqual([]);
  expect((await http(app).post('/api/billing/assign').set('Authorization', fixture.staffToken).send({ studentId: String(normal._id), planId: fixture.planId })).status).toBe(200);
  result = await http(app).get('/api/billing/installments').set('Authorization', normalToken); expect(result.body.installments).toHaveLength(2);
  expect(result.body.installments[0].id).not.toBe(fixture.installments[0].id);
});
test('FR92 skips overdue and fully paid installments when identifying the next installment', async () => {
  const fixture = await setupBilling();
  await Installment.updateOne({ _id: fixture.installments[0].id }, { $set: { dueDate: new Date(Date.now() - 86400000) } });
  let preview = await http(app).get(`/api/extra-hours/mine/${request._id}/next-installment`).set('Authorization', token);
  expect(preview.body.installment.id).toBe(fixture.installments[1].id);
  await Installment.updateOne({ _id: fixture.installments[1].id }, { $set: { status: 'Paid' } });
  preview = await http(app).get(`/api/extra-hours/mine/${request._id}/next-installment`).set('Authorization', token); expect(preview.status).toBe(409);
});
test.each([0.001, 0.00000000001, 12.345])('billing rejects non-currency amount %s', async (amount) => {
  const fixture = await setupBilling();
  const result = await http(app).post(`/api/billing/installments/${fixture.installments[0].id}/entries`).set('Authorization', fixture.staffToken).send({ kind: 'Payment', amount, reason: 'Test', externalReference: 'BAD-AMOUNT', submissionKey: require('crypto').randomUUID() });
  expect(result.status).toBe(400); expect(await BillingLedger.countDocuments()).toBe(0);
});
const cancelUrl = (id) => `/api/extra-hours/mine/payments/${id}/cancel`;
const retryUrl = () => `/api/extra-hours/mine/${request._id}/retry-stripe`;
async function cancelStripe(id, generation = 0) {
  return http(app).post(cancelUrl(id)).set('Authorization', token).send({ generation });
}
test('FR93 cancellation closes Stripe first, records status once, and never charges or activates', async () => {
  const id = await beginStripe();
  expect((await cancelStripe(id)).status).toBe(200); expect((await cancelStripe(id)).status).toBe(200);
  expect(checkout.status).toBe('expired'); expect((await Payment.findById(id)).status).toBe('Cancelled');
  const row = await Request.findById(request._id); expect(row.settlementStatus).toBe('Cancelled');
  expect(row.history.filter((item) => item.action === 'StripePaymentCancelled')).toHaveLength(1);
  expect(await Schedule.countDocuments()).toBe(3); expect(await Ledger.countDocuments()).toBe(0);
});
test('FR93 concurrent retries share one fresh session and later payment activates exactly once', async () => {
  const id = await beginStripe(), oldId = checkout.id; await cancelStripe(id);
  const responses = await Promise.all([1, 2].map(() => http(app).post(retryUrl()).set('Authorization', token).send({})));
  expect(responses.map((result) => result.status)).toEqual([200, 200]); expect(responses[0].body.url).toBe(responses[1].body.url);
  const payment = await Payment.findById(id); expect(payment.checkoutGeneration).toBe(1); expect(payment.retiredSessions).toHaveLength(1); expect(payment.retiredSessions[0].sessionId).toBe(oldId);
  expect(checkout.id).not.toBe(oldId); expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
  expect((await Request.findById(request._id)).history.filter((item) => item.action === 'StripePaymentRetried')).toHaveLength(1);
  expect(await Payment.countDocuments()).toBe(1); expect(await Schedule.countDocuments()).toBe(3);
  checkout.payment_status = 'paid'; checkout.status = 'complete';
  expect((await http(app).post(confirmUrl(id)).set('Authorization', token).send({})).status).toBe(200);
  expect((await http(app).post(confirmUrl(id)).set('Authorization', token).send({})).status).toBe(200);
  expect((await Request.findById(request._id)).settlementStatus).toBe('Paid'); expect(await Schedule.countDocuments({ slotId: extraSlot._id })).toBe(1);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000);
});
test('FR93 failed card payment is verified, expired and retryable for the same approved amount', async () => {
  const id = await beginStripe(); intent.last_payment_error = { code: 'card_declined' };
  expect((await http(app).post(confirmUrl(id)).set('Authorization', token).send({})).status).toBe(200);
  expect(checkout.status).toBe('expired'); expect((await Payment.findById(id)).status).toBe('Failed'); expect((await Request.findById(request._id)).settlementStatus).toBe('Failed');
  intent.last_payment_error = null;
  const retried = await http(app).post(retryUrl()).set('Authorization', token).send({}); expect(retried.status).toBe(200);
  expect(stripe.checkout.sessions.create.mock.calls.at(-1)[0].line_items[0].price_data.unit_amount).toBe(240000);
  expect(await Ledger.countDocuments()).toBe(0); expect(await Schedule.countDocuments()).toBe(3);
});
test('FR93 expiry reconciliation supports retry without a return to the website', async () => {
  const id = await beginStripe(); checkout.status = 'expired';
  await require('../services/extraHoursPaymentService').confirmCheckout(id, null, checkout.id);
  expect((await Request.findById(request._id)).settlementStatus).toBe('Cancelled');
  expect((await http(app).post(retryUrl()).set('Authorization', token).send({})).status).toBe(200);
});
test('FR93 pending/processing payment is never replaced by another charge', async () => {
  const id = await beginStripe(); intent.status = 'processing'; checkout.status = 'complete';
  expect((await cancelStripe(id)).status).toBe(200); expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  expect((await http(app).post(retryUrl()).set('Authorization', token).send({})).status).toBe(409);
  expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1); expect((await Payment.findById(id)).status).toBe('Pending');
});
test('FR93 successful payment racing cancellation is fulfilled instead of marked cancelled', async () => {
  const id = await beginStripe();
  stripe.checkout.sessions.expire.mockImplementationOnce(async () => { checkout.payment_status = 'paid'; checkout.status = 'complete'; throw new Error('Paid during cancel'); });
  expect((await cancelStripe(id)).status).toBe(200); expect((await Request.findById(request._id)).settlementStatus).toBe('Paid');
  expect(await Schedule.countDocuments({ slotId: extraSlot._id })).toBe(1); expect((await http(app).post(retryUrl()).set('Authorization', token).send({})).status).toBe(409);
});
test('FR93 an unconfirmed expiration failure leaves checkout pending and does not enable another charge', async () => {
  const id = await beginStripe(); stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('Network failure'));
  expect((await cancelStripe(id)).status).toBe(503); expect((await Payment.findById(id)).status).toBe('Pending'); expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
});
test('FR93 old cancellation URLs and delayed webhooks cannot cancel the new retry', async () => {
  const id = await beginStripe(), oldSession = checkout.id; await cancelStripe(id);
  expect((await http(app).post(retryUrl()).set('Authorization', token).send({})).status).toBe(200);
  expect((await cancelStripe(id, 0)).status).toBe(200);
  const service = require('../services/extraHoursPaymentService');
  await service.confirmCheckout(id, null, oldSession); await service.confirmIntentFailure(id, 'pi_mock', 0);
  expect((await Payment.findById(id)).status).toBe('Pending'); expect((await Payment.findById(id)).stripeSessionId).toBe(checkout.id);
  expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
});
test('FR93 cancellation and retry reject other students and client-controlled prices', async () => {
  const id = await beginStripe();
  const otherUser = await User.create({ fullName: 'Other', email: 'other@student.guc.edu.eg', password: 'test', role: 'Student' });
  await Student.create({ fullName: 'Other', email: otherUser.email, studentId: '64-99994', studentType: 'Advising Student' });
  const otherToken = `Bearer ${jwt.sign({ userId: String(otherUser._id), role: 'Student' }, process.env.JWT_SECRET)}`;
  expect((await http(app).post(cancelUrl(id)).set('Authorization', otherToken).send({ generation: 0 })).status).toBe(404);
  expect((await http(app).post(retryUrl()).set('Authorization', otherToken).send({})).status).toBe(404);
  expect((await http(app).post(retryUrl()).set('Authorization', token).send({ amount: 1 })).status).toBe(400);
  expect((await http(app).post(cancelUrl(id)).set('Authorization', token).send({ generation: 0, paid: true })).status).toBe(400);
});
test('FR93 eligibility is checked again before a fresh retry; failure leaves the old cancellation intact', async () => {
  const id = await beginStripe(); await cancelStripe(id);
  await Student.updateOne({ _id: student._id }, { $set: { academicStanding: 'Probation' } });
  expect((await http(app).post(retryUrl()).set('Authorization', token).send({})).status).toBe(409);
  expect((await Payment.findById(id)).checkoutGeneration).toBe(0); expect((await Payment.findById(id)).status).toBe('Cancelled'); expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
});
test('FR93 retry transaction failure rolls back generation, history and request together', async () => {
  const id = await beginStripe(); await cancelStripe(id);
  jest.spyOn(Request, 'updateOne').mockRejectedValueOnce(new Error('retry persistence failure'));
  expect((await http(app).post(retryUrl()).set('Authorization', token).send({})).status).toBe(500);
  const payment = await Payment.findById(id); expect(payment.checkoutGeneration).toBe(0); expect(payment.retiredSessions).toHaveLength(0);
  expect((await Request.findById(request._id)).settlementStatus).toBe('Cancelled'); expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
});
test('FR93 legacy payment records without a generation field can be cancelled and retried', async () => {
  const id = await beginStripe(); await Payment.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { checkoutGeneration: '' } });
  expect((await cancelStripe(id)).status).toBe(200);
  expect((await http(app).post(retryUrl()).set('Authorization', token).send({})).status).toBe(200); expect((await Payment.findById(id)).checkoutGeneration).toBe(1);
});
test('FR93 delayed session recovery cannot attach an old session to a new generation', async () => {
  const id = await beginStripe(), oldSession = checkout.id; checkout.status = 'expired';
  await Payment.updateOne({ _id: id }, { $set: { stripeSessionId: null } });
  stripe.checkout.sessions.retrieve.mockImplementationOnce(async () => {
    await Payment.updateOne({ _id: id }, { $set: { checkoutGeneration: 1, stripeSessionId: null }, $push: { retiredSessions: { sessionId: oldSession, generation: 0, status: 'Cancelled' } } });
    return checkout;
  });
  await require('../services/extraHoursPaymentService').confirmCheckout(id, null, oldSession);
  const current = await Payment.findById(id); expect(current.checkoutGeneration).toBe(1); expect(current.stripeSessionId).toBeNull(); expect(current.status).toBe('Pending');
  expect((await Request.findById(request._id)).settlementStatus).toBe('Awaiting Payment Choice');
});
test('FR94 wallet receipt includes verified transaction details and a downloadable PDF', async () => {
  await http(app).post(walletUrl()).set('Authorization', token).send({});
  const url = `/api/extra-hours/mine/${request._id}/document`;
  const result = await http(app).get(url).set('Authorization', token);
  expect(result.status).toBe(200); expect(result.body.document).toMatchObject({ kind: 'Paid', title: 'Extra-hours payment receipt', paymentMethod: 'Wallet', totalCost: 2400, items: [{ ratePerHour: 800, subtotal: 2400 }] });
  expect(result.body.document.transactionReference).toMatch(/^PAY-/); expect(result.body.document.date).toBeTruthy();
  const pdf = await http(app).get(`${url}?format=pdf`).set('Authorization', token);
  expect(pdf.status).toBe(200); expect(pdf.headers['content-type']).toMatch(/application\/pdf/); expect(pdf.headers['content-disposition']).toContain('attachment');
  expect(Buffer.isBuffer(pdf.body)).toBe(true); expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  if (process.env.FR94_ARTIFACT_DIR) require('fs').writeFileSync(require('path').join(process.env.FR94_ARTIFACT_DIR, 'fr94-wallet.pdf'), pdf.body);
});
test('FR94 deferred confirmation identifies installment, amount due and date without claiming payment', async () => {
  await setupBilling(); const body = await deferralPreview();
  await http(app).post(deferUrl()).set('Authorization', token).send(body);
  const url = `/api/extra-hours/mine/${request._id}/document`;
  const result = await http(app).get(url).set('Authorization', token);
  expect(result.body.document).toMatchObject({ kind: 'Deferred', title: 'Deferred-payment confirmation', amountDue: 2400, chargeStatus: 'Outstanding', installment: { label: 'Installment 1' } });
  expect(result.body.document.notice).toContain('not a paid receipt'); expect(result.body.document.date).toBeTruthy(); expect(result.body.document.installment.reference).toBeTruthy(); expect(result.body.document.paymentMethod).toBeUndefined();
  const pdf = await http(app).get(`${url}?format=pdf`).set('Authorization', token); expect(pdf.status).toBe(200);
  if (process.env.FR94_ARTIFACT_DIR) require('fs').writeFileSync(require('path').join(process.env.FR94_ARTIFACT_DIR, 'fr94-deferred.pdf'), pdf.body);
});
test('FR94 Stripe receipt uses its actual provider transaction reference', async () => {
  const id = await beginStripe(); checkout.payment_status = 'paid';
  await http(app).post(confirmUrl(id)).set('Authorization', token).send({});
  const result = await http(app).get(`/api/extra-hours/mine/${request._id}/document`).set('Authorization', token);
  expect(result.body.document).toMatchObject({ kind: 'Paid', paymentMethod: 'Stripe (sandbox)', transactionReference: 'pi_mock' });
});
test.each(['Awaiting Payment Choice', 'Failed', 'Cancelled', 'Refunded'])('FR94 %s cannot issue a paid receipt', async (settlementStatus) => {
  await Request.updateOne({ _id: request._id }, { $set: { settlementStatus } });
  expect((await http(app).get(`/api/extra-hours/mine/${request._id}/document`).set('Authorization', token)).status).toBe(409);
});
test('FR94 ownership and role checks apply to PDF and JSON documents', async () => {
  await http(app).post(walletUrl()).set('Authorization', token).send({});
  const other = await User.create({ fullName: 'Other', email: 'other@student.guc.edu.eg', password: 'test', role: 'Student' });
  await Student.create({ fullName: 'Other', email: other.email, studentId: '64-99994', studentType: 'Advising Student' });
  const otherToken = `Bearer ${jwt.sign({ userId: String(other._id), role: 'Student' }, process.env.JWT_SECRET)}`;
  for (const format of ['json', 'pdf']) {
    expect((await http(app).get(`/api/extra-hours/mine/${request._id}/document?format=${format}`).set('Authorization', otherToken)).status).toBe(404);
    expect((await http(app).get(`/api/extra-hours/mine/${request._id}/document?format=${format}`)).status).toBe(401);
  }
});

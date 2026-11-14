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
let repl, student, user, advisor, term, request, token, extraSlot, stripe, checkout;
const walletUrl = () => `/api/extra-hours/mine/${request._id}/pay-wallet`;
const checkoutUrl = () => `/api/extra-hours/mine/${request._id}/stripe-checkout`;
const confirmUrl = (id) => `/api/extra-hours/mine/payments/${id}/confirm`;
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
  stripe = { checkout: { sessions: {
    create: jest.fn(async (data) => { checkout = { id: 'cs_test_mock', mode: 'payment', livemode: false, status: 'open', payment_status: 'unpaid', amount_total: 240000, currency: 'egp', metadata: data.metadata, payment_intent: 'pi_mock', url: 'https://checkout.stripe.com/c/pay/cs_test_mock' }; return checkout; }),
    retrieve: jest.fn(async () => checkout),
  } }, refunds: { create: jest.fn(async () => ({ id: 're_mock', status: 'succeeded' })) } };
  require('stripe').mockReturnValue(stripe);
});
async function beginStripe() {
  const result = await http(app).post(checkoutUrl()).set('Authorization', token).send({});
  expect(result.status).toBe(200); return result.body.paymentId;
}
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

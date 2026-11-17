// Reqs 95, 97-102, 127: extra-hours financial records, history, refund/cancel and export.
jest.setTimeout(180000);
process.env.JWT_SECRET = 'finance-test';
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const express = require('express'), http = require('supertest'), jwt = require('jsonwebtoken');
const User = require('../models/User'), Student = require('../models/Student'), Term = require('../models/AcademicTerm');
const Course = require('../models/Course'), Offering = require('../models/CourseOffering'), Slot = require('../models/CourseSlot');
const Schedule = require('../models/StudentSchedule'), Request = require('../models/ExtraHoursRequest');
const Wallet = require('../models/Wallet'), Ledger = require('../models/WalletTransaction'), Payment = require('../models/ExtraHoursPayment');
const Charge = require('../models/DeferredExtraHoursCharge');
require('../models/GraduationPlan'); require('../models/ExitExamRequest'); require('../models/CourseRecord');
const { prepareExtraHoursRequest } = require('../services/extraHoursService');

const app = express(); app.use(express.json()); app.use('/api/extra-hours', require('../routes/extraHoursRoutes'));
const bearer = (user) => `Bearer ${jwt.sign({ userId: String(user._id), role: user.role }, process.env.JWT_SECRET)}`;
let repl, coordinator, admin, advisor, otherAdvisor, student, studentUser, other, otherUser, paidRequest, deferredRequest, charge, extraSlot;

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'finance_test' });
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); if (repl) await repl.stop(); });

async function makeStudent(index) {
  const s = await Student.create({ fullName: `Student ${index}`, email: `s${index}@student.guc.edu.eg`, studentId: `64-1000${index}`, studentType: 'Advising Student', currentSemester: 7, academicStanding: 'Good Standing', major: 'Computer Science', workflowStatus: 'Draft' });
  const u = await User.create({ fullName: s.fullName, email: s.email, password: 'test', role: 'Student' });
  return [s, u];
}

beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  coordinator = await User.create({ fullName: 'Coord', email: 'coord@guc.edu.eg', password: 'test', role: 'Coordinator' });
  admin = await User.create({ fullName: 'Admin', email: 'admin@guc.edu.eg', password: 'test', role: 'Administrator' });
  advisor = await User.create({ fullName: 'Advisor', email: 'advisor@guc.edu.eg', password: 'test', role: 'Advisor' });
  otherAdvisor = await User.create({ fullName: 'Other Advisor', email: 'other.advisor@guc.edu.eg', password: 'test', role: 'Advisor' });
  [student, studentUser] = await makeStudent(1);
  [other, otherUser] = await makeStudent(2);
  const now = Date.now();
  const term = await Term.create({ academicYear: '2026/2027', season: 'Winter', termStartDate: new Date(now - 86400000), termEndDate: new Date(now + 60 * 86400000), teachingStartDate: new Date(now), teachingEndDate: new Date(now + 50 * 86400000), advisingDeadline: new Date(now + 86400000), swapDeadline: new Date(now + 86400000) });
  const courses = [];
  for (const [i, creditHours] of [12, 12, 4, 3].entries()) {
    const course = await Course.create({ code: `TEST ${701 + i}`, name: `Course ${i}`, creditHours, lectureHours: 2, courseType: 'Core', majors: ['Computer Science'], recommendedSemester: 7, offeringSeasons: ['Winter'] });
    courses.push(course);
    const offering = await Offering.create({ courseId: course._id, termId: term._id, publicationStatus: 'Published' });
    const slot = await Slot.create({ offeringId: offering._id, instructorId: advisor._id, slotType: 'Lecture', groupNumber: 1, dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'][i], startTime: '08:00', endTime: '10:00', roomId: `R${i}`, maxCapacity: 20, assignedCount: i < 3 ? 2 : 0 });
    if (i < 3) for (const s of [student, other]) await Schedule.create({ studentId: s._id, termId: term._id, slotId: slot._id, status: 'Draft' });
    else extraSlot = slot;
  }
  const build = (s) => {
    const r = prepareExtraHoursRequest({ student: s, termId: term._id, requestingAdvisorId: advisor._id, selectedCourses: courses.slice(0, 3), courseRequests: [{ course: courses[3], requestedHours: 3 }], records: [] });
    r.decision = 'Approved'; r.settlementStatus = 'Awaiting Payment Choice'; r.decidedAt = new Date(); r.decidedBy = coordinator._id; r.responseNote = 'OK';
    r.history.push({ action: 'Submitted', actor: advisor._id }, { action: 'Approved', actor: coordinator._id, note: 'OK' });
    return r;
  };
  paidRequest = build(student); await paidRequest.save();
  await Wallet.create({ student: student._id, balance: 3000, currency: 'EGP' });
  // Pay through the real wallet flow so activation is recorded exactly as in the app.
  const paid = await http(app).post(`/api/extra-hours/mine/${paidRequest._id}/pay-wallet`).set('Authorization', bearer(studentUser)).send({});
  expect(paid.status).toBe(200);
  // An older-style deferred request (no recorded activation) for the second student.
  deferredRequest = build(other);
  const installmentId = new mongoose.Types.ObjectId();
  charge = await Charge.create({ request: deferredRequest._id, student: other._id, installment: installmentId, installmentReference: 'INST-1', installmentLabel: 'Installment 1', dueDate: new Date(now + 30 * 86400000), amount: deferredRequest.totalCost, confirmedAt: new Date(now - 86400000), confirmedBy: otherUser._id });
  deferredRequest.settlementStatus = 'Deferred to Next Installment'; deferredRequest.settlementOption = 'Next Installment';
  deferredRequest.deferredCharge = charge._id; deferredRequest.activatedAt = new Date(); deferredRequest.activatedHours = 3;
  await deferredRequest.save();
});

const finance = (path = '', user = coordinator) => http(app).get(`/api/extra-hours/finance${path}`).set('Authorization', bearer(user));

test('Req 98: Coordinator and Administrator see every financial record with the required fields', async () => {
  for (const user of [coordinator, admin]) {
    const res = await finance('', user);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    const wallet = res.body.records.find((r) => r.kind === 'payment');
    expect(wallet).toMatchObject({ amount: 2400, settlementOption: 'Wallet', status: 'Succeeded', student: { studentId: '64-10001' }, request: { reference: paidRequest.reference } });
    expect(wallet.reference).toMatch(/^PAY-/);
    expect(wallet.date).toBeTruthy();
    const deferred = res.body.records.find((r) => r.kind === 'deferred');
    expect(deferred).toMatchObject({ settlementOption: 'Next Installment', status: 'Outstanding', reference: charge.reference });
  }
  expect((await finance('', advisor)).status).toBe(403);
  expect((await finance('', studentUser)).status).toBe(403);
});

test('Req 99: search by student ID, request ID, transaction reference and deferred-charge reference', async () => {
  const payment = await Payment.findOne({ request: paidRequest._id });
  for (const [search, kind] of [['64-10002', 'deferred'], [paidRequest.reference, 'payment'], [String(paidRequest._id), 'payment'], [payment.reference, 'payment'], [charge.reference, 'deferred']]) {
    const res = await finance(`?search=${encodeURIComponent(search)}`);
    expect(res.status).toBe(200);
    expect(res.body.records.map((r) => r.kind)).toEqual([kind]);
  }
  expect((await finance('?search=.*')).body.records).toHaveLength(0); // literal, not a regex
});

test('Req 100: filter by date, settlement option and status', async () => {
  expect((await finance('?settlementOption=Wallet')).body.records.map((r) => r.kind)).toEqual(['payment']);
  expect((await finance('?status=Outstanding')).body.records.map((r) => r.kind)).toEqual(['deferred']);
  const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  expect((await finance(`?from=${ymd(today)}&to=${ymd(today)}`)).body.records.map((r) => r.kind)).toEqual(['payment']);
  expect((await finance('?from=2026-12-02&to=2026-12-01')).status).toBe(400);
  expect((await finance('?status=Bogus')).status).toBe(400);
});

test('Req 101: open a record from the results', async () => {
  const list = await finance('?settlementOption=Wallet');
  const res = await finance(`/payment/${list.body.records[0].id}`);
  expect(res.status).toBe(200);
  expect(res.body.record.reference).toMatch(/^PAY-/);
  expect(res.body.request.reference).toBe(paidRequest.reference);
  expect(res.body.reversal).toMatchObject({ eligible: true, action: 'Refund' });
  expect((await finance(`/payment/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  expect((await finance('/unknown/abc')).status).toBe(400);
});

test('Req 127: export matches the filtered list', async () => {
  const res = await finance('/export?settlementOption=Next%20Installment');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/csv/);
  expect(res.headers['content-disposition']).toMatch(/attachment/);
  const lines = res.text.trim().split(/\r\n/);
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain(charge.reference);
  expect(res.text).not.toContain('PAY-');
});

test('Req 102: refund a paid charge to the wallet once, revoke hours and remove added slots', async () => {
  const payment = await Payment.findOne({ request: paidRequest._id });
  const before = await Request.findById(paidRequest._id).lean();
  expect(before.activation.addedSchedules).toHaveLength(1);
  const url = `/api/extra-hours/finance/payment/${payment._id}/reverse`;
  expect((await http(app).post(url).set('Authorization', bearer(coordinator)).send({ reason: '' })).status).toBe(400);
  const res = await http(app).post(url).set('Authorization', bearer(coordinator)).send({ reason: 'Student withdrew from the course.' });
  expect(res.status).toBe(200);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000); // 3000 - 2400 + 2400
  expect(await Ledger.countDocuments({ student: student._id, type: 'Refund' })).toBe(1);
  expect((await Payment.findById(payment._id)).status).toBe('Refunded');
  const after = await Request.findById(paidRequest._id).lean();
  expect(after).toMatchObject({ settlementStatus: 'Refunded', activatedHours: 0, activatedAt: null, reversal: { kind: 'Refund', removedSchedules: 1, restoredDrafts: 0 } });
  expect(after.history.map((h) => h.action)).toEqual(expect.arrayContaining(['Cancelled', 'Refunded']));
  expect(await Schedule.countDocuments({ studentId: student._id, slotId: extraSlot._id })).toBe(0);
  expect((await Slot.findById(extraSlot._id)).assignedCount).toBe(0);
  expect(await Schedule.countDocuments({ studentId: student._id, status: 'Draft' })).toBe(3);
  // Never twice.
  const again = await http(app).post(url).set('Authorization', bearer(admin)).send({ reason: 'Trying a second refund.' });
  expect(again.status).toBe(409);
  expect((await Wallet.findOne({ student: student._id })).balance).toBe(3000);
});

test('Req 102: cancel an unpaid deferred charge without a wallet credit', async () => {
  await Schedule.updateMany({ studentId: other._id }, { $set: { status: 'Active' } });
  const res = await http(app).post(`/api/extra-hours/finance/deferred/${charge._id}/reverse`).set('Authorization', bearer(admin)).send({ reason: 'Request cancelled by the faculty.' });
  expect(res.status).toBe(200);
  expect((await Charge.findById(charge._id)).status).toBe('Cancelled');
  expect(await Ledger.countDocuments({ student: other._id })).toBe(0);
  expect(await Wallet.findOne({ student: other._id })).toBeNull();
  const after = await Request.findById(deferredRequest._id).lean();
  expect(after).toMatchObject({ settlementStatus: 'Cancelled', activatedHours: 0, reversal: { kind: 'Deferred Charge Cancelled' } });
  // A paid deferred charge is not eligible.
  await Charge.updateOne({ _id: charge._id }, { $set: { status: 'Paid' } });
  const detail = await finance(`/deferred/${charge._id}`);
  expect(detail.body.reversal.eligible).toBe(false);
});

test('Req 97: a student sees only their own payment and deferred-charge history', async () => {
  const mine = await http(app).get('/api/extra-hours/mine/finance').set('Authorization', bearer(studentUser));
  expect(mine.status).toBe(200);
  expect(mine.body.records).toHaveLength(1);
  expect(mine.body.records[0]).toMatchObject({ settlementOption: 'Wallet', status: 'Succeeded' });
  const theirs = await http(app).get('/api/extra-hours/mine/finance?studentId=x').set('Authorization', bearer(otherUser));
  expect(theirs.status).toBe(400);
  const ok = await http(app).get('/api/extra-hours/mine/finance').set('Authorization', bearer(otherUser));
  expect(ok.body.records.map((r) => r.settlementOption)).toEqual(['Next Installment']);
});

test('Req 95: status and decision history for the student, the requesting Advisor and the Coordinator', async () => {
  const student95 = await http(app).get(`/api/extra-hours/mine/${paidRequest._id}/history`).set('Authorization', bearer(studentUser));
  expect(student95.status).toBe(200);
  expect(student95.body.history).toMatchObject({ decision: 'Approved', settlementStatus: 'Paid' });
  expect(student95.body.history.events.map((e) => e.action)).toEqual(['Submitted', 'Approved', 'Paid']);
  expect((await http(app).get(`/api/extra-hours/mine/${paidRequest._id}/history`).set('Authorization', bearer(otherUser))).status).toBe(404);
  const advisor95 = await http(app).get(`/api/extra-hours/${paidRequest._id}/history`).set('Authorization', bearer(advisor));
  expect(advisor95.status).toBe(200);
  expect(advisor95.body.history.events[1]).toMatchObject({ label: 'Approved by the Coordinator', actor: { name: 'Coord' } });
  expect((await http(app).get(`/api/extra-hours/${paidRequest._id}/history`).set('Authorization', bearer(otherAdvisor))).status).toBe(404);
  const coord95 = await http(app).get(`/api/extra-hours/review/${paidRequest._id}`).set('Authorization', bearer(coordinator));
  expect(coord95.body.request.history.map((e) => e.action)).toEqual(['Submitted', 'Approved', 'Paid']);
});

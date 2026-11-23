// Req 126: export the displayed schedule activity history (with Reqs 124 and
// 125 filters and search applied) as CSV, Coordinator / Administrator only.
jest.setTimeout(180000);
process.env.JWT_SECRET = 'schedule-history-export-test';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const express = require('express');
const http = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const ScheduleActivityLog = require('../models/ScheduleActivityLog');
const { parseCsv } = require('../utils/csv');

const app = express();
app.use(express.json());
app.use('/api/schedule-history', require('../routes/scheduleActivityRoutes'));

const bearer = (user) => `Bearer ${jwt.sign({ userId: String(user._id), role: user.role }, process.env.JWT_SECRET)}`;
const HEAD = [
  'Student ID', 'Student name', 'Action', 'Schedule version', 'Staff full name',
  'Staff GUC email', 'Staff role', 'Date and time (UTC)', 'Reopening reason',
];

let mongo, coordinator, admin, advisor, studentUser, alpha, beta, seeded;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'schedule_history_export_test' });
  await Promise.all([User.init(), Student.init(), ScheduleActivityLog.init()]);
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const log = (student, overrides) => ({
  student: student._id,
  studentId: student.studentId,
  studentName: student.fullName,
  staffRole: 'Advisor',
  ...overrides,
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Student.deleteMany({}), ScheduleActivityLog.deleteMany({})]);
  coordinator = await User.create({ fullName: 'Nour Coordinator', email: 'coordinator@guc.edu.eg', password: 'x', role: 'Coordinator' });
  admin = await User.create({ fullName: 'Ada Admin', email: 'admin@guc.edu.eg', password: 'x', role: 'Administrator' });
  advisor = await User.create({ fullName: 'Omar Advisor', email: 'omar.advisor@guc.edu.eg', password: 'x', role: 'Advisor' });
  studentUser = await User.create({ fullName: 'Sara Student', email: 'sara@student.guc.edu.eg', password: 'x', role: 'Student' });

  alpha = await Student.create({ fullName: 'Alpha Student', email: 'alpha@student.guc.edu.eg', studentId: '64-10001',
    studentType: 'Advising Student', major: 'Computer Science', workflowStatus: 'Reopened', assignedAdvisor: advisor._id });
  beta = await Student.create({ fullName: 'Beta, "Quoted" Student', email: 'beta@student.guc.edu.eg', studentId: '64-10002',
    studentType: 'Advising Student', major: 'Computer Science', workflowStatus: 'Processed', assignedAdvisor: advisor._id });
  // No runtime log: shown through the derived baseline entry (Req 123), so export must include it too.
  seeded = await Student.create({ fullName: 'Seeded Student', email: 'seeded@student.guc.edu.eg', studentId: '64-10003',
    studentType: 'Advising Student', major: 'Computer Science', workflowStatus: 'Processed',
    lastUpdateAt: new Date('2026-09-20T10:00:00.000Z') });
  // Normal students never appear in the advising history.
  await Student.create({ fullName: 'Normal Student', email: 'normal@student.guc.edu.eg', studentId: '64-10004',
    studentType: 'Normal Student', major: 'Computer Science', workflowStatus: 'Schedule Assigned' });

  await ScheduleActivityLog.create([
    log(alpha, { action: 'Processed', scheduleVersion: 1, staffName: advisor.fullName, staffEmail: advisor.email,
      occurredAt: new Date('2026-10-01T09:00:00.000Z') }),
    log(alpha, { action: 'Reopened', scheduleVersion: 2, staffName: coordinator.fullName, staffEmail: coordinator.email,
      staffRole: 'Coordinator', reason: '=HYPERLINK("http://x"), then fix\nthe tutorial clash', occurredAt: new Date('2026-10-05T12:30:00.000Z') }),
    log(beta, { action: 'Processed', scheduleVersion: 1, staffName: advisor.fullName, staffEmail: advisor.email,
      occurredAt: new Date('2026-10-10T08:15:00.000Z') }),
  ]);
});

const BOM = '\uFEFF';

// Keeps the CSV body as raw text (supertest only buffers JSON and text/plain by default).
const asText = (res, done) => {
  let text = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => { text += chunk; });
  res.on('end', () => done(null, text));
};

const list = (user, qs = '') => http(app).get(`/api/schedule-history${qs}`).set('Authorization', bearer(user));
const exportCsv = (user, qs = '') =>
  http(app).get(`/api/schedule-history/export${qs}`).set('Authorization', bearer(user)).buffer(true).parse(asText);
const rowsOf = (text) => parseCsv(text).map((record) => record.fields);

// What the CSV should hold for the entries the page displayed: every column,
// with values that start like a formula prefixed by an apostrophe.
const asExported = (value) => (/^[=+\-@]/.test(value) ? `'${value}` : value);
const expectedRows = (logs) => logs.map((e) => [
  e.studentId, e.studentName, e.action, String(e.scheduleVersion), e.staffName,
  e.staffEmail, e.staffRole, new Date(e.occurredAt).toISOString(), e.reason ?? '',
].map(asExported));

test('exports every displayed entry as a CSV in the project export format', async () => {
  const shown = await list(coordinator);
  expect(shown.status).toBe(200);
  expect(shown.body.logs).toHaveLength(4); // three runtime logs + one seeded baseline

  const res = await exportCsv(coordinator);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
  expect(res.headers['content-disposition']).toMatch(/^attachment; filename="schedule-activity-history-\d{4}-\d{2}-\d{2}\.csv"$/);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.body.startsWith(BOM)).toBe(true);
  expect(res.body.endsWith('\r\n')).toBe(true);

  const [head, ...rows] = rowsOf(res.body);
  expect(head).toEqual(HEAD);
  expect(rows).toEqual(expectedRows(shown.body.logs));
  expect(rows.map((r) => r[0])).toEqual(['64-10002', '64-10001', '64-10001', '64-10003']);
  // The reopening reason keeps its text, comma and line break, but cannot run as a formula.
  expect(rows[1][8]).toBe(`'=HYPERLINK("http://x"), then fix\nthe tutorial clash`);
});

test.each([
  ['action type', '?action=Reopened'],
  ['action type Processed', '?action=Processed'],
  ['date range', '?startDate=2026-10-01&endDate=2026-10-05'],
  ['single day', '?startDate=2026-10-10&endDate=2026-10-10'],
  ['student ID search', '?search=64-10002'],
  ['staff name search', '?search=nour%20coord'],
  ['staff GUC email search', '?search=OMAR.ADVISOR%40guc.edu.eg'],
  ['combined filters and search', '?action=Processed&startDate=2026-09-01&endDate=2026-10-31&search=omar'],
  ['no matches', '?search=nobody'],
])('export matches the displayed list for %s', async (_label, qs) => {
  const shown = await list(admin, qs);
  expect(shown.status).toBe(200);
  const res = await exportCsv(admin, qs);
  expect(res.status).toBe(200);
  const [head, ...rows] = rowsOf(res.body);
  expect(head).toEqual(HEAD);
  expect(rows).toEqual(expectedRows(shown.body.logs));
});

test('filters narrow the export to exactly the matching entries', async () => {
  const reopened = rowsOf((await exportCsv(coordinator, '?action=Reopened')).body).slice(1);
  expect(reopened.map((r) => [r[0], r[2], r[3]])).toEqual([['64-10001', 'Reopened', '2']]);
  expect(reopened[0][4]).toBe('Nour Coordinator');
  expect(reopened[0][5]).toBe('coordinator@guc.edu.eg');
  expect(reopened[0][6]).toBe('Coordinator');

  const byEmail = rowsOf((await exportCsv(coordinator, '?search=omar.advisor@guc.edu.eg&startDate=2026-10-02')).body).slice(1);
  expect(byEmail.map((r) => [r[0], r[2]])).toEqual([['64-10002', 'Processed']]);
  expect(byEmail[0][1]).toBe('Beta, "Quoted" Student'); // commas and quotes survive the round trip
  expect(byEmail[0][8]).toBe('');

  const none = await exportCsv(coordinator, '?search=nobody');
  expect(none.body).toBe(`${BOM}${HEAD.join(',')}\r\n`);
});

test('a runtime log replaces the matching baseline entry instead of duplicating it', async () => {
  await ScheduleActivityLog.create(log(seeded, { action: 'Processed', scheduleVersion: 1, staffName: coordinator.fullName,
    staffEmail: coordinator.email, staffRole: 'Coordinator', occurredAt: new Date('2026-10-20T10:00:00.000Z') }));
  const rows = rowsOf((await exportCsv(coordinator, '?search=64-10003')).body).slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0][4]).toBe('Nour Coordinator');
});

test('only active Coordinators and Administrators can export', async () => {
  expect((await http(app).get('/api/schedule-history/export')).status).toBe(401);
  expect((await http(app).get('/api/schedule-history/export').set('Authorization', 'Bearer nope')).status).toBe(401);
  expect((await exportCsv(advisor)).status).toBe(403);
  expect((await exportCsv(studentUser)).status).toBe(403);
  expect((await exportCsv(admin)).status).toBe(200);

  // A token issued before deactivation or a role change no longer exports.
  const staleCoordinatorToken = bearer(coordinator);
  await User.updateOne({ _id: coordinator._id }, { isActive: false });
  const deactivated = await http(app).get('/api/schedule-history/export').set('Authorization', staleCoordinatorToken);
  expect(deactivated.status).toBe(403);
  expect(deactivated.headers['content-type']).toMatch(/json/);

  const staleAdminToken = bearer(admin);
  await User.updateOne({ _id: admin._id }, { role: 'Advisor' });
  expect((await http(app).get('/api/schedule-history/export').set('Authorization', staleAdminToken)).status).toBe(403);

  // A valid token for an account that no longer exists.
  const deletedCoordinator = { _id: new mongoose.Types.ObjectId(), role: 'Coordinator' };
  expect((await exportCsv(deletedCoordinator)).status).toBe(403);
});

test.each([
  ['an unknown action type', '?action=Deleted'],
  ['a malformed start date', '?startDate=01-10-2026'],
  ['an impossible end date', '?endDate=2026-13-45'],
  ['an unknown parameter', '?studentId=64-10001'],
  ['a repeated parameter', '?action=Processed&action=Reopened'],
])('rejects %s with a clear 400', async (_label, qs) => {
  const res = await http(app).get(`/api/schedule-history/export${qs}`).set('Authorization', bearer(coordinator));
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/valid action type/);
});

test('empty filter values behave like no filter, as on the page', async () => {
  const all = rowsOf((await exportCsv(coordinator)).body);
  const empties = rowsOf((await exportCsv(coordinator, '?action=&startDate=&endDate=&search=')).body);
  expect(empties).toEqual(all);
});

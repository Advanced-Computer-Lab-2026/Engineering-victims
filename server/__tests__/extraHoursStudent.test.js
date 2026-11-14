process.env.JWT_SECRET = 'student-extra-test';
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Student', () => ({ findOne: jest.fn() }));
jest.mock('../models/ExtraHoursRequest', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
const express = require('express'), jwt = require('jsonwebtoken'), http = require('supertest');
const User = require('../models/User'), Student = require('../models/Student'), Request = require('../models/ExtraHoursRequest');
const app = express(); app.use('/mine', require('../routes/extraHoursStudentRoutes'));
const auth = (role = 'Student') => `Bearer ${jwt.sign({ userId: 'user', role }, process.env.JWT_SECRET)}`;
const q = (value) => { const query = { select: () => query, populate: () => query, sort: jest.fn(() => query), skip: jest.fn(() => query), limit: () => query, lean: async () => value }; return query; };
let rows, list;
beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockReturnValue(q({ email: 'own@student.guc.edu.eg', role: 'Student', isActive: true }));
  Student.findOne.mockReturnValue(q({ _id: 'own-student', studentType: 'Advising Student', isActive: true }));
  rows = [{ _id: 'request', reference: 'EHR-own', decision: 'Approved', term: { academicYear: '2026/2027', season: 'Winter' },
    requestedHours: 3, totalCost: 2400, currency: 'EGP', settlementStatus: 'Awaiting Payment Choice',
    items: [{ course: 'course', code: 'CSEN701', name: 'Course', creditHours: 5, requestedHours: 3, classification: 'New', ratePerHour: 800, subtotal: 2400 }],
    submissionKey: 'private-key', responseNote: 'private-review', eligibility: { gpa: 2 } }];
  list = q(rows); Request.find.mockReturnValue(list); Request.countDocuments.mockResolvedValue(1);
});
test('only own approved requests are queried and costs are serialized', async () => {
  const result = await http(app).get('/mine').set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(Student.findOne).toHaveBeenCalledWith({ email: 'own@student.guc.edu.eg' });
  expect(Request.find).toHaveBeenCalledWith({ student: 'own-student', decision: 'Approved' });
  expect(Request.countDocuments).toHaveBeenCalledWith({ student: 'own-student', decision: 'Approved' });
  expect(result.body.requests[0]).toMatchObject({ term: '2026/2027 Winter', totalCost: 2400, requestedHours: 3,
    items: [{ code: 'CSEN701', creditHours: 5, requestedHours: 3, ratePerHour: 800, subtotal: 2400 }] });
  expect(result.text).not.toMatch(/private-key|private-review|eligibility/);
  expect(result.headers['cache-control']).toBe('no-store');
});
test('anonymous cannot read requests', async () => { expect((await http(app).get('/mine')).status).toBe(401); expect(Request.find).not.toHaveBeenCalled(); });
test.each(['Advisor', 'Coordinator', 'Administrator'])('%s cannot read student endpoint', async (role) => {
  expect((await http(app).get('/mine').set('Authorization', auth(role))).status).toBe(403); expect(User.findById).not.toHaveBeenCalled();
});
test.each([{ role: 'Student', isActive: false }, { role: 'Advisor', isActive: true }, null])('stale or inactive account rejected: %j', async (user) => {
  User.findById.mockReturnValue(q(user));
  expect((await http(app).get('/mine').set('Authorization', auth())).status).toBe(403); expect(Request.find).not.toHaveBeenCalled();
});
test.each([{ studentType: 'Normal Student', isActive: true }, { studentType: 'Advising Student', isActive: false }])('student eligibility enforced: %j', async (student) => {
  Student.findOne.mockReturnValue(q(student)); expect((await http(app).get('/mine').set('Authorization', auth())).status).toBe(403); expect(Request.find).not.toHaveBeenCalled();
});
test('missing directory record is 404', async () => { Student.findOne.mockReturnValue(q(null)); expect((await http(app).get('/mine').set('Authorization', auth())).status).toBe(404); });
test.each(['studentId=other', 'decision=Pending', 'page=0', 'page=1.5'])('invalid query or ownership override rejected: %s', async (query) => {
  expect((await http(app).get(`/mine?${query}`).set('Authorization', auth())).status).toBe(400); expect(Request.find).not.toHaveBeenCalled();
});
test('pagination stable and constrained to own approved records', async () => {
  Request.countDocuments.mockResolvedValue(21);
  const result = await http(app).get('/mine?page=2').set('Authorization', auth());
  expect(result.body.pagination).toEqual({ page: 2, limit: 20, total: 21, totalPages: 2 }); expect(list.skip).toHaveBeenCalledWith(20);
});
test('empty approved list succeeds', async () => {
  Request.find.mockReturnValue(q([])); Request.countDocuments.mockResolvedValue(0);
  const result = await http(app).get('/mine').set('Authorization', auth()); expect(result.body.requests).toEqual([]); expect(result.body.pagination.total).toBe(0);
});
test('deleted term does not hide historical itemized costs', async () => {
  rows[0].term = null; const result = await http(app).get('/mine').set('Authorization', auth()); expect(result.body.requests[0].term).toBe('Term unavailable');
});
test('safe database failure', async () => {
  Request.find.mockImplementation(() => { throw new Error('private database info'); });
  const result = await http(app).get('/mine').set('Authorization', auth()); expect(result.status).toBe(500); expect(result.text).not.toContain('private database info');
});

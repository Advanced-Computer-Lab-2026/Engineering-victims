process.env.JWT_SECRET = 'review-test-key';
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Student', () => ({ find: jest.fn() }));
jest.mock('../models/ExtraHoursRequest', () => ({ find: jest.fn(), findById: jest.fn(), countDocuments: jest.fn() }));
const express = require('express'), jwt = require('jsonwebtoken'), request = require('supertest');
const User = require('../models/User');
const Student = require('../models/Student');
const Request = require('../models/ExtraHoursRequest');
const app = express(); app.use(express.json()); app.use('/api/extra-hours', require('../routes/extraHoursRoutes'));
const actorId = '507f1f77bcf86cd799439011', requestId = '507f1f77bcf86cd799439012';
const auth = (role = 'Coordinator') => `Bearer ${jwt.sign({ userId: actorId, role }, process.env.JWT_SECRET)}`;
let row, listQuery;
const query = (value) => {
  const q = { populate: jest.fn(() => q), select: jest.fn(() => q), sort: jest.fn(() => q), skip: jest.fn(() => q), limit: jest.fn(() => q), lean: jest.fn(async () => value) };
  return q;
};
beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockReturnValue({ select: async () => ({ role: 'Coordinator', isActive: true }) });
  row = { _id: requestId, reference: 'EHR-test', student: { _id: 'student', fullName: 'Student', studentId: '64-12345', email: 'student@student.guc.edu.eg' },
    requestingAdvisor: { _id: 'advisor', fullName: 'Advisor', email: 'advisor@guc.edu.eg', password: 'private-password' },
    term: { _id: 'term', academicYear: '2026/2027', season: 'Winter' }, requestedHours: 3, totalCost: 2400, currency: 'EGP',
    decision: 'Pending', settlementStatus: 'Not Applicable', settlementOption: null, createdAt: new Date('2026-11-14T12:00:00Z'),
    submissionKey: 'internal-key', submissionFingerprint: 'internal-fingerprint',
    items: [{ course: 'course', code: 'CSEN 701', name: 'Course', creditHours: 3, requestedHours: 3, classification: 'New', ratePerHour: 800, subtotal: 2400 }],
    eligibility: { standardHours: 28, allowedHours: 28, selectedHours: 31, maximumTotalHours: 31, gpa: 2, graduationBasis: 'Unknown', checks: [{ code: 'TOTAL_LIMIT', passed: true, message: 'Limit' }] },
    responseNote: null, decidedAt: null };
  listQuery = query([row]); Request.find.mockReturnValue(listQuery); Request.findById.mockReturnValue(query(row)); Request.countDocuments.mockResolvedValue(1);
  Student.find.mockReturnValue(query([{ _id: 'student' }]));
});
test('anonymous users cannot list requests', async () => {
  expect((await request(app).get('/api/extra-hours/review')).status).toBe(401);
  expect(Request.find).not.toHaveBeenCalled();
});
test.each(['Student', 'Advisor', 'Administrator'])('%s cannot access Coordinator review list or details', async (role) => {
  expect((await request(app).get('/api/extra-hours/review').set('Authorization', auth(role))).status).toBe(403);
  expect((await request(app).get(`/api/extra-hours/review/${requestId}`).set('Authorization', auth(role))).status).toBe(403);
  expect(Request.find).not.toHaveBeenCalled();
});
test('deactivated or reassigned accounts cannot use stale Coordinator tokens', async () => {
  User.findById.mockReturnValue({ select: async () => ({ role: 'Coordinator', isActive: false }) });
  expect((await request(app).get('/api/extra-hours/review').set('Authorization', auth())).status).toBe(403);
  User.findById.mockReturnValue({ select: async () => ({ role: 'Advisor', isActive: true }) });
  expect((await request(app).get('/api/extra-hours/review').set('Authorization', auth())).status).toBe(403);
});
test('Coordinator sees all decisions without advisor or roster scoping', async () => {
  Request.find.mockReturnValue(query(['Pending', 'Approved', 'Rejected'].map((decision) => ({ ...row, decision }))));
  Request.countDocuments.mockResolvedValue(3);
  const result = await request(app).get('/api/extra-hours/review').set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(result.body.requests.map((item) => item.decision)).toEqual(['Pending', 'Approved', 'Rejected']);
  expect(Request.find).toHaveBeenCalledWith({});
  expect(result.body.pagination.total).toBe(3);
  expect(result.headers['cache-control']).toBe('no-store');
});
test('pagination uses stable ordering and exposes the total count', async () => {
  Request.countDocuments.mockResolvedValue(41);
  const result = await request(app).get('/api/extra-hours/review?page=2&limit=20').set('Authorization', auth());
  expect(result.body.pagination).toEqual({ page: 2, limit: 20, total: 41, totalPages: 3 });
  expect(listQuery.skip).toHaveBeenCalledWith(20);
  expect(listQuery.limit).toHaveBeenCalledWith(20);
  expect(listQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
});
test.each(['page=0', 'page=1.5', 'limit=101', 'page=abc', 'studentId=other'])('invalid pagination/query %s is rejected', async (params) => {
  expect((await request(app).get(`/api/extra-hours/review?${params}`).set('Authorization', auth())).status).toBe(400);
  expect(Request.find).not.toHaveBeenCalled();
});
test('empty list is a successful empty state', async () => {
  Request.find.mockReturnValue(query([])); Request.countDocuments.mockResolvedValue(0);
  const result = await request(app).get('/api/extra-hours/review').set('Authorization', auth());
  expect(result.status).toBe(200); expect(result.body.requests).toEqual([]); expect(result.body.pagination.totalPages).toBe(0);
});
test('details include all FR 84 information and distinguish the eligibility snapshot', async () => {
  const result = await request(app).get(`/api/extra-hours/review/${requestId}`).set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(result.body.request).toMatchObject({ student: { studentId: '64-12345' }, requestingAdvisor: { name: 'Advisor' },
    items: [{ code: 'CSEN 701', requestedHours: 3, ratePerHour: 800, subtotal: 2400 }], requestedHours: 3, totalCost: 2400,
    eligibility: { gpa: 2, checks: [{ passed: true }] }, decision: 'Pending', settlementStatus: 'Not Applicable', submittedAt: row.createdAt.toISOString(), eligibilityRecordedAt: row.createdAt.toISOString() });
  expect(result.text).not.toMatch(/private-password|internal-key|internal-fingerprint/);
});
test('list excludes internal retry keys and populated credentials', async () => {
  const result = await request(app).get('/api/extra-hours/review').set('Authorization', auth());
  expect(result.text).not.toMatch(/private-password|internal-key|internal-fingerprint/);
});
test('missing related records remain viewable without crashing', async () => {
  Object.assign(row, { student: null, requestingAdvisor: null, term: null });
  const result = await request(app).get(`/api/extra-hours/review/${requestId}`).set('Authorization', auth());
  expect(result.status).toBe(200); expect(result.body.request.student).toBeNull();
});
test('malformed and missing request IDs return 400/404', async () => {
  expect((await request(app).get('/api/extra-hours/review/not-an-id').set('Authorization', auth())).status).toBe(400);
  Request.findById.mockReturnValue(query(null));
  expect((await request(app).get(`/api/extra-hours/review/${requestId}`).set('Authorization', auth())).status).toBe(404);
});
test('database failures produce safe errors', async () => {
  Request.find.mockImplementation(() => { throw new Error('private database details'); });
  const result = await request(app).get('/api/extra-hours/review').set('Authorization', auth());
  expect(result.status).toBe(500); expect(result.text).not.toContain('private database details');
});
test.each(['64-12345', '64-', '123'])('student ID search %s filters requests before pagination', async (search) => {
  const result = await request(app).get('/api/extra-hours/review').query({ search, page: 2, limit: 1 }).set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(Student.find).toHaveBeenCalledWith({ studentId: { $regex: search } });
  expect(Request.find).toHaveBeenCalledWith({ student: { $in: ['student'] } });
  expect(Request.countDocuments).toHaveBeenCalledWith({ student: { $in: ['student'] } });
  expect(listQuery.skip).toHaveBeenCalledWith(1);
});
test('search whitespace is trimmed, and an empty search restores all requests', async () => {
  await request(app).get('/api/extra-hours/review').query({ search: ' 64-12345 ' }).set('Authorization', auth());
  expect(Student.find).toHaveBeenCalledWith({ studentId: { $regex: '64-12345' } });
  Request.find.mockClear(); Student.find.mockClear();
  await request(app).get('/api/extra-hours/review').query({ search: '  ' }).set('Authorization', auth());
  expect(Request.find).toHaveBeenCalledWith({});
  expect(Student.find).not.toHaveBeenCalled();
});
test('a nonmatching student ID produces an empty scope, never all requests', async () => {
  Student.find.mockReturnValue(query([])); Request.find.mockReturnValue(query([])); Request.countDocuments.mockResolvedValue(0);
  const result = await request(app).get('/api/extra-hours/review?search=99-99999').set('Authorization', auth());
  expect(result.body.requests).toEqual([]);
  expect(Request.find).toHaveBeenCalledWith({ student: { $in: [] } });
  expect(result.body.pagination.total).toBe(0);
});
test.each(['.*', '[a-z]', 'student name', '1'.repeat(33)])('unsafe or oversized search %s is rejected', async (search) => {
  expect((await request(app).get('/api/extra-hours/review').query({ search }).set('Authorization', auth())).status).toBe(400);
  expect(Student.find).not.toHaveBeenCalled();
});
test('non-Coordinators cannot use search to enumerate student requests', async () => {
  expect((await request(app).get('/api/extra-hours/review?search=64').set('Authorization', auth('Advisor'))).status).toBe(403);
  expect(Student.find).not.toHaveBeenCalled();
});

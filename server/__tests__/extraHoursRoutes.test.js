process.env.JWT_SECRET = 'extra-hours-test';
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../services/extraHoursSubmissionService', () => ({ loadContext: jest.fn(), evaluateSelection: jest.fn(), submitRequest: jest.fn() }));
const express = require('express'), request = require('supertest'), jwt = require('jsonwebtoken');
const User = require('../models/User');
const { submitRequest } = require('../services/extraHoursSubmissionService');
const app = express(); app.use(express.json()); app.use('/api/extra-hours', require('../routes/extraHoursRoutes'));
const advisor = '507f1f77bcf86cd799439011';
const payload = { studentId: '507f1f77bcf86cd799439012', termId: '507f1f77bcf86cd799439013', items: [{ courseId: '507f1f77bcf86cd799439014', requestedHours: 3 }], submissionKey: 'a0000000-0000-4000-8000-000000000001' };
const auth = (role = 'Advisor') => `Bearer ${jwt.sign({ userId: advisor, role }, process.env.JWT_SECRET)}`;
beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockReturnValue({ select: async () => ({ role: 'Advisor', isActive: true }) });
  submitRequest.mockResolvedValue({ request: { _id: 'request', reference: 'EHR-test', requestedHours: 3, totalCost: 2400, decision: 'Pending' }, replay: false });
});
test('students, coordinators and anonymous users cannot request increases', async () => {
  expect((await request(app).post('/api/extra-hours').send(payload)).status).toBe(401);
  for (const role of ['Student', 'Coordinator', 'Administrator']) expect((await request(app).post('/api/extra-hours').set('Authorization', auth(role)).send(payload)).status).toBe(403);
});
test('current account role and activation are checked beyond the JWT', async () => {
  User.findById.mockReturnValue({ select: async () => ({ role: 'Advisor', isActive: false }) });
  expect((await request(app).post('/api/extra-hours').set('Authorization', auth()).send(payload)).status).toBe(403);
});
test('advisor identity is bound to the token, and saved request is returned', async () => {
  const result = await request(app).post('/api/extra-hours').set('Authorization', auth()).send(payload);
  expect(result.status).toBe(201);
  expect(submitRequest).toHaveBeenCalledWith(advisor, payload);
  expect(result.body.request.decision).toBe('Pending');
});
test.each([{ requestingAdvisorId: 'attacker' }, { totalCost: 1 }, { graduationAssessment: { withinOneYear: true } }])('forged server-controlled fields are rejected: %j', async (extra) => {
  expect((await request(app).post('/api/extra-hours').set('Authorization', auth()).send({ ...payload, ...extra })).status).toBe(400);
  expect(submitRequest).not.toHaveBeenCalled();
});
test('a successful retry returns 200 rather than a second creation', async () => {
  submitRequest.mockResolvedValue({ request: {}, replay: true });
  expect((await request(app).post('/api/extra-hours').set('Authorization', auth()).send(payload)).status).toBe(200);
});
test('structured eligibility failures are shown without exposing database errors', async () => {
  submitRequest.mockRejectedValue(Object.assign(new Error('Not eligible'), { status: 422, issues: [{ code: 'PROBATION', message: 'Probation blocks increases' }] }));
  expect((await request(app).post('/api/extra-hours').set('Authorization', auth()).send(payload)).status).toBe(422);
});

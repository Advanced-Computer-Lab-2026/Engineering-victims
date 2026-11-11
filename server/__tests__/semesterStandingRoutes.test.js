process.env.JWT_SECRET = 'standing-test-secret';
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/SemesterStanding', () => ({ find: jest.fn() }));
jest.mock('../services/probationService', () => ({ finalizeStanding: jest.fn(), evaluateStandings: jest.fn() }));
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const Standing = require('../models/SemesterStanding');
const { finalizeStanding, evaluateStandings } = require('../services/probationService');
const app = express();
app.use(express.json());
app.use('/api/semester-standings', require('../routes/semesterStandingRoutes'));
const studentId = '507f1f77bcf86cd799439011';
const termId = '507f1f77bcf86cd799439012';
const actorId = '507f1f77bcf86cd799439013';
const path = `/api/semester-standings/${studentId}/${termId}/finalize`;
const auth = (role = 'Coordinator') => `Bearer ${jwt.sign({ userId: actorId, role }, process.env.JWT_SECRET)}`;
beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockReturnValue({ select: async () => ({ role: 'Coordinator', isActive: true }) });
  finalizeStanding.mockResolvedValue({ revision: 1, standing: 'Probation' });
  Standing.find.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
  evaluateStandings.mockReturnValue({ latest: null, count: 0 });
});
test('anonymous, student and advisor requests cannot finalize standings', async () => {
  expect((await request(app).post(path)).status).toBe(401);
  for (const role of ['Student', 'Advisor']) {
    expect((await request(app).post(path).set('Authorization', auth(role))).status).toBe(403);
  }
  expect(finalizeStanding).not.toHaveBeenCalled();
});
test('deactivated staff and revoked roles cannot use stale JWTs', async () => {
  User.findById.mockReturnValue({ select: async () => ({ role: 'Coordinator', isActive: false }) });
  expect((await request(app).post(path).set('Authorization', auth())).status).toBe(403);
  User.findById.mockReturnValue({ select: async () => ({ role: 'Advisor', isActive: true }) });
  expect((await request(app).post(path).set('Authorization', auth())).status).toBe(403);
});
test.each(['Coordinator', 'Administrator'])('%s can submit authoritative GPA with server-bound actor and owner', async (role) => {
  User.findById.mockReturnValue({ select: async () => ({ role, isActive: true }) });
  const result = await request(app).post(path).set('Authorization', auth(role)).send({
    cumulativeGpa: 3.8, expectedRevision: 0, studentId: 'attacker', actorId: 'attacker', standing: 'Good Standing',
  });
  expect(result.status).toBe(200);
  expect(finalizeStanding).toHaveBeenCalledWith({ studentId, termId, cumulativeGpa: 3.8, expectedRevision: 0, actorId });
  expect(result.headers['cache-control']).toBe('no-store');
});
test('invalid IDs do not reach finalization', async () => {
  expect((await request(app).post(`/api/semester-standings/invalid/${termId}/finalize`).set('Authorization', auth())).status).toBe(400);
  expect(finalizeStanding).not.toHaveBeenCalled();
});
test('revision conflict is returned without exposing internal data', async () => {
  finalizeStanding.mockRejectedValue(Object.assign(new Error('Reload the current revision.'), { status: 409 }));
  const result = await request(app).post(path).set('Authorization', auth()).send({ cumulativeGpa: 3.8, expectedRevision: 0 });
  expect(result.status).toBe(409);
});
test('internal database errors are not exposed to clients', async () => {
  finalizeStanding.mockRejectedValue(new Error('private connection details'));
  const result = await request(app).post(path).set('Authorization', auth());
  expect(result.status).toBe(500);
  expect(result.text).not.toContain('private connection details');
});
test('authorized staff can read history and a derived probation flag', async () => {
  evaluateStandings.mockReturnValue({ count: 0, latest: { standing: 'Good Standing' } });
  const result = await request(app).get(`/api/semester-standings/${studentId}`).set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(result.body.summary).toEqual({ consecutiveProbationSemesters: 0, isProbation: false, standing: 'Good Standing' });
  expect(Standing.find).toHaveBeenCalledWith({ student: studentId });
});

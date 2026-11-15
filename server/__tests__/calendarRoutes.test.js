process.env.JWT_SECRET = 'calendar-test-secret';
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Student', () => ({ findOne: jest.fn() }));
jest.mock('../models/CalendarConnection', () => ({ findOne: jest.fn(), exists: jest.fn(), create: jest.fn(), findOneAndDelete: jest.fn() }));
jest.mock('../models/CalendarOAuthState', () => ({ deleteMany: jest.fn(), create: jest.fn(), findOneAndDelete: jest.fn() }));
jest.mock('../services/calendarScheduleService', () => ({ timezone: () => 'Africa/Cairo', synchronize: jest.fn() }));
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const Connection = require('../models/CalendarConnection');
const State = require('../models/CalendarOAuthState');
const google = require('../services/googleCalendarClient');
const { synchronize } = require('../services/calendarScheduleService');
const app = express();
app.use(express.json());
app.use('/api/calendar', require('../routes/calendarRoutes'));
const userId = '507f1f77bcf86cd799439011';
const auth = (role = 'Student', id = userId) => `Bearer ${jwt.sign({ userId: id, role }, process.env.JWT_SECRET)}`;
const state = 's'.repeat(43);
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'http://localhost:5173/schedule';
  process.env.CALENDAR_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
  User.findById.mockReturnValue({ select: async () => ({ email: 'own@student.guc.edu.eg', role: 'Student', isActive: true }) });
  Student.findOne.mockResolvedValue({ _id: 'student-1', studentType: 'Normal Student' });
  Connection.findOne.mockReturnValue({ lean: async () => null });
  Connection.exists.mockResolvedValue(false);
  Connection.create.mockResolvedValue({});
  State.findOneAndDelete.mockReturnValue({ select: async () => ({ verifier: google.encrypt('pkce-verifier') }) });
  Connection.findOneAndDelete.mockReturnValue({ select: async () => null });
});
test('anonymous and staff accounts cannot access calendar routes', async () => {
  expect((await request(app).get('/api/calendar')).status).toBe(401);
  for (const role of ['Advisor', 'Coordinator', 'Administrator']) {
    expect((await request(app).get('/api/calendar').set('Authorization', auth(role))).status).toBe(403);
  }
});
test('stale tokens cannot bypass account deactivation', async () => {
  User.findById.mockReturnValue({ select: async () => ({ role: 'Student', isActive: false }) });
  expect((await request(app).post('/api/calendar/sync').set('Authorization', auth())).status).toBe(403);
});
test('status is safe when configuration is absent', async () => {
  delete process.env.CALENDAR_TOKEN_KEY;
  const result = await request(app).get('/api/calendar').set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ configured: false, connected: false });
});
test('status never returns stored tokens or Google subject identifiers', async () => {
  Connection.findOne.mockReturnValue({ lean: async () => ({ googleSubject: 'private-subject', refreshToken: 'private-token', googleEmail: 'test@gmail.com' }) });
  const result = await request(app).get('/api/calendar').set('Authorization', auth());
  expect(JSON.stringify(result.body)).not.toMatch(/private-token|private-subject/);
  expect(result.headers['cache-control']).toBe('no-store');
});
test('OAuth begins with offline consent, PKCE and expiring hashed state', async () => {
  const result = await request(app).post('/api/calendar/connect').set('Authorization', auth());
  expect(result.status).toBe(200);
  const url = new URL(result.body.url);
  expect(url.searchParams.get('state')).toBe(result.body.state);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('access_type')).toBe('offline');
  const stored = State.create.mock.calls[0][0];
  expect(stored.user).toBe(userId);
  expect(stored.stateHash).toBe(google.hash(result.body.state));
  expect(stored.verifier).not.toBe(google.decrypt(stored.verifier));
  expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
});
test('calendar endpoints reject unsupported providers', async () => {
  const result = await request(app).post('/api/calendar/connect')
    .set('Authorization', auth())
    .send({ provider: 'unsupported' });
  expect(result.status).toBe(400);
});
test('expired, replayed or other-user state cannot exchange a code', async () => {
  State.findOneAndDelete.mockReturnValue({ select: async () => null });
  const exchange = jest.spyOn(google, 'exchangeCode');
  const result = await request(app).post('/api/calendar/complete').set('Authorization', auth()).send({ code: 'code', state });
  expect(result.status).toBe(400);
  expect(State.findOneAndDelete.mock.calls[0][0]).toMatchObject({ user: userId, stateHash: google.hash(state) });
  expect(exchange).not.toHaveBeenCalled();
});
test('completion encrypts refresh tokens and binds them to the authenticated user', async () => {
  jest.spyOn(google, 'exchangeCode').mockResolvedValue({ refreshToken: 'refresh-secret', subject: 'google-1', email: 'test@gmail.com' });
  const result = await request(app).post('/api/calendar/complete').set('Authorization', auth()).send({ code: 'code', state, userId: 'attacker' });
  expect(result.status).toBe(200);
  const stored = Connection.create.mock.calls[0][0];
  expect(stored.user).toBe(userId);
  expect(stored.refreshToken).not.toBe('refresh-secret');
  expect(google.decrypt(stored.refreshToken)).toBe('refresh-secret');
  expect(JSON.stringify(result.body)).not.toContain('refresh-secret');
});
test('sync cannot target a user or student supplied in the body', async () => {
  Connection.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ provider: 'google' }) }) });
  synchronize.mockResolvedValue({ count: 2 });
  const result = await request(app).post('/api/calendar/sync').set('Authorization', auth()).send({ userId: 'attacker', studentId: 'another-student' });
  expect(result.status).toBe(200);
  expect(synchronize).toHaveBeenCalledWith(userId, { _id: 'student-1', studentType: 'Normal Student' });
});
test('disconnect deletes credentials locally and attempts provider revocation', async () => {
  Connection.findOneAndDelete.mockReturnValue({ select: async () => ({ refreshToken: google.encrypt('refresh-secret') }) });
  const revoke = jest.spyOn(google, 'revoke').mockResolvedValue({});
  const result = await request(app).delete('/api/calendar').set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(revoke).toHaveBeenCalledWith('refresh-secret');
  expect(result.body.message).toContain('remain');
});
test('disconnect reports remote revocation failure without retaining credentials', async () => {
  Connection.findOneAndDelete.mockReturnValue({ select: async () => ({ refreshToken: google.encrypt('refresh-secret') }) });
  jest.spyOn(google, 'revoke').mockRejectedValue(new Error('network'));
  const result = await request(app).delete('/api/calendar').set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(result.body.message).toContain('Google account permissions');
});

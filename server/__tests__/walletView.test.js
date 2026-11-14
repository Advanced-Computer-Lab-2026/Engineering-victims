process.env.JWT_SECRET = 'wallet-view-test';
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Student', () => ({ findOne: jest.fn() }));
jest.mock('../models/Wallet', () => ({ findOne: jest.fn() }));
jest.mock('../models/WalletTransaction', () => ({ find: jest.fn(), DIRECTION: { Refund: 'Credit', Payment: 'Debit' } }));
const express = require('express'), jwt = require('jsonwebtoken'), http = require('supertest');
const User = require('../models/User'), Student = require('../models/Student'), Wallet = require('../models/Wallet'), Transaction = require('../models/WalletTransaction');
const app = express(); app.use('/wallet', require('../routes/walletRoutes'));
const auth = (role = 'Student') => `Bearer ${jwt.sign({ userId: 'account', role }, process.env.JWT_SECRET)}`;
const q = (value) => { const query = { select: () => query, sort: jest.fn(() => query), lean: async () => value }; return query; };
beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockReturnValue(q({ email: 'own@student.guc.edu.eg', role: 'Student', isActive: true }));
  Student.findOne.mockReturnValue(q({ _id: 'student', studentType: 'Advising Student', isActive: true }));
  Wallet.findOne.mockReturnValue(q({ _id: 'wallet', balance: 300, currency: 'EGP' }));
  Transaction.find.mockReturnValue(q([
    { _id: 'debit', type: 'Payment', amount: 200, balanceAfter: 300, occurredAt: '2026-11-14', requestReference: 'EHR-1', paymentReference: 'PAY-1' },
    { _id: 'credit', type: 'Refund', amount: 500, balanceAfter: 500, occurredAt: '2026-11-13', requestReference: 'EHR-0', paymentReference: 'PAY-0' },
  ]));
});
test('FR89 own wallet and full history include direction, amount, date, references and resulting balance', async () => {
  const result = await http(app).get('/wallet/me').set('Authorization', auth());
  expect(result.status).toBe(200); expect(result.body.wallet.balance).toBe(300);
  expect(result.body.summary).toEqual({ totalCredits: 500, totalDebits: 200, count: 2 });
  expect(result.body.transactions[0]).toMatchObject({ direction: 'Debit', amount: 200, balanceAfter: 300, occurredAt: '2026-11-14', requestReference: 'EHR-1', paymentReference: 'PAY-1' });
  expect(result.body.transactions[1].direction).toBe('Credit');
  expect(Student.findOne).toHaveBeenCalledWith({ email: 'own@student.guc.edu.eg' });
  expect(Wallet.findOne).toHaveBeenCalledWith({ student: 'student' });
  expect(Transaction.find).toHaveBeenCalledWith({ wallet: 'wallet', student: 'student' });
  expect(result.headers['cache-control']).toBe('no-store');
});
test('ownership parameters cannot redirect the authenticated wallet lookup', async () => {
  await http(app).get('/wallet/me?studentId=other&walletId=other').set('Authorization', auth());
  expect(Wallet.findOne).toHaveBeenCalledWith({ student: 'student' });
});
test('new wallet has zero balance and no transactions', async () => {
  Wallet.findOne.mockReturnValue(q(null)); const result = await http(app).get('/wallet/me').set('Authorization', auth());
  expect(result.body.wallet).toMatchObject({ balance: 0, currency: 'EGP' }); expect(result.body.transactions).toEqual([]); expect(Transaction.find).not.toHaveBeenCalled();
});
test('anonymous rejected', async () => { expect((await http(app).get('/wallet/me')).status).toBe(401); });
test.each(['Coordinator', 'Advisor', 'Administrator'])('%s cannot read wallet', async (role) => {
  expect((await http(app).get('/wallet/me').set('Authorization', auth(role))).status).toBe(403); expect(Wallet.findOne).not.toHaveBeenCalled();
});
test.each([{ role: 'Student', isActive: false }, { role: 'Advisor', isActive: true }])('stale account denied %j', async (user) => {
  User.findById.mockReturnValue(q(user)); expect((await http(app).get('/wallet/me').set('Authorization', auth())).status).toBe(403); expect(Wallet.findOne).not.toHaveBeenCalled();
});
test.each([{ studentType: 'Normal Student', isActive: true }, { studentType: 'Advising Student', isActive: false }])('directory eligibility checked %j', async (student) => {
  Student.findOne.mockReturnValue(q(student)); expect((await http(app).get('/wallet/me').set('Authorization', auth())).status).toBe(403); expect(Wallet.findOne).not.toHaveBeenCalled();
});
test('missing directory record returns 404', async () => { Student.findOne.mockReturnValue(q(null)); expect((await http(app).get('/wallet/me').set('Authorization', auth())).status).toBe(404); });
test('missing account returns 404', async () => { User.findById.mockReturnValue(q(null)); expect((await http(app).get('/wallet/me').set('Authorization', auth())).status).toBe(404); });
test('database error details are private', async () => {
  Wallet.findOne.mockImplementation(() => { throw new Error('private database error'); });
  const result = await http(app).get('/wallet/me').set('Authorization', auth()); expect(result.status).toBe(500); expect(result.text).not.toContain('private database error');
});

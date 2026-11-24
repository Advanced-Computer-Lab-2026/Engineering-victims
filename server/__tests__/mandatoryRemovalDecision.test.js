/**
 * Req 68: a Coordinator opens a removal request from the list.
 * Req 69: a Coordinator approves or rejects it and provides a response note.
 *   "Approval removes the course from the mandatory list and any unprocessed
 *    draft schedule. Rejection leaves it mandatory."
 *
 * The decision rule is tested as a pure function. The routes run on a bare
 * Express app with the models and the schedule workflow mocked, so no MongoDB
 * is needed and each test states exactly what the database holds.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/Student', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../models/Course', () => ({ find: jest.fn() }));
jest.mock('../models/User', () => ({ find: jest.fn() }));
jest.mock('../models/MandatoryRemovalRequest', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  distinct: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../services/mandatoryCourseService', () => ({ buildMandatoryCandidates: jest.fn() }));
jest.mock('../services/academicHistoryService', () => ({ buildAcademicHistory: jest.fn() }));
jest.mock('../services/notificationService', () => ({ notifyRole: jest.fn().mockResolvedValue([]) }));
jest.mock('../services/transactionSupport', () => ({
  supportsTransactions: jest.fn(),
  isTransactionUnsupportedError: jest.fn(),
}));
jest.mock('../services/advisingScheduleWorkflowService', () => ({
  runInTransaction: jest.fn(),
  removeCourseFromUnprocessedSchedule: jest.fn(),
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');
const { supportsTransactions, isTransactionUnsupportedError } = require('../services/transactionSupport');
const { runInTransaction, removeCourseFromUnprocessedSchedule } = require('../services/advisingScheduleWorkflowService');
const routes = require('../routes/mandatoryRemovalRoutes');
const { applyDecision, NOTE_LIMIT } = require('../services/mandatoryRemovalService');

const app = express();
app.use(express.json());
app.use('/api/mandatory-removal-requests', routes);

const oid = () => new mongoose.Types.ObjectId();
const coordinatorId = oid();
const tokenFor = (role) =>
  `Bearer ${jwt.sign({ userId: String(role === 'Coordinator' ? coordinatorId : oid()), role }, process.env.JWT_SECRET)}`;

const NOW = new Date('2026-11-24T09:00:00.000Z');
const pending = (overrides = {}) => ({
  _id: oid(),
  status: 'Pending',
  student: oid(),
  course: oid(),
  advisor: oid(),
  responseNote: '',
  decidedBy: null,
  decidedAt: null,
  ...overrides,
});

describe('applyDecision (req 69)', () => {
  const decide = (request, overrides = {}) =>
    applyDecision({ request, decision: 'approve', note: 'Valid first-makeup case.', coordinatorId, now: NOW, ...overrides });

  it('approves a pending request and records who decided, when, and the trimmed note', () => {
    const request = pending();

    expect(decide(request, { note: '  Valid first-makeup case.  ' })).toBeNull();

    expect(request).toMatchObject({
      status: 'Approved',
      responseNote: 'Valid first-makeup case.',
      decidedBy: coordinatorId,
      decidedAt: NOW,
    });
  });

  it('rejects a pending request the same way', () => {
    const request = pending();
    expect(decide(request, { decision: 'reject', note: 'Not a valid case.' })).toBeNull();
    expect(request).toMatchObject({ status: 'Rejected', responseNote: 'Not a valid case.', decidedBy: coordinatorId });
  });

  it.each(['Approved', 'Rejected'])('refuses a request that is already %s and changes nothing', (status) => {
    const request = pending({ status });
    expect(decide(request)).toBe('Only a pending removal request can be decided.');
    expect(request.status).toBe(status);
    expect(request.decidedBy).toBeNull();
  });

  it.each([undefined, '', '   ', null, 42])('requires a response note (%p)', (note) => {
    const request = pending();
    expect(decide(request, { note })).toBe('Add a response note for the Advisor.');
    expect(request.status).toBe('Pending');
  });

  it('accepts a note of exactly the limit and refuses one character more', () => {
    expect(decide(pending(), { note: 'x'.repeat(NOTE_LIMIT) })).toBeNull();
    const request = pending();
    expect(decide(request, { note: 'x'.repeat(NOTE_LIMIT + 1) })).toBe(`Keep the response note under ${NOTE_LIMIT} characters.`);
    expect(request.status).toBe('Pending');
  });

  it.each([undefined, '', 'approved', 'maybe', 'APPROVE'])('refuses %p as a decision', (decision) => {
    const request = pending();
    expect(decide(request, { decision })).toBe('Choose whether to approve or reject the removal request.');
    expect(request.status).toBe('Pending');
  });
});

describe('GET /api/mandatory-removal-requests/:id (req 68)', () => {
  const populatedQuery = (row) => {
    const query = { populate: jest.fn(() => query), lean: jest.fn(() => Promise.resolve(row)) };
    return query;
  };
  const get = (id, role = 'Coordinator') =>
    request(app).get(`/api/mandatory-removal-requests/${id}`).set('Authorization', tokenFor(role));

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('opens one request, in the same shape as a list row', async () => {
    const row = {
      ...pending({ status: 'Rejected', responseNote: 'Not a valid case.' }),
      student: { _id: oid(), fullName: 'Omar Nabil', studentId: '64-20046', major: 'Computer Science' },
      advisor: { _id: oid(), fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' },
      course: { _id: oid(), code: 'CSEN 301', name: 'Data Structures and Algorithms', creditHours: 6 },
      pairedCourse: null,
      category: 'First-makeup eligibility',
      reason: 'The first makeup has not been sat yet.',
      createdAt: new Date('2026-11-20T10:00:00.000Z'),
    };
    MandatoryRemovalRequest.findById.mockReturnValue(populatedQuery(row));

    const res = await get(row._id).expect(200);

    expect(res.body.request).toMatchObject({
      id: String(row._id),
      status: 'Rejected',
      responseNote: 'Not a valid case.',
      student: { fullName: 'Omar Nabil', studentId: '64-20046' },
      advisor: { fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' },
      course: { code: 'CSEN 301' },
      category: 'First-makeup eligibility',
      reason: 'The first makeup has not been sat yet.',
    });
  });

  it('answers an unknown request with 404 and a malformed id with 400', async () => {
    MandatoryRemovalRequest.findById.mockReturnValue(populatedQuery(null));
    await get(oid()).expect(404);

    const res = await get('not-an-id').expect(400);
    expect(res.body.message).toBe('That removal request id is not valid.');
  });

  it.each(['Advisor', 'Administrator', 'Student'])('is closed to a %s', async (role) => {
    await get(oid(), role).expect(403);
    expect(MandatoryRemovalRequest.findById).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    await request(app).get(`/api/mandatory-removal-requests/${oid()}`).expect(401);
  });
});

describe('POST /api/mandatory-removal-requests/:id/decision (req 69)', () => {
  const post = (id, body, role = 'Coordinator') =>
    request(app)
      .post(`/api/mandatory-removal-requests/${id}/decision`)
      .set('Authorization', tokenFor(role))
      .send(body);

  /** findById(id) resolving to a document with a real `status`, as the controller mutates it. */
  const stored = (row) => MandatoryRemovalRequest.findById.mockResolvedValueOnce(row);
  /** The re-read after a decision, with the populate chain. */
  const rereadAs = (row) => {
    const query = { populate: jest.fn(() => query), lean: jest.fn(() => Promise.resolve(row)) };
    MandatoryRemovalRequest.findById.mockReturnValueOnce(query);
  };

  beforeEach(() => {
    jest.resetAllMocks();
    supportsTransactions.mockResolvedValue(true);
    isTransactionUnsupportedError.mockReturnValue(false);
    // The real runInTransaction hands the callback a session; so does this one.
    runInTransaction.mockImplementation(async (work) => work({ id: 'session' }));
    removeCourseFromUnprocessedSchedule.mockResolvedValue({ skipped: null, slotRows: 2, drafts: 1 });
  });

  describe('rejecting', () => {
    it('saves the decision with one guarded update and changes nothing else', async () => {
      const row = pending();
      stored(row);
      MandatoryRemovalRequest.findOneAndUpdate.mockResolvedValue({ ...row, status: 'Rejected' });
      rereadAs({ ...row, status: 'Rejected', responseNote: 'Not a valid case.' });

      const res = await post(row._id, { decision: 'reject', note: ' Not a valid case. ' }).expect(200);

      expect(MandatoryRemovalRequest.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: row._id, status: 'Pending' },
        {
          $set: {
            status: 'Rejected',
            responseNote: 'Not a valid case.',
            decidedBy: String(coordinatorId),
            decidedAt: expect.any(Date),
          },
        },
        { new: true }
      );
      // "Rejection leaves it mandatory": no schedule is touched and no transaction is needed.
      expect(removeCourseFromUnprocessedSchedule).not.toHaveBeenCalled();
      expect(runInTransaction).not.toHaveBeenCalled();
      expect(supportsTransactions).not.toHaveBeenCalled();
      expect(res.body.message).toBe('Removal rejected. The course stays mandatory for this student.');
      expect(res.body.request.status).toBe('Rejected');
    });

    it('works on a database that cannot run transactions', async () => {
      supportsTransactions.mockResolvedValue(false);
      const row = pending();
      stored(row);
      MandatoryRemovalRequest.findOneAndUpdate.mockResolvedValue({ ...row, status: 'Rejected' });
      rereadAs({ ...row, status: 'Rejected' });

      await post(row._id, { decision: 'reject', note: 'No.' }).expect(200);
    });

    it('refuses, rather than overwrites, a request decided in the meantime', async () => {
      const row = pending();
      stored(row);
      MandatoryRemovalRequest.findOneAndUpdate.mockResolvedValue(null);

      const res = await post(row._id, { decision: 'reject', note: 'No.' }).expect(409);

      expect(res.body.message).toBe('This removal request has already been decided.');
    });
  });

  describe('approving', () => {
    it('saves the decision and takes the course out of the unprocessed schedule in one transaction', async () => {
      const row = pending();
      stored(row);
      MandatoryRemovalRequest.findOneAndUpdate.mockResolvedValue({ ...row, status: 'Approved' });
      rereadAs({ ...row, status: 'Approved', responseNote: 'Valid.' });

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(200);

      expect(runInTransaction).toHaveBeenCalledTimes(1);
      expect(MandatoryRemovalRequest.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: row._id, status: 'Pending' },
        { $set: expect.objectContaining({ status: 'Approved', responseNote: 'Valid.' }) },
        { new: true, session: { id: 'session' } }
      );
      expect(removeCourseFromUnprocessedSchedule).toHaveBeenCalledWith({
        studentId: row.student,
        courseId: row.course,
        session: { id: 'session' },
      });
      expect(res.body.message).toBe('Removal approved. The course is no longer mandatory for this student.');
      expect(res.body.request.status).toBe('Approved');
    });

    it('is refused up front, with nothing changed, on a database without transactions', async () => {
      supportsTransactions.mockResolvedValue(false);
      const row = pending();
      stored(row);

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(503);

      expect(res.body.message).toMatch(/needs a database that supports transactions.*Nothing was changed/);
      expect(MandatoryRemovalRequest.findOneAndUpdate).not.toHaveBeenCalled();
      expect(removeCourseFromUnprocessedSchedule).not.toHaveBeenCalled();
    });

    it('is refused, with nothing changed, when transaction support cannot be checked', async () => {
      supportsTransactions.mockRejectedValue(new Error('connection lost'));
      const row = pending();
      stored(row);
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(503);

      expect(res.body.message).toMatch(/Could not reach the database.*Nothing was changed/);
      expect(MandatoryRemovalRequest.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('does not touch any schedule when the request was decided in the meantime', async () => {
      const row = pending();
      stored(row);
      MandatoryRemovalRequest.findOneAndUpdate.mockResolvedValue(null);

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(409);

      expect(res.body.message).toBe('This removal request has already been decided.');
      expect(removeCourseFromUnprocessedSchedule).not.toHaveBeenCalled();
    });

    it('answers a refusal raised by the schedule workflow with its own status and message', async () => {
      const row = pending();
      stored(row);
      MandatoryRemovalRequest.findOneAndUpdate.mockResolvedValue({ ...row, status: 'Approved' });
      removeCourseFromUnprocessedSchedule.mockRejectedValue(Object.assign(new Error('Advising student not found.'), { status: 404 }));

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(404);

      expect(res.body.message).toBe('Advising student not found.');
    });

    it('answers an unexpected failure with a fixed message, never the internal error', async () => {
      const row = pending();
      stored(row);
      MandatoryRemovalRequest.findOneAndUpdate.mockResolvedValue({ ...row, status: 'Approved' });
      removeCourseFromUnprocessedSchedule.mockRejectedValue(new Error('secret connection string leaked'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(500);

      expect(res.body.message).toBe('Could not save the decision. Nothing was changed.');
      expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    });

    it("reports the server's own refusal to start a transaction as 503", async () => {
      const row = pending();
      stored(row);
      isTransactionUnsupportedError.mockReturnValue(true);
      runInTransaction.mockRejectedValue(new Error('Transaction numbers are only allowed on a replica set member'));

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(503);

      expect(res.body.message).toMatch(/Nothing was changed/);
    });
  });

  describe('refusals before anything is saved', () => {
    it.each([
      [{ decision: 'approve' }, 'Add a response note for the Advisor.'],
      [{ decision: 'approve', note: '   ' }, 'Add a response note for the Advisor.'],
      [{ note: 'Valid.' }, 'Choose whether to approve or reject the removal request.'],
      [{ decision: 'maybe', note: 'Valid.' }, 'Choose whether to approve or reject the removal request.'],
      [{ decision: 'approve', note: 'x'.repeat(NOTE_LIMIT + 1) }, `Keep the response note under ${NOTE_LIMIT} characters.`],
    ])('answers %j with 400', async (body, message) => {
      const row = pending();
      stored(row);

      const res = await post(row._id, body).expect(400);

      expect(res.body.message).toBe(message);
      expect(MandatoryRemovalRequest.findOneAndUpdate).not.toHaveBeenCalled();
      expect(removeCourseFromUnprocessedSchedule).not.toHaveBeenCalled();
    });

    it.each(['Approved', 'Rejected'])('answers a request that is already %s with 409', async (status) => {
      const row = pending({ status });
      stored(row);

      const res = await post(row._id, { decision: 'approve', note: 'Valid.' }).expect(409);

      expect(res.body.message).toBe('Only a pending removal request can be decided.');
      expect(MandatoryRemovalRequest.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('answers an unknown request and a malformed id with 404', async () => {
      MandatoryRemovalRequest.findById.mockResolvedValueOnce(null);
      await post(oid(), { decision: 'approve', note: 'Valid.' }).expect(404);
      await post('not-an-id', { decision: 'approve', note: 'Valid.' }).expect(404);
      expect(MandatoryRemovalRequest.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each(['Advisor', 'Administrator', 'Student'])('is closed to a %s', async (role) => {
      await post(oid(), { decision: 'approve', note: 'Valid.' }, role).expect(403);
      expect(MandatoryRemovalRequest.findById).not.toHaveBeenCalled();
    });

    it('requires a session', async () => {
      await request(app).post(`/api/mandatory-removal-requests/${oid()}/decision`).send({}).expect(401);
    });
  });
});

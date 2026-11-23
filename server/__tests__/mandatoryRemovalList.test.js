/**
 * Req 65: a Coordinator views a list of mandatory-course removal requests.
 * Req 66: ...and searches it using a student ID, course code or Advisor's name
 *         or GUC email.
 *
 * The real routes, auth middleware and controller run on a bare Express app;
 * only the models are mocked, so no MongoDB is needed.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/Student', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../models/Course', () => ({ find: jest.fn() }));
jest.mock('../models/User', () => ({ find: jest.fn() }));
jest.mock('../models/MandatoryRemovalRequest', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  distinct: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../services/mandatoryCourseService', () => ({ buildMandatoryCandidates: jest.fn() }));
jest.mock('../services/academicHistoryService', () => ({ buildAcademicHistory: jest.fn() }));
jest.mock('../services/notificationService', () => ({ notifyRole: jest.fn().mockResolvedValue([]) }));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Student = require('../models/Student');
const Course = require('../models/Course');
const User = require('../models/User');
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');
const routes = require('../routes/mandatoryRemovalRoutes');

const app = express();
app.use(express.json());
app.use('/api/mandatory-removal-requests', routes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role) => `Bearer ${jwt.sign({ userId: String(oid()), role }, process.env.JWT_SECRET)}`;

/** MandatoryRemovalRequest.find(...).sort(...).populate(...)...lean() resolving to `rows`. */
const requestQuery = (rows) => {
  const query = {
    sort: jest.fn(() => query),
    populate: jest.fn(() => query),
    lean: jest.fn(() => Promise.resolve(rows)),
  };
  return query;
};
/** Model.find(...).select(...).lean() resolving to `rows`. */
const idQuery = (rows) => ({ select: () => ({ lean: () => Promise.resolve(rows) }) });

const row = (overrides = {}) => ({
  _id: oid(),
  status: 'Pending',
  student: { _id: oid(), fullName: 'Omar Nabil', studentId: '64-20046', major: 'Computer Science' },
  advisor: { _id: oid(), fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' },
  course: { _id: oid(), code: 'CSEN 301', name: 'Data Structures and Algorithms', creditHours: 6 },
  pairedCourse: null,
  category: 'First-makeup eligibility',
  reason: 'The first makeup has not been sat yet.',
  responseNote: '',
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
  decidedAt: null,
  decidedBy: null,
  ...overrides,
});

const list = (search, role = 'Coordinator') => {
  const req = request(app).get('/api/mandatory-removal-requests').query(search === undefined ? {} : { search });
  return req.set('Authorization', tokenFor(role));
};

beforeEach(() => {
  jest.resetAllMocks();
  MandatoryRemovalRequest.distinct.mockResolvedValue([]);
  Student.find.mockReturnValue(idQuery([]));
  Course.find.mockReturnValue(idQuery([]));
  User.find.mockReturnValue(idQuery([]));
});

describe('GET /api/mandatory-removal-requests (req 65)', () => {
  it('lists every removal request, newest first, in the shape the request screens use', async () => {
    const first = row();
    const second = row({ status: 'Rejected', responseNote: 'Not a valid case.' });
    const query = requestQuery([first, second]);
    MandatoryRemovalRequest.find.mockReturnValue(query);

    const res = await list().expect(200);

    expect(MandatoryRemovalRequest.find).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.requests).toHaveLength(2);
    expect(res.body.requests[0]).toMatchObject({
      id: String(first._id),
      status: 'Pending',
      student: { fullName: 'Omar Nabil', studentId: '64-20046' },
      advisor: { fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' },
      course: { code: 'CSEN 301' },
      category: 'First-makeup eligibility',
      reason: 'The first makeup has not been sat yet.',
    });
    expect(res.body.requests[1]).toMatchObject({ status: 'Rejected', responseNote: 'Not a valid case.' });
    // Nothing is filtered, and no Advisor has asked yet, so there are no Advisor choices.
    expect(res.body.filters).toEqual({ status: '', advisor: '', submittedFrom: '', submittedTo: '' });
    expect(res.body.advisors).toEqual([]);
    // Without a search nothing narrows the list, so the other models are not queried.
    expect(Student.find).not.toHaveBeenCalled();
    expect(Course.find).not.toHaveBeenCalled();
    expect(User.find).not.toHaveBeenCalled();
  });

  it('returns an empty list cleanly', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));
    const res = await list().expect(200);
    expect(res.body.requests).toEqual([]);
  });

  it.each(['Advisor', 'Administrator', 'Student'])('is closed to a %s', async (role) => {
    await list(undefined, role).expect(403);
    expect(MandatoryRemovalRequest.find).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    await request(app).get('/api/mandatory-removal-requests').expect(401);
  });

  it('answers a server error with a message and no stack', async () => {
    MandatoryRemovalRequest.find.mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await list().expect(500);
    expect(res.body.message).toBe('Could not load the removal requests');
  });
});

describe('searching the list (req 66)', () => {
  it('matches a student ID, a course code, or an Advisor by name or GUC email, and nothing else', async () => {
    const studentId = oid();
    const courseId = oid();
    const advisorId = oid();
    Student.find.mockReturnValue(idQuery([{ _id: studentId }]));
    Course.find.mockReturnValue(idQuery([{ _id: courseId }]));
    User.find.mockReturnValue(idQuery([{ _id: advisorId }]));
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([row()]));

    const res = await list('mona').expect(200);

    // Each lookup touches only the field the sheet names.
    expect(Student.find).toHaveBeenCalledWith({ studentId: expect.any(RegExp) });
    expect(Course.find).toHaveBeenCalledWith({ code: expect.any(RegExp) });
    expect(User.find).toHaveBeenCalledWith({
      role: 'Advisor',
      $or: [{ fullName: expect.any(RegExp) }, { email: expect.any(RegExp) }],
    });
    // The requests are narrowed to those ids.
    expect(MandatoryRemovalRequest.find).toHaveBeenCalledWith({
      $or: [{ student: { $in: [studentId] } }, { course: { $in: [courseId] } }, { advisor: { $in: [advisorId] } }],
    });
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.search).toBe('mona');
  });

  it('ignores case', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));
    await list('csen 301').expect(200);

    const pattern = Course.find.mock.calls[0][0].code;
    expect(pattern.flags).toContain('i');
    expect(pattern.test('CSEN 301')).toBe(true);
  });

  it('finds an Advisor by GUC email', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));
    await list('mona.adel@guc.edu.eg').expect(200);

    const [{ $or }] = User.find.mock.calls[0].slice(0, 1).map((filter) => filter);
    expect($or[1].email.test('mona.adel@guc.edu.eg')).toBe(true);
    expect($or[1].email.test('karim.fahmy@guc.edu.eg')).toBe(false);
  });

  it('matches part of a student ID', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));
    await list('20046').expect(200);

    const pattern = Student.find.mock.calls[0][0].studentId;
    expect(pattern.test('64-20046')).toBe(true);
    expect(pattern.test('64-30010')).toBe(false);
  });

  it('reads what is typed literally, so "." and "(" are not patterns', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));
    await list('.*').expect(200);

    const pattern = Student.find.mock.calls[0][0].studentId;
    expect(pattern.test('64-20046')).toBe(false);
    expect(pattern.test('abc.*def')).toBe(true);
  });

  it('does not fail on text that would be an invalid pattern', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));
    await list('(').expect(200);
    await list('[').expect(200);
  });

  it('returns no rows when nothing matches, without matching on empty id lists by accident', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));

    const res = await list('zzz-no-such').expect(200);

    expect(res.body.requests).toEqual([]);
    expect(MandatoryRemovalRequest.find).toHaveBeenCalledWith({
      $or: [{ student: { $in: [] } }, { course: { $in: [] } }, { advisor: { $in: [] } }],
    });
  });

  it('trims the text, and treats blank text as no search', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));

    await list('   ').expect(200);

    expect(MandatoryRemovalRequest.find).toHaveBeenCalledWith({});
    expect(Student.find).not.toHaveBeenCalled();
  });

  it('refuses text longer than 80 characters before querying anything', async () => {
    const res = await list('a'.repeat(81)).expect(400);

    expect(res.body.message).toBe('Search text can be at most 80 characters.');
    expect(MandatoryRemovalRequest.find).not.toHaveBeenCalled();
    expect(Student.find).not.toHaveBeenCalled();
  });

  it('is closed to an Advisor, as the list is', async () => {
    await list('mona', 'Advisor').expect(403);
    expect(Student.find).not.toHaveBeenCalled();
  });
});

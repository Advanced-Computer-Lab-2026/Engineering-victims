/**
 * Req 67: a Coordinator filters the mandatory-course removal requests by
 * Advisor, request status and submission date.
 *
 * The parsing and the filter are tested directly; the route runs on a bare
 * Express app with only the models mocked, so no MongoDB is needed.
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
const { parseListQuery, buildListFilter } = require('../services/mandatoryRemovalListService');

const app = express();
app.use(express.json());
app.use('/api/mandatory-removal-requests', routes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role) => `Bearer ${jwt.sign({ userId: String(oid()), role }, process.env.JWT_SECRET)}`;

const requestQuery = (rows) => {
  const query = {
    sort: jest.fn(() => query),
    populate: jest.fn(() => query),
    lean: jest.fn(() => Promise.resolve(rows)),
  };
  return query;
};
const idQuery = (rows) => ({ select: () => ({ lean: () => Promise.resolve(rows) }) });
const advisorQuery = (rows) => ({ select: () => ({ sort: () => ({ lean: () => Promise.resolve(rows) }) }) });

const NONE = { search: '', status: '', advisor: '', submittedFrom: '', submittedTo: '' };
const values = (overrides) => ({ ...NONE, ...overrides });

beforeEach(() => {
  jest.resetAllMocks();
  MandatoryRemovalRequest.distinct.mockResolvedValue([]);
  Student.find.mockReturnValue(idQuery([]));
  Course.find.mockReturnValue(idQuery([]));
  User.find.mockReturnValue(idQuery([]));
});

describe('parseListQuery', () => {
  it('reads an empty query as no search and no filters', () => {
    expect(parseListQuery({})).toEqual({ values: NONE });
  });

  it('trims every value and treats blank as not set', () => {
    const advisor = String(oid());
    expect(parseListQuery({ status: ' Pending ', advisor: `  ${advisor} `, submittedFrom: '  ', search: '  csen  ' })).toEqual({
      values: values({ status: 'Pending', advisor, search: 'csen' }),
    });
  });

  it.each(['Pending', 'Approved', 'Rejected'])('accepts the %s status', (status) => {
    expect(parseListQuery({ status }).values.status).toBe(status);
  });

  it.each(['pending', 'Withdrawn', 'Open', 'all'])('refuses %p as a status', (status) => {
    expect(parseListQuery({ status }).error).toBe('Status must be one of Pending, Approved, Rejected.');
  });

  it.each(['abc', '123', 'none', '{"$ne":null}'])('refuses %p as an Advisor', (advisor) => {
    expect(parseListQuery({ advisor }).error).toBe('That Advisor filter is not valid.');
  });

  it.each([
    [{ submittedFrom: '2026-02-30' }],
    [{ submittedTo: 'yesterday' }],
    [{ submittedFrom: '2026-13-01' }],
  ])('refuses %j as a submission date', (query) => {
    expect(parseListQuery(query).error).toBe('Enter a valid submission date.');
  });

  it('refuses a start date after the end date, and accepts the same day', () => {
    expect(parseListQuery({ submittedFrom: '2026-11-20', submittedTo: '2026-11-10' }).error).toBe(
      'The submission start date must be on or before the end date.'
    );
    expect(parseListQuery({ submittedFrom: '2026-11-20', submittedTo: '2026-11-20' }).error).toBeUndefined();
  });

  it('refuses a parameter given more than once or as an object, so it cannot become a query operator', () => {
    expect(parseListQuery({ status: ['Pending', 'Approved'] }).error).toBe('Each search and filter must be a single value.');
    expect(parseListQuery({ advisor: { $ne: '' } }).error).toBe('Each search and filter must be a single value.');
    expect(parseListQuery({ search: ['a', 'b'] }).error).toBe('Each search and filter must be a single value.');
  });

  it('refuses search text longer than 80 characters', () => {
    expect(parseListQuery({ search: 'a'.repeat(81) }).error).toBe('Search text can be at most 80 characters.');
    expect(parseListQuery({ search: 'a'.repeat(80) }).error).toBeUndefined();
  });
});

describe('buildListFilter', () => {
  it('is empty when nothing is set, so every request is listed', async () => {
    expect(await buildListFilter(NONE)).toEqual({});
  });

  it('filters by status alone', async () => {
    expect(await buildListFilter(values({ status: 'Rejected' }))).toEqual({ status: 'Rejected' });
  });

  it('filters by the Advisor who asked', async () => {
    const advisor = String(oid());
    expect(await buildListFilter(values({ advisor }))).toEqual({ advisor });
  });

  it('includes the whole end day when only a calendar date is given', async () => {
    const filter = await buildListFilter(values({ submittedFrom: '2026-11-10', submittedTo: '2026-11-12' }));

    expect(filter.createdAt.$gte).toEqual(new Date('2026-11-10T00:00:00.000Z'));
    // Midnight after the 12th, exclusive: a request at 23:59 on the 12th is in.
    expect(filter.createdAt.$lt).toEqual(new Date('2026-11-13T00:00:00.000Z'));
  });

  it('takes a start date alone or an end date alone', async () => {
    const from = await buildListFilter(values({ submittedFrom: '2026-11-10' }));
    expect(from.createdAt.$gte).toEqual(new Date('2026-11-10T00:00:00.000Z'));
    expect(from.createdAt.$lt).toBeUndefined();

    const to = await buildListFilter(values({ submittedTo: '2026-11-10' }));
    expect(to.createdAt.$gte).toBeUndefined();
    expect(to.createdAt.$lt).toEqual(new Date('2026-11-11T00:00:00.000Z'));
  });

  it('combines the search and every filter with AND', async () => {
    const advisor = String(oid());
    const studentId = oid();
    Student.find.mockReturnValue(idQuery([{ _id: studentId }]));

    const filter = await buildListFilter(
      values({ search: '64-20046', status: 'Pending', advisor, submittedFrom: '2026-11-10' })
    );

    expect(filter.$and).toHaveLength(4);
    expect(filter.$and[0].$or[0]).toEqual({ student: { $in: [studentId] } });
    expect(filter.$and[1]).toEqual({ status: 'Pending' });
    expect(filter.$and[2]).toEqual({ advisor });
    expect(filter.$and[3].createdAt.$gte).toEqual(new Date('2026-11-10T00:00:00.000Z'));
  });

  it('does not look anything up when there is no search text', async () => {
    await buildListFilter(values({ status: 'Pending' }));
    expect(Student.find).not.toHaveBeenCalled();
    expect(Course.find).not.toHaveBeenCalled();
    expect(User.find).not.toHaveBeenCalled();
  });
});

describe('GET /api/mandatory-removal-requests with filters (req 67)', () => {
  const get = (query) =>
    request(app).get('/api/mandatory-removal-requests').query(query).set('Authorization', tokenFor('Coordinator'));

  it('narrows the list and echoes the filters that were applied', async () => {
    const advisor = String(oid());
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));

    const res = await get({ status: 'Approved', advisor, submittedFrom: '2026-11-01', submittedTo: '2026-11-30' }).expect(200);

    const filter = MandatoryRemovalRequest.find.mock.calls[0][0];
    expect(filter.$and).toEqual([
      { status: 'Approved' },
      { advisor },
      { createdAt: { $gte: new Date('2026-11-01T00:00:00.000Z'), $lt: new Date('2026-12-01T00:00:00.000Z') } },
    ]);
    expect(res.body.filters).toEqual({
      status: 'Approved',
      advisor,
      submittedFrom: '2026-11-01',
      submittedTo: '2026-11-30',
    });
  });

  it('offers the Advisors who have asked, from all requests and not only the filtered ones', async () => {
    const mona = { _id: oid(), fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' };
    const karim = { _id: oid(), fullName: 'Dr. Karim Fahmy', email: 'karim.fahmy@guc.edu.eg' };
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));
    MandatoryRemovalRequest.distinct.mockResolvedValue([mona._id, karim._id]);
    User.find.mockReturnValue(advisorQuery([karim, mona]));

    const res = await get({ status: 'Rejected' }).expect(200);

    // Asked for with no filter, so choosing a status never shrinks the Advisor choices.
    expect(MandatoryRemovalRequest.distinct).toHaveBeenCalledWith('advisor');
    expect(User.find).toHaveBeenCalledWith({ _id: { $in: [mona._id, karim._id] } });
    expect(res.body.advisors).toEqual([
      { id: String(karim._id), fullName: 'Dr. Karim Fahmy', email: 'karim.fahmy@guc.edu.eg' },
      { id: String(mona._id), fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' },
    ]);
  });

  it.each([
    [{ status: 'Done' }, 'Status must be one of Pending, Approved, Rejected.'],
    [{ advisor: 'nobody' }, 'That Advisor filter is not valid.'],
    [{ submittedFrom: '2026-02-30' }, 'Enter a valid submission date.'],
    [{ submittedFrom: '2026-12-01', submittedTo: '2026-11-01' }, 'The submission start date must be on or before the end date.'],
  ])('answers %j with 400 and queries nothing', async (query, message) => {
    const res = await get(query).expect(400);

    expect(res.body.message).toBe(message);
    expect(MandatoryRemovalRequest.find).not.toHaveBeenCalled();
  });

  it('combines a search with a filter', async () => {
    MandatoryRemovalRequest.find.mockReturnValue(requestQuery([]));

    await get({ search: 'mona', status: 'Pending' }).expect(200);

    const filter = MandatoryRemovalRequest.find.mock.calls[0][0];
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[1]).toEqual({ status: 'Pending' });
  });

  it('is closed to an Advisor', async () => {
    await request(app)
      .get('/api/mandatory-removal-requests')
      .query({ status: 'Pending' })
      .set('Authorization', tokenFor('Advisor'))
      .expect(403);
    expect(MandatoryRemovalRequest.find).not.toHaveBeenCalled();
  });
});

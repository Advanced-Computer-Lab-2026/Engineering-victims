/**
 * Req 64: an Advisor requests the removal of a mandatory course and provides
 * the reason.
 *
 * The rule is tested as a pure function. The routes run on a bare Express app
 * with the models and the two record-reading services mocked, so no MongoDB is
 * needed and each test states exactly what the student's record holds.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/Student', () => ({ findById: jest.fn() }));
jest.mock('../models/MandatoryRemovalRequest', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
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
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');
const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const { notifyRole } = require('../services/notificationService');
const mandatoryRemovalRoutes = require('../routes/mandatoryRemovalRoutes');
const {
  FIRST_MAKEUP,
  SECOND_MAKEUP,
  OVER_HOURS,
  RESTRICTED_PAIR,
  familyOf,
  validateRemovalRequest,
} = require('../services/mandatoryRemovalService');

const app = express();
app.use(express.json());
app.use('/api/mandatory-removal-requests', mandatoryRemovalRoutes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role, userId = oid()) =>
  `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;

const candidate = (code, reason) => ({
  course: { id: oid(), code, name: `Course ${code}`, creditHours: 4 },
  reason,
  semester: 3,
  term: reason === 'Failed' ? '2025/2026 Winter' : null,
  inProgress: false,
  mandatory: true,
});

const CSEN301 = candidate('CSEN 301', 'Failed');
const MATH301 = candidate('MATH 301', 'Failed');
const MATH401 = candidate('MATH 401', 'Unattended');
const CSEN403 = candidate('CSEN 403', 'Unattended');
const DE303 = candidate('DE 303', 'Unattended');
const CANDIDATES = [CSEN301, MATH301, MATH401, CSEN403, DE303];

const check = (overrides = {}) =>
  validateRemovalRequest({
    candidates: CANDIDATES,
    completedHours: 100,
    courseId: CSEN301.course.id,
    category: FIRST_MAKEUP,
    reason: 'The first makeup has not been sat yet.',
    ...overrides,
  });

describe('valid cases for removing a mandatory course', () => {
  it('accepts a first makeup for a failed course', () => {
    expect(check()).toBeNull();
  });

  it('refuses a makeup for a course that was never attended', () => {
    expect(check({ courseId: MATH401.course.id })).toMatch(/only to a failed course/);
    expect(check({ courseId: MATH401.course.id, category: SECOND_MAKEUP })).toMatch(/only to a failed course/);
  });

  it('accepts a second makeup with one or two failed courses and refuses it with three', () => {
    expect(check({ category: SECOND_MAKEUP })).toBeNull();
    const three = [...CANDIDATES, candidate('CSEN 202', 'Failed')];
    expect(check({ category: SECOND_MAKEUP, candidates: three })).toMatch(/one or two failed courses/);
    // The first makeup is always available, however many courses were failed.
    expect(check({ category: FIRST_MAKEUP, candidates: three })).toBeNull();
  });

  it('accepts deferral only above 157 completed hours', () => {
    expect(check({ category: OVER_HOURS, completedHours: 157 })).toMatch(/more than 157/);
    expect(check({ category: OVER_HOURS, completedHours: 158 })).toBeNull();
    // Deferral is not tied to how the course became mandatory.
    expect(check({ category: OVER_HOURS, completedHours: 160, courseId: DE303.course.id })).toBeNull();
  });

  it('accepts a restricted pair of two mandatory courses from the same family', () => {
    expect(
      check({ category: RESTRICTED_PAIR, courseId: MATH301.course.id, pairedCourseId: MATH401.course.id })
    ).toBeNull();
    expect(
      check({ category: RESTRICTED_PAIR, courseId: CSEN301.course.id, pairedCourseId: CSEN403.course.id })
    ).toBeNull();
  });

  it('refuses a pair that is missing, mixed, the same course twice or outside CS, Math and Physics', () => {
    const pair = { category: RESTRICTED_PAIR, courseId: MATH301.course.id };
    expect(check(pair)).toMatch(/other course of the restricted pair/);
    expect(check({ ...pair, pairedCourseId: MATH301.course.id })).toMatch(/different course/);
    expect(check({ ...pair, pairedCourseId: CSEN301.course.id })).toMatch(/must be Math courses/);
    expect(check({ ...pair, pairedCourseId: oid() })).toMatch(/must also be one of the student's mandatory/);
    expect(check({ ...pair, courseId: DE303.course.id, pairedCourseId: MATH301.course.id })).toMatch(
      /only to CS, Math or Physics/
    );
  });

  it('requires a mandatory course, a known case and a reason', () => {
    expect(check({ courseId: oid() })).toMatch(/not one of the student's mandatory courses/);
    expect(check({ category: 'Because I said so' })).toMatch(/valid cases/);
    expect(check({ reason: '   ' })).toMatch(/Explain why/);
    expect(check({ reason: 'x'.repeat(1001) })).toMatch(/under 1000/);
  });

  it('reads the subject family off the course code', () => {
    expect(familyOf('CSEN 301')).toBe('CS');
    expect(familyOf('CSIS 402')).toBe('CS');
    expect(familyOf('MATH 203')).toBe('Math');
    expect(familyOf('PHYSt 301')).toBe('Physics');
    expect(familyOf('DMET 502')).toBeNull();
  });
});

describe('mandatory-course removal request routes', () => {
  const advisorId = oid();
  const student = (overrides = {}) => ({
    _id: oid(),
    fullName: 'Ahmed Sherif',
    studentId: '64-30012',
    studentType: 'Advising Student',
    assignedAdvisor: advisorId,
    ...overrides,
  });

  /** A query that resolves to `result` however it is chained. */
  const query = (result) => {
    const chain = {
      populate: jest.fn(() => chain),
      sort: jest.fn(() => chain),
      lean: jest.fn(() => Promise.resolve(result)),
    };
    return chain;
  };

  const body = (target, overrides = {}) => ({
    studentId: String(target._id),
    courseId: String(CSEN301.course.id),
    category: FIRST_MAKEUP,
    reason: '  The first makeup has not been sat yet.  ',
    ...overrides,
  });

  beforeEach(() => {
    buildMandatoryCandidates.mockResolvedValue(CANDIDATES);
    buildAcademicHistory.mockResolvedValue({ summary: { completedHours: 100 } });
    MandatoryRemovalRequest.findOne.mockReturnValue(query(null));
  });

  afterEach(() => jest.clearAllMocks());

  it('lets only an Advisor submit, and only staff read', async () => {
    await request(app).post('/api/mandatory-removal-requests').send({}).expect(401);
    await request(app)
      .post('/api/mandatory-removal-requests')
      .set('Authorization', tokenFor('Coordinator'))
      .send({})
      .expect(403);
    await request(app)
      .get(`/api/mandatory-removal-requests/student/${oid()}`)
      .set('Authorization', tokenFor('Student'))
      .expect(403);
  });

  it('refuses an Advisor the student is not assigned to', async () => {
    const target = student();
    Student.findById.mockResolvedValue(target);
    const response = await request(app)
      .post('/api/mandatory-removal-requests')
      .set('Authorization', tokenFor('Advisor'))
      .send(body(target))
      .expect(403);
    expect(response.body.message).toMatch(/assigned Advisor/);
    expect(MandatoryRemovalRequest.create).not.toHaveBeenCalled();
  });

  it('creates a pending request, trims the reason and notifies the Coordinators', async () => {
    const target = student();
    Student.findById.mockResolvedValue(target);
    const created = { _id: oid() };
    MandatoryRemovalRequest.create.mockResolvedValue(created);
    MandatoryRemovalRequest.findById.mockReturnValue(
      query({
        _id: created._id,
        status: 'Pending',
        student: target,
        course: { _id: CSEN301.course.id, code: 'CSEN 301', name: 'Course CSEN 301', creditHours: 4 },
        category: FIRST_MAKEUP,
        reason: 'The first makeup has not been sat yet.',
        responseNote: '',
        createdAt: new Date(),
      })
    );

    const response = await request(app)
      .post('/api/mandatory-removal-requests')
      .set('Authorization', tokenFor('Advisor', advisorId))
      .send(body(target))
      .expect(201);

    expect(MandatoryRemovalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        advisor: String(advisorId),
        category: FIRST_MAKEUP,
        pairedCourse: null,
        reason: 'The first makeup has not been sat yet.',
      })
    );
    expect(response.body.request).toMatchObject({ status: 'Pending', course: { code: 'CSEN 301' } });
    expect(notifyRole).toHaveBeenCalledWith('Coordinator', expect.objectContaining({ type: 'approval' }));
  });

  it('answers 400 with the rule that failed and creates nothing', async () => {
    const target = student();
    Student.findById.mockResolvedValue(target);
    const response = await request(app)
      .post('/api/mandatory-removal-requests')
      .set('Authorization', tokenFor('Advisor', advisorId))
      .send(body(target, { category: OVER_HOURS }))
      .expect(400);
    expect(response.body.message).toMatch(/more than 157/);
    expect(MandatoryRemovalRequest.create).not.toHaveBeenCalled();
  });

  it('refuses a second request while one is pending', async () => {
    const target = student();
    Student.findById.mockResolvedValue(target);
    MandatoryRemovalRequest.findOne.mockReturnValue(query({ _id: oid(), status: 'Pending' }));
    await request(app)
      .post('/api/mandatory-removal-requests')
      .set('Authorization', tokenFor('Advisor', advisorId))
      .send(body(target))
      .expect(409);
    expect(MandatoryRemovalRequest.create).not.toHaveBeenCalled();
  });

  it('refuses a Normal Student and a malformed student id', async () => {
    Student.findById.mockResolvedValue(student({ studentType: 'Normal Student' }));
    await request(app)
      .post('/api/mandatory-removal-requests')
      .set('Authorization', tokenFor('Advisor', advisorId))
      .send(body({ _id: oid() }))
      .expect(400);
    await request(app)
      .post('/api/mandatory-removal-requests')
      .set('Authorization', tokenFor('Advisor', advisorId))
      .send({ studentId: 'nope' })
      .expect(400);
  });

  it('tells the assigned Advisor they may request, and nobody else', async () => {
    const target = student();
    Student.findById.mockResolvedValue(target);
    MandatoryRemovalRequest.find.mockReturnValue(query([]));
    const path = `/api/mandatory-removal-requests/student/${target._id}`;

    const mine = await request(app).get(path).set('Authorization', tokenFor('Advisor', advisorId)).expect(200);
    expect(mine.body).toMatchObject({ requests: [], canRequest: true });
    expect(mine.body.categories).toHaveLength(4);

    const other = await request(app).get(path).set('Authorization', tokenFor('Advisor')).expect(200);
    expect(other.body.canRequest).toBe(false);
    const coordinator = await request(app).get(path).set('Authorization', tokenFor('Coordinator')).expect(200);
    expect(coordinator.body.canRequest).toBe(false);
  });
});

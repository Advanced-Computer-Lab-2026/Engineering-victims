/**
 * Req 59: advising reason, system-calculated credit-hour allowance, schedule
 * status and bachelor-project eligibility.
 *
 * The rules are tested as pure functions. The route runs on a bare Express app
 * with only the database models mocked, so no MongoDB is needed.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/User', () => ({ findById: jest.fn(), find: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/Student', () => ({ findById: jest.fn(), find: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/CourseRecord', () => {
  const model = { find: jest.fn() };
  model.GRADE_POINTS = { A: 1.0, B: 2.0, D: 4.0, F: 5.0 };
  return model;
});
jest.mock('../models/Course', () => ({ find: jest.fn() }));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Student = require('../models/Student');
const CourseRecord = require('../models/CourseRecord');
const Course = require('../models/Course');
const advisorRoutes = require('../routes/advisorRoutes');
const {
  deriveAllowance,
  deriveBachelorEligibility,
} = require('../services/advisingOverviewService');

const app = express();
app.use('/api/advisors', advisorRoutes);

const tokenFor = (role) =>
  `Bearer ${jwt.sign({ userId: String(new mongoose.Types.ObjectId()), role }, process.env.JWT_SECRET)}`;

const course = (code, recommendedSemester, creditHours = 4) => ({
  _id: new mongoose.Types.ObjectId(),
  code,
  name: `Course ${code}`,
  creditHours,
  recommendedSemester,
});

const AS102 = course('AS 102', 1, 2);
const RPW401 = course('RPW 401', 3, 2);
const CSEN102 = course('CSEN 102', 1);
const MATH203 = course('MATH 203', 2);
const CSEN301 = course('CSEN 301', 3);
const CSEN601 = course('CSEN 601', 6);
const CSEN701 = course('CSEN 701', 7);
const CATALOGUE = [AS102, RPW401, CSEN102, MATH203, CSEN301, CSEN601, CSEN701];

const passed = (c) => ({ course: c, status: 'Completed', grade: 'B', semester: c.recommendedSemester });
const failed = (c) => ({ course: c, status: 'Completed', grade: 'F', semester: c.recommendedSemester });
const running = (c) => ({ course: c, status: 'In Progress', grade: null, semester: c.recommendedSemester });

const student = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  fullName: 'Omar Nabil',
  studentId: '64-20046',
  studentType: 'Advising Student',
  major: 'Computer Science',
  currentSemester: 5,
  academicStanding: 'Good Standing',
  advisingReason: 'Unattended courses',
  workflowStatus: 'Draft',
  blockingStep: 'Advisor to complete the draft',
  lastUpdateAt: new Date('2026-11-01T10:00:00Z'),
  ...overrides,
});

describe('credit-hour allowance', () => {
  it.each([
    [1, 34],
    [3, 34],
    [4, 34],
    [5, 30],
    [6, 30],
    [7, 28],
    [8, 24],
    [10, 24],
  ])('gives semester %i the standard %i hours', (currentSemester, hours) => {
    const allowance = deriveAllowance({ student: student({ currentSemester }), gpa: 2.1 });
    expect(allowance.standardHours).toBe(hours);
    expect(allowance.allowedHours).toBe(hours);
    expect(allowance.isProbation).toBe(false);
    expect(allowance.canReceiveIncrease).toBe(true);
  });

  it.each([
    [4, 26],
    [6, 23],
    [7, 21],
    [8, 18],
  ])('gives a probation student in semester %i 25%% less, rounded up: %i hours', (currentSemester, hours) => {
    const allowance = deriveAllowance({
      student: student({ currentSemester, academicStanding: 'Probation' }),
      gpa: 3.9,
    });
    expect(allowance.allowedHours).toBe(hours);
    expect(allowance.reductionPercent).toBe(25);
    expect(allowance.canReceiveIncrease).toBe(false);
  });

  it('treats a GPA of exactly 3.70 as probation and 3.69 as not', () => {
    expect(deriveAllowance({ student: student(), gpa: 3.7 }).isProbation).toBe(true);
    expect(deriveAllowance({ student: student(), gpa: 3.69 }).isProbation).toBe(false);
  });

  it('does not call an ungraded student probation', () => {
    expect(deriveAllowance({ student: student(), gpa: null }).isProbation).toBe(false);
  });
});

describe('bachelor-project eligibility', () => {
  const upToSix = [AS102, RPW401, CSEN102, MATH203, CSEN301, CSEN601];

  it('is eligible when every semester 1-6 and English course is passed', () => {
    const result = deriveBachelorEligibility({ records: upToSix.map(passed), catalogue: CATALOGUE });
    expect(result.eligible).toBe(true);
    expect(result.outstandingCourses).toHaveLength(0);
  });

  it('ignores courses after semester 6', () => {
    const result = deriveBachelorEligibility({ records: upToSix.map(passed), catalogue: CATALOGUE });
    expect(result.outstandingCourses.map((entry) => entry.course.code)).not.toContain('CSEN 701');
  });

  it('stays eligible with one or two failed semester 1-6 courses', () => {
    const records = [passed(AS102), passed(RPW401), passed(CSEN102), passed(MATH203), failed(CSEN301), failed(CSEN601)];
    const result = deriveBachelorEligibility({ records, catalogue: CATALOGUE });
    expect(result.eligible).toBe(true);
    expect(result.outstandingCourses.map((entry) => entry.state)).toEqual(['Failed', 'Failed']);
  });

  it('is not eligible with three failed courses', () => {
    const records = [passed(AS102), passed(RPW401), passed(CSEN102), failed(MATH203), failed(CSEN301), failed(CSEN601)];
    expect(deriveBachelorEligibility({ records, catalogue: CATALOGUE }).eligible).toBe(false);
  });

  it('does not tolerate a course that was never attended', () => {
    const records = [passed(AS102), passed(RPW401), passed(CSEN102), passed(MATH203), passed(CSEN301)];
    const result = deriveBachelorEligibility({ records, catalogue: CATALOGUE });
    expect(result.eligible).toBe(false);
    expect(result.outstandingCourses[0]).toMatchObject({ state: 'Not attended' });
  });

  it('does not count a course still in progress as completed', () => {
    const records = [passed(AS102), passed(RPW401), passed(CSEN102), passed(MATH203), passed(CSEN301), running(CSEN601)];
    const result = deriveBachelorEligibility({ records, catalogue: CATALOGUE });
    expect(result.eligible).toBe(false);
    expect(result.outstandingCourses[0]).toMatchObject({ state: 'In progress' });
  });

  it('is not eligible while RPW is missing, even with only one failed course', () => {
    const records = [passed(AS102), failed(RPW401), passed(CSEN102), passed(MATH203), passed(CSEN301), passed(CSEN601)];
    const result = deriveBachelorEligibility({ records, catalogue: CATALOGUE });
    expect(result.eligible).toBe(false);
    expect(result.englishComplete).toBe(false);
    expect(result.outstandingEnglish.map((entry) => entry.course.code)).toEqual(['RPW 401']);
  });

  it('counts a failed course as passed once a retake is passed', () => {
    const records = [...upToSix.map(passed), failed(CSEN301)];
    expect(deriveBachelorEligibility({ records, catalogue: CATALOGUE }).eligible).toBe(true);
  });
});

describe('GET /api/advisors/advising-students/:id/overview', () => {
  /** A query object that resolves to `result` whichever chain the service uses. */
  const query = (result) => {
    const chain = {
      populate: jest.fn(() => chain),
      select: jest.fn(() => chain),
      sort: jest.fn(() => chain),
      lean: jest.fn(() => Promise.resolve(result)),
    };
    return chain;
  };

  const mockRecords = (records) => {
    CourseRecord.find.mockImplementation(() => query(records));
    Course.find.mockImplementation(() => query(CATALOGUE.map((c) => ({ ...c, prerequisites: [] }))));
  };

  afterEach(() => jest.clearAllMocks());

  it('requires a signed-in Advisor, Coordinator or Administrator', async () => {
    const id = new mongoose.Types.ObjectId();
    await request(app).get(`/api/advisors/advising-students/${id}/overview`).expect(401);
    await request(app)
      .get(`/api/advisors/advising-students/${id}/overview`)
      .set('Authorization', tokenFor('Student'))
      .expect(403);
  });

  it.each(['Advisor', 'Coordinator', 'Administrator'])('answers a %s with the calculated overview', async (role) => {
    const target = student({ currentSemester: 7, academicStanding: 'Probation' });
    Student.findById.mockResolvedValue(target);
    mockRecords([passed(AS102), passed(RPW401), passed(CSEN102), passed(MATH203), failed(CSEN301), passed(CSEN601)]);

    const response = await request(app)
      .get(`/api/advisors/advising-students/${target._id}/overview`)
      .set('Authorization', tokenFor(role))
      .expect(200);

    expect(response.body.overview).toMatchObject({
      advisingReason: 'Unattended courses',
      allowance: { standardHours: 28, allowedHours: 21, isProbation: true, canReceiveIncrease: false },
      schedule: { status: 'Draft', blockingStep: 'Advisor to complete the draft' },
      bachelorProject: { eligible: true },
    });
  });

  it('refuses a Normal Student and a malformed id', async () => {
    Student.findById.mockResolvedValue(student({ studentType: 'Normal Student' }));
    await request(app)
      .get(`/api/advisors/advising-students/${new mongoose.Types.ObjectId()}/overview`)
      .set('Authorization', tokenFor('Coordinator'))
      .expect(404);
    await request(app)
      .get('/api/advisors/advising-students/not-an-id/overview')
      .set('Authorization', tokenFor('Coordinator'))
      .expect(400);
  });
});

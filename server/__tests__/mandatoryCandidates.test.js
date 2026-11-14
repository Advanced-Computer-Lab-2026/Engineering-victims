/**
 * Req 61: failed and unattended courses as mandatory-course candidates.
 *
 * The real routes, auth middleware, controller and candidate service run on a
 * bare Express app; only the database models are mocked, so no MongoDB is
 * needed and each test states exactly which records the student has.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Student', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/CourseRecord', () => ({ find: jest.fn() }));
jest.mock('../models/Course', () => ({ find: jest.fn() }));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Student = require('../models/Student');
const CourseRecord = require('../models/CourseRecord');
const Course = require('../models/Course');
const academicHistoryRoutes = require('../routes/academicHistoryRoutes');
const { deriveCandidates, approvedRemovalsFor } = require('../services/mandatoryCourseService');

const app = express();
app.use('/api/academic-history', academicHistoryRoutes);

const tokenFor = (role) => `Bearer ${jwt.sign({ userId: String(new mongoose.Types.ObjectId()), role }, process.env.JWT_SECRET)}`;

const makeStudent = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  fullName: 'Omar Nabil',
  email: 'omar.nabil@student.guc.edu.eg',
  studentId: '64-20046',
  studentType: 'Advising Student',
  major: 'Computer Science',
  currentSemester: 4,
  academicStanding: 'Good Standing',
  assignedAdvisor: null,
  ...overrides,
});

const course = (code, recommendedSemester) => ({
  _id: new mongoose.Types.ObjectId(),
  code,
  name: `Course ${code}`,
  creditHours: 6,
  recommendedSemester,
});

const CSEN102 = course('CSEN 102', 1);
const MATH103 = course('MATH 103', 1);
const CSEN202 = course('CSEN 202', 2);
const MATH203 = course('MATH 203', 3);
const CSEN401 = course('CSEN 401', 4);
const CSEN501 = course('CSEN 501', 5);
const CATALOGUE = [CSEN102, MATH103, CSEN202, MATH203, CSEN401, CSEN501];

const completed = (c, grade, semester, term) => ({ course: c, status: 'Completed', grade, semester, term });
const inProgress = (c, semester, term) => ({ course: c, status: 'In Progress', grade: null, semester, term });

/** A clean semester-4 history: semesters 1-3 passed, semester 4 in progress. */
const cleanRecords = () => [
  completed(CSEN102, 'A', 1, '2024/2025 Winter'),
  completed(MATH103, 'B', 1, '2024/2025 Winter'),
  completed(CSEN202, 'B+', 2, '2024/2025 Spring'),
  completed(MATH203, 'A-', 3, '2025/2026 Winter'),
  inProgress(CSEN401, 4, '2025/2026 Spring'),
];

const derive = (records, student = makeStudent()) => deriveCandidates({ student, records, catalogue: CATALOGUE });

describe('deriveCandidates', () => {
  it('lists a failed course as a mandatory candidate', () => {
    const records = cleanRecords().map((row) => (row.course === CSEN202 ? { ...row, grade: 'F' } : row));

    expect(derive(records)).toEqual([
      {
        course: { id: CSEN202._id, code: 'CSEN 202', name: 'Course CSEN 202', creditHours: 6 },
        reason: 'Failed',
        semester: 2,
        term: '2024/2025 Spring',
        inProgress: false,
        mandatory: true,
      },
    ]);
  });

  it('lists a required past-semester course with no attempt as Unattended', () => {
    const records = cleanRecords().filter((row) => row.course !== MATH103);

    expect(derive(records)).toEqual([
      {
        course: { id: MATH103._id, code: 'MATH 103', name: 'Course MATH 103', creditHours: 6 },
        reason: 'Unattended',
        semester: 1,
        term: null,
        inProgress: false,
        mandatory: true,
      },
    ]);
  });

  it('does not call current or future-semester courses unattended', () => {
    // CSEN 401 (semester 4, the current one) and CSEN 501 (semester 5) have no record.
    const records = cleanRecords().filter((row) => row.course !== CSEN401);

    expect(derive(records)).toEqual([]);
  });

  it('drops a failed course once it has been passed', () => {
    const records = [
      ...cleanRecords().map((row) => (row.course === CSEN202 ? { ...row, grade: 'F' } : row)),
      completed(CSEN202, 'C', 3, '2025/2026 Spring'),
    ];

    expect(derive(records)).toEqual([]);
  });

  it('keeps a failed course that is being retaken, flagged in progress', () => {
    const records = [
      ...cleanRecords().map((row) => (row.course === CSEN202 ? { ...row, grade: 'F' } : row)),
      inProgress(CSEN202, 4, '2025/2026 Spring'),
    ];

    const [candidate, ...rest] = derive(records);
    expect(rest).toEqual([]);
    expect(candidate).toMatchObject({ reason: 'Failed', mandatory: true, inProgress: true, term: '2024/2025 Spring' });
    expect(candidate.course.code).toBe('CSEN 202');
  });

  it('returns one candidate per course however many times it was failed', () => {
    const records = [
      ...cleanRecords().map((row) => (row.course === CSEN102 ? { ...row, grade: 'F' } : row)),
      completed(CSEN102, 'F', 3, '2025/2026 Winter'),
    ];

    const candidates = derive(records);
    expect(candidates).toHaveLength(1);
    // The latest failed attempt is the one shown.
    expect(candidates[0]).toMatchObject({ reason: 'Failed', semester: 3, term: '2025/2026 Winter' });
  });

  it('returns an empty list for a student who owes nothing', () => {
    expect(derive(cleanRecords())).toEqual([]);
  });

  it('calls nothing unattended when the current semester is unknown', () => {
    expect(derive([], makeStudent({ currentSemester: undefined }))).toEqual([]);
  });

  it('sorts failed and unattended candidates by semester, then code', () => {
    const records = cleanRecords()
      .filter((row) => row.course !== MATH103)
      .map((row) => (row.course === MATH203 ? { ...row, grade: 'F' } : row));

    expect(derive(records).map((c) => [c.course.code, c.reason])).toEqual([
      ['MATH 103', 'Unattended'],
      ['MATH 203', 'Failed'],
    ]);
  });

  it('leaves out a course once an approved removal applies', () => {
    const records = cleanRecords().map((row) => (row.course === CSEN202 ? { ...row, grade: 'F' } : row));
    const candidates = deriveCandidates({
      student: makeStudent(),
      records,
      catalogue: CATALOGUE,
      approvedRemovals: new Set([String(CSEN202._id)]),
    });

    expect(candidates).toEqual([]);
  });

  it('returns only mandatory candidates', () => {
    const records = cleanRecords()
      .filter((row) => row.course !== MATH103)
      .map((row) => (row.course === CSEN202 ? { ...row, grade: 'F' } : row));

    const candidates = derive(records);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.mandatory === true)).toBe(true);
  });

  it('has no approved removals until req 64-69 exist', async () => {
    expect((await approvedRemovalsFor(makeStudent())).size).toBe(0);
  });
});

describe('GET /api/academic-history/:studentId/mandatory-candidates', () => {
  /** Student.findById(...).populate(...) resolving to `student`. */
  const populated = (student) => ({ populate: jest.fn().mockResolvedValue(student) });

  const withData = (student, records) => {
    Student.findById.mockReturnValue(populated(student));
    CourseRecord.find.mockReturnValue({ populate: () => ({ lean: () => Promise.resolve(records) }) });
    Course.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(CATALOGUE) }) });
  };

  const url = (id) => `/api/academic-history/${id}/mandatory-candidates`;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each(['Advisor', 'Coordinator'])('lets a %s view the candidates', async (role) => {
    const student = makeStudent();
    const records = cleanRecords().map((row) => (row.course === CSEN102 ? { ...row, grade: 'F' } : row));
    withData(student, records);

    const res = await request(app).get(url(student._id)).set('Authorization', tokenFor(role));

    expect(res.status).toBe(200);
    expect(res.body.student).toMatchObject({ studentId: '64-20046', fullName: 'Omar Nabil' });
    expect(res.body.candidates).toEqual([
      {
        course: { id: String(CSEN102._id), code: 'CSEN 102', name: 'Course CSEN 102', creditHours: 6 },
        reason: 'Failed',
        semester: 1,
        term: '2024/2025 Winter',
        inProgress: false,
        mandatory: true,
      },
    ]);
    expect(CourseRecord.find).toHaveBeenCalledWith({ student: student._id });
    expect(Course.find).toHaveBeenCalledWith({
      isActive: true,
      majors: 'Computer Science',
      courseType: { $ne: 'Elective' },
    });
  });

  it('returns an empty list cleanly when nothing is owed', async () => {
    const student = makeStudent();
    withData(student, cleanRecords());

    const res = await request(app).get(url(student._id)).set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(200);
    expect(res.body.candidates).toEqual([]);
  });

  it('is closed to Students', async () => {
    const res = await request(app)
      .get(url(new mongoose.Types.ObjectId()))
      .set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(403);
    expect(Student.findById).not.toHaveBeenCalled();
    expect(CourseRecord.find).not.toHaveBeenCalled();
  });

  it('is closed to Administrators, as the history page is', async () => {
    const res = await request(app)
      .get(url(new mongoose.Types.ObjectId()))
      .set('Authorization', tokenFor('Administrator'));
    expect(res.status).toBe(403);
  });

  it('requires a session', async () => {
    const res = await request(app).get(url(new mongoose.Types.ObjectId()));
    expect(res.status).toBe(401);
  });

  it("refuses a Normal Student's record, as the history page does", async () => {
    withData(makeStudent({ studentType: 'Normal Student' }), []);

    const res = await request(app)
      .get(url(new mongoose.Types.ObjectId()))
      .set('Authorization', tokenFor('Coordinator'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Academic history is only kept for Advising Students.');
    expect(CourseRecord.find).not.toHaveBeenCalled();
  });

  it('answers an invalid student id with 400', async () => {
    const res = await request(app).get(url('not-an-id')).set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('That student link is not valid.');
    expect(Student.findById).not.toHaveBeenCalled();
  });

  it('answers an unknown student with 404', async () => {
    Student.findById.mockReturnValue(populated(null));

    const res = await request(app)
      .get(url(new mongoose.Types.ObjectId()))
      .set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(404);
  });
});

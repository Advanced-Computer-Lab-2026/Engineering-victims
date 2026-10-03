/**
 * Req 56: downloading the req 54 academic history as a PDF.
 *
 * The real routes, auth middleware, controller and PDF renderer run on a bare
 * Express app; only the database models and the history builder are mocked,
 * so no MongoDB is needed.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Student', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../services/academicHistoryService', () => ({ buildAcademicHistory: jest.fn() }));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const Student = require('../models/Student');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const academicHistoryRoutes = require('../routes/academicHistoryRoutes');

const app = express();
app.use('/api/academic-history', academicHistoryRoutes);

const tokenFor = (role, userId = new mongoose.Types.ObjectId()) =>
  `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;

const makeStudent = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  fullName: 'Omar Khaled',
  email: 'omar.khaled@student.guc.edu.eg',
  studentId: '58-12345',
  studentType: 'Advising Student',
  major: 'Computer Engineering',
  currentSemester: 5,
  academicStanding: 'Good Standing',
  assignedAdvisor: { _id: new mongoose.Types.ObjectId(), fullName: 'Dr. Sara Adel', email: 'sara.adel@guc.edu.eg' },
  ...overrides,
});

const course = (code, creditHours = 4) => ({
  id: new mongoose.Types.ObjectId(),
  code,
  name: `Course ${code}`,
  creditHours,
});

// Enough rows to spill onto further pages, so page breaks are exercised too.
const history = {
  summary: { gpa: 1.84, completedHours: 96, currentHours: 20, remainingHours: 40 },
  completed: Array.from({ length: 40 }, (_, i) => ({
    id: new mongoose.Types.ObjectId(),
    course: course(`CSEN ${100 + i}`),
    grade: i === 3 ? 'F' : 'B+',
    gradePoints: i === 3 ? 5.0 : 1.7,
    passed: i !== 3,
    term: `${2022 + Math.floor(i / 10)}/${2023 + Math.floor(i / 10)} ${i % 2 ? 'Spring' : 'Winter'}`,
    semester: 1 + Math.floor(i / 5),
  })),
  current: [{ id: new mongoose.Types.ObjectId(), course: course('CSEN 501'), term: '2026/2027 Winter', semester: 5 }],
  remaining: [
    {
      ...course('CSEN 601'),
      courseType: 'Core',
      recommendedSemester: 6,
      offeringSeasons: ['Spring'],
      prerequisites: [{ id: new mongoose.Types.ObjectId(), code: 'CSEN 501', name: 'Course CSEN 501', passed: false }],
      isRetake: false,
    },
  ],
};

/** Student.findOne/findById(...).populate(...) resolving to `student`. */
const populated = (student) => ({ populate: jest.fn().mockResolvedValue(student) });

/** Collects the raw body, since supertest does not buffer application/pdf. */
const binary = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const signInAsStudent = (student) => {
  User.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ email: student.email }) }),
  });
  Student.findOne.mockReturnValue(populated(student));
};

const expectPdf = (res, student) => {
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^application\/pdf/);
  expect(res.headers['content-disposition']).toBe(
    `attachment; filename="academic-history-${student.studentId}.pdf"`
  );
  expect(Buffer.isBuffer(res.body)).toBe(true);
  expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  expect(Number(res.headers['content-length'])).toBe(res.body.length);
};

beforeEach(() => {
  jest.resetAllMocks();
  buildAcademicHistory.mockResolvedValue(history);
});

describe('GET /api/academic-history/me/pdf', () => {
  it('lets an Advising Student download their own history', async () => {
    const student = makeStudent();
    signInAsStudent(student);

    const res = await request(app)
      .get('/api/academic-history/me/pdf')
      .set('Authorization', tokenFor('Student'))
      .buffer(true)
      .parse(binary);

    expectPdf(res, student);
    expect(Student.findOne).toHaveBeenCalledWith({ email: student.email });
    expect(buildAcademicHistory).toHaveBeenCalledWith(student);
  });

  it('rejects a Normal Student', async () => {
    signInAsStudent(makeStudent({ studentType: 'Normal Student' }));

    const res = await request(app).get('/api/academic-history/me/pdf').set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.message).toBe('Academic history is only available to Advising Students.');
    expect(buildAcademicHistory).not.toHaveBeenCalled();
  });

  it.each(['Advisor', 'Coordinator', 'Administrator'])('is closed to %s accounts', async (role) => {
    const res = await request(app).get('/api/academic-history/me/pdf').set('Authorization', tokenFor(role));
    expect(res.status).toBe(403);
  });

  it('requires a session', async () => {
    const res = await request(app).get('/api/academic-history/me/pdf');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/academic-history/:studentId/pdf', () => {
  it.each(['Advisor', 'Coordinator'])('lets a %s download an Advising Student\'s history', async (role) => {
    const student = makeStudent();
    Student.findById.mockReturnValue(populated(student));

    const res = await request(app)
      .get(`/api/academic-history/${student._id}/pdf`)
      .set('Authorization', tokenFor(role))
      .buffer(true)
      .parse(binary);

    expectPdf(res, student);
    expect(Student.findById).toHaveBeenCalledWith(String(student._id));
  });

  it('stops an Advising Student downloading another student\'s history', async () => {
    const other = makeStudent();
    Student.findById.mockReturnValue(populated(other));

    const res = await request(app)
      .get(`/api/academic-history/${other._id}/pdf`)
      .set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(403);
    expect(Student.findById).not.toHaveBeenCalled();
    expect(buildAcademicHistory).not.toHaveBeenCalled();
  });

  it('rejects an Administrator', async () => {
    const res = await request(app)
      .get(`/api/academic-history/${new mongoose.Types.ObjectId()}/pdf`)
      .set('Authorization', tokenFor('Administrator'));
    expect(res.status).toBe(403);
  });

  it('answers an invalid student id with 400', async () => {
    const res = await request(app).get('/api/academic-history/not-an-id/pdf').set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('That student link is not valid.');
    expect(Student.findById).not.toHaveBeenCalled();
  });

  it('answers an unknown student with 404', async () => {
    Student.findById.mockReturnValue(populated(null));

    const res = await request(app)
      .get(`/api/academic-history/${new mongoose.Types.ObjectId()}/pdf`)
      .set('Authorization', tokenFor('Coordinator'));

    expect(res.status).toBe(404);
  });

  it('refuses a Normal Student\'s record, as the page does', async () => {
    const student = makeStudent({ studentType: 'Normal Student' });
    Student.findById.mockReturnValue(populated(student));

    const res = await request(app)
      .get(`/api/academic-history/${student._id}/pdf`)
      .set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Academic history is only kept for Advising Students.');
  });
});

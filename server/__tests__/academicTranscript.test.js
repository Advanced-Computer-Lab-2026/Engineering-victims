/**
 * Req 55: an attended academic year's transcript.
 *
 * The real routes, auth middleware, controller and transcript builder run on a
 * bare Express app. User and Student are mocked, and CourseRecord.find returns
 * in-memory rows, so no MongoDB is needed. The seed only holds Winter and
 * Spring terms, so Summer and both makeups are proven here.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/Student', () => ({ findById: jest.fn(), findOne: jest.fn() }));
// The transcript never renders a PDF; this keeps the suite independent of pdfkit.
jest.mock('../services/academicHistoryPdfService', () => ({ renderAcademicHistoryPdf: jest.fn() }));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const Student = require('../models/Student');
const CourseRecord = require('../models/CourseRecord');
const { parseAcademicYear, parseTerm } = require('../services/academicHistoryService');
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
  academicStanding: 'Probation',
  assignedAdvisor: { _id: new mongoose.Types.ObjectId(), fullName: 'Dr. Sara Adel', email: 'sara.adel@guc.edu.eg' },
  ...overrides,
});

const record = (code, term, grade, semester = 3) => ({
  _id: new mongoose.Types.ObjectId(),
  course: { _id: new mongoose.Types.ObjectId(), code, name: `Course ${code}`, creditHours: 4 },
  status: grade ? 'Completed' : 'In Progress',
  grade: grade ?? null,
  term,
  semester,
});

// Deliberately out of session order, to prove the transcript orders them.
const RECORDS = [
  record('MATH 301', '2025/2026 Second Makeup', 'C'),
  record('CSEN 301', '2025/2026 Winter', 'B+'),
  record('MATH 301', '2025/2026 Winter', 'F'),
  record('MATH 301', '2025/2026 First Makeup', 'F'),
  record('CSEN 302', '2025/2026 Summer', 'A'),
  record('CSEN 401', '2025/2026 Spring', 'B'),
  record('CSEN 201', '2024/2025 Spring', 'A-', 2),
  record('CSEN 101', '2024/2025 Winter', 'B', 1),
  record('CSEN 501', '2026/2027 Winter', null, 5),
  // Not a term label the transcript can place, so it is skipped.
  record('CSEN 999', 'Fall 2025', 'A'),
];

/** CourseRecord.find(...).populate(...).sort(...).lean() resolving to `rows`. */
const stubRecords = (rows) =>
  jest.spyOn(CourseRecord, 'find').mockReturnValue({
    populate: () => ({ sort: () => ({ lean: () => Promise.resolve(rows) }) }),
  });

/** Student.findOne/findById(...).populate(...) resolving to `student`. */
const populated = (student) => ({ populate: jest.fn().mockResolvedValue(student) });

const signInAsStudent = (student) => {
  User.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ email: student.email }) }),
  });
  Student.findOne.mockReturnValue(populated(student));
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
  stubRecords(RECORDS);
});

describe('parseTerm', () => {
  it.each([
    ['2025/2026 Winter', 'Winter'],
    ['2025/2026 Spring', 'Spring'],
    ['2025/2026 Summer', 'Summer'],
    ['2025/2026 First Makeup', 'First Makeup'],
    ['2025/2026 Second Makeup', 'Second Makeup'],
  ])('reads %s', (term, session) => {
    expect(parseTerm(term)).toEqual({ academicYear: '2025/2026', session });
  });

  it('normalises a dashed year', () => {
    expect(parseTerm('2025-2026 Summer')).toEqual({ academicYear: '2025/2026', session: 'Summer' });
  });

  it.each(['2025/2027 Winter', '2025/2026 Fall', '2025/2026', 'Winter 2025/2026', '2025/2026 first makeup', '', null])(
    'rejects %p',
    (term) => {
      expect(parseTerm(term)).toBeNull();
    }
  );
});

describe('parseAcademicYear', () => {
  it('accepts slash and dash forms', () => {
    expect(parseAcademicYear('2025/2026')).toBe('2025/2026');
    expect(parseAcademicYear('2025-2026')).toBe('2025/2026');
  });

  it.each(['2025/2027', '2025/2025', '2026/2025', '25/26', '2025', 'abc'])('rejects %s', (year) => {
    expect(parseAcademicYear(year)).toBeNull();
  });
});

describe('GET /api/academic-history/me/transcript', () => {
  it('shows an Advising Student their newest attended year by default', async () => {
    const student = makeStudent();
    signInAsStudent(student);

    const res = await request(app).get('/api/academic-history/me/transcript').set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(200);
    expect(res.body.student.studentId).toBe(student.studentId);
    expect(res.body.years).toEqual(['2026/2027', '2025/2026', '2024/2025']);
    expect(res.body.academicYear).toBe('2026/2027');
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].session).toBe('Winter');
    // In-progress courses are listed without a grade.
    expect(res.body.sessions[0].courses[0]).toMatchObject({
      status: 'In Progress',
      grade: null,
      gradePoints: null,
      passed: null,
    });
    expect(Student.findOne).toHaveBeenCalledWith({ email: student.email });
    expect(CourseRecord.find).toHaveBeenCalledWith({ student: student._id });
  });

  it('lists all five sessions in transcript order', async () => {
    signInAsStudent(makeStudent());

    const res = await request(app)
      .get('/api/academic-history/me/transcript?year=2025/2026')
      .set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(200);
    expect(res.body.academicYear).toBe('2025/2026');
    expect(res.body.sessions.map((session) => session.session)).toEqual([
      'Winter',
      'Spring',
      'Summer',
      'First Makeup',
      'Second Makeup',
    ]);
    expect(res.body.sessions.map((session) => session.term)).toEqual([
      '2025/2026 Winter',
      '2025/2026 Spring',
      '2025/2026 Summer',
      '2025/2026 First Makeup',
      '2025/2026 Second Makeup',
    ]);
    const winter = res.body.sessions[0].courses;
    expect(winter.map((row) => row.course.code)).toEqual(['CSEN 301', 'MATH 301']);
    expect(winter[1]).toMatchObject({ status: 'Completed', grade: 'F', gradePoints: 5, passed: false });
    expect(res.body.sessions[4].courses[0]).toMatchObject({ grade: 'C', gradePoints: 3, passed: true });
  });

  it('leaves out sessions without records', async () => {
    signInAsStudent(makeStudent());

    const res = await request(app)
      .get('/api/academic-history/me/transcript?year=2024-2025')
      .set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(200);
    expect(res.body.academicYear).toBe('2024/2025');
    expect(res.body.sessions.map((session) => session.session)).toEqual(['Winter', 'Spring']);
  });

  it('answers a malformed year with 400', async () => {
    signInAsStudent(makeStudent());

    for (const year of ['2025/2027', 'last-year', '2025']) {
      const res = await request(app)
        .get(`/api/academic-history/me/transcript?year=${encodeURIComponent(year)}`)
        .set('Authorization', tokenFor('Student'));
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Academic year should look like 2025/2026.');
    }
  });

  it('answers a valid but unattended year with 404', async () => {
    signInAsStudent(makeStudent());

    const res = await request(app)
      .get('/api/academic-history/me/transcript?year=2010/2011')
      .set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('The student did not attend the 2010/2011 academic year.');
  });

  it('returns empty lists for a student with no records', async () => {
    signInAsStudent(makeStudent({ currentSemester: 1 }));
    stubRecords([]);

    const res = await request(app).get('/api/academic-history/me/transcript').set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(200);
    expect(res.body.years).toEqual([]);
    expect(res.body.academicYear).toBeNull();
    expect(res.body.sessions).toEqual([]);
  });

  it('ignores a student id in the query, reading only the token', async () => {
    const student = makeStudent();
    signInAsStudent(student);

    const res = await request(app)
      .get(`/api/academic-history/me/transcript?studentId=${new mongoose.Types.ObjectId()}`)
      .set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(200);
    expect(Student.findById).not.toHaveBeenCalled();
    expect(CourseRecord.find).toHaveBeenCalledWith({ student: student._id });
  });

  it('rejects a Normal Student', async () => {
    signInAsStudent(makeStudent({ studentType: 'Normal Student' }));

    const res = await request(app).get('/api/academic-history/me/transcript').set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(403);
    expect(CourseRecord.find).not.toHaveBeenCalled();
  });

  it.each(['Advisor', 'Coordinator', 'Administrator'])('is closed to %s accounts', async (role) => {
    const res = await request(app).get('/api/academic-history/me/transcript').set('Authorization', tokenFor(role));
    expect(res.status).toBe(403);
  });

  it('requires a session', async () => {
    const res = await request(app).get('/api/academic-history/me/transcript');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/academic-history/:studentId/transcript', () => {
  it.each(['Advisor', 'Coordinator'])("lets a %s view an Advising Student's transcript", async (role) => {
    const student = makeStudent();
    Student.findById.mockReturnValue(populated(student));

    const res = await request(app)
      .get(`/api/academic-history/${student._id}/transcript?year=2025/2026`)
      .set('Authorization', tokenFor(role));

    expect(res.status).toBe(200);
    expect(res.body.student.id).toBe(String(student._id));
    expect(res.body.sessions).toHaveLength(5);
    expect(Student.findById).toHaveBeenCalledWith(String(student._id));
  });

  it("stops an Advising Student viewing another student's transcript", async () => {
    const other = makeStudent();
    Student.findById.mockReturnValue(populated(other));

    const res = await request(app)
      .get(`/api/academic-history/${other._id}/transcript`)
      .set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(403);
    expect(Student.findById).not.toHaveBeenCalled();
    expect(CourseRecord.find).not.toHaveBeenCalled();
  });

  it('rejects an Administrator', async () => {
    const res = await request(app)
      .get(`/api/academic-history/${new mongoose.Types.ObjectId()}/transcript`)
      .set('Authorization', tokenFor('Administrator'));
    expect(res.status).toBe(403);
  });

  it('answers an invalid student id with 400', async () => {
    const res = await request(app)
      .get('/api/academic-history/not-an-id/transcript')
      .set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('That student link is not valid.');
  });

  it('answers an unknown student with 404', async () => {
    Student.findById.mockReturnValue(populated(null));

    const res = await request(app)
      .get(`/api/academic-history/${new mongoose.Types.ObjectId()}/transcript`)
      .set('Authorization', tokenFor('Coordinator'));

    expect(res.status).toBe(404);
  });

  it("refuses a Normal Student's record, as the history page does", async () => {
    const student = makeStudent({ studentType: 'Normal Student' });
    Student.findById.mockReturnValue(populated(student));

    const res = await request(app)
      .get(`/api/academic-history/${student._id}/transcript`)
      .set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(400);
    expect(CourseRecord.find).not.toHaveBeenCalled();
  });

  it('validates the year for staff too', async () => {
    const student = makeStudent();
    Student.findById.mockReturnValue(populated(student));

    const bad = await request(app)
      .get(`/api/academic-history/${student._id}/transcript?year=2025/2030`)
      .set('Authorization', tokenFor('Advisor'));
    const unattended = await request(app)
      .get(`/api/academic-history/${student._id}/transcript?year=2019/2020`)
      .set('Authorization', tokenFor('Advisor'));

    expect(bad.status).toBe(400);
    expect(unattended.status).toBe(404);
  });
});

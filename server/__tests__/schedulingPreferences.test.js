/**
 * Req 58: Advisors and Coordinators view an advising student's submitted
 * scheduling preferences. Req 57's /me routes are covered as a regression.
 *
 * The real routes, auth middleware, controller and validation run on a bare
 * Express app; only the model queries are stubbed, so no MongoDB is needed.
 */
process.env.JWT_SECRET = 'test_secret';

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const Student = require('../models/Student');
const AcademicTerm = require('../models/AcademicTerm');
const SchedulingPreference = require('../models/SchedulingPreference');
const schedulingPreferenceRoutes = require('../routes/schedulingPreferenceRoutes');

const app = express();
app.use(express.json());
app.use('/api/preferences', schedulingPreferenceRoutes);

const tokenFor = (role, userId = new mongoose.Types.ObjectId()) =>
  `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;

/** A chainable, awaitable stand-in for a mongoose query resolving to `result`. */
const query = (result) => {
  const q = {
    sort: jest.fn(() => q),
    populate: jest.fn(() => q),
    select: jest.fn(() => q),
    collation: jest.fn(() => q),
    lean: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const makeTerm = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  academicYear: '2026/2027',
  season: 'Spring',
  advisingDeadline: new Date(Date.now() + 10 * DAY_MS),
  termStartDate: new Date(Date.now() + 30 * DAY_MS),
  termEndDate: new Date(Date.now() + 150 * DAY_MS),
  ...overrides,
});

const makeStudent = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  fullName: 'Omar Nabil',
  email: 'omar.nabil@student.guc.edu.eg',
  studentId: '58-12345',
  studentType: 'Advising Student',
  ...overrides,
});

// Deliberately not in any sorted order, so a reordering would be caught.
const RANKED = [
  { kind: 'Day off', day: 'Thursday', startTime: null, endTime: null, groupNumber: null, courseCode: null },
  { kind: 'Avoided time range', day: null, startTime: '08:00', endTime: '09:30', groupNumber: null, courseCode: null },
  { kind: 'Preferred group', day: null, startTime: null, endTime: null, groupNumber: 1, courseCode: 'CSEN 501' },
  { kind: 'Avoided day', day: 'Saturday', startTime: null, endTime: null, groupNumber: null, courseCode: null },
];

const makePreference = (student, term, overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  student: student._id,
  term,
  preferences: RANKED,
  note: 'I commute, so early starts are hard.',
  createdAt: new Date('2026-09-20T10:00:00Z'),
  updatedAt: new Date('2026-10-01T08:30:00Z'),
  ...overrides,
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/preferences/students/:studentId (req 58)', () => {
  const url = (id) => `/api/preferences/students/${id}`;

  it.each(['Advisor', 'Coordinator'])("lets a %s view an advising student's latest preferences", async (role) => {
    const student = makeStudent();
    const term = makeTerm();
    const saved = makePreference(student, term);
    jest.spyOn(Student, 'findById').mockReturnValue(query(student));
    const findOne = jest.spyOn(SchedulingPreference, 'findOne').mockReturnValue(query(saved));

    const res = await request(app).get(url(student._id)).set('Authorization', tokenFor(role));

    expect(res.status).toBe(200);
    expect(res.body.student).toEqual({
      id: String(student._id),
      fullName: student.fullName,
      studentId: student.studentId,
    });
    expect(res.body.term).toMatchObject({ id: String(term._id), label: '2026/2027 Spring', isOpen: true });
    expect(res.body.preference.note).toBe(saved.note);
    expect(res.body.preference.submittedAt).toBe(saved.createdAt.toISOString());
    expect(res.body.preference.updatedAt).toBe(saved.updatedAt.toISOString());
    expect(findOne).toHaveBeenCalledWith({ student: student._id });
  });

  it('keeps the stored priority order and numbers it from 1', async () => {
    const student = makeStudent();
    jest.spyOn(Student, 'findById').mockReturnValue(query(student));
    jest.spyOn(SchedulingPreference, 'findOne').mockReturnValue(query(makePreference(student, makeTerm())));

    const res = await request(app).get(url(student._id)).set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(200);
    expect(res.body.preference.preferences).toEqual(RANKED.map((entry, index) => ({ priority: index + 1, ...entry })));
  });

  it('returns the most recently updated submission, with its own term', async () => {
    const student = makeStudent();
    // An earlier term whose advising deadline has passed.
    const pastTerm = makeTerm({ season: 'Winter', advisingDeadline: new Date(Date.now() - 60 * DAY_MS) });
    const latest = makePreference(student, pastTerm);
    jest.spyOn(Student, 'findById').mockReturnValue(query(student));
    const preferenceQuery = query(latest);
    jest.spyOn(SchedulingPreference, 'findOne').mockReturnValue(preferenceQuery);

    const res = await request(app).get(url(student._id)).set('Authorization', tokenFor('Coordinator'));

    expect(res.status).toBe(200);
    expect(preferenceQuery.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(preferenceQuery.populate).toHaveBeenCalledWith('term');
    expect(res.body.term).toMatchObject({ id: String(pastTerm._id), label: '2026/2027 Winter', isOpen: false });
  });

  it('answers a student with no preferences with 200 and preference: null', async () => {
    const student = makeStudent({ fullName: 'Laila Hassan' });
    jest.spyOn(Student, 'findById').mockReturnValue(query(student));
    jest.spyOn(SchedulingPreference, 'findOne').mockReturnValue(query(null));

    const res = await request(app).get(url(student._id)).set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(200);
    expect(res.body.preference).toBeNull();
    expect(res.body.term).toBeNull();
    expect(res.body.student.fullName).toBe('Laila Hassan');
  });

  it('answers an invalid student id with 400', async () => {
    const findById = jest.spyOn(Student, 'findById');

    const res = await request(app).get(url('not-an-id')).set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('That student link is not valid.');
    expect(findById).not.toHaveBeenCalled();
  });

  it('answers an unknown student with 404', async () => {
    jest.spyOn(Student, 'findById').mockReturnValue(query(null));

    const res = await request(app).get(url(new mongoose.Types.ObjectId())).set('Authorization', tokenFor('Coordinator'));

    expect(res.status).toBe(404);
  });

  it('refuses a Normal Student', async () => {
    jest.spyOn(Student, 'findById').mockReturnValue(query(makeStudent({ studentType: 'Normal Student' })));
    const findOne = jest.spyOn(SchedulingPreference, 'findOne');

    const res = await request(app).get(url(new mongoose.Types.ObjectId())).set('Authorization', tokenFor('Advisor'));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('That student is not an advising student.');
    expect(findOne).not.toHaveBeenCalled();
  });

  it.each(['Student', 'Administrator'])('is closed to %s accounts', async (role) => {
    const findById = jest.spyOn(Student, 'findById');

    const res = await request(app).get(url(new mongoose.Types.ObjectId())).set('Authorization', tokenFor(role));

    expect(res.status).toBe(403);
    expect(findById).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    const res = await request(app).get(url(new mongoose.Types.ObjectId()));
    expect(res.status).toBe(401);
  });

  it.each(['put', 'patch', 'post', 'delete'])('has no %s route: staff cannot change preferences', async (method) => {
    const save = jest.spyOn(SchedulingPreference.prototype, 'save');

    const res = await request(app)[method](url(new mongoose.Types.ObjectId()))
      .set('Authorization', tokenFor('Advisor'))
      .send({ preferences: [], note: 'changed' });

    expect(res.status).toBe(404);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Req 57 /api/preferences/me regression', () => {
  const signInAsStudent = (student) => {
    jest.spyOn(User, 'findById').mockReturnValue(query({ email: student.email }));
    jest.spyOn(Student, 'findOne').mockReturnValue(query(student));
  };

  it("GET /me returns the student's own preferences for the open advising term", async () => {
    const student = makeStudent();
    const term = makeTerm();
    signInAsStudent(student);
    jest.spyOn(AcademicTerm, 'find').mockReturnValue(query([term]));
    const findOne = jest.spyOn(SchedulingPreference, 'findOne').mockReturnValue(query(makePreference(student, term._id)));

    const res = await request(app).get('/api/preferences/me').set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith({ student: student._id, term: term._id });
    expect(res.body.term).toMatchObject({ id: String(term._id), isOpen: true });
    expect(res.body.preference.preferences.map((entry) => entry.priority)).toEqual([1, 2, 3, 4]);
    expect(res.body.options.kinds).toEqual(SchedulingPreference.KINDS);
  });

  it('PUT /me still submits new preferences before the deadline', async () => {
    const student = makeStudent();
    signInAsStudent(student);
    jest.spyOn(AcademicTerm, 'find').mockReturnValue(query([makeTerm()]));
    jest.spyOn(SchedulingPreference, 'findOne').mockReturnValue(query(null));
    const save = jest.spyOn(SchedulingPreference.prototype, 'save').mockResolvedValue();

    const res = await request(app)
      .put('/api/preferences/me')
      .set('Authorization', tokenFor('Student'))
      .send({ preferences: [{ kind: 'Day off', day: 'Thursday' }], note: 'Early starts are hard.' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Your preferences were submitted.');
    expect(res.body.preference.preferences[0]).toMatchObject({ priority: 1, kind: 'Day off', day: 'Thursday' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('PUT /me is still refused after the advising deadline', async () => {
    signInAsStudent(makeStudent());
    jest.spyOn(AcademicTerm, 'find').mockReturnValue(query([makeTerm({ advisingDeadline: new Date(Date.now() - 5 * DAY_MS) })]));
    const save = jest.spyOn(SchedulingPreference.prototype, 'save');

    const res = await request(app)
      .put('/api/preferences/me')
      .set('Authorization', tokenFor('Student'))
      .send({ preferences: [{ kind: 'Day off', day: 'Thursday' }] });

    expect(res.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it('/me still turns away Normal Students', async () => {
    signInAsStudent(makeStudent({ studentType: 'Normal Student' }));

    const res = await request(app).get('/api/preferences/me').set('Authorization', tokenFor('Student'));

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Scheduling preferences are only for Advising Students.');
  });

  it.each(['Advisor', 'Coordinator', 'Administrator'])('/me is still closed to %s accounts', async (role) => {
    const res = await request(app).get('/api/preferences/me').set('Authorization', tokenFor(role));
    expect(res.status).toBe(403);
  });
});

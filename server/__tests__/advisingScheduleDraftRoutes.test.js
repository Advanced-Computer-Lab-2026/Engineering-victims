process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/Student', () => ({ findById: jest.fn() }));
jest.mock('../models/StudentSchedule', () => ({ find: jest.fn() }));
jest.mock('../models/AcademicTerm', () => ({ find: jest.fn(), findById: jest.fn() }));
jest.mock('../models/AdvisingScheduleDraft', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../services/schedulingPreferenceService', () => ({ advisingTerm: jest.fn() }));
jest.mock('../services/mandatoryCourseService', () => ({ buildMandatoryCandidates: jest.fn() }));
jest.mock('../services/advisingScheduleDraftService', () => ({
  eligibleNonMandatoryCourses: jest.fn(),
  progressionSemesterFor: jest.fn(({ student }) => student.currentSemester),
}));
jest.mock('../services/academicHistoryService', () => ({ buildAcademicHistory: jest.fn() }));
jest.mock('../services/advisingOverviewService', () => ({ deriveAllowance: jest.fn() }));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const AcademicTerm = require('../models/AcademicTerm');
const AdvisingScheduleDraft = require('../models/AdvisingScheduleDraft');
const { advisingTerm } = require('../services/schedulingPreferenceService');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const { deriveAllowance } = require('../services/advisingOverviewService');
const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');
const { eligibleNonMandatoryCourses } = require('../services/advisingScheduleDraftService');
const routes = require('../routes/advisingScheduleDraftRoutes');

const app = express();
app.use(express.json());
app.use('/api/advising-schedules', routes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role, userId = oid()) =>
  ['Bearer', jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)].join(' ');
const populated = (value) => ({ populate: jest.fn().mockResolvedValue(value) });

const makeStudent = (workflowStatus = 'Not Started') => ({
  _id: oid(),
  fullName: 'Omar Nabil',
  studentId: '64-20046',
  studentType: 'Advising Student',
  major: 'Computer Science',
  currentSemester: 2,
  workflowStatus,
  save: jest.fn().mockResolvedValue(undefined),
});

const makeDraft = (student, term, courses = []) => ({
  _id: oid(),
  student: student._id,
  term: term._id,
  courses,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
});

beforeEach(() => {
  jest.clearAllMocks();
  advisingTerm.mockResolvedValue({ term: null });
  AcademicTerm.find.mockReturnValue({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    }),
  });
  buildAcademicHistory.mockResolvedValue({ summary: { gpa: null } });
  deriveAllowance.mockReturnValue({
    allowedHours: 30,
    standardHours: 30,
    isProbation: false,
  });
});

describe('advising schedule draft routes', () => {
  it('requires Advisor or Coordinator access', async () => {
    await request(app).get(`/api/advising-schedules/students/${oid()}`).expect(401);
    await request(app)
      .get(`/api/advising-schedules/students/${oid()}`)
      .set('Authorization', tokenFor('Student'))
      .expect(403);
  });

  it('does not create a draft merely by opening the editor', async () => {
    const student = makeStudent();
    const term = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };
    Student.findById.mockResolvedValue(student);
    advisingTerm.mockResolvedValue({ term });
    AdvisingScheduleDraft.findOne.mockReturnValue(populated(null));
    eligibleNonMandatoryCourses.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/advising-schedules/students/${student._id}`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(200);

    expect(response.body.draft).toBeNull();
    expect(response.body.canEdit).toBe(true);
    expect(AdvisingScheduleDraft.create).not.toHaveBeenCalled();
  });

  it('loads the selected term draft and reports selected, allowed, extra, and remaining hours', async () => {
    const student = makeStudent('Draft');
    const term = { _id: oid(), academicYear: '2027/2028', season: 'Spring' };
    const course = { _id: oid(), code: 'CSEN 201', name: 'Course 201', creditHours: 36 };
    const draft = makeDraft(student, term, [{ course, mandatory: false }]);
    Student.findById.mockResolvedValue(student);
    AcademicTerm.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(term) });
    AcademicTerm.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([term]) }),
    });
    AdvisingScheduleDraft.findOne.mockReturnValue(populated(draft));
    eligibleNonMandatoryCourses.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/advising-schedules/students/${student._id}?termId=${term._id}`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(200);

    expect(response.body.term).toMatchObject({
      id: String(term._id),
      label: '2027/2028 Spring',
      season: 'Spring',
    });
    expect(response.body.terms).toHaveLength(1);
    expect(response.body.creditHours).toEqual({
      selected: 36,
      allowed: 30,
      extra: 6,
      remaining: 0,
      standardAllowance: 30,
      isProbation: false,
    });
    expect(AdvisingScheduleDraft.findOne).toHaveBeenCalledWith({
      student: student._id,
      term: term._id,
    });
    expect(eligibleNonMandatoryCourses).toHaveBeenCalledWith({
      student,
      term,
      currentTerm: term,
      draft,
    });
  });

  it('creates an empty draft without submitted preferences', async () => {
    const student = makeStudent();
    const term = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };
    const draft = makeDraft(student, term);
    Student.findById.mockResolvedValue(student);
    advisingTerm.mockResolvedValue({ term });
    AdvisingScheduleDraft.findOne
      .mockReturnValueOnce(populated(null))
      .mockReturnValueOnce(populated(null))
      .mockReturnValue(populated(draft));
    AdvisingScheduleDraft.create.mockResolvedValue(draft);
    eligibleNonMandatoryCourses.mockResolvedValue([]);

    const response = await request(app)
      .post(`/api/advising-schedules/students/${student._id}`)
      .set('Authorization', tokenFor('Coordinator'))
      .expect(201);

    expect(response.body.draft.courses).toEqual([]);
    expect(student.workflowStatus).toBe('Draft');
    expect(student.save).toHaveBeenCalledTimes(1);
    expect(AdvisingScheduleDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ courses: [], term: term._id, student: student._id })
    );
    expect(StudentSchedule.find).not.toHaveBeenCalled();
  });

  it('migrates selected courses from an existing incomplete slot schedule', async () => {
    const student = makeStudent('Draft');
    const term = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };
    const course = { _id: oid(), code: 'CSEN 201', name: 'Course 201', creditHours: 6 };
    const draft = makeDraft(student, term, [{ course: course._id, mandatory: false }]);
    Student.findById.mockResolvedValue(student);
    advisingTerm.mockResolvedValue({ term });
    AdvisingScheduleDraft.findOne
      .mockReturnValueOnce(populated(null))
      .mockReturnValue(populated(draft));
    StudentSchedule.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ slotId: { offeringId: { courseId: course } } }]),
      }),
    });
    AdvisingScheduleDraft.create.mockResolvedValue(draft);
    buildMandatoryCandidates.mockResolvedValue([]);
    eligibleNonMandatoryCourses.mockResolvedValue([]);

    await request(app)
      .get(`/api/advising-schedules/students/${student._id}`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(200);

    expect(AdvisingScheduleDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        courses: [{ course: course._id, mandatory: false }],
        student: student._id,
        term: term._id,
      })
    );
  });

  it('adds only an eligible non-mandatory course to an existing draft', async () => {
    const student = makeStudent('Draft');
    const term = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };
    const courseId = oid();
    const draft = makeDraft(student, term);
    const updatedDraft = makeDraft(student, term, [
      { course: { _id: courseId, code: 'CSEN 201', name: 'Course 201', creditHours: 6 }, mandatory: false },
    ]);
    Student.findById.mockResolvedValue(student);
    advisingTerm.mockResolvedValue({ term });
    AdvisingScheduleDraft.findOne.mockResolvedValueOnce(draft).mockReturnValueOnce(populated(updatedDraft));
    AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 1 });
    eligibleNonMandatoryCourses.mockResolvedValue([{ id: String(courseId) }]);

    const response = await request(app)
      .post(`/api/advising-schedules/students/${student._id}/courses`)
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId })
      .expect(200);

    expect(response.body.draft.courses[0]).toMatchObject({ id: String(courseId), mandatory: false });
    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ 'courses.course': { $ne: String(courseId) } }),
      expect.objectContaining({ $push: { courses: { course: String(courseId), mandatory: false } } })
    );
  });

  it('removes only a non-mandatory course from the draft', async () => {
    const student = makeStudent('Draft');
    const term = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };
    const courseId = oid();
    const draft = makeDraft(student, term, [{ course: courseId, mandatory: false }]);
    const updatedDraft = makeDraft(student, term);
    Student.findById.mockResolvedValue(student);
    advisingTerm.mockResolvedValue({ term });
    AdvisingScheduleDraft.findOne.mockResolvedValueOnce(draft).mockReturnValueOnce(populated(updatedDraft));
    AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await request(app)
      .delete(`/api/advising-schedules/students/${student._id}/courses/${courseId}`)
      .set('Authorization', tokenFor('Coordinator'))
      .expect(200);

    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        courses: { $elemMatch: { course: courseId.toString(), mandatory: false } },
      }),
      expect.objectContaining({ $pull: { courses: { course: courseId.toString(), mandatory: false } } })
    );
  });

  it('refuses to create a draft after the schedule has left the editable workflow', async () => {
    const student = makeStudent('Ready for Student Review');
    Student.findById.mockResolvedValue(student);

    await request(app)
      .post(`/api/advising-schedules/students/${student._id}`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(409);

    expect(AdvisingScheduleDraft.create).not.toHaveBeenCalled();
  });
});

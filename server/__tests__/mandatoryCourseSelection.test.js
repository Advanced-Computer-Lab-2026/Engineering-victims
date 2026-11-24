/**
 * Req 63: an Advisor or Coordinator selects the mandatory courses to include in
 * an advising student's schedule.
 *
 *   "Mandatory courses are selected before other courses and consume the
 *    student's available credit hours. If mandatory courses consume all allowed
 *    hours, no other course may be added without approved extra hours."
 *
 * The real routes, auth middleware and controller run on a bare Express app;
 * models and sibling services are mocked, as in advisingScheduleDraftRoutes.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../models/Student', () => ({ findById: jest.fn() }));
jest.mock('../models/StudentSchedule', () => ({ find: jest.fn() }));
jest.mock('../models/AcademicTerm', () => ({ find: jest.fn(), findById: jest.fn() }));
jest.mock('../models/Course', () => ({ findById: jest.fn() }));
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
jest.mock('../services/bachelorProjectService', () => ({ loadBachelorEligibility: jest.fn() }));
jest.mock('../services/draftHoursService', () => ({ approvedExtraHoursFor: jest.fn() }));
jest.mock('../services/academicHistoryService', () => ({ buildAcademicHistory: jest.fn() }));
jest.mock('../services/advisingOverviewService', () => ({ deriveAllowance: jest.fn() }));
jest.mock('../services/advisingScheduleWorkflowService', () => ({
  canManageStudent: jest.fn(),
  removeCourseFromDraft: jest.fn(),
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Student = require('../models/Student');
const AcademicTerm = require('../models/AcademicTerm');
const Course = require('../models/Course');
const AdvisingScheduleDraft = require('../models/AdvisingScheduleDraft');
const { advisingTerm } = require('../services/schedulingPreferenceService');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');
const { loadBachelorEligibility } = require('../services/bachelorProjectService');
const { approvedExtraHoursFor } = require('../services/draftHoursService');
const { deriveAllowance } = require('../services/advisingOverviewService');
const { eligibleNonMandatoryCourses } = require('../services/advisingScheduleDraftService');
const workflow = require('../services/advisingScheduleWorkflowService');
const routes = require('../routes/advisingScheduleDraftRoutes');

const app = express();
app.use(express.json());
app.use('/api/advising-schedules', routes);

const oid = () => new mongoose.Types.ObjectId();
const advisorId = oid();
const tokenFor = (role) =>
  ['Bearer', jwt.sign({ userId: String(role === 'Advisor' ? advisorId : oid()), role }, process.env.JWT_SECRET)].join(' ');
const populated = (value) => ({ populate: jest.fn().mockResolvedValue(value) });

const term = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };

const makeStudent = (workflowStatus = 'Draft') => ({
  _id: oid(),
  fullName: 'Omar Nabil',
  studentId: '64-20046',
  studentType: 'Advising Student',
  assignedAdvisor: advisorId,
  major: 'Computer Science',
  currentSemester: 6,
  workflowStatus,
  save: jest.fn().mockResolvedValue(undefined),
});

const course = (code, creditHours = 6, courseType = 'Core') => ({
  _id: oid(),
  code,
  name: `Course ${code}`,
  courseType,
  creditHours,
});
const candidateOf = (c, reason = 'Failed') => ({
  course: { id: c._id, code: c.code, name: c.name, creditHours: c.creditHours },
  reason,
  semester: 2,
  term: '2024/2025 Spring',
  inProgress: false,
  mandatory: true,
});
const entry = (c, mandatory = false) => ({ course: c, mandatory });
const makeDraft = (student, entries = [], extra = {}) => ({
  _id: oid(),
  student: student._id,
  term: term._id,
  courses: entries,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...extra,
});

beforeEach(() => {
  jest.resetAllMocks();
  // resetAllMocks also clears the factory implementation, so restore the access rule.
  workflow.canManageStudent.mockImplementation(
    (user, student) => user?.role === 'Coordinator' || String(student.assignedAdvisor) === String(user?.userId)
  );
  advisingTerm.mockResolvedValue({ term });
  AcademicTerm.find.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([term]) }) });
  buildAcademicHistory.mockResolvedValue({ summary: { gpa: null } });
  buildMandatoryCandidates.mockResolvedValue([]);
  eligibleNonMandatoryCourses.mockResolvedValue([]);
  loadBachelorEligibility.mockResolvedValue({ eligible: false, explanation: 'Not eligible.' });
  approvedExtraHoursFor.mockResolvedValue(0);
  deriveAllowance.mockReturnValue({ allowedHours: 24, standardHours: 24, isProbation: false });
  AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('POST /students/:studentId/mandatory-courses', () => {
  const url = (student) => `/api/advising-schedules/students/${student._id}/mandatory-courses`;

  /** A student whose mandatory list is `candidates`, with a draft holding `entries`. */
  const arrange = ({ candidates, entries = [], status = 'Draft', draftExtra = {} }) => {
    const student = makeStudent(status);
    const draft = makeDraft(student, entries, draftExtra);
    Student.findById.mockResolvedValue(student);
    buildMandatoryCandidates.mockResolvedValue(candidates.map((c) => candidateOf(c)));
    AdvisingScheduleDraft.findOne.mockResolvedValueOnce(draft).mockReturnValue(populated(draft));
    return { student, draft };
  };

  it('adds a course from the mandatory list, stored as mandatory', async () => {
    const failed = course('CSEN 202');
    const { student, draft } = arrange({ candidates: [failed] });

    const response = await request(app)
      .post(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: failed._id })
      .expect(200);

    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalledWith(
      { _id: draft._id, 'courses.course': { $ne: String(failed._id) } },
      { $push: { courses: { course: String(failed._id), mandatory: true } }, $set: { updatedBy: String(advisorId) } }
    );
    expect(response.body.draft).toBeDefined();
    expect(student.save).toHaveBeenCalled();
  });

  it('lets a Coordinator do it too', async () => {
    const failed = course('CSEN 202');
    const { student } = arrange({ candidates: [failed] });
    await request(app).post(url(student)).set('Authorization', tokenFor('Coordinator')).send({ courseId: failed._id }).expect(200);
  });

  it('refuses a course that is not on the mandatory list', async () => {
    const owed = course('CSEN 202');
    const other = course('CSEN 301');
    const { student } = arrange({ candidates: [owed] });

    const response = await request(app)
      .post(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: other._id })
      .expect(400);

    expect(response.body.message).toBe("That course is not one of the student's mandatory courses.");
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('refuses a course that is already in the draft', async () => {
    const failed = course('CSEN 202');
    const { student } = arrange({ candidates: [failed], entries: [entry(failed, true)] });

    await request(app).post(url(student)).set('Authorization', tokenFor('Advisor')).send({ courseId: failed._id }).expect(409);

    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('reports a lost race as a conflict', async () => {
    const failed = course('CSEN 202');
    const { student } = arrange({ candidates: [failed] });
    AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 0 });

    await request(app).post(url(student)).set('Authorization', tokenFor('Advisor')).send({ courseId: failed._id }).expect(409);
  });

  it('needs a draft to exist first', async () => {
    const student = makeStudent();
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockResolvedValue(null);

    const response = await request(app)
      .post(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: oid() })
      .expect(404);

    expect(response.body.message).toBe('Create a draft before adding courses.');
  });

  it('is refused once the schedule has left the editable workflow', async () => {
    const failed = course('CSEN 202');
    const { student } = arrange({ candidates: [failed], status: 'Ready for Student Review' });

    await request(app).post(url(student)).set('Authorization', tokenFor('Advisor')).send({ courseId: failed._id }).expect(409);

    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('rejects an invalid course id', async () => {
    const { student } = arrange({ candidates: [] });
    await request(app).post(url(student)).set('Authorization', tokenFor('Advisor')).send({ courseId: 'nope' }).expect(400);
  });

  it('is closed to Students and to anonymous callers', async () => {
    await request(app).post(url({ _id: oid() })).send({ courseId: oid() }).expect(401);
    await request(app).post(url({ _id: oid() })).set('Authorization', tokenFor('Student')).send({ courseId: oid() }).expect(403);
  });

  it("only lets an Advisor change a student assigned to them", async () => {
    const failed = course('CSEN 202');
    const { student } = arrange({ candidates: [failed] });
    student.assignedAdvisor = oid();

    await request(app).post(url(student)).set('Authorization', tokenFor('Advisor')).send({ courseId: failed._id }).expect(403);

    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('keeps the bachelor project cap (req 60) when the mandatory course would exceed it', async () => {
    const third = course('CSEN 1003');
    const { student } = arrange({
      candidates: [third],
      entries: [entry(course('CSEN 901')), entry(course('CSEN 903'))],
      draftExtra: { bachelorProject: { season: 'Winter' } },
    });
    Course.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(third) }) });

    const response = await request(app)
      .post(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: third._id })
      .expect(409);

    expect(response.body.message).toBe('With the bachelor project a student may take at most 2 core courses.');
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });
});

describe('POST /students/:studentId/courses once mandatory courses exist', () => {
  const url = (student) => `/api/advising-schedules/students/${student._id}/courses`;

  /**
   * `inDraft` is what the draft already holds; `candidates` the mandatory list;
   * `adding` the other course being added.
   */
  const arrange = ({ inDraft, candidates, adding, allowedHours = 24, approvedExtra = 0, draftExtra = {} }) => {
    const student = makeStudent();
    const draft = makeDraft(student, inDraft, draftExtra);
    Student.findById.mockResolvedValue(student);
    buildMandatoryCandidates.mockResolvedValue(candidates.map((c) => candidateOf(c)));
    AdvisingScheduleDraft.findOne.mockResolvedValueOnce(draft).mockReturnValue(populated(draft));
    eligibleNonMandatoryCourses.mockResolvedValue([
      { id: String(adding._id), code: adding.code, name: adding.name, creditHours: adding.creditHours, courseType: adding.courseType },
    ]);
    deriveAllowance.mockReturnValue({ allowedHours, standardHours: allowedHours, isProbation: false });
    approvedExtraHoursFor.mockResolvedValue(approvedExtra);
    return student;
  };
  const post = (student, adding, role = 'Advisor') =>
    request(app).post(url(student)).set('Authorization', tokenFor(role)).send({ courseId: adding._id });

  it('refuses another course while a mandatory course is still unselected', async () => {
    const owed = course('CSEN 202');
    const adding = course('CSEN 905', 4, 'Elective');
    const student = arrange({ inDraft: [], candidates: [owed], adding });

    const response = await post(student, adding).expect(409);

    expect(response.body.message).toBe('Select the mandatory courses before other courses: CSEN 202.');
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('names every unselected mandatory course', async () => {
    const adding = course('CSEN 905', 4, 'Elective');
    const student = arrange({ inDraft: [], candidates: [course('CSEN 202'), course('MATH 203')], adding });

    const response = await post(student, adding).expect(409);

    expect(response.body.message).toBe('Select the mandatory courses before other courses: CSEN 202, MATH 203.');
  });

  it('allows another course once every mandatory course is selected and hours remain', async () => {
    const owed = course('CSEN 202', 6);
    const adding = course('CSEN 905', 4, 'Elective');
    const student = arrange({ inDraft: [entry(owed, true)], candidates: [owed], adding, allowedHours: 24 });

    await post(student, adding).expect(200);

    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalled();
  });

  it('refuses another course when the mandatory courses consume all allowed hours', async () => {
    const owed = [course('CSEN 202', 12), course('MATH 203', 12)];
    const adding = course('CSEN 905', 4, 'Elective');
    const student = arrange({
      inDraft: owed.map((c) => entry(c, true)),
      candidates: owed,
      adding,
      allowedHours: 24,
      approvedExtra: 0,
    });

    const response = await post(student, adding).expect(409);

    expect(response.body.message).toBe(
      'The mandatory courses already use all 24 allowed credit hours. Another course needs approved extra hours first.'
    );
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('allows it once approved extra hours cover the new course', async () => {
    const owed = [course('CSEN 202', 12), course('MATH 203', 12)];
    const adding = course('CSEN 905', 4, 'Elective');
    const student = arrange({ inDraft: owed.map((c) => entry(c, true)), candidates: owed, adding, allowedHours: 24, approvedExtra: 4 });

    await post(student, adding).expect(200);

    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalled();
  });

  it('still refuses it when approved extra hours do not cover the new course', async () => {
    const owed = [course('CSEN 202', 12), course('MATH 203', 12)];
    const adding = course('CSEN 905', 4, 'Elective');
    const student = arrange({ inDraft: owed.map((c) => entry(c, true)), candidates: owed, adding, allowedHours: 24, approvedExtra: 3 });

    await post(student, adding).expect(409);
  });

  it('applies the same rule when the draft has a bachelor project (the sheet makes no exception)', async () => {
    const owed = [course('CSEN 202', 12), course('MATH 203', 12)];
    const adding = course('DE 404', 4, 'Huma');
    adding.name = 'German 4';
    const student = arrange({
      inDraft: owed.map((c) => entry(c, true)),
      candidates: owed,
      adding,
      allowedHours: 24,
      draftExtra: { bachelorProject: { season: 'Winter' } },
    });

    const response = await post(student, adding).expect(409);

    expect(response.body.message).toMatch(/already use all 24 allowed credit hours/);
  });

  it('does not apply the hours rule to a draft with no mandatory courses', async () => {
    const adding = course('CSEN 905', 30, 'Elective');
    const student = arrange({ inDraft: [entry(course('CSEN 301', 6), false)], candidates: [], adding, allowedHours: 24 });

    await post(student, adding).expect(200);
  });
});

describe('the draft response lists the mandatory courses', () => {
  it('marks each candidate as already selected or not', async () => {
    const inDraft = course('CSEN 202');
    const notYet = course('MATH 203');
    const student = makeStudent();
    const draft = makeDraft(student, [entry(inDraft, true)]);
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockReturnValue(populated(draft));
    buildMandatoryCandidates.mockResolvedValue([candidateOf(inDraft, 'Failed'), candidateOf(notYet, 'Unattended')]);

    const response = await request(app)
      .get(`/api/advising-schedules/students/${student._id}`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(200);

    expect(response.body.mandatoryCandidates).toEqual([
      expect.objectContaining({ course: expect.objectContaining({ code: 'CSEN 202' }), reason: 'Failed', selected: true }),
      expect.objectContaining({ course: expect.objectContaining({ code: 'MATH 203' }), reason: 'Unattended', selected: false }),
    ]);
  });
});

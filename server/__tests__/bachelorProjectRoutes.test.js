/**
 * Req 60: adding the bachelor project to an eligible student's draft schedule
 * and choosing Winter or Spring.
 *
 * The real routes, auth middleware and controller run on a bare Express app;
 * models and sibling services are mocked, as in advisingScheduleDraftRoutes.
 */
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
jest.mock('../services/bachelorProjectService', () => ({ loadBachelorEligibility: jest.fn() }));
jest.mock('../services/academicHistoryService', () => ({ buildAcademicHistory: jest.fn() }));
jest.mock('../services/advisingOverviewService', () => ({ deriveAllowance: jest.fn() }));
jest.mock('../services/advisingScheduleWorkflowService', () => ({
  canManageStudent: jest.fn(
    (user, student) => user?.role === 'Coordinator' || String(student.assignedAdvisor) === String(user?.userId)
  ),
  removeCourseFromDraft: jest.fn(),
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Student = require('../models/Student');
const AcademicTerm = require('../models/AcademicTerm');
const AdvisingScheduleDraft = require('../models/AdvisingScheduleDraft');
const { advisingTerm } = require('../services/schedulingPreferenceService');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const { loadBachelorEligibility } = require('../services/bachelorProjectService');
const { deriveAllowance } = require('../services/advisingOverviewService');
const { eligibleNonMandatoryCourses } = require('../services/advisingScheduleDraftService');
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
  currentSemester: 8,
  workflowStatus,
  save: jest.fn().mockResolvedValue(undefined),
});

const course = (code, courseType, creditHours = 4, name = `Course ${code}`) => ({
  _id: oid(),
  code,
  name,
  courseType,
  creditHours,
});
const entries = (...courses) => courses.map((entry) => ({ course: entry, mandatory: false }));
const makeDraft = (student, courses = [], extra = {}) => ({
  _id: oid(),
  student: student._id,
  term: term._id,
  courses: entries(...courses),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...extra,
});

const ELIGIBLE = {
  eligible: true,
  explanation: 'Eligible: every course from semesters 1-6 and every English course is completed.',
};
const INELIGIBLE = {
  eligible: false,
  explanation: 'Not eligible: every English course, including RPW, must be completed first.',
};

beforeEach(() => {
  jest.resetAllMocks();
  // resetAllMocks also clears the factory implementation, so restore the access rule.
  require('../services/advisingScheduleWorkflowService').canManageStudent.mockImplementation(
    (user, student) => user?.role === 'Coordinator' || String(student.assignedAdvisor) === String(user?.userId)
  );
  advisingTerm.mockResolvedValue({ term });
  AcademicTerm.find.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([term]) }) });
  buildAcademicHistory.mockResolvedValue({ summary: { gpa: null } });
  eligibleNonMandatoryCourses.mockResolvedValue([]);
  deriveAllowance.mockReturnValue({ allowedHours: 30, standardHours: 30, isProbation: false });
});

describe('PUT /students/:studentId/bachelor-project', () => {
  const url = (student) => `/api/advising-schedules/students/${student._id}/bachelor-project`;

  /** A student with a draft. The draft is read once, then re-read (with the project) to respond. */
  const arrange = ({ courses = [], workflowStatus = 'Draft', eligibility = ELIGIBLE } = {}) => {
    const student = makeStudent(workflowStatus);
    const draft = makeDraft(student, courses);
    const saved = { ...draft, bachelorProject: { season: 'Spring', setBy: advisorId, setAt: new Date() } };
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockReturnValueOnce(populated(draft)).mockReturnValue(populated(saved));
    AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 1 });
    loadBachelorEligibility.mockResolvedValue(eligibility);
    return { student, draft };
  };

  it('saves the season for an eligible student and returns the refreshed draft', async () => {
    const { student, draft } = arrange({ courses: [course('CSEN 901', 'Core')] });

    const response = await request(app)
      .put(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ season: 'Spring' })
      .expect(200);

    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalledWith(
      { _id: draft._id },
      {
        $set: {
          bachelorProject: { season: 'Spring', setBy: String(advisorId), setAt: expect.any(Date) },
          updatedBy: String(advisorId),
        },
      }
    );
    expect(response.body.draft.bachelorProject).toEqual({ season: 'Spring' });
    expect(response.body.bachelorProject).toMatchObject({
      eligible: true,
      selection: { season: 'Spring' },
      limits: { maxCourses: 4, maxCore: 2, maxHumanities: 2 },
    });
    expect(student.save).toHaveBeenCalled();
  });

  it('lets a Coordinator do it too', async () => {
    const { student } = arrange();
    await request(app).put(url(student)).set('Authorization', tokenFor('Coordinator')).send({ season: 'Winter' }).expect(200);
  });

  it.each(['Summer', 'winter', '', 42, null])('rejects %p as a season', async (season) => {
    const { student } = arrange();

    const response = await request(app)
      .put(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ season })
      .expect(400);

    expect(response.body.message).toBe('Choose Winter or Spring for the bachelor project.');
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a missing season', async () => {
    const { student } = arrange();
    await request(app).put(url(student)).set('Authorization', tokenFor('Advisor')).send({}).expect(400);
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('refuses an ineligible student and says why', async () => {
    const { student } = arrange({ eligibility: INELIGIBLE });

    const response = await request(app)
      .put(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ season: 'Winter' })
      .expect(409);

    expect(response.body.message).toBe(INELIGIBLE.explanation);
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('needs a draft to exist first', async () => {
    const student = makeStudent();
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockReturnValue(populated(null));

    const response = await request(app)
      .put(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ season: 'Winter' })
      .expect(404);

    expect(response.body.message).toBe('Create a draft before adding the bachelor project.');
    expect(loadBachelorEligibility).not.toHaveBeenCalled();
  });

  it('is refused once the schedule has left the editable workflow', async () => {
    const { student } = arrange({ workflowStatus: 'Ready for Student Review' });

    await request(app).put(url(student)).set('Authorization', tokenFor('Advisor')).send({ season: 'Winter' }).expect(409);

    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('refuses when the draft already holds more courses than the project allows', async () => {
    const { student } = arrange({
      courses: [course('CSEN 901', 'Core'), course('CSEN 903', 'Core'), course('CSEN 1001', 'Core')],
    });

    const response = await request(app)
      .put(url(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ season: 'Winter' })
      .expect(409);

    expect(response.body.message).toMatch(/at most 2 core courses\. Remove the extra courses/);
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('is closed to Students and to anonymous callers', async () => {
    await request(app).put(url({ _id: oid() })).send({ season: 'Winter' }).expect(401);
    await request(app).put(url({ _id: oid() })).set('Authorization', tokenFor('Student')).send({ season: 'Winter' }).expect(403);
  });

  it('only lets an Advisor change a student assigned to them', async () => {
    const { student } = arrange();
    student.assignedAdvisor = oid();

    await request(app).put(url(student)).set('Authorization', tokenFor('Advisor')).send({ season: 'Winter' }).expect(403);

    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });
});

describe('DELETE /students/:studentId/bachelor-project', () => {
  it('takes the project off the draft', async () => {
    const student = makeStudent();
    const draft = makeDraft(student, [], { bachelorProject: { season: 'Winter' } });
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockReturnValue(populated(draft));
    AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 1 });
    loadBachelorEligibility.mockResolvedValue(ELIGIBLE);

    await request(app)
      .delete(`/api/advising-schedules/students/${student._id}/bachelor-project`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(200);

    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalledWith(
      { _id: draft._id },
      { $set: { bachelorProject: null, updatedBy: String(advisorId) } }
    );
  });

  it('is refused once the schedule is no longer an editable draft', async () => {
    const student = makeStudent('Pending Approval');
    Student.findById.mockResolvedValue(student);

    await request(app)
      .delete(`/api/advising-schedules/students/${student._id}/bachelor-project`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(409);

    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });
});

describe('adding courses to a draft that has the project', () => {
  const addUrl = (student) => `/api/advising-schedules/students/${student._id}/courses`;

  /** addCourse reads the draft, then re-reads it populated to count what is already there. */
  const arrange = ({ existing, adding }) => {
    const student = makeStudent();
    const draft = makeDraft(student, existing, { bachelorProject: { season: 'Winter' } });
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockResolvedValueOnce(draft).mockReturnValue(populated(draft));
    AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 1 });
    eligibleNonMandatoryCourses.mockResolvedValue([
      { id: String(adding._id), code: adding.code, name: adding.name, creditHours: adding.creditHours, courseType: adding.courseType },
    ]);
    return student;
  };

  it('refuses a third core course', async () => {
    const adding = course('CSEN 1003', 'Core');
    const student = arrange({ existing: [course('CSEN 901', 'Core'), course('CSEN 903', 'Core')], adding });

    const response = await request(app)
      .post(addUrl(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: adding._id })
      .expect(409);

    expect(response.body.message).toBe('With the bachelor project a student may take at most 2 core courses.');
    expect(AdvisingScheduleDraft.updateOne).not.toHaveBeenCalled();
  });

  it('refuses an elective', async () => {
    const adding = course('CSEN 905', 'Elective');
    const student = arrange({ existing: [], adding });

    const response = await request(app)
      .post(addUrl(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: adding._id })
      .expect(409);

    expect(response.body.message).toMatch(/only core courses and humanities/);
  });

  it('allows a second humanities course', async () => {
    const adding = course('DE 404', 'Huma', 4, 'German 4');
    const student = arrange({ existing: [course('MNGT 601', 'Core', 2, 'Introduction to Management')], adding });

    await request(app)
      .post(addUrl(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: adding._id })
      .expect(200);

    expect(AdvisingScheduleDraft.updateOne).toHaveBeenCalled();
  });

  it('does not apply the cap to a draft without the project', async () => {
    const adding = course('CSEN 1003', 'Core');
    const student = makeStudent();
    const draft = makeDraft(student, [course('CSEN 901', 'Core'), course('CSEN 903', 'Core'), course('CSEN 1001', 'Core')]);
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockResolvedValueOnce(draft).mockReturnValue(populated(draft));
    AdvisingScheduleDraft.updateOne.mockResolvedValue({ modifiedCount: 1 });
    eligibleNonMandatoryCourses.mockResolvedValue([{ id: String(adding._id) }]);

    await request(app)
      .post(addUrl(student))
      .set('Authorization', tokenFor('Advisor'))
      .send({ courseId: adding._id })
      .expect(200);
  });
});

describe('credit hours on a draft that has the project', () => {
  it('counts humanities hours as extra hours even inside the allowance', async () => {
    const student = makeStudent();
    const draft = makeDraft(
      student,
      [course('CSEN 901', 'Core', 20), course('DE 404', 'Huma', 4, 'German 4')],
      { bachelorProject: { season: 'Winter' } }
    );
    Student.findById.mockResolvedValue(student);
    AdvisingScheduleDraft.findOne.mockReturnValue(populated(draft));
    loadBachelorEligibility.mockResolvedValue(ELIGIBLE);

    const response = await request(app)
      .get(`/api/advising-schedules/students/${student._id}`)
      .set('Authorization', tokenFor('Advisor'))
      .expect(200);

    // 24 selected is inside the 30-hour allowance, yet the 4 humanities hours are extra.
    expect(response.body.creditHours).toMatchObject({ selected: 24, allowed: 30, extra: 4, remaining: 10 });
  });
});

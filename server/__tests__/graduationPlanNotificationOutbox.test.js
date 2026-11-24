jest.mock('../models/Student', () => ({ findById: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/GraduationPlan', () => ({ findById: jest.fn() }));
jest.mock('../services/graduationPlanService', () => ({
  applyDecision: jest.fn((plan, { decision, coordinatorId }) => {
    plan.status = decision === 'accept' ? 'Accepted' : 'Draft';
    plan.decidedAt = new Date('2026-11-12T10:00:00Z');
    plan.decidedBy = coordinatorId;
    return null;
  }),
  planInputsFor: jest.fn(),
  approvedCreditLimitFor: jest.fn(),
  approvedExitExamCourseIdsFor: jest.fn(),
  creditLimitsFor: jest.fn(),
  validatePlan: jest.fn(),
  termLabel: jest.fn(() => '2026/2027 Spring'),
}));
jest.mock('../services/notificationEventService', () => ({ publishNotificationEvent: jest.fn() }));
jest.mock('../services/studentNotificationService', () => ({
  buildStudentNotification: jest.fn((name, source) => ({
    name,
    entityId: String(source.entityId),
    occurrence: source.occurrence,
    title: 'Graduation-plan decision',
    message: 'Your graduation-plan request has been approved.',
    link: '/notifications',
  })),
}));

const mongoose = require('mongoose');
const Student = require('../models/Student');
const User = require('../models/User');
const GraduationPlan = require('../models/GraduationPlan');
const {
  planInputsFor,
  approvedCreditLimitFor,
  approvedExitExamCourseIdsFor,
  creditLimitsFor,
  validatePlan,
} = require('../services/graduationPlanService');
const { decidePlan } = require('../controllers/graduationPlanController');

test('graduation-plan decision is saved with its student notification event', async () => {
  const planId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const coordinatorId = new mongoose.Types.ObjectId();
  const student = {
    _id: studentId,
    fullName: 'A Student',
    email: 'student@example.test',
    studentId: '64-12345',
    studentType: 'Advising Student',
    major: 'CS',
    currentSemester: 7,
  };
  const plan = {
    _id: planId,
    student: studentId,
    advisor: new mongoose.Types.ObjectId(),
    status: 'Submitted',
    terms: [
      { season: 'Winter', academicYear: '2026/2027' },
      { season: 'Spring', academicYear: '2026/2027' },
      { season: 'Summer', academicYear: '2026/2027' },
    ],
    placements: [],
    pendingStudentNotificationEvents: [],
    save: jest.fn(async function () {
      expect(this.pendingStudentNotificationEvents).toEqual([
        expect.objectContaining({
          name: 'graduation_plan.decided',
          entityId: String(planId),
          occurrence: '2026-11-12T10:00:00.000Z',
        }),
      ]);
    }),
  };

  GraduationPlan.findById.mockResolvedValue(plan);
  Student.findById.mockResolvedValue(student);
  User.findById.mockReturnValue({ select: () => ({ lean: async () => null }) });
  planInputsFor.mockResolvedValue({ remaining: [], gpa: 3.2 });
  approvedCreditLimitFor.mockResolvedValue(null);
  approvedExitExamCourseIdsFor.mockResolvedValue([]);
  creditLimitsFor.mockReturnValue([]);
  validatePlan.mockReturnValue({ errors: [] });

  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await decidePlan({
    params: { planId: String(planId) },
    body: { decision: 'accept', note: 'Looks good.' },
    user: { userId: String(coordinatorId) },
  }, res);

  expect(plan.save).toHaveBeenCalledTimes(1);
  expect(res.status).toHaveBeenCalledWith(200);
});

jest.mock('../models/GraduationPlan', () => ({ insertMany: jest.fn() }));
jest.mock('../services/graduationPlanService', () => ({
  planningTerms: jest.fn(() => [
    { season: 'Spring', academicYear: '2026/2027' },
    { season: 'Summer', academicYear: '2026/2027' },
    { season: 'Winter', academicYear: '2027/2028' },
  ]),
  remainingCoursesFor: jest.fn(),
  STANDARD_CREDIT_LIMIT: 18,
  validatePlan: jest.fn(() => ({ errors: [] })),
}));

const GraduationPlan = require('../models/GraduationPlan');
const {
  remainingCoursesFor,
  validatePlan,
} = require('../services/graduationPlanService');
const { seedGraduationPlans, planPlacements } = require('../config/graduationPlanSeed');
const realGraduationPlanRules = jest.requireActual('../services/graduationPlanService');

const fixture = () => {
  const advisor = { _id: 'advisor-id', email: 'karim.fahmy@guc.edu.eg' };
  const coordinator = { _id: 'coordinator-id', email: 'coordinator@guc.edu.eg' };
  const students = [
    { _id: 'student-accepted', studentId: '64-50034', studentType: 'Advising Student', assignedAdvisor: advisor._id },
    { _id: 'student-submitted', studentId: '64-40077', studentType: 'Advising Student', assignedAdvisor: advisor._id },
    { _id: 'student-rejected', studentId: '64-40078', studentType: 'Advising Student', assignedAdvisor: advisor._id },
    { _id: 'student-draft', studentId: '64-20046', studentType: 'Advising Student', assignedAdvisor: advisor._id },
  ];
  const course = {
    id: 'course-id',
    code: 'CSEN 901',
    creditHours: 4,
    offeringSeasons: ['Winter'],
    prerequisites: [],
  };
  return { advisor, coordinator, students, users: [advisor, coordinator], course };
};

beforeEach(() => {
  jest.clearAllMocks();
  GraduationPlan.insertMany.mockImplementation(async (plans) => plans);
  remainingCoursesFor.mockResolvedValue([fixture().course]);
});

describe('planPlacements', () => {
  it('places every course in an offered term within the credit limit', () => {
    const { course } = fixture();
    const terms = [
      { season: 'Spring', academicYear: '2026/2027' },
      { season: 'Summer', academicYear: '2026/2027' },
      { season: 'Winter', academicYear: '2027/2028' },
    ];

    expect(planPlacements([course], terms)).toEqual([{ courseId: 'course-id', termIndex: 2 }]);
  });

  it('returns null when the remaining courses cannot fit a valid term sequence', () => {
    const prerequisite = { ...fixture().course, id: 'prerequisite', offeringSeasons: ['Winter'] };
    const dependent = {
      ...fixture().course,
      id: 'dependent',
      offeringSeasons: ['Spring'],
      prerequisites: [{ id: prerequisite.id, code: prerequisite.code, passed: false }],
    };
    const terms = [
      { season: 'Spring', academicYear: '2026/2027' },
      { season: 'Summer', academicYear: '2026/2027' },
      { season: 'Winter', academicYear: '2027/2028' },
    ];

    expect(planPlacements([dependent, prerequisite], terms)).toBeNull();
  });

  it('creates valid complete plans for the final-year Computer Science and DMET cohorts', () => {
    const terms = realGraduationPlanRules.planningTerms(new Date('2026-11-11T12:00:00Z'));
    const course = (id, code, creditHours, recommendedSemester, prerequisites = []) => ({
      id,
      code,
      creditHours,
      recommendedSemester,
      offeringSeasons: [recommendedSemester % 2 ? 'Winter' : 'Spring'],
      prerequisites,
    });
    const computerScience = [
      course('cs901', 'CSEN 901', 4, 9, [{ id: 'cs301', passed: true }]),
      course('cs903', 'CSEN 903', 4, 9),
      course('cs1001', 'CSEN 1001', 4, 10),
      course('cs1002', 'CSEN 1002', 4, 10),
      course('cs1003', 'CSEN 1003', 4, 10, [{ id: 'cs502', passed: true }]),
      course('huma', 'HUMA 1001', 4, 10),
    ];
    const dmet = [
      course('dm901', 'DMET 901', 4, 9, [{ id: 'dm502', passed: true }]),
      course('dm902', 'DMET 902', 4, 9, [{ id: 'dm603', passed: true }]),
      course('dm904', 'DMET 904', 4, 9),
      course('dm1001', 'DMET 1001', 4, 10, [{ id: 'dm603', passed: true }]),
      course('dm1002', 'DMET 1002', 4, 10),
      course('dm1003', 'DMET 1003', 4, 10, [{ id: 'dm603', passed: true }]),
      course('dmet-huma', 'HUMA 1001', 4, 10),
    ];

    for (const remaining of [computerScience, dmet]) {
      const placements = planPlacements(remaining, terms);
      expect(placements).not.toBeNull();
      expect(
        realGraduationPlanRules.validatePlan({
          placements,
          remaining,
          terms,
          requireComplete: true,
        }).errors
      ).toEqual([]);
    }
  });
});

describe('seedGraduationPlans', () => {
  it('seeds accepted, pending, rejected-returned-to-draft, and private draft examples', async () => {
    const { advisor, coordinator, students, users } = fixture();
    const now = new Date('2026-11-11T12:00:00Z');

    const plans = await seedGraduationPlans({ students, users, now });

    expect(GraduationPlan.insertMany).toHaveBeenCalledTimes(1);
    expect(plans.map((plan) => plan.status)).toEqual(['Accepted', 'Submitted', 'Draft', 'Draft']);
    expect(plans[0].advisor).toBe(advisor._id);
    expect(plans[0].decidedBy).toBe(coordinator._id);
    expect(plans[0].submittedAt).toEqual(new Date('2026-11-08T12:00:00.000Z'));
    expect(plans[0].decidedAt).toEqual(new Date('2026-11-10T12:00:00.000Z'));
    expect(plans[1].decidedBy).toBeNull();
    expect(plans[2].responseNote).toMatch(/revise the term sequence/i);
    expect(plans[2].submittedAt).toBeNull();
    expect(plans[2].decidedBy).toBe(coordinator._id);
    expect(plans[3].placements).toEqual([]);
    expect(plans[3].responseNote).toBe('');
    expect(validatePlan).toHaveBeenCalledTimes(2);
  });
});

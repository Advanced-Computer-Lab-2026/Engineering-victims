/**
 * Req 103-107: the graduation-plan rules.
 *
 * The rules are pure, so these tests exercise them directly without a database:
 * terms, season placement, prerequisite order, the credit limit, completeness
 * and the single failed-course exit-exam exception.
 */
const {
  STANDARD_CREDIT_LIMIT,
  planningTerms,
  validatePlan,
} = require('../services/graduationPlanService');

const course = (overrides) => ({
  id: overrides.id ?? overrides.code,
  code: 'CSEN 000',
  creditHours: 4,
  offeringSeasons: ['Winter', 'Spring'],
  prerequisites: [],
  isRetake: false,
  ...overrides,
});

const termsFor = (date) => planningTerms(new Date(date));

const validate = ({ placements, remaining, terms, ...rest }) =>
  validatePlan({ placements, remaining, terms, ...rest });

describe('planningTerms (req 103)', () => {
  it('moves a November plan to the next Spring, Summer and Winter', () => {
    expect(termsFor('2026-11-11T10:00:00')).toEqual([
      { season: 'Spring', academicYear: '2026/2027' },
      { season: 'Summer', academicYear: '2026/2027' },
      { season: 'Winter', academicYear: '2027/2028' },
    ]);
  });

  it('moves a January plan to Summer, Winter and Spring', () => {
    expect(termsFor('2027-01-20T10:00:00')).toEqual([
      { season: 'Summer', academicYear: '2026/2027' },
      { season: 'Winter', academicYear: '2027/2028' },
      { season: 'Spring', academicYear: '2027/2028' },
    ]);
  });

  it('moves a July plan to Winter, Spring and Summer of the next academic year', () => {
    expect(termsFor('2027-07-01T10:00:00')).toEqual([
      { season: 'Winter', academicYear: '2027/2028' },
      { season: 'Spring', academicYear: '2027/2028' },
      { season: 'Summer', academicYear: '2027/2028' },
    ]);
  });

  it('always returns exactly the three planning seasons', () => {
    const terms = termsFor('2026-11-11T10:00:00');
    expect(terms.map((term) => term.season)).toEqual(['Spring', 'Summer', 'Winter']);
    expect(new Set(terms.map((term) => term.academicYear)).size).toBe(2);
  });
});

describe('validatePlan (req 103)', () => {
  const terms = termsFor('2026-11-11T10:00:00');

  it('accepts a complete plan that follows every rule', () => {
    const remaining = [
      course({ code: 'CSEN 301', creditHours: 6, prerequisites: [{ id: 'MATH 203', code: 'MATH 203', passed: true }] }),
      course({ code: 'CSEN 501', creditHours: 6 }),
    ];
    const result = validate({
      terms,
      remaining,
      placements: [
        { courseId: 'CSEN 301', termIndex: 0 },
        { courseId: 'CSEN 501', termIndex: 2 },
      ],
      requireComplete: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.assignedCount).toBe(2);
    expect(result.totalCourses).toBe(2);
    expect(result.termHours.map((term) => term.hours)).toEqual([6, 0, 6]);
  });

  it('lets a draft stay unfinished but blocks submitting it', () => {
    const remaining = [course({ code: 'CSEN 301' }), course({ code: 'CSEN 501' })];
    const placements = [{ courseId: 'CSEN 301', termIndex: 0 }];

    expect(validate({ terms, remaining, placements }).errors).toEqual([]);

    const submitted = validate({ terms, remaining, placements, requireComplete: true });
    expect(submitted.errors).toHaveLength(1);
    expect(submitted.errors[0]).toMatch(/CSEN 501/);
  });

  it('rejects a course placed in a season it is not offered in', () => {
    const remaining = [course({ code: 'CSEN 301', offeringSeasons: ['Winter'] })];
    const result = validate({
      terms,
      remaining,
      placements: [{ courseId: 'CSEN 301', termIndex: 0 }],
      requireComplete: true,
    });

    expect(result.errors).toEqual(['CSEN 301 is offered in Winter, not in 2026/2027 Spring.']);
  });

  it('keeps a prerequisite in an earlier term', () => {
    const remaining = [
      course({ code: 'CSEN 301' }),
      course({
        code: 'CSEN 501',
        prerequisites: [{ id: 'CSEN 301', code: 'CSEN 301', passed: false }],
      }),
    ];

    const wrong = validate({
      terms,
      remaining,
      placements: [
        { courseId: 'CSEN 301', termIndex: 1 },
        { courseId: 'CSEN 501', termIndex: 1 },
      ],
      requireComplete: true,
    });
    expect(wrong.errors).toContain('CSEN 301 must be placed in an earlier term than CSEN 501.');

    const right = validate({
      terms,
      remaining,
      placements: [
        { courseId: 'CSEN 301', termIndex: 0 },
        { courseId: 'CSEN 501', termIndex: 2 },
      ],
      requireComplete: true,
    });
    expect(right.errors).toEqual([]);
  });

  it('treats an already-passed prerequisite as cleared', () => {
    const remaining = [
      course({
        code: 'CSEN 501',
        prerequisites: [{ id: 'CSEN 301', code: 'CSEN 301', passed: true }],
      }),
    ];
    const result = validate({
      terms,
      remaining,
      placements: [{ courseId: 'CSEN 501', termIndex: 0 }],
      requireComplete: true,
    });

    expect(result.errors).toEqual([]);
  });

  it('rejects a term over the standard credit-hour limit', () => {
    const remaining = [
      course({ code: 'CSEN 301', creditHours: 6 }),
      course({ code: 'CSEN 501', creditHours: 6 }),
      course({ code: 'CSEN 503', creditHours: 6 }),
      course({ code: 'CSEN 605', creditHours: 6 }),
    ];
    const result = validate({
      terms,
      remaining,
      placements: remaining.map((entry) => ({ courseId: entry.id, termIndex: 0 })),
      requireComplete: true,
    });

    expect(STANDARD_CREDIT_LIMIT).toBe(18);
    expect(result.errors).toContain('2026/2027 Spring has 24 credit hours, over the 18-hour limit.');
  });

  it('uses a separately approved credit-hour limit when one exists', () => {
    const remaining = [
      course({ code: 'CSEN 301', creditHours: 12 }),
      course({ code: 'CSEN 501', creditHours: 12 }),
    ];
    const result = validate({
      terms,
      remaining,
      placements: remaining.map((entry) => ({ courseId: entry.id, termIndex: 0 })),
      creditLimit: 24,
      requireComplete: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.creditLimit).toBe(24);
  });

  it('rejects the same course assigned twice', () => {
    const remaining = [course({ code: 'CSEN 301' })];
    const result = validate({
      terms,
      remaining,
      placements: [
        { courseId: 'CSEN 301', termIndex: 0 },
        { courseId: 'CSEN 301', termIndex: 1 },
      ],
    });

    expect(result.errors).toEqual(['CSEN 301 is assigned more than once.']);
  });

  it('rejects a course that is not remaining and a missing term', () => {
    const remaining = [course({ code: 'CSEN 301' })];
    const result = validate({
      terms,
      remaining,
      placements: [
        { courseId: 'CSEN 999', termIndex: 0 },
        { courseId: 'CSEN 301', termIndex: null },
      ],
    });

    expect(result.errors).toContain("That course is not one of this student's remaining courses.");
    expect(result.errors).toContain('Choose a term for CSEN 301.');
  });

  it('allows the single failed course with an approved exit exam to stay unassigned (req 107)', () => {
    const remaining = [
      course({ code: 'CSEN 301' }),
      course({ code: 'CSEN 501', isRetake: true }),
    ];
    const placements = [{ courseId: 'CSEN 301', termIndex: 0 }];

    const open = validate({
      terms,
      remaining,
      placements,
      requireComplete: true,
      approvedExitExamCourseIds: new Set(['CSEN 501']),
    });
    expect(open.errors).toEqual([]);

    const rejected = validate({
      terms,
      remaining,
      placements,
      requireComplete: true,
      approvedExitExamCourseIds: new Set(),
    });
    expect(rejected.errors[0]).toMatch(/CSEN 501/);
  });

  it('does not let the exit-exam exception cover a non-failed course or more than one course', () => {
    const notFailed = validate({
      terms,
      remaining: [course({ code: 'CSEN 301' })],
      placements: [],
      requireComplete: true,
      approvedExitExamCourseIds: new Set(['CSEN 301']),
    });
    expect(notFailed.errors).toHaveLength(1);

    const twoUnassigned = validate({
      terms,
      remaining: [
        course({ code: 'CSEN 301', isRetake: true }),
        course({ code: 'CSEN 501', isRetake: true }),
      ],
      placements: [],
      requireComplete: true,
      approvedExitExamCourseIds: new Set(['CSEN 301', 'CSEN 501']),
    });
    expect(twoUnassigned.errors).toHaveLength(1);
  });

  it('reports the hours behind each term even when a rule fails', () => {
    const remaining = [
      course({ code: 'CSEN 301', creditHours: 6 }),
      course({ code: 'CSEN 501', creditHours: 4 }),
    ];
    const result = validate({
      terms,
      remaining,
      placements: [
        { courseId: 'CSEN 301', termIndex: 0 },
        { courseId: 'CSEN 501', termIndex: 2 },
      ],
    });

    expect(result.termHours).toEqual([
      { season: 'Spring', academicYear: '2026/2027', hours: 6 },
      { season: 'Summer', academicYear: '2026/2027', hours: 0 },
      { season: 'Winter', academicYear: '2027/2028', hours: 4 },
    ]);
  });
});

/**
 * Req 103-107: the graduation-plan rules.
 *
 * The rules are pure, so these tests exercise them directly without a database:
 * terms, season placement, prerequisite order, the per-term credit-hour limits
 * of req 59, completeness and the single failed-course exit-exam exception.
 */
const {
  planningTerms,
  termSemestersFor,
  creditLimitsFor,
  validatePlan,
} = require('../services/graduationPlanService');
const { deriveAllowance } = require('../services/advisingOverviewService');

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

/**
 * One flat limit per term, so a rule that is not about the allowance can be
 * checked without also depending on req 59's bands. The allowance itself is
 * covered by its own tests below.
 */
const fixtureLimits = (terms, limit = 18) => terms.map(() => limit);

const validate = ({ placements, remaining, terms, creditLimits = fixtureLimits(terms), ...rest }) =>
  validatePlan({ placements, remaining, terms, creditLimits, ...rest });

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

  it('rejects a term over its credit-hour limit', () => {
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

    expect(result.errors).toContain('2026/2027 Spring has 24 credit hours, over the 18-hour limit.');
  });

  it('checks each term against its own limit (req 59)', () => {
    const remaining = [
      course({ code: 'CSEN 301', creditHours: 26 }),
      course({ code: 'CSEN 501', creditHours: 26 }),
    ];
    const result = validate({
      terms,
      remaining,
      // A Spring term of 26 hours fits, the Winter one behind it does not.
      creditLimits: [30, 30, 24],
      placements: [
        { courseId: 'CSEN 301', termIndex: 0 },
        { courseId: 'CSEN 501', termIndex: 2 },
      ],
      requireComplete: true,
    });

    expect(result.creditLimits).toEqual([30, 30, 24]);
    expect(result.errors).toEqual([
      '2027/2028 Winter has 26 credit hours, over the 24-hour limit.',
    ]);
  });

  it('refuses to guess a limit when the caller did not send one', () => {
    expect(() => validatePlan({ terms, remaining: [], placements: [] })).toThrow(
      /one credit-hour limit per term/i
    );
    expect(() =>
      validatePlan({ terms, remaining: [], placements: [], creditLimits: [34] })
    ).toThrow(/one credit-hour limit per term/i);
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
      creditLimits: fixtureLimits(terms, 24),
      requireComplete: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.creditLimits).toEqual([24, 24, 24]);
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

describe('credit-hour allowance (req 59 applied to req 103)', () => {
  const terms = termsFor('2026-11-11T10:00:00'); // Spring, Summer, Winter

  const limits = (currentSemester, { gpa = null, ...overrides } = {}) =>
    creditLimitsFor({
      student: { currentSemester, academicStanding: 'Good Standing', ...overrides },
      gpa,
      terms,
    });

  it('walks one semester per taught term and lets Summer keep the previous one', () => {
    expect(termSemestersFor(terms, 5)).toEqual([6, 6, 7]);
    expect(termSemestersFor(terms, 1)).toEqual([2, 2, 3]);
    // Starting after a Summer term keeps Winter odd and the Spring after it even.
    expect(termSemestersFor(termsFor('2027-01-20T10:00:00'), 6)).toEqual([6, 7, 8]);
    // A student record without a semester falls back to semester 1, not NaN.
    expect(termSemestersFor(terms, undefined)).toEqual([2, 2, 3]);
  });

  it('takes every band from req 59, semesters 1-2 included', () => {
    expect(limits(1)).toEqual([34, 34, 34]);
    expect(limits(2)).toEqual([34, 34, 34]);
    expect(limits(3)).toEqual([34, 34, 30]);
    expect(limits(4)).toEqual([30, 30, 30]);
    expect(limits(5)).toEqual([30, 30, 28]);
    expect(limits(6)).toEqual([28, 28, 24]);
    expect(limits(7)).toEqual([24, 24, 24]);
    expect(limits(12)).toEqual([24, 24, 24]);
  });

  it('cuts the allowance by 25% rounded up while on probation', () => {
    expect(limits(5, { academicStanding: 'Probation' })).toEqual([23, 23, 21]);
    expect(limits(7, { academicStanding: 'Probation' })).toEqual([18, 18, 18]);
    // The GPA alone decides it when the standing has not been finalised yet.
    expect(limits(7, { academicStanding: 'Good Standing', gpa: 3.7 })).toEqual([18, 18, 18]);
    expect(limits(7, { academicStanding: 'Good Standing', gpa: 3.69 })).toEqual([24, 24, 24]);
  });

  it('agrees with the allowance the advising overview derives (req 59)', () => {
    for (const semester of [1, 3, 5, 7, 8]) {
      const student = { currentSemester: semester, academicStanding: 'Good Standing' };
      const perTerm = termSemestersFor(terms, semester).map((termSemester) =>
        deriveAllowance({ student: { ...student, currentSemester: termSemester } }).allowedHours
      );

      expect(creditLimitsFor({ student, terms })).toEqual(perTerm);
    }
  });

  it('applies a separately approved limit to every term, but never to a probation student', () => {
    expect(creditLimitsFor({
      student: { currentSemester: 5, academicStanding: 'Good Standing' },
      terms,
      approvedLimit: 40,
    })).toEqual([40, 40, 40]);

    expect(creditLimitsFor({
      student: { currentSemester: 5, academicStanding: 'Probation' },
      terms,
      approvedLimit: 40,
    })).toEqual([23, 23, 21]);
  });
});

/**
 * Req 60: the pure rules for a draft that includes the bachelor project, and
 * how the draft validator applies them.
 */
const {
  isHumanities,
  classifyCourse,
  isValidSeason,
  projectCourseIssues,
  projectHours,
} = require('../services/bachelorProjectRules');
const { validateAdvisingDraft } = require('../services/advisingScheduleValidation');

const course = (code, courseType, creditHours = 4, name = `Course ${code}`) => ({ code, name, courseType, creditHours });

const CORE_A = course('CSEN 901', 'Core');
const CORE_B = course('CSEN 903', 'Core');
const CORE_C = course('CSEN 1001', 'Core');
const GERMAN = course('DE 404', 'Huma', 4, 'German 4');
const MANAGEMENT = course('MNGT 601', 'Core', 2, 'Introduction to Management');
const PROJECT_MANAGEMENT = course('HUMA 1001', 'Huma', 4, 'Project Management');
const SEMINAR = course('SEM 1000', 'Huma', 2, 'Seminar');

describe('isHumanities', () => {
  it.each([
    ['any German course', GERMAN],
    ['German 1', course('DE 101', 'Huma', 4, 'German 1')],
    ['Introduction to Management, although the catalogue types it Core', MANAGEMENT],
    ['Project Management', PROJECT_MANAGEMENT],
    ['Seminar, which has no course code in the curriculum sheet', SEMINAR],
  ])('treats %s as humanities', (_label, subject) => {
    expect(isHumanities(subject)).toBe(true);
  });

  it.each([
    ['a core course', CORE_A],
    ['an elective', course('CSEN 905', 'Elective')],
    ['English for Academic Purposes, typed Huma but not on the req 60 list', course('AS 102', 'Huma', 2, 'English for Academic Purposes')],
    ['Research Paper Writing', course('RPW 401', 'Huma', 2, 'Research Paper Writing')],
    ['a course whose code merely starts with DE', course('DEMO 101', 'Core')],
    ['a course with no code', {}],
  ])('does not treat %s as humanities', (_label, subject) => {
    expect(isHumanities(subject)).toBe(false);
  });
});

describe('classifyCourse', () => {
  it('sorts a course into Humanities, Core or Other', () => {
    expect(classifyCourse(GERMAN)).toBe('Humanities');
    expect(classifyCourse(MANAGEMENT)).toBe('Humanities');
    expect(classifyCourse(CORE_A)).toBe('Core');
    expect(classifyCourse(course('CSEN 905', 'Elective'))).toBe('Other');
  });
});

describe('isValidSeason', () => {
  it('accepts only Winter and Spring', () => {
    expect(isValidSeason('Winter')).toBe(true);
    expect(isValidSeason('Spring')).toBe(true);
    expect(isValidSeason('Summer')).toBe(false);
    expect(isValidSeason('spring')).toBe(false);
    expect(isValidSeason(undefined)).toBe(false);
  });
});

describe('projectCourseIssues', () => {
  it('allows an empty draft', () => {
    expect(projectCourseIssues([])).toEqual([]);
  });

  it('allows the full set: two core and two humanities', () => {
    expect(projectCourseIssues([CORE_A, CORE_B, GERMAN, PROJECT_MANAGEMENT])).toEqual([]);
  });

  it('refuses a third core course', () => {
    expect(projectCourseIssues([CORE_A, CORE_B, CORE_C])).toEqual([
      'With the bachelor project a student may take at most 2 core courses.',
    ]);
  });

  it('refuses a third humanities course', () => {
    expect(projectCourseIssues([GERMAN, MANAGEMENT, SEMINAR])).toEqual([
      'With the bachelor project a student may take at most 2 humanities courses.',
    ]);
  });

  it('refuses electives and other courses', () => {
    const issues = projectCourseIssues([course('CSEN 905', 'Elective')]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/only core courses and humanities/);
  });

  it('reports every rule that is broken, not just the first', () => {
    const issues = projectCourseIssues([CORE_A, CORE_B, CORE_C, GERMAN, MANAGEMENT, SEMINAR]);
    expect(issues).toEqual([
      'With the bachelor project a student may take at most 2 core courses.',
      'With the bachelor project a student may take at most 2 humanities courses.',
      'With the bachelor project a student may take at most 4 courses.',
    ]);
  });
});

describe('projectHours', () => {
  it('counts humanities as extra even when the allowance is unused', () => {
    expect(projectHours({ courses: [CORE_A, GERMAN], allowedHours: 24 })).toEqual({
      humanitiesHours: 4,
      otherHours: 4,
      extraHours: 4,
    });
  });

  it('adds any overflow of the other courses to the humanities hours', () => {
    const big = course('CSEN 902', 'Core', 28);
    expect(projectHours({ courses: [big, GERMAN], allowedHours: 24 })).toEqual({
      humanitiesHours: 4,
      otherHours: 28,
      extraHours: 8,
    });
  });

  it('has no extra hours without humanities or overflow', () => {
    expect(projectHours({ courses: [CORE_A, CORE_B], allowedHours: 24 }).extraHours).toBe(0);
  });
});

describe('validateAdvisingDraft with a bachelor project', () => {
  /** A draft whose only open issues are the ones under test. */
  const input = (courses, { approvedExtraHours = 0, allowedHours = 24, bachelorProject = { season: 'Winter' } } = {}) => ({
    courses: courses.map((entry) => ({ course: { ...entry, lectureHours: 0, tutorialHours: 0, labHours: 0, prerequisites: [] }, mandatory: false })),
    mandatoryCandidates: [],
    courseRecords: [],
    offerings: courses.map((entry) => ({ courseId: entry, publicationStatus: 'Published' })),
    assignments: [],
    slotOccupancy: new Map(),
    allowedHours,
    approvedExtraHours,
    bachelorProject,
  });
  const codes = (result) => result.issues.map((issue) => issue.code);

  it('needs approved extra hours for humanities, naming how many', () => {
    const result = validateAdvisingDraft(input([CORE_A, GERMAN]));

    const issue = result.issues.find((entry) => entry.code === 'bachelor-project-extra-hours');
    expect(issue.message).toBe(
      'With the bachelor project, 4 humanities hours count as extra hours. The draft needs 4 approved extra hours; 0 are approved.'
    );
  });

  it('is satisfied once enough extra hours are approved', () => {
    const result = validateAdvisingDraft(input([CORE_A, GERMAN], { approvedExtraHours: 4 }));
    expect(codes(result)).not.toContain('bachelor-project-extra-hours');
    expect(codes(result)).not.toContain('bachelor-project-courses');
  });

  it('still reports 4 approved hours as short for 6 humanities hours', () => {
    const result = validateAdvisingDraft(input([MANAGEMENT, GERMAN], { approvedExtraHours: 4 }));
    expect(codes(result)).toContain('bachelor-project-extra-hours');
  });

  it('reports a course set the cap forbids', () => {
    const result = validateAdvisingDraft(input([CORE_A, CORE_B, CORE_C], { approvedExtraHours: 99 }));
    expect(codes(result)).toContain('bachelor-project-courses');
  });

  it('does not double-report hours as a plain credit-hour overflow', () => {
    const result = validateAdvisingDraft(input([CORE_A, GERMAN], { allowedHours: 4, approvedExtraHours: 4 }));
    expect(codes(result)).not.toContain('credit-hour-limit');
  });

  it('leaves a draft without the project exactly as before', () => {
    const result = validateAdvisingDraft(input([CORE_A, GERMAN], { bachelorProject: null }));
    // 8 hours against a 24-hour allowance: no humanities-as-extra rule, no cap rule.
    expect(codes(result)).not.toContain('bachelor-project-extra-hours');
    expect(codes(result)).not.toContain('bachelor-project-courses');
    expect(codes(result)).not.toContain('credit-hour-limit');
  });
});

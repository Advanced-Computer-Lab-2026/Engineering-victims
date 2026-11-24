/**
 * Req 63: "If mandatory courses consume all allowed hours, no other course may
 * be added without approved extra hours."
 */
const { sumHours, mandatoryHoursBlock, mandatoryCoursesOf } = require('../services/mandatoryScheduleRules');

const base = { mandatoryHours: 24, selectedHours: 24, newHours: 4, allowedHours: 24, approvedExtraHours: 0 };

describe('mandatoryHoursBlock', () => {
  it('blocks another course when the mandatory courses use exactly all allowed hours', () => {
    expect(mandatoryHoursBlock(base)).toBe(
      'The mandatory courses already use all 24 allowed credit hours. Another course needs approved extra hours first.'
    );
  });

  it('blocks it when the mandatory courses use more than the allowed hours', () => {
    expect(mandatoryHoursBlock({ ...base, mandatoryHours: 28, selectedHours: 28 })).not.toBeNull();
  });

  it('does not block while the mandatory courses leave room', () => {
    expect(mandatoryHoursBlock({ ...base, mandatoryHours: 23, selectedHours: 23 })).toBeNull();
  });

  it('allows it when approved extra hours cover the new course exactly', () => {
    expect(mandatoryHoursBlock({ ...base, approvedExtraHours: 4 })).toBeNull();
  });

  it('blocks it when approved extra hours fall one hour short', () => {
    expect(mandatoryHoursBlock({ ...base, approvedExtraHours: 3 })).not.toBeNull();
  });

  it('counts other courses already added against the approved extra hours', () => {
    // 4 extra hours are approved and 4 are already used by another course.
    expect(mandatoryHoursBlock({ ...base, selectedHours: 28, approvedExtraHours: 4 })).not.toBeNull();
  });

  it('treats a missing approved-extra figure as none', () => {
    const { approvedExtraHours, ...withoutExtra } = base;
    expect(mandatoryHoursBlock(withoutExtra)).not.toBeNull();
  });
});

describe('sumHours', () => {
  it('adds credit hours and ignores missing values', () => {
    expect(sumHours([{ creditHours: 6 }, { creditHours: 4 }, {}, null])).toBe(10);
    expect(sumHours([])).toBe(0);
  });
});

describe('mandatoryCoursesOf', () => {
  it('returns only the mandatory entries that have a course', () => {
    const a = { code: 'A', creditHours: 6 };
    const b = { code: 'B', creditHours: 4 };
    expect(
      mandatoryCoursesOf([
        { course: a, mandatory: true },
        { course: b, mandatory: false },
        { course: null, mandatory: true },
      ])
    ).toEqual([a]);
  });
});

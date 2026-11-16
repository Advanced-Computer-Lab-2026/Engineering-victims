const { requiredCount, validateAdvisingDraft } = require('../services/advisingScheduleValidation');
const { buildSlotAssignments } = require('../services/advisingScheduleWorkflowService');

const course = (id, fields = {}) => ({
  _id: id,
  code: `CSEN ${id}`,
  creditHours: 6,
  lectureHours: 2,
  tutorialHours: 2,
  labHours: 0,
  prerequisites: [],
  ...fields,
});

const slot = (id, slotType, groupNumber, fields = {}) => ({
  _id: id,
  slotType,
  groupNumber,
  dayOfWeek: 'Monday',
  startTime: '09:00',
  endTime: '11:00',
  maxCapacity: 10,
  ...fields,
});

const validDraft = () => {
  const selected = course('course-1');
  const lecture = slot('lecture-1', 'Lecture', 1);
  const tutorial = slot('tutorial-1', 'Tutorial', 1, { dayOfWeek: 'Tuesday' });
  const offering = { _id: 'offering-1', courseId: selected, publicationStatus: 'Published' };
  return {
    courses: [{ course: selected, mandatory: false }],
    mandatoryCandidates: [],
    courseRecords: [],
    offerings: [offering],
    assignments: [
      { slotId: { ...lecture, offeringId: { courseId: selected } } },
      { slotId: { ...tutorial, offeringId: { courseId: selected } } },
    ],
    slotOccupancy: new Map([['lecture-1', 1], ['tutorial-1', 1]]),
    allowedHours: 6,
    approvedExtraHours: 0,
  };
};

test('requires a lecture and one session per two contact hours for tutorials and labs', () => {
  expect(requiredCount(course('a', { lectureHours: 0, tutorialHours: 4, labHours: 6 }), 'Lecture')).toBe(1);
  expect(requiredCount(course('a', { tutorialHours: 4, labHours: 6 }), 'Tutorial')).toBe(2);
  expect(requiredCount(course('a', { tutorialHours: 4, labHours: 6 }), 'Lab')).toBe(3);
});

test('reports mandatory courses, missing required slots, and credit-hour excess', () => {
  const input = validDraft();
  input.mandatoryCandidates = [{ course: { id: 'course-2', code: 'CSEN 202' } }];
  input.assignments.pop();
  input.allowedHours = 3;

  const result = validateAdvisingDraft(input);

  expect(result.valid).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining(['missing-mandatory-course', 'missing-required-slots', 'credit-hour-limit'])
  );
});

test('reports unpublished offerings and unmet prerequisites', () => {
  const input = validDraft();
  input.courses[0].course.prerequisites = ['prerequisite-1'];
  input.offerings[0].publicationStatus = 'Draft';

  const result = validateAdvisingDraft(input);

  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining(['unpublished-offering', 'unmet-prerequisite'])
  );
});

test('reports timetable clashes and over-capacity assigned slots', () => {
  const input = validDraft();
  input.assignments[1].slotId.dayOfWeek = 'Monday';
  input.slotOccupancy.set('lecture-1', 11);

  const result = validateAdvisingDraft(input);

  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining(['timetable-clash', 'slot-over-capacity'])
  );
});

test('accepts hours above the base allowance only when approved extra hours cover them', () => {
  const input = validDraft();
  input.allowedHours = 3;
  input.approvedExtraHours = 3;

  expect(validateAdvisingDraft(input).valid).toBe(true);
});

test('does not allow an empty schedule or assignments for courses outside the draft', () => {
  const empty = validateAdvisingDraft({});
  const input = validDraft();
  input.assignments.push({ slotId: { ...slot('orphan-slot', 'Lab', 2), offeringId: { courseId: 'not-selected' } } });

  expect(empty.issues.map((issue) => issue.code)).toContain('empty-schedule');
  expect(validateAdvisingDraft(input).issues.map((issue) => issue.code)).toContain('unselected-course-assignment');
});

test('marks slot choices that clash with another course in the draft', () => {
  const selectedCourse = course('course-1', { tutorialHours: 0 });
  const otherCourse = course('course-2');
  const candidate = slot('candidate-lecture', 'Lecture', 2, {
    dayOfWeek: 'Thursday',
    startTime: '10:00',
    endTime: '12:00',
    offeringId: 'offering-1',
  });
  const occupied = slot('other-course-lab', 'Lab', 1, {
    dayOfWeek: 'Thursday',
    startTime: '11:00',
    endTime: '13:00',
    offeringId: { courseId: otherCourse },
  });

  const result = buildSlotAssignments({
    courses: [{ course: selectedCourse }],
    offerings: [{ _id: 'offering-1', courseId: selectedCourse }],
    rows: [{ _id: 'other-assignment', slotId: occupied }],
    slots: [candidate],
    slotOccupancy: new Map([['candidate-lecture', 2]]),
  });

  expect(result[0].components[0].options[0].clashes).toContain('other-assignment');
});
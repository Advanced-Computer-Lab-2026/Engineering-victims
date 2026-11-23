const { slotsOverlap } = require('./conflictService');
const { projectCourseIssues, projectHours } = require('./bachelorProjectRules');

const COMPONENTS = [
  { slotType: 'Lecture', hoursField: 'lectureHours', minimum: 1 },
  { slotType: 'Tutorial', hoursField: 'tutorialHours', minimum: 0 },
  { slotType: 'Lab', hoursField: 'labHours', minimum: 0 },
];

const idOf = (value) => {
  const id = value?._id ?? value?.id ?? value;
  return id == null ? null : String(id);
};

const requiredCount = (course, slotType) => {
  const component = COMPONENTS.find((item) => item.slotType === slotType);
  if (!component) return 0;
  return Math.max(component.minimum, Math.ceil((Number(course?.[component.hoursField]) || 0) / 2));
};

const validateAdvisingDraft = ({
  courses = [],
  mandatoryCandidates = [],
  courseRecords = [],
  offerings = [],
  assignments = [],
  slotOccupancy = new Map(),
  allowedHours = 0,
  approvedExtraHours = 0,
  bachelorProject = null,
}) => {
  const issues = [];
  const selectedIds = new Set(courses.map((entry) => idOf(entry.course)));
  const passedIds = new Set(
    courseRecords
      .filter((record) => record.status === 'Completed' && record.grade && record.grade !== 'F')
      .map((record) => idOf(record.course))
  );
  const offeringByCourse = new Map(offerings.map((offering) => [idOf(offering.courseId), offering]));

  if (courses.length === 0) {
    issues.push({ code: 'empty-schedule', message: 'Add at least one course before sending the schedule for review.' });
  }

  for (const candidate of mandatoryCandidates) {
    const courseId = idOf(candidate.course);
    if (courseId && !selectedIds.has(courseId)) {
      issues.push({
        code: 'missing-mandatory-course',
        courseId,
        message: `Mandatory course ${candidate.course.code} is missing from the draft.`,
      });
    }
  }

  const selectedHours = courses.reduce((total, entry) => total + (Number(entry.course?.creditHours) || 0), 0);
  const maximumHours = Number(allowedHours) + Number(approvedExtraHours);
  if (bachelorProject) {
    // Req 60: with the project the cap on courses applies, and humanities are
    // extra hours that must be covered by an approved extra-hours request.
    const courseDocs = courses.map((entry) => entry.course).filter(Boolean);
    projectCourseIssues(courseDocs).forEach((message) => {
      issues.push({ code: 'bachelor-project-courses', message });
    });
    const { humanitiesHours, extraHours } = projectHours({ courses: courseDocs, allowedHours: Number(allowedHours) });
    if (extraHours > Number(approvedExtraHours)) {
      issues.push({
        code: 'bachelor-project-extra-hours',
        message: `With the bachelor project, ${humanitiesHours} humanities hours count as extra hours. The draft needs ${extraHours} approved extra hours; ${Number(approvedExtraHours)} are approved.`,
      });
    }
  } else if (selectedHours > maximumHours) {
    issues.push({
      code: 'credit-hour-limit',
      message: `The draft has ${selectedHours} credit hours; the allowed total is ${maximumHours}.`,
    });
  }

  for (const row of assignments) {
    const courseId = idOf(row.slotId?.offeringId?.courseId);
    if (courseId && !selectedIds.has(courseId)) {
      issues.push({
        code: 'unselected-course-assignment',
        courseId,
        message: `A slot assignment exists for a course that is not in this draft. Remove or restore that course before continuing.`,
      });
    }
  }

  for (const entry of courses) {
    const course = entry.course;
    const courseId = idOf(course);
    const offering = offeringByCourse.get(courseId);
    if (!offering || offering.publicationStatus !== 'Published') {
      issues.push({
        code: 'unpublished-offering',
        courseId,
        message: `Course ${course.code} does not have a published offering for this term.`,
      });
    }

    const unmetPrerequisites = (course.prerequisites ?? [])
      .map(idOf)
      .filter((prerequisiteId) => prerequisiteId && !passedIds.has(prerequisiteId));
    if (unmetPrerequisites.length) {
      issues.push({
        code: 'unmet-prerequisite',
        courseId,
        message: `Course ${course.code} has unmet prerequisites.`,
      });
    }

    const selectedAssignments = assignments.filter((row) => idOf(row.slotId?.offeringId?.courseId) === courseId);
    for (const component of COMPONENTS) {
      const required = requiredCount(course, component.slotType);
      const count = selectedAssignments.filter((row) => row.slotId?.slotType === component.slotType).length;
      if (count < required) {
        issues.push({
          code: 'missing-required-slots',
          courseId,
          slotType: component.slotType,
          message: `Course ${course.code} needs ${required - count} more ${component.slotType.toLowerCase()} slot${required - count === 1 ? '' : 's'}.`,
        });
      } else if (count > required) {
        issues.push({
          code: 'too-many-slots',
          courseId,
          slotType: component.slotType,
          message: `Course ${course.code} has more ${component.slotType.toLowerCase()} slots than required.`,
        });
      }
    }
  }

  for (let first = 0; first < assignments.length; first += 1) {
    const firstSlot = assignments[first].slotId;
    if (!firstSlot) continue;
    const occupancy = Number(slotOccupancy.get(idOf(firstSlot))) || 0;
    if (occupancy > Number(firstSlot.maxCapacity)) {
      issues.push({
        code: 'slot-over-capacity',
        slotId: idOf(firstSlot),
        message: `Group ${firstSlot.groupNumber} is over capacity. Choose another slot.`,
      });
    }
    for (let second = first + 1; second < assignments.length; second += 1) {
      const secondSlot = assignments[second].slotId;
      if (secondSlot && slotsOverlap(firstSlot, secondSlot)) {
        issues.push({
          code: 'timetable-clash',
          slotIds: [idOf(firstSlot), idOf(secondSlot)],
          message: `${firstSlot.slotType} group ${firstSlot.groupNumber} clashes with ${secondSlot.slotType.toLowerCase()} group ${secondSlot.groupNumber}.`,
        });
      }
    }
  }

  return { valid: issues.length === 0, selectedHours, allowedHours: maximumHours, issues };
};

module.exports = { COMPONENTS, idOf, requiredCount, validateAdvisingDraft };
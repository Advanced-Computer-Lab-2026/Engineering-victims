const mongoose = require('mongoose');
const { GRADE_POINTS } = require('../models/CourseRecord');
const { deriveAllowance } = require('./advisingOverviewService');
const idOf = (course) => String(course?._id || '');
const validCredits = (value) => Number.isInteger(value) && value >= 1 && value <= 12;

/**
 * Pure FR 83 rules. All student, course, selected-course and academic-record
 * values must be loaded/authorized on the server by the eventual request API.
 * `courseRequests` identifies billable requested hours per course explicitly;
 * a course crossing the allowance need not be billed for its entire credit load.
 * Graduation evidence is trusted integration context, never an HTTP-body flag.
 */
function evaluateExtraHoursRequest({ student, selectedCourses = [], courseRequests = [], records = [], graduationAssessment = null }) {
  const checks = [];
  const check = (code, passed, message) => checks.push({ code, passed: Boolean(passed), message });
  check('ADVISING_STUDENT', student?.studentType === 'Advising Student', 'Extra hours require an Advising Student.');
  check('ACTIVE_STUDENT', student?.isActive === true, 'The student account must be active.');
  const validSemester = Number.isInteger(student?.currentSemester) && student.currentSemester > 0;
  check('VALID_SEMESTER', validSemester, 'A positive whole semester number is required.');

  // Same weighted all-attempt GPA convention as academicHistoryService. Stored
  // probation independently blocks an increase, even if records are incomplete.
  let gradeHours = 0;
  let points = 0;
  let validHistory = true;
  const completed = records.filter((record) => record.status === 'Completed');
  for (const record of completed) {
    if (!record.course?._id || !validCredits(record.course.creditHours) || !Object.hasOwn(GRADE_POINTS, record.grade)) {
      validHistory = false;
      continue;
    }
    gradeHours += record.course.creditHours;
    points += GRADE_POINTS[record.grade] * record.course.creditHours;
  }
  const gpa = gradeHours ? Math.round(points / gradeHours * 100) / 100 : null;
  // Shared FR 59 policy, also used by graduation-plan validation. Do not keep
  // independent semester bands, probation thresholds or reductions here.
  const allowance = deriveAllowance({ student: student || {}, gpa });
  const standardHours = validSemester ? allowance.standardHours : null;
  const allowedHours = validSemester ? allowance.allowedHours : null;
  check('ACADEMIC_HISTORY', validHistory, 'Completed academic records must have valid courses, credits and grades.');
  check('NOT_ON_PROBATION', student?.academicStanding === 'Good Standing' && allowance.canReceiveIncrease, 'Probation or dismissed students cannot receive extra hours.');

  const verifiedGraduate = graduationAssessment?.withinOneYear === true &&
    typeof graduationAssessment.sourceReference === 'string' && Boolean(graduationAssessment.sourceReference.trim());
  check('GRADUATION_EVIDENCE', graduationAssessment?.withinOneYear !== true || verifiedGraduate,
    'A within-one-year assessment requires an authoritative source reference.');
  const maximumTotalHours = standardHours === null ? null : allowance.canReceiveIncrease
    ? Math.min(34, standardHours + (verifiedGraduate ? 34 - standardHours : 3)) : allowedHours;
  const selected = new Map();
  let validSelected = true;
  for (const course of selectedCourses) {
    const id = idOf(course);
    if (!mongoose.isValidObjectId(id) || !validCredits(course.creditHours)) { validSelected = false; continue; }
    if (selected.has(id) && selected.get(id).creditHours !== course.creditHours) validSelected = false;
    selected.set(id, course); // Lecture/tutorial/lab rows count the course once.
  }
  check('SELECTED_COURSES', validSelected, 'Selected courses must have valid identifiers and credit hours.');
  check('COURSES_REQUESTED', courseRequests.length > 0, 'At least one course must be specified.');
  const seen = new Set();
  const items = [];
  for (const { course, requestedHours } of courseRequests) {
    const id = idOf(course);
    const valid = mongoose.isValidObjectId(id) && !seen.has(id) && validCredits(course?.creditHours) &&
      Number.isInteger(requestedHours) && requestedHours > 0 && requestedHours <= course.creditHours &&
      course.isActive === true && Boolean(course.code) && Boolean(course.name);
    check(`COURSE_${id || 'INVALID'}`, valid, 'Request courses must be unique, active and have valid requested hours within their credit hours.');
    seen.add(id);
    if (!valid) continue;
    const attempts = completed.filter((record) => idOf(record.course) === id);
    check(`NOT_PASSED_${id}`, !attempts.some((record) => Object.hasOwn(GRADE_POINTS, record.grade) && record.grade !== 'F'), 'Already passed courses cannot be requested again (FR 70).');
    const repeated = attempts.some((record) => record.grade === 'F');
    const ratePerHour = repeated ? 1000 : 800;
    items.push({ course: id, code: course.code, name: course.name, creditHours: course.creditHours,
      requestedHours, classification: repeated ? 'Repeated' : 'New', ratePerHour, subtotal: requestedHours * ratePerHour });
    if (selected.has(id) && selected.get(id).creditHours !== course.creditHours) {
      check(`CREDIT_CONSISTENCY_${id}`, false, 'Course credits disagree between the draft and catalogue.');
    }
    selected.set(id, course);
  }
  const selectedHours = [...selected.values()].reduce((sum, course) => sum + course.creditHours, 0);
  const requestedHours = items.reduce((sum, item) => sum + item.requestedHours, 0);
  const extraHoursNeeded = standardHours === null ? null : Math.max(0, selectedHours - standardHours);
  check('EXTRA_HOURS_NEEDED', extraHoursNeeded > 0, 'Selected/requested courses must exceed the standard allowance to require extra hours.');
  check('REQUEST_COVERS_EXCESS', extraHoursNeeded !== null && requestedHours >= extraHoursNeeded, 'Requested extra hours must cover the selected credit-hour excess.');
  check('TOTAL_LIMIT', maximumTotalHours !== null && selectedHours <= maximumTotalHours, 'The projected schedule exceeds the applicable standard-plus-three or 34-hour limit.');
  check('REQUEST_LIMIT', maximumTotalHours !== null && requestedHours <= maximumTotalHours - standardHours, 'Requested extra hours exceed the permitted increase.');
  return {
    eligible: checks.every((entry) => entry.passed), checks,
    issues: checks.filter((entry) => !entry.passed),
    standardHours, allowedHours, isProbation: allowance.isProbation, canReceiveIncrease: allowance.canReceiveIncrease,
    selectedHours, requestedHours, extraHoursNeeded, maximumTotalHours, gpa,
    graduationBasis: verifiedGraduate ? 'Verified within one year' : graduationAssessment?.withinOneYear === false ? 'Not within one year' : 'Unknown — standard-plus-three limit',
    graduationSource: verifiedGraduate ? graduationAssessment.sourceReference.trim() : null,
    items, totalCost: items.reduce((sum, item) => sum + item.subtotal, 0), currency: 'EGP',
  };
}

// Builds an UNSAVED request. Submission, role/deadline checks and loading official
// course/offering/draft data belong to the next step; nothing activates here.
function prepareExtraHoursRequest({ student, termId, requestingAdvisorId, selectedCourses, courseRequests, records, graduationAssessment }) {
  if (![student?._id, termId, requestingAdvisorId].every((id) => mongoose.isValidObjectId(id))) throw new Error('Valid student, term and requesting advisor identifiers are required.');
  const quote = evaluateExtraHoursRequest({ student, selectedCourses, courseRequests, records, graduationAssessment });
  if (!quote.eligible) {
    const error = new Error('The extra-hours request does not meet eligibility rules.');
    error.status = 422;
    error.issues = quote.issues;
    throw error;
  }
  const ExtraHoursRequest = require('../models/ExtraHoursRequest');
  return new ExtraHoursRequest({ student: student._id, term: termId, requestingAdvisor: requestingAdvisorId,
    items: quote.items, requestedHours: quote.requestedHours, totalCost: quote.totalCost,
    eligibility: { standardHours: quote.standardHours, allowedHours: quote.allowedHours, selectedHours: quote.selectedHours,
      maximumTotalHours: quote.maximumTotalHours, gpa: quote.gpa, graduationBasis: quote.graduationBasis,
      graduationSource: quote.graduationSource, checks: quote.checks } });
}
module.exports = { evaluateExtraHoursRequest, prepareExtraHoursRequest };

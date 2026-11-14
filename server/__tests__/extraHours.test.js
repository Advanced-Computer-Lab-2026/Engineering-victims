const mongoose = require('mongoose');
const { evaluateExtraHoursRequest: evaluate, prepareExtraHoursRequest } = require('../services/extraHoursService');
const { deriveAllowance } = require('../services/advisingOverviewService');
const ExtraHoursRequest = require('../models/ExtraHoursRequest');
const oid = () => new mongoose.Types.ObjectId();
const course = (creditHours = 3) => ({ _id: oid(), code: 'CSEN 701', name: 'Test Course', creditHours, isActive: true });
const student = () => ({ _id: oid(), studentType: 'Advising Student', isActive: true, academicStanding: 'Good Standing', currentSemester: 7 });
const base = () => ({ student: student(), selectedCourses: [course(12), course(12), course(4)], courseRequests: [{ course: course(), requestedHours: 3 }], records: [] });
test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('semester %s uses the shared FR 59 allowance', (semester) => {
  const input = base();
  input.student.currentSemester = semester;
  const shared = deriveAllowance({ student: input.student });
  expect(evaluate(input)).toMatchObject({ standardHours: shared.standardHours, allowedHours: shared.allowedHours, isProbation: shared.isProbation, canReceiveIncrease: shared.canReceiveIncrease });
});
test.each([3, 5, 7, 8])('probation in semester %s uses the shared reduced allowance and blocks increases', (semester) => {
  const input = base();
  Object.assign(input.student, { currentSemester: semester, academicStanding: 'Probation' });
  const shared = deriveAllowance({ student: input.student });
  expect(evaluate(input)).toMatchObject({ eligible: false, allowedHours: shared.allowedHours, maximumTotalHours: shared.allowedHours, isProbation: true, canReceiveIncrease: false });
});
test('new-course request derives itemized EGP 800/hour prices', () => {
  const result = evaluate(base());
  expect(result.eligible).toBe(true);
  expect(result).toMatchObject({ standardHours: 28, selectedHours: 31, requestedHours: 3, maximumTotalHours: 31, totalCost: 2400, currency: 'EGP' });
  expect(result.items[0]).toMatchObject({ classification: 'New', ratePerHour: 800, subtotal: 2400 });
});
test('failed-course repeats cost EGP 1000/hour, including when already in the draft', () => {
  const input = base();
  input.selectedCourses.push(input.courseRequests[0].course);
  input.records = [{ status: 'Completed', grade: 'F', course: input.courseRequests[0].course },
    { status: 'Completed', grade: 'A', course: course(12) }];
  const result = evaluate(input);
  expect(result.eligible).toBe(true);
  expect(result.selectedHours).toBe(31);
  expect(result.items[0]).toMatchObject({ classification: 'Repeated', ratePerHour: 1000, subtotal: 3000 });
});
test.each(['Probation', 'Dismissed'])('%s students cannot receive extra hours', (academicStanding) => {
  const input = base();
  input.student.academicStanding = academicStanding;
  expect(evaluate(input).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NOT_ON_PROBATION' })]));
});
test('calculated GPA 3.70 blocks increases even if the stored standing is outdated', () => {
  const input = base();
  input.records = [{ status: 'Completed', grade: 'D+', course: course() }];
  expect(evaluate(input)).toMatchObject({ eligible: false, gpa: 3.7 });
});
test.each([{ studentType: 'Normal Student' }, { isActive: false }, { currentSemester: 0 }, { currentSemester: 7.5 }])('unsupported student context is rejected: %j', (override) => {
  const input = base();
  Object.assign(input.student, override);
  expect(evaluate(input).eligible).toBe(false);
});
test('unverified graduation cannot authorize more than three extra hours', () => {
  const input = base();
  input.courseRequests = [{ course: course(6), requestedHours: 6 }];
  expect(evaluate(input).eligible).toBe(false);
  input.graduationAssessment = { withinOneYear: true };
  expect(evaluate(input).issues.some((issue) => issue.code === 'GRADUATION_EVIDENCE')).toBe(true);
});
test('verified within-year context permits the increase to 34 hours', () => {
  const input = base();
  input.courseRequests = [{ course: course(6), requestedHours: 6 }];
  input.graduationAssessment = { withinOneYear: true, sourceReference: 'authoritative-graduation-assessment' };
  expect(evaluate(input)).toMatchObject({ eligible: true, selectedHours: 34, requestedHours: 6, maximumTotalHours: 34, totalCost: 4800 });
});
test('34-hour absolute ceiling holds even for verified graduating students', () => {
  const input = base();
  input.courseRequests = [{ course: course(7), requestedHours: 7 }];
  input.graduationAssessment = { withinOneYear: true, sourceReference: 'verified-source' };
  expect(evaluate(input).eligible).toBe(false);
});
test('semesters 3–4 cannot exceed their existing 34-hour allowance', () => {
  const input = base();
  input.student.currentSemester = 3;
  input.selectedCourses = [course(12), course(12), course(10)];
  expect(evaluate(input).eligible).toBe(false);
});
test('duplicate draft course rows count once, duplicate request items are rejected', () => {
  const input = base();
  input.selectedCourses.push(input.selectedCourses[0]);
  expect(evaluate(input).selectedHours).toBe(31);
  input.courseRequests.push(input.courseRequests[0]);
  expect(evaluate(input).eligible).toBe(false);
});
test.each([0, -1, 1.5, NaN, Infinity, '3', 4])('invalid requested hours %s are rejected', (hours) => {
  const input = base();
  input.courseRequests[0].requestedHours = hours;
  expect(evaluate(input).eligible).toBe(false);
});
test('insufficient extra hours cannot cover the proposed schedule', () => {
  const input = base();
  input.courseRequests[0].requestedHours = 1;
  expect(evaluate(input).issues.some((issue) => issue.code === 'REQUEST_COVERS_EXCESS')).toBe(true);
});
test('a course crossing the allowance supports explicitly requested partial hours', () => {
  const input = base();
  input.selectedCourses = [course(12), course(12), course(2)];
  input.courseRequests[0].requestedHours = 1;
  expect(evaluate(input)).toMatchObject({ eligible: true, selectedHours: 29, requestedHours: 1, totalCost: 800 });
});
test('requests that fit inside the standard allowance do not need extra hours', () => {
  const input = base();
  input.selectedCourses = [course(12)];
  expect(evaluate(input).issues.some((issue) => issue.code === 'EXTRA_HOURS_NEEDED')).toBe(true);
});
test('already passed courses and inactive catalogue courses are rejected', () => {
  const input = base();
  input.records = [{ status: 'Completed', grade: 'A', course: input.courseRequests[0].course }];
  expect(evaluate(input).eligible).toBe(false);
  input.records = [];
  input.courseRequests[0].course.isActive = false;
  expect(evaluate(input).eligible).toBe(false);
});
test('malformed completed history cannot silently classify a course as new', () => {
  const input = base();
  input.records = [{ status: 'Completed', course: null, grade: 'F' }];
  expect(evaluate(input).eligible).toBe(false);
});
test('draft and catalogue credit-hour disagreements are rejected', () => {
  const input = base();
  input.selectedCourses.push({ ...input.courseRequests[0].course, creditHours: 1 });
  expect(evaluate(input).eligible).toBe(false);
});
test('builder produces an unsaved pending request with no activation or payment', async () => {
  const input = { ...base(), termId: oid(), requestingAdvisorId: oid() };
  const request = prepareExtraHoursRequest(input);
  await expect(request.validate()).resolves.toBeUndefined();
  expect(request.isNew).toBe(true);
  expect(request.decision).toBe('Pending');
  expect(request.settlementStatus).toBe('Not Applicable');
  expect(request.settlementOption).toBeNull();
  expect(request.totalCost).toBe(2400);
});
test('builder rejects an ineligible request with useful validation codes', () => {
  const input = { ...base(), termId: oid(), requestingAdvisorId: oid() };
  input.student.academicStanding = 'Probation';
  try { prepareExtraHoursRequest(input); throw new Error('should reject'); }
  catch (error) { expect(error.status).toBe(422); expect(error.issues.some((issue) => issue.code === 'NOT_ON_PROBATION')).toBe(true); }
});
test.each(['total', 'rate', 'duplicate', 'item-hours'])('schema rejects tampered %s', async (kind) => {
  const request = prepareExtraHoursRequest({ ...base(), termId: oid(), requestingAdvisorId: oid() });
  if (kind === 'total') request.totalCost = 1;
  if (kind === 'rate') { request.items[0].ratePerHour = 1000; request.items[0].subtotal = 3000; request.totalCost = 3000; }
  if (kind === 'duplicate') request.items.push(request.items[0].toObject());
  if (kind === 'item-hours') request.items[0].requestedHours = 8;
  await expect(request.validate()).rejects.toThrow();
});

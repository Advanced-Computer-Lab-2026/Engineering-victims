jest.mock('../models/Student', () => ({ findById: jest.fn() }));
jest.mock('../models/AcademicTerm', () => ({ find: jest.fn() }));
jest.mock('../models/StudentSchedule', () => ({ find: jest.fn() }));
jest.mock('../models/CourseOffering', () => ({ find: jest.fn() }));
jest.mock('../models/CourseRecord', () => ({ find: jest.fn(), GRADE_POINTS: { A: 1, F: 5 } }));
jest.mock('../models/GraduationPlan', () => ({ findOne: jest.fn() }));
const Student = require('../models/Student');
const Term = require('../models/AcademicTerm');
const Schedule = require('../models/StudentSchedule');
const Offering = require('../models/CourseOffering');
const Record = require('../models/CourseRecord');
const Plan = require('../models/GraduationPlan');
const Request = require('../models/ExtraHoursRequest');
const { loadContext, evaluateSelection, fingerprint, submitRequest } = require('../services/extraHoursSubmissionService');
const mongoose = require('mongoose');
const id = () => new mongoose.Types.ObjectId();
const q = (value) => { const query = { populate: () => query, sort: () => query, lean: async () => value }; return query; };
let student, term, courses, candidate;
beforeEach(() => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  student = { _id: id(), fullName: 'Test Student', isActive: true, studentType: 'Advising Student', academicStanding: 'Good Standing', currentSemester: 7, major: 'Computer Science' };
  term = { _id: id(), academicYear: '2026/2027', season: 'Winter', advisingDeadline: new Date('2099-01-01') };
  courses = [12, 12, 4].map((creditHours) => ({ _id: id(), code: 'CSEN 701', name: 'Course', creditHours, isActive: true }));
  candidate = { _id: id(), code: 'CSEN 702', name: 'Extra Course', creditHours: 3, isActive: true, majors: [student.major], prerequisites: [], offeringSeasons: ['Winter'] };
  Student.findById.mockReturnValue(q(student));
  Term.find.mockReturnValue(q([term]));
  Schedule.find.mockReturnValue(q(courses.map((course) => ({ status: 'Draft', termId: term._id, slotId: { offeringId: { courseId: course, termId: term._id, publicationStatus: 'Published' } } }))));
  Offering.find.mockReturnValue(q([{ courseId: candidate, eligibleMajors: [], eligibleSemesters: [] }]));
  Record.find.mockReturnValue(q([]));
  Plan.findOne.mockReturnValue(q(null));
});
test('loads the actual draft, published offerings and academic records for the selected student', async () => {
  const context = await loadContext(String(student._id), String(term._id));
  expect(context.selectedCourses).toHaveLength(3);
  expect(Schedule.find).toHaveBeenCalledWith({ studentId: String(student._id), termId: String(term._id) });
  expect(Offering.find).toHaveBeenCalledWith({ termId: term._id, publicationStatus: 'Published' });
  expect(evaluateSelection(context, [{ courseId: String(candidate._id), requestedHours: 3 }]).quote).toMatchObject({ eligible: true, totalCost: 2400, selectedHours: 31 });
});
test('missing drafts are explicit dependency failures, not simulated schedules', async () => {
  Term.find.mockReturnValue(q([]));
  await expect(loadContext(String(student._id))).rejects.toThrow('No editable');
});
test('processed rows cannot be used as an editable draft', async () => {
  Schedule.find.mockReturnValue(q([{ status: 'Draft', termId: term._id }, { status: 'Processed', termId: term._id }]));
  await expect(loadContext(String(student._id), String(term._id))).rejects.toThrow();
});
test('expired advising deadlines block quotes and submissions', async () => {
  term.advisingDeadline = new Date('2000-01-01');
  const context = await loadContext(String(student._id));
  expect(() => evaluateSelection(context, [{ courseId: String(candidate._id), requestedHours: 3 }])).toThrow('deadline');
});
test.each(['normal', 'inactive'])('%s students cannot be request targets', async (kind) => {
  if (kind === 'normal') student.studentType = 'Normal Student'; else student.isActive = false;
  await expect(loadContext(String(student._id))).rejects.toThrow('active advising');
});
test('unmet prerequisites and passed courses are excluded', async () => {
  candidate.prerequisites = [id()];
  expect((await loadContext(String(student._id))).courses.size).toBe(0);
  candidate.prerequisites = [];
  Record.find.mockReturnValue(q([{ status: 'Completed', grade: 'A', course: candidate }]));
  expect((await loadContext(String(student._id))).courses.size).toBe(0);
});
test('major and semester offering restrictions cannot be bypassed', async () => {
  Offering.find.mockReturnValue(q([{ courseId: candidate, eligibleSemesters: ['3'], eligibleMajors: [] }]));
  const context = await loadContext(String(student._id));
  expect(() => evaluateSelection(context, [{ courseId: String(candidate._id), requestedHours: 3 }])).toThrow('not eligible');
});
test('duplicate submission keys return the original request without reloading or saving', async () => {
  const body = { studentId: String(student._id), termId: String(term._id), items: [{ courseId: String(candidate._id), requestedHours: 3 }], submissionKey: 'key' };
  const existing = { _id: id(), submissionFingerprint: fingerprint(body) };
  jest.spyOn(Request, 'findOne').mockResolvedValue(existing);
  const result = await submitRequest(id(), body);
  expect(result).toEqual({ request: existing, replay: true });
  expect(Student.findById).not.toHaveBeenCalled();
});
test('a key cannot be reused for different payloads', async () => {
  jest.spyOn(Request, 'findOne').mockResolvedValue({ submissionFingerprint: 'different' });
  await expect(submitRequest(id(), { studentId: 'student', termId: 'term', submissionKey: 'key', items: [] })).rejects.toThrow('different');
});
test('submission persists pending request and history without modifying schedules', async () => {
  jest.spyOn(Request, 'findOne').mockResolvedValue(null);
  const save = jest.spyOn(Request.prototype, 'save').mockResolvedValue(undefined);
  const advisor = id();
  const result = await submitRequest(advisor, { studentId: String(student._id), termId: String(term._id), submissionKey: 'key', items: [{ courseId: String(candidate._id), requestedHours: 3 }] });
  expect(save).toHaveBeenCalledTimes(1);
  expect(result.request.decision).toBe('Pending');
  expect(result.request.settlementStatus).toBe('Not Applicable');
  expect(String(result.request.requestingAdvisor)).toBe(String(advisor));
  expect(result.request.history[0].action).toBe('Submitted');
});

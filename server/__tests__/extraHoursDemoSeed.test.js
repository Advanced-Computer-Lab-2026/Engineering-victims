const mongoose = require('mongoose');
const { COURSES } = require('../config/courseCatalogue');
const { STUDENTS } = require('../config/seedData');
const { buildDemoRequests } = require('../config/extraHoursDemoSeed');

const oid = () => new mongoose.Types.ObjectId();

test('regular-seed demo requests are valid, final-state, and non-payable', async () => {
  const advisorIds = new Map();
  const students = STUDENTS.map((student) => {
    if (student.advisorEmail && !advisorIds.has(student.advisorEmail)) {
      advisorIds.set(student.advisorEmail, oid());
    }
    const { advisorEmail, ...details } = student;
    return {
      ...details,
      _id: oid(),
      assignedAdvisor: advisorIds.get(advisorEmail) ?? null,
    };
  });
  const users = [{ _id: oid(), role: 'Coordinator' }];
  const terms = [{ _id: oid(), season: 'Winter', termStartDate: '2026-09-01' }];
  const courses = COURSES.map((course) => ({ ...course, _id: oid(), isActive: true }));

  const requests = buildDemoRequests({ students, users, terms, courses, records: [] });
  await Promise.all(requests.map((request) => request.validate()));

  expect(requests.map((request) => request.decision)).toEqual(['Rejected', 'Withdrawn', 'Rejected']);
  expect(requests.every((request) => request.settlementStatus === 'Not Applicable')).toBe(true);
  expect(requests.every((request) => request.settlementOption === null)).toBe(true);
  expect(requests.every((request) => request.history.some((entry) => entry.action === 'DemoCreated'))).toBe(true);
  expect(requests.every((request) => request.eligibility.checks.every((check) => check.passed))).toBe(true);
});

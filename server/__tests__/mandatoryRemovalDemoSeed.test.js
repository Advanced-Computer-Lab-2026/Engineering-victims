const mongoose = require('mongoose');
const { STUDENTS } = require('../config/seedData');
const { buildDemoRequests, DEMO_REQUESTS } = require('../config/mandatoryRemovalDemoSeed');

const oid = () => new mongoose.Types.ObjectId();

const demoFixture = () => {
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
  const users = [
    ...[...advisorIds].map(([email, _id]) => ({ _id, email, role: 'Advisor' })),
    { _id: oid(), email: 'coordinator@guc.edu.eg', role: 'Coordinator' },
  ];
  const candidatesByStudent = new Map(
    DEMO_REQUESTS.map(({ studentEmail }) => [
      studentEmail,
      [
        {
          reason: 'Failed',
          course: { id: oid(), code: 'CSEN 301' },
        },
      ],
    ])
  );
  return { students, users, candidatesByStudent };
};

test('builds valid pending and decided requests from assigned students and failed mandatory courses', () => {
  const requests = buildDemoRequests(demoFixture());

  expect(requests.map((request) => request.status)).toEqual(['Rejected', 'Approved', 'Pending']);
  expect(requests[0].student).toBe(requests[1].student);
  expect(requests[0].course).toBe(requests[1].course);
  expect(requests[2].decidedBy).toBeNull();
  expect(requests[2].decidedAt).toBeNull();
  expect(requests.every((request) => request.advisor && request.course && request.reason)).toBe(true);
});

test('fails rather than seeding a request for a student without a failed mandatory course', () => {
  const fixture = demoFixture();
  fixture.candidatesByStudent.set('laila.hassan@student.guc.edu.eg', []);

  expect(() => buildDemoRequests(fixture)).toThrow('requires a failed mandatory course');
});

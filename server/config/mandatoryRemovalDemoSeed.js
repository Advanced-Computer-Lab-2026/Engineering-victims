const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');
const { FIRST_MAKEUP, validateRemovalRequest } = require('../services/mandatoryRemovalService');
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');

const DEMO_REQUESTS = [
  {
    studentEmail: 'laila.hassan@student.guc.edu.eg',
    status: 'Rejected',
    submittedAt: '2026-11-10T09:00:00.000Z',
    decidedAt: '2026-11-11T09:00:00.000Z',
    reason: 'The student failed the course and requests a first makeup opportunity.',
    responseNote: 'The supporting documentation does not establish first-makeup eligibility.',
  },
  {
    studentEmail: 'laila.hassan@student.guc.edu.eg',
    status: 'Approved',
    submittedAt: '2026-11-17T09:00:00.000Z',
    decidedAt: '2026-11-18T09:00:00.000Z',
    reason: 'The updated transcript confirms the student remains eligible for a first makeup opportunity.',
    responseNote: 'First-makeup eligibility confirmed; the course is removed from the mandatory list.',
  },
  {
    studentEmail: 'ahmed.sherif@student.guc.edu.eg',
    status: 'Pending',
    submittedAt: '2026-11-20T09:00:00.000Z',
    decidedAt: null,
    reason: 'The student failed the course and requests a first makeup opportunity.',
    responseNote: '',
  },
];

const buildDemoRequests = ({ students, users, candidatesByStudent }) => {
  const studentByEmail = new Map(students.map((student) => [student.email, student]));
  const coordinator = users.find((user) => user.role === 'Coordinator');
  if (!coordinator) {
    throw new Error('The mandatory-removal demo requests require a seeded Coordinator.');
  }

  return DEMO_REQUESTS.map((spec) => {
    const student = studentByEmail.get(spec.studentEmail);
    if (!student?.isActive || student.studentType !== 'Advising Student' || !student.assignedAdvisor) {
      throw new Error(
        `The mandatory-removal demo request requires an assigned, active Advising Student: ${spec.studentEmail}.`
      );
    }

    const advisor = users.find(
      (user) => user.role === 'Advisor' && String(user._id) === String(student.assignedAdvisor)
    );
    if (!advisor) {
      throw new Error(`The mandatory-removal demo request could not find ${student.studentId}'s Advisor.`);
    }

    const candidates = candidatesByStudent.get(spec.studentEmail) ?? [];
    const candidate = candidates.find((entry) => entry.reason === 'Failed');
    if (!candidate) {
      throw new Error(
        `The mandatory-removal demo request requires a failed mandatory course for ${student.studentId}.`
      );
    }

    const validationError = validateRemovalRequest({
      candidates,
      completedHours: 0,
      courseId: candidate.course.id,
      category: FIRST_MAKEUP,
      reason: spec.reason,
    });
    if (validationError) {
      throw new Error(`The mandatory-removal demo request is invalid for ${student.studentId}: ${validationError}`);
    }

    const submittedAt = new Date(spec.submittedAt);
    const decidedAt = spec.decidedAt ? new Date(spec.decidedAt) : null;
    return {
      student: student._id,
      course: candidate.course.id,
      advisor: advisor._id,
      category: FIRST_MAKEUP,
      reason: spec.reason,
      status: spec.status,
      responseNote: spec.responseNote,
      decidedBy: decidedAt ? coordinator._id : null,
      decidedAt,
      createdAt: submittedAt,
      updatedAt: decidedAt ?? submittedAt,
    };
  });
};

const seedMandatoryRemovalRequests = async ({ students, users }) => {
  const studentByEmail = new Map(students.map((student) => [student.email, student]));
  const targetEmails = [...new Set(DEMO_REQUESTS.map((request) => request.studentEmail))];
  const candidatesByStudent = new Map();

  for (const email of targetEmails) {
    const student = studentByEmail.get(email);
    if (!student) {
      throw new Error(`The mandatory-removal demo request student is missing from the seed: ${email}.`);
    }
    candidatesByStudent.set(email, await buildMandatoryCandidates(student));
  }

  const requests = buildDemoRequests({ students, users, candidatesByStudent });
  await MandatoryRemovalRequest.insertMany(requests);
  return requests.length;
};

module.exports = { DEMO_REQUESTS, buildDemoRequests, seedMandatoryRemovalRequests };

const mongoose = require('mongoose');
const ExitExamRequest = require('../models/ExitExamRequest');
const {
  NOTE_LIMIT,
  applyDecision,
  validateRequest,
} = require('../services/exitExamRequestService');
const { approvedExitExamCourseIdsFor } = require('../services/graduationPlanService');

const student = { studentType: 'Advising Student' };
const failedCourse = { id: 'course-1', code: 'CSEN 301', isRetake: true };

describe('validateRequest (req 108)', () => {
  it('accepts a reason for the only remaining failed course', () => {
    expect(
      validateRequest({
        student,
        remaining: [failedCourse, { id: 'course-2', isRetake: false }],
        courseId: 'course-1',
        reason: 'The course is not offered before graduation.',
      })
    ).toBeNull();
  });

  it('requires an Advising Student and exactly one remaining failed course', () => {
    expect(
      validateRequest({
        student: { studentType: 'Normal Student' },
        remaining: [failedCourse],
        courseId: failedCourse.id,
        reason: 'No valid placement.',
      })
    ).toMatch(/only for Advising Students/i);

    expect(
      validateRequest({
        student,
        remaining: [failedCourse, { id: 'course-2', isRetake: true }],
        courseId: failedCourse.id,
        reason: 'No valid placement.',
      })
    ).toMatch(/exactly one failed course/i);
  });

  it('requires the single failed course and a bounded explanation', () => {
    expect(
      validateRequest({
        student,
        remaining: [failedCourse],
        courseId: 'course-2',
        reason: 'No valid placement.',
      })
    ).toMatch(/single failed course/i);

    expect(
      validateRequest({
        student,
        remaining: [failedCourse],
        courseId: failedCourse.id,
        reason: '  ',
      })
    ).toMatch(/explain why/i);

    expect(
      validateRequest({
        student,
        remaining: [failedCourse],
        courseId: failedCourse.id,
        reason: 'x'.repeat(NOTE_LIMIT + 1),
      })
    ).toMatch(/under 1000 characters/i);
  });
});

describe('applyDecision (req 109)', () => {
  const coordinatorId = new mongoose.Types.ObjectId();
  const now = new Date('2026-11-11T12:00:00Z');

  it.each([
    ['approve', 'Approved'],
    ['reject', 'Rejected'],
  ])('records a %s decision and response note', (decision, expectedStatus) => {
    const request = { status: 'Pending', responseNote: '' };
    expect(
      applyDecision({
        request,
        decision,
        note: '  Please retain this decision in the student record.  ',
        coordinatorId,
        now,
      })
    ).toBeNull();
    expect(request).toEqual({
      status: expectedStatus,
      responseNote: 'Please retain this decision in the student record.',
      decidedBy: coordinatorId,
      decidedAt: now,
    });
  });

  it('requires a pending request and a non-empty bounded response note', () => {
    expect(applyDecision({ request: { status: 'Approved' }, decision: 'reject', note: 'No.' })).toMatch(
      /only a pending/i
    );
    expect(applyDecision({ request: { status: 'Pending' }, decision: 'approve', note: ' ' })).toMatch(
      /response note/i
    );
    expect(
      applyDecision({
        request: { status: 'Pending' },
        decision: 'approve',
        note: 'x'.repeat(NOTE_LIMIT + 1),
      })
    ).toMatch(/under 1000 characters/i);
  });
});

describe('approvedExitExamCourseIdsFor (req 107/109)', () => {
  it('returns only course ids from approved requests for the student', async () => {
    const courseId = new mongoose.Types.ObjectId();
    const distinct = jest.spyOn(ExitExamRequest, 'distinct').mockResolvedValue([courseId]);

    const result = await approvedExitExamCourseIdsFor({ _id: 'student-1' });

    expect(distinct).toHaveBeenCalledWith('course', {
      student: 'student-1',
      status: 'Approved',
    });
    expect(result).toEqual(new Set([String(courseId)]));
    distinct.mockRestore();
  });
});

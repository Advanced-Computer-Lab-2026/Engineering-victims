jest.mock('../models/StudentSchedule', () => ({ find: jest.fn() }));
jest.mock('../models/CourseSlot', () => ({ find: jest.fn() }));
jest.mock('../models/SlotChangeRequest', () => ({ insertMany: jest.fn() }));
jest.mock('../models/ExitExamRequest', () => ({ create: jest.fn() }));
jest.mock('../models/SemesterStanding', () => ({ insertMany: jest.fn() }));
jest.mock('../models/GraduationPlan', () => ({ exists: jest.fn() }));
jest.mock('../services/graduationPlanService', () => ({ remainingCoursesFor: jest.fn() }));
jest.mock('../services/exitExamRequestService', () => ({ validateRequest: jest.fn() }));
jest.mock('../services/probationService', () => ({ semesterOrdinal: jest.fn(() => 4051) }));

const StudentSchedule = require('../models/StudentSchedule');
const CourseSlot = require('../models/CourseSlot');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const ExitExamRequest = require('../models/ExitExamRequest');
const SemesterStanding = require('../models/SemesterStanding');
const GraduationPlan = require('../models/GraduationPlan');
const { remainingCoursesFor } = require('../services/graduationPlanService');
const { validateRequest } = require('../services/exitExamRequestService');
const {
  seedSlotChangeRequests,
  seedExitExamRequests,
  seedSemesterStandingHistory,
} = require('../config/workflowDemoSeed');

const queryFor = (result) => ({
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(result),
});

beforeEach(() => {
  jest.clearAllMocks();
  SlotChangeRequest.insertMany.mockResolvedValue([]);
  ExitExamRequest.create.mockResolvedValue({});
  SemesterStanding.insertMany.mockResolvedValue([]);
  GraduationPlan.exists.mockResolvedValue({ _id: 'draft-plan' });
  remainingCoursesFor.mockResolvedValue([{ id: 'failed-course', isRetake: true }]);
  validateRequest.mockReturnValue(null);
});

describe('seedSlotChangeRequests', () => {
  it('creates pending requests tied to assigned slots in the review-ready schedule', async () => {
    const term = {
      _id: 'current-term',
      termStartDate: new Date('2026-09-15T00:00:00Z'),
      advisingDeadline: new Date('2027-01-15T00:00:00Z'),
    };
    const student = {
      _id: 'student',
      studentId: '64-30010',
      studentType: 'Advising Student',
      workflowStatus: 'Ready for Student Review',
    };
    const scheduleRows = ['lecture', 'tutorial', 'lab'].map((slotType) => ({
      _id: `entry-${slotType}`,
      slotId: `slot-${slotType}`,
    }));
    const slots = ['Lecture', 'Tutorial', 'Lab'].map((slotType) => ({
      _id: `slot-${slotType.toLowerCase()}`,
      slotType,
      groupNumber: 1,
      dayOfWeek: 'Monday',
      startTime: '09:00',
      endTime: '10:30',
      roomId: 'C7.201',
      offeringId: { _id: `offering-${slotType}`, courseId: `course-${slotType}` },
    }));
    StudentSchedule.find.mockReturnValue(queryFor(scheduleRows));
    CourseSlot.find.mockReturnValue(queryFor(slots));

    await expect(
      seedSlotChangeRequests({
        students: [student],
        terms: [term],
        courses: slots.map((slot) => ({
          _id: slot.offeringId.courseId,
          code: `CSEN ${slot.slotType}`,
        })),
        now: new Date('2026-11-14T00:00:00Z'),
      })
    ).resolves.toBe(3);

    const requests = SlotChangeRequest.insertMany.mock.calls[0][0];
    expect(requests.map((request) => request.status)).toEqual(['Pending', 'Pending', 'Pending']);
    expect(requests.map((request) => request.currentSlot)).toEqual([
      'slot-lecture',
      'slot-tutorial',
      'slot-lab',
    ]);
    expect(requests[0]).toMatchObject({
      student: student._id,
      term: term._id,
      scheduleEntry: 'entry-lecture',
      course: 'course-Lecture',
      offering: 'offering-Lecture',
      preferenceNote: expect.stringContaining('Sunday'),
      currentSlotSnapshot: { room: 'C7.201' },
    });
  });
});

describe('seedExitExamRequests', () => {
  it('creates a pending request for the seeded advisor draft and sole failed course', async () => {
    const student = {
      _id: 'student',
      studentId: '64-30011',
      studentType: 'Advising Student',
      assignedAdvisor: 'advisor',
    };
    const advisor = { _id: 'advisor', role: 'Advisor' };

    await expect(seedExitExamRequests({ students: [student], users: [advisor] })).resolves.toBe(1);

    expect(GraduationPlan.exists).toHaveBeenCalledWith({
      student: student._id,
      advisor: advisor._id,
      status: 'Draft',
    });
    expect(validateRequest).toHaveBeenCalledWith({
      student,
      remaining: [{ id: 'failed-course', isRetake: true }],
      courseId: 'failed-course',
      reason: expect.any(String),
    });
    expect(ExitExamRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        student: student._id,
        advisor: advisor._id,
        course: 'failed-course',
        status: 'Pending',
      })
    );
  });
});

describe('seedSemesterStandingHistory', () => {
  it('seeds completed-term history only for non-new Advising Students', async () => {
    const oldTerm = {
      _id: 'old-term',
      academicYear: '2025/2026',
      season: 'Spring',
      termEndDate: new Date('2026-05-22T00:00:00Z'),
    };
    const students = [
      { _id: 'probation', studentType: 'Advising Student', currentSemester: 6, academicStanding: 'Probation' },
      { _id: 'good', studentType: 'Advising Student', currentSemester: 4, academicStanding: 'Good Standing' },
      { _id: 'new', studentType: 'Advising Student', currentSemester: 1, academicStanding: 'Good Standing' },
      { _id: 'dismissed', studentType: 'Advising Student', currentSemester: 6, academicStanding: 'Dismissed' },
      { _id: 'normal', studentType: 'Normal Student', currentSemester: 5, academicStanding: 'Good Standing' },
    ];

    await expect(
      seedSemesterStandingHistory({
        students,
        terms: [oldTerm],
        users: [{ _id: 'coordinator', role: 'Coordinator' }],
        now: new Date('2026-11-14T00:00:00Z'),
      })
    ).resolves.toBe(2);

    const rows = SemesterStanding.insertMany.mock.calls[0][0];
    expect(rows.map((row) => row.student)).toEqual(['probation', 'good']);
    expect(rows.map((row) => row.standing)).toEqual(['Probation', 'Good Standing']);
    expect(rows.every((row) => row.term === oldTerm._id && row.checkPending === false)).toBe(true);
  });
});

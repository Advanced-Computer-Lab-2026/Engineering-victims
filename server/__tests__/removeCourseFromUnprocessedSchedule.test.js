/**
 * Req 69: "Approval removes the course from the mandatory list and any
 * unprocessed draft schedule."
 *
 * The mandatory list is read from the approved request (mandatoryCourseService);
 * this covers the schedule side. Models are mocked, so no MongoDB is needed and
 * each test states exactly what the student's schedule holds.
 */
jest.mock('../models/Student', () => ({ updateOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/CourseOffering', () => ({ find: jest.fn() }));
jest.mock('../models/CourseSlot', () => ({ find: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/StudentSchedule', () => ({ deleteMany: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/AdvisingScheduleDraft', () => ({ updateMany: jest.fn() }));

const mongoose = require('mongoose');
const Student = require('../models/Student');
const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');
const StudentSchedule = require('../models/StudentSchedule');
const AdvisingScheduleDraft = require('../models/AdvisingScheduleDraft');
const { removeCourseFromUnprocessedSchedule } = require('../services/advisingScheduleWorkflowService');

const oid = () => new mongoose.Types.ObjectId();
const SESSION = { id: 'session' };

/** A query that ends in `.session(...)` (and optionally `.select(...)`) resolving to `value`. */
const sessionQuery = (value) => {
  const query = { select: jest.fn(() => query), session: jest.fn(() => Promise.resolve(value)) };
  return query;
};

const studentId = oid();
const courseId = oid();

/** Arranges the student's status, the course's offerings and slots, and the seats that remain. */
const arrange = ({ workflowStatus = 'Draft', offerings = [], slots = [], seatsLeft = 0 } = {}) => {
  Student.updateOne.mockResolvedValue({ matchedCount: 1 });
  Student.findById.mockReturnValue(sessionQuery({ _id: studentId, workflowStatus }));
  CourseOffering.find.mockReturnValue(sessionQuery(offerings));
  CourseSlot.find.mockReturnValue(sessionQuery(slots));
  CourseSlot.updateOne.mockResolvedValue({});
  StudentSchedule.deleteMany.mockResolvedValue({ deletedCount: slots.length });
  StudentSchedule.countDocuments.mockReturnValue({ session: jest.fn(() => Promise.resolve(seatsLeft)) });
  AdvisingScheduleDraft.updateMany.mockResolvedValue({ modifiedCount: 1 });
};

const run = () => removeCourseFromUnprocessedSchedule({ studentId, courseId, session: SESSION });

beforeEach(() => {
  jest.resetAllMocks();
});

describe('removeCourseFromUnprocessedSchedule (req 69)', () => {
  it('takes the course out of every draft and deletes its unprocessed slot rows, counting the freed seats back', async () => {
    const offering = { _id: oid() };
    const slots = [{ _id: oid() }, { _id: oid() }, { _id: oid() }];
    arrange({ offerings: [offering], slots, seatsLeft: 4 });

    const result = await run();

    expect(StudentSchedule.deleteMany).toHaveBeenCalledWith(
      { studentId, status: { $in: ['Draft', 'Active'] }, slotId: { $in: slots.map((slot) => slot._id) } },
      { session: SESSION }
    );
    // Each slot's assigned count is rebuilt from the rows that remain, so the seat is free again.
    slots.forEach((slot) => {
      expect(CourseSlot.updateOne).toHaveBeenCalledWith({ _id: slot._id }, { $set: { assignedCount: 4 } }, { session: SESSION });
    });
    expect(AdvisingScheduleDraft.updateMany).toHaveBeenCalledWith(
      { student: studentId, 'courses.course': courseId },
      { $pull: { courses: { course: courseId } } },
      { session: SESSION }
    );
    expect(result).toEqual({ skipped: null, slotRows: 3, drafts: 1 });
  });

  it('deletes Draft rows and the Active rows of a schedule marked Ready for Student Review, never Processed ones', async () => {
    arrange({ offerings: [{ _id: oid() }], slots: [{ _id: oid() }] });

    await run();

    const [filter] = StudentSchedule.deleteMany.mock.calls[0];
    // Ready for Student Review turns Draft rows Active; processing turns both Processed.
    expect(filter.status).toEqual({ $in: ['Draft', 'Active'] });
    expect(filter.status.$in).not.toContain('Processed');
    expect(filter.studentId).toBe(studentId);
  });

  it.each(['Not Started', 'Draft', 'Ready for Student Review', 'Change Request Pending', 'Pending Approval', 'Ready to Process', 'Reopened'])(
    'acts on a schedule that is %s, because it is not processed',
    async (workflowStatus) => {
      arrange({ workflowStatus, offerings: [{ _id: oid() }], slots: [{ _id: oid() }] });

      const result = await run();

      expect(result.skipped).toBeNull();
      expect(AdvisingScheduleDraft.updateMany).toHaveBeenCalled();
    }
  );

  it('leaves a processed schedule completely untouched', async () => {
    arrange({ workflowStatus: 'Processed', offerings: [{ _id: oid() }], slots: [{ _id: oid() }] });

    const result = await run();

    expect(result).toEqual({ skipped: 'processed', slotRows: 0, drafts: 0 });
    expect(StudentSchedule.deleteMany).not.toHaveBeenCalled();
    expect(CourseSlot.updateOne).not.toHaveBeenCalled();
    expect(AdvisingScheduleDraft.updateMany).not.toHaveBeenCalled();
  });

  it('still removes the course from the draft when it has no offering or slots yet', async () => {
    arrange({ offerings: [], slots: [] });

    const result = await run();

    expect(CourseSlot.find).not.toHaveBeenCalled();
    expect(StudentSchedule.deleteMany).not.toHaveBeenCalled();
    expect(AdvisingScheduleDraft.updateMany).toHaveBeenCalledWith(
      { student: studentId, 'courses.course': courseId },
      { $pull: { courses: { course: courseId } } },
      { session: SESSION }
    );
    expect(result).toEqual({ skipped: null, slotRows: 0, drafts: 1 });
  });

  it('locks the student first, so it cannot race a slot edit', async () => {
    arrange({ offerings: [], slots: [] });

    await run();

    expect(Student.updateOne).toHaveBeenCalledWith(
      { _id: studentId },
      { $inc: { __v: 1 }, $set: { lastUpdateAt: expect.any(Date) } },
      { session: SESSION }
    );
    expect(Student.updateOne.mock.invocationCallOrder[0]).toBeLessThan(Student.findById.mock.invocationCallOrder[0]);
  });

  it('refuses a student that does not exist, changing nothing', async () => {
    Student.updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(run()).rejects.toMatchObject({ status: 404, message: 'Advising student not found.' });

    expect(StudentSchedule.deleteMany).not.toHaveBeenCalled();
    expect(AdvisingScheduleDraft.updateMany).not.toHaveBeenCalled();
  });
});

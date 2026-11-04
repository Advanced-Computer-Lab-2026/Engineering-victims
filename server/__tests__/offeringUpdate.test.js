/**
 * FR 25: update a course offering and its slots.
 *
 * The controller is exercised directly with the model queries stubbed. The real
 * capacity validator runs, so the assertions are about the numbers it receives,
 * not a reimplementation of the rule.
 */
process.env.JWT_SECRET = 'offering-update-test-secret';

const mongoose = require('mongoose');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');
const StudentSchedule = require('../models/StudentSchedule');
const { checkSlotConflict } = require('../services/conflictService');
const controller = require('../controllers/offeringController');

jest.mock('../models/Course', () => ({ exists: jest.fn() }));
jest.mock('../models/AcademicTerm', () => ({ exists: jest.fn() }));
jest.mock('../models/CourseOffering', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../models/CourseSlot', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../models/StudentSchedule', () => ({
  exists: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../models/User', () => ({ countDocuments: jest.fn() }));
jest.mock('../services/conflictService', () => ({
  checkSlotConflict: jest.fn(),
  // Keep the real rule so a changed message or comparison is caught here.
  validateCapacity: jest.requireActual('../services/conflictService').validateCapacity,
}));

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

const call = async (handler, req) => {
  const res = mockRes();
  await handler(req, res);
  return res;
};

const objectId = () => new mongoose.Types.ObjectId();

/** The subset of a mongoose document the controller reads or spreads. */
const slotDoc = (overrides = {}) => {
  const doc = {
    _id: objectId(),
    offeringId: objectId(),
    instructorId: objectId(),
    slotType: 'Lecture',
    groupNumber: 1,
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '10:00',
    roomId: 'H1-01',
    maxCapacity: 60,
    // Deliberately stale: the schedule rows say otherwise.
    assignedCount: 49,
    ...overrides,
  };
  doc.toObject = () => ({ ...doc, toObject: undefined });
  return doc;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateSlot capacity validation', () => {
  test('uses the StudentSchedule count instead of the stored assignedCount', async () => {
    const slot = slotDoc({ assignedCount: 49 });
    CourseSlot.findById.mockResolvedValue(slot);
    StudentSchedule.countDocuments.mockResolvedValue(2);
    CourseSlot.findByIdAndUpdate.mockResolvedValue({ ...slot, maxCapacity: 40 });

    const res = await call(controller.updateSlot, {
      params: { id: String(slot._id) },
      body: { maxCapacity: 40 },
    });

    expect(StudentSchedule.countDocuments).toHaveBeenCalledWith({ slotId: slot._id });
    expect(CourseSlot.findByIdAndUpdate).toHaveBeenCalledWith(
      String(slot._id),
      { maxCapacity: 40 },
      { new: true, runValidators: true },
    );
    expect(res.statusCode).toBe(200);
  });

  test('rejects a capacity below the real assigned count', async () => {
    const slot = slotDoc({ assignedCount: 0 });
    CourseSlot.findById.mockResolvedValue(slot);
    StudentSchedule.countDocuments.mockResolvedValue(3);

    const res = await call(controller.updateSlot, {
      params: { id: String(slot._id) },
      body: { maxCapacity: 2 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('3 students are already assigned');
    expect(CourseSlot.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('updateSlot field whitelist', () => {
  test('ignores assignedCount, ids and timestamps echoed back by the client', async () => {
    const slot = slotDoc();
    CourseSlot.findById.mockResolvedValue(slot);
    CourseSlot.findByIdAndUpdate.mockResolvedValue({ ...slot, roomId: 'H1-02' });
    checkSlotConflict.mockResolvedValue(undefined);

    const res = await call(controller.updateSlot, {
      params: { id: String(slot._id) },
      body: {
        roomId: 'H1-02',
        assignedCount: 0,
        _id: objectId(),
        offeringId: objectId(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        __v: 0,
      },
    });

    expect(CourseSlot.findByIdAndUpdate).toHaveBeenCalledWith(
      String(slot._id),
      { roomId: 'H1-02' },
      { new: true, runValidators: true },
    );
    expect(res.statusCode).toBe(200);
  });

  test('rejects an update with no editable fields', async () => {
    const res = await call(controller.updateSlot, {
      params: { id: String(objectId()) },
      body: { assignedCount: 0, _id: objectId() },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('There are no slot changes to save.');
    expect(CourseSlot.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('updateSlot conflict check', () => {
  test('checks the merged slot and excludes the slot being edited', async () => {
    const slot = slotDoc();
    CourseSlot.findById.mockResolvedValue(slot);
    CourseSlot.findByIdAndUpdate.mockResolvedValue({ ...slot, dayOfWeek: 'Tuesday' });
    checkSlotConflict.mockResolvedValue(undefined);

    const res = await call(controller.updateSlot, {
      params: { id: String(slot._id) },
      body: { dayOfWeek: 'Tuesday' },
    });

    expect(checkSlotConflict).toHaveBeenCalledTimes(1);
    const [candidate, excluded] = checkSlotConflict.mock.calls[0];
    expect(excluded).toBe(String(slot._id));
    expect(candidate.dayOfWeek).toBe('Tuesday');
    expect(candidate.startTime).toBe(slot.startTime);
    expect(res.statusCode).toBe(200);
  });
});

describe('updateOffering field whitelist', () => {
  test('writes only offering fields, never the derived counter or document metadata', async () => {
    const courseId = objectId();
    const termId = objectId();
    const current = { _id: objectId(), publicationStatus: 'Draft' };
    Course.exists.mockResolvedValue({ _id: courseId });
    AcademicTerm.exists.mockResolvedValue({ _id: termId });
    CourseOffering.findById.mockResolvedValue(current);
    CourseOffering.findByIdAndUpdate.mockResolvedValue({ ...current, publicationStatus: 'Published' });

    const res = await call(controller.updateOffering, {
      params: { id: String(current._id) },
      body: {
        courseId: String(courseId),
        termId: String(termId),
        publicationStatus: 'Published',
        eligibleMajors: ['Computer Science'],
        eligibleSemesters: ['5'],
        assignedCount: 999,
        _id: objectId(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(CourseOffering.findByIdAndUpdate).toHaveBeenCalledWith(
      String(current._id),
      {
        courseId: String(courseId),
        termId: String(termId),
        publicationStatus: 'Published',
        eligibleMajors: ['Computer Science'],
        eligibleSemesters: ['5'],
      },
      { new: true, runValidators: true },
    );
    expect(res.statusCode).toBe(200);
  });
});

describe('unpublish guard', () => {
  test('refuses to unpublish while an active or processed schedule depends on the offering', async () => {
    const current = { _id: objectId(), publicationStatus: 'Published' };
    CourseOffering.findById.mockResolvedValue(current);
    CourseSlot.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([{ _id: objectId() }]),
    });
    StudentSchedule.exists.mockResolvedValue({ _id: objectId() });

    const res = await call(controller.updateOffering, {
      params: { id: String(current._id) },
      body: { publicationStatus: 'Draft' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Cannot unpublish offering');
    expect(CourseOffering.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

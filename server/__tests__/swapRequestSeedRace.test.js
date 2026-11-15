/**
 * The lazy SwapRequest seeder must be safe under concurrency.
 *
 * The swaps page fires /api/swaps/mine and /api/swaps/eligible-open together
 * (React StrictMode mounts the effect twice), and every one of those handlers
 * starts by awaiting ensureSeededSwapRequests(). On a cold database each
 * concurrent caller used to see countDocuments === 0 for the same student and
 * race to insert. The unique partial index on {requesterId, termId} for
 * status 'Open' then rejected the loser with E11000, which the handler reported
 * as a 500 — "Could not load your swap requests." — until the user refreshed.
 * Rows whose status is not 'Open' sit outside that partial index, so the same
 * race silently wrote duplicates.
 *
 * These tests pin both halves of the fix: concurrent callers share a single
 * run, and a lost insert race is treated as success instead of an error.
 */
process.env.JWT_SECRET = 'test_secret';

const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const AcademicTerm = require('../models/AcademicTerm');
const SwapRequest = require('../models/SwapRequest');
const { ensureSeededSwapRequests } = require('../controllers/swapRequestController');

const oid = () => new mongoose.Types.ObjectId();

/** Awaitable stand-in for a mongoose query resolving to `result`. */
const query = (result) => {
  const q = {
    sort: jest.fn(() => q),
    populate: jest.fn(() => q),
    select: jest.fn(() => q),
    lean: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

const STUDENT_ID = oid();
const TERM_ID = oid();

const swapStudent = {
  _id: STUDENT_ID,
  fullName: 'Mariam Fouad',
  email: 'mariam.fouad@student.guc.edu.eg',
  studentType: 'Normal Student',
  major: 'Computer Science',
  currentSemester: 5,
  studyGroup: 'G2',
  workflowStatus: 'Swap Request Open',
  lastUpdateAt: new Date(),
};

const slot = {
  _id: oid(),
  slotType: 'Lecture',
  groupNumber: 2,
  dayOfWeek: 'Monday',
  startTime: '09:00',
  endTime: '10:30',
  roomId: 'H1-01',
  offeringId: { courseId: { code: 'CSEN 301', name: 'Operating Systems', creditHours: 3 } },
  instructorId: { fullName: 'Ahmed Nabil' },
};

/** Wires every model the seeder touches to one student with no requests yet. */
const stubColdDatabase = ({ existingCount = 0, createImpl } = {}) => {
  const spies = {};
  spies.studentFind = jest.spyOn(Student, 'find').mockReturnValue(query([swapStudent]));
  spies.countDocuments = jest
    .spyOn(SwapRequest, 'countDocuments')
    .mockResolvedValue(existingCount);
  spies.create = jest
    .spyOn(SwapRequest, 'create')
    .mockImplementation(createImpl ?? jest.fn(async (doc) => ({ _id: oid(), ...doc })));
  spies.scheduleFindOne = jest
    .spyOn(StudentSchedule, 'findOne')
    .mockReturnValue(query({ termId: TERM_ID }));
  spies.scheduleFind = jest
    .spyOn(StudentSchedule, 'find')
    .mockReturnValue(query([{ slotId: slot }]));
  spies.termFindById = jest
    .spyOn(AcademicTerm, 'findById')
    .mockReturnValue(query({ _id: TERM_ID, academicYear: '2026/2027', season: 'Winter' }));
  spies.templateFind = jest
    .spyOn(ScheduleTemplate, 'find')
    .mockReturnValue(query([{ studyGroup: 'G1' }]));
  return spies;
};

const restore = (spies) => Object.values(spies).forEach((spy) => spy.mockRestore());

afterEach(() => jest.restoreAllMocks());

describe('ensureSeededSwapRequests concurrency', () => {
  test('concurrent callers share one run instead of racing to insert', async () => {
    const spies = stubColdDatabase();

    // Ten parallel handlers, exactly as the page's Promise.all + StrictMode
    // double-mount produces against a cold database.
    await Promise.all(Array.from({ length: 10 }, () => ensureSeededSwapRequests()));

    expect(spies.studentFind).toHaveBeenCalledTimes(1);
    expect(spies.create).toHaveBeenCalledTimes(1);
    expect(spies.countDocuments).toHaveBeenCalledTimes(1);
  });

  test('a lost insert race (E11000) is treated as success, not a 500', async () => {
    const dupKey = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    const spies = stubColdDatabase({ createImpl: jest.fn().mockRejectedValue(dupKey) });

    // Must not reject: the handler would surface it as
    // "Could not load your swap requests."
    await expect(ensureSeededSwapRequests()).resolves.toBeUndefined();
    expect(spies.create).toHaveBeenCalledTimes(1);

    // The failure is not cached — a later call still gets a full run.
    await ensureSeededSwapRequests();
    expect(spies.studentFind).toHaveBeenCalledTimes(2);
  });

  test('a genuine insert failure still propagates', async () => {
    const spies = stubColdDatabase({
      createImpl: jest.fn().mockRejectedValue(new Error('connection lost')),
    });

    await expect(ensureSeededSwapRequests()).rejects.toThrow('connection lost');
    // Not cached: the next caller retries rather than inheriting the failure.
    await expect(ensureSeededSwapRequests()).rejects.toThrow('connection lost');
    expect(spies.studentFind).toHaveBeenCalledTimes(2);
  });

  test('students that already have a request are left alone', async () => {
    const spies = stubColdDatabase({ existingCount: 2 });

    await ensureSeededSwapRequests();

    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.scheduleFindOne).not.toHaveBeenCalled();
  });
});

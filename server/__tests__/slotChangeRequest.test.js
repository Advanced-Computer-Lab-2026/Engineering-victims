/**
 * Req 40: an Advising Student requests a change to one assigned lecture,
 * tutorial or lab slot in their completed schedule.
 *
 * The real routes, auth middleware, controller, service and notification
 * service run on a bare Express app; only the model queries are stubbed, so no
 * MongoDB is needed. Deadlines are controlled through the stubbed term.
 */
process.env.JWT_SECRET = 'test_secret';

jest.mock('../services/notificationEventService', () => ({
  publishNotificationEvent: jest.fn().mockResolvedValue({}),
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const CourseSlot = require('../models/CourseSlot');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const Notification = require('../models/Notification');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const slotChangeRequestRoutes = require('../routes/slotChangeRequestRoutes');
const { publishNotificationEvent } = require('../services/notificationEventService');

const app = express();
app.use(express.json());
app.use('/api/slot-change-requests', slotChangeRequestRoutes);

const DAY_MS = 24 * 60 * 60 * 1000;
const oid = () => new mongoose.Types.ObjectId();

const tokenFor = (role, userId = oid()) => `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;

/** A chainable, awaitable stand-in for a mongoose query resolving to `result`. */
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

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Builds one consistent world: a student, their term, one course and one held slot. */
const makeWorld = ({ student: studentOverrides = {}, term: termOverrides = {} } = {}) => {
  const userId = oid();
  const advisorId = oid();
  const term = {
    _id: oid(),
    academicYear: '2026/2027',
    season: 'Winter',
    advisingDeadline: new Date(Date.now() + 10 * DAY_MS),
    termStartDate: new Date(Date.now() - 30 * DAY_MS),
    termEndDate: new Date(Date.now() + 60 * DAY_MS),
    ...termOverrides,
  };
  const student = {
    _id: oid(),
    fullName: 'Salma Ibrahim',
    email: 'salma.ibrahim@student.guc.edu.eg',
    studentId: '64-30010',
    studentType: 'Advising Student',
    workflowStatus: 'Ready for Student Review',
    assignedAdvisor: advisorId,
    save: jest.fn(),
    ...studentOverrides,
  };
  const course = { _id: oid(), code: 'CSEN 501', name: 'Databases I' };
  const offering = { _id: oid(), courseId: course._id, termId: term._id };
  const slot = {
    _id: oid(),
    offeringId: offering,
    slotType: 'Tutorial',
    groupNumber: 4,
    dayOfWeek: 'Tuesday',
    startTime: '10:00',
    endTime: '11:30',
    roomId: 'C7.201',
  };
  const entry = { _id: oid(), slotId: slot._id, termId: term._id };
  return { userId, advisorId, term, student, course, offering, slot, entry };
};

/**
 * Wires the model stubs to one world. `held` false makes the slot not part of
 * the student's schedule; `hasSchedule` false removes their Active rows.
 */
const stubWorld = (world, { held = true, hasSchedule = true, duplicate = false, pending = [] } = {}) => {
  const spies = {};
  spies.userFindById = jest
    .spyOn(User, 'findById')
    .mockReturnValue(query({ _id: world.userId, email: world.student.email }));
  spies.userFind = jest.spyOn(User, 'find').mockReturnValue(query([{ _id: oid() }, { _id: oid() }]));
  spies.studentFindOne = jest.spyOn(Student, 'findOne').mockReturnValue(query(world.student));
  spies.scheduleFindOne = jest.spyOn(StudentSchedule, 'findOne').mockImplementation((filter) => {
    if (filter.slotId) return query(held ? world.entry : null);
    return query(hasSchedule ? { termId: world.term._id } : null);
  });
  spies.termFindById = jest.spyOn(AcademicTerm, 'findById').mockReturnValue(query(world.term));
  spies.slotFindById = jest.spyOn(CourseSlot, 'findById').mockReturnValue(query(world.slot));
  spies.courseFindById = jest.spyOn(Course, 'findById').mockReturnValue(query(world.course));
  spies.exists = jest.spyOn(SlotChangeRequest, 'exists').mockResolvedValue(duplicate ? { _id: oid() } : null);
  spies.find = jest.spyOn(SlotChangeRequest, 'find').mockReturnValue(query(pending));
  spies.create = jest.spyOn(SlotChangeRequest, 'create').mockImplementation(async (doc) => ({
    _id: oid(),
    status: 'Pending',
    createdAt: new Date(),
    ...doc,
  }));
  spies.insertMany = jest.spyOn(Notification, 'insertMany').mockImplementation(async (docs) => docs);

  // Anything that would change a schedule or a seat count.
  spies.writes = [
    jest.spyOn(StudentSchedule, 'updateOne'),
    jest.spyOn(StudentSchedule, 'updateMany'),
    jest.spyOn(StudentSchedule, 'findOneAndUpdate'),
    jest.spyOn(StudentSchedule, 'deleteMany'),
    jest.spyOn(StudentSchedule, 'insertMany'),
    jest.spyOn(CourseSlot, 'updateOne'),
    jest.spyOn(CourseSlot, 'findByIdAndUpdate'),
    jest.spyOn(CourseSlot.prototype, 'save'),
    jest.spyOn(StudentSchedule.prototype, 'save'),
  ];
  return spies;
};

const validBody = (world, overrides = {}) => ({
  courseId: String(world.course._id),
  slotType: world.slot.slotType,
  slotId: String(world.slot._id),
  preferenceNote: 'Group 2 or any Sunday slot would work better.',
  ...overrides,
});

const submit = (world, body) =>
  request(app)
    .post('/api/slot-change-requests/me')
    .set('Authorization', tokenFor('Student', world.userId))
    .send(body);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/slot-change-requests/me (req 40)', () => {
  it('creates a Pending request that identifies the course, component and current slot', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);

    const res = await submit(world, validBody(world));

    expect(res.status).toBe(201);
    expect(spies.create).toHaveBeenCalledTimes(1);
    const saved = spies.create.mock.calls[0][0];
    expect(saved).toEqual({
      student: world.student._id,
      term: world.term._id,
      scheduleEntry: world.entry._id,
      course: world.course._id,
      offering: world.offering._id,
      slotType: 'Tutorial',
      currentSlot: world.slot._id,
      currentSlotSnapshot: { groupNumber: 4, dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '11:30', room: 'C7.201' },
      preferenceNote: 'Group 2 or any Sunday slot would work better.',
    });
    expect(res.body.request).toMatchObject({
      status: 'Pending',
      slotType: 'Tutorial',
      course: { code: 'CSEN 501', name: 'Databases I' },
      currentSlot: { id: String(world.slot._id), groupNumber: 4, dayOfWeek: 'Tuesday', room: 'C7.201' },
    });
  });

  it('only looks at the Active row of the schedule term for this student and slot', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);

    await submit(world, validBody(world));

    expect(spies.scheduleFindOne).toHaveBeenCalledWith({
      studentId: world.student._id,
      slotId: String(world.slot._id),
      termId: world.term._id,
      status: 'Active',
    });
  });

  it('never changes the schedule, the slot or the workflow status', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);

    const res = await submit(world, validBody(world));

    expect(res.status).toBe(201);
    spies.writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(world.student.save).not.toHaveBeenCalled();
    expect(world.student.workflowStatus).toBe('Ready for Student Review');
  });

  it('ignores extra body fields, such as an attempt to pick the replacement slot', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);

    const res = await submit(
      world,
      validBody(world, { replacementSlot: String(oid()), status: 'Approved', student: String(oid()) })
    );

    expect(res.status).toBe(201);
    const saved = spies.create.mock.calls[0][0];
    expect(saved).not.toHaveProperty('replacementSlot');
    expect(saved).not.toHaveProperty('status');
    expect(saved.student).toBe(world.student._id);
  });

  it('accepts a missing note and stores an empty one', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    const { preferenceNote, ...body } = validBody(world);

    const res = await submit(world, body);

    expect(res.status).toBe(201);
    expect(spies.create.mock.calls[0][0].preferenceNote).toBe('');
  });

  it('trims the note', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);

    await submit(world, validBody(world, { preferenceNote: '   prefer Sunday   ' }));

    expect(spies.create.mock.calls[0][0].preferenceNote).toBe('prefer Sunday');
  });

  it('notifies the student and their assigned Advisor', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);

    await submit(world, validBody(world));

    const recipients = spies.insertMany.mock.calls.map((call) => String(call[0][0].user));
    expect(recipients).toEqual([String(world.userId)]);
    expect(publishNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'slot_change.submitted',
      studentId: world.student._id,
      link: `/schedule/${world.student._id}`,
    }));
    expect(spies.userFind).not.toHaveBeenCalled();
  });

  it('notifies the Coordinators when the student has no Advisor', async () => {
    const world = makeWorld({ student: { assignedAdvisor: null } });
    const spies = stubWorld(world);

    const res = await submit(world, validBody(world));

    expect(res.status).toBe(201);
    expect(spies.userFind).toHaveBeenCalledWith({ role: 'Coordinator', isActive: true });
    expect(spies.insertMany).toHaveBeenCalledTimes(2);
    expect(spies.insertMany.mock.calls[1][0]).toHaveLength(2);
  });

  it('still succeeds when notifications fail', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    spies.insertMany.mockRejectedValue(new Error('notifications down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await submit(world, validBody(world));

    expect(res.status).toBe(201);
    expect(spies.create).toHaveBeenCalledTimes(1);
  });

  describe('workflow status', () => {
    it.each([
      'Not Started',
      'Draft',
      'Reopened',
      'Change Request Pending',
      'Pending Approval',
      'Awaiting Payment Choice',
      'Ready to Process',
      'Processed',
    ])('refuses a schedule whose status is %s', async (workflowStatus) => {
      const world = makeWorld({ student: { workflowStatus } });
      const spies = stubWorld(world);

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Ready for Student Review/);
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('refuses a student with no completed (Active) schedule', async () => {
      const world = makeWorld();
      const spies = stubWorld(world, { hasSchedule: false });

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(409);
      expect(spies.create).not.toHaveBeenCalled();
    });
  });

  describe('advising deadline', () => {
    it('refuses once the deadline of the schedule term has passed', async () => {
      const world = makeWorld({ term: { advisingDeadline: new Date(startOfToday().getTime() - DAY_MS) } });
      const spies = stubWorld(world);

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'The advising deadline for 2026/2027 Winter has passed, so slot-change requests can no longer be made.'
      );
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('stays open for the whole deadline day', async () => {
      const world = makeWorld({ term: { advisingDeadline: startOfToday() } });
      stubWorld(world);

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(201);
    });

    it("checks the term of the student's own schedule", async () => {
      const world = makeWorld();
      const spies = stubWorld(world);

      await submit(world, validBody(world));

      expect(spies.termFindById).toHaveBeenCalledWith(world.term._id);
    });
  });

  describe('identifying the slot', () => {
    it.each([
      ['a missing course', { courseId: undefined }],
      ['an invalid course id', { courseId: 'nope' }],
      ['a missing component type', { slotType: undefined }],
      ['an unknown component type', { slotType: 'Seminar' }],
      ['a missing slot', { slotId: undefined }],
      ['an invalid slot id', { slotId: '123' }],
      ['a note that is not text', { preferenceNote: { day: 'Sunday' } }],
      ['a note over 500 characters', { preferenceNote: 'x'.repeat(501) }],
    ])('answers %s with 400', async (_label, overrides) => {
      const world = makeWorld();
      const spies = stubWorld(world);

      const res = await submit(world, validBody(world, overrides));

      expect(res.status).toBe(400);
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('refuses a slot the student does not hold', async () => {
      const world = makeWorld();
      const spies = stubWorld(world, { held: false });

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('That slot is not part of your schedule under review.');
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('refuses a component type that does not match the slot', async () => {
      const world = makeWorld();
      const spies = stubWorld(world);

      const res = await submit(world, validBody(world, { slotType: 'Lab' }));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('That slot is a Tutorial, not a Lab.');
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('refuses a course that does not own the slot', async () => {
      const world = makeWorld();
      const spies = stubWorld(world);

      const res = await submit(world, validBody(world, { courseId: String(oid()) }));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('That slot does not belong to the selected course.');
      expect(spies.create).not.toHaveBeenCalled();
    });
  });

  describe('duplicates', () => {
    it('refuses a second pending request for the same slot', async () => {
      const world = makeWorld();
      const spies = stubWorld(world, { duplicate: true });

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(409);
      expect(spies.exists).toHaveBeenCalledWith({ student: world.student._id, currentSlot: world.slot._id, status: 'Pending' });
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('turns a simultaneous duplicate caught by the index into 409', async () => {
      const world = makeWorld();
      const spies = stubWorld(world);
      spies.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(409);
      expect(spies.insertMany).not.toHaveBeenCalled();
    });

    it('allows a request for another slot while an earlier one is pending', async () => {
      const world = makeWorld();
      // Pending requests exist for other slots; only this slot is checked.
      const spies = stubWorld(world, { pending: [{ currentSlot: oid() }] });

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(201);
      expect(world.student.workflowStatus).toBe('Ready for Student Review');
      expect(spies.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('access', () => {
    it('requires a session', async () => {
      const res = await request(app).post('/api/slot-change-requests/me').send({});
      expect(res.status).toBe(401);
    });

    it.each(['Advisor', 'Coordinator', 'Administrator'])('is closed to %s accounts', async (role) => {
      const findById = jest.spyOn(User, 'findById');

      const res = await request(app).post('/api/slot-change-requests/me').set('Authorization', tokenFor(role)).send({});

      expect(res.status).toBe(403);
      expect(findById).not.toHaveBeenCalled();
    });

    it('refuses a Normal Student', async () => {
      const world = makeWorld({ student: { studentType: 'Normal Student', workflowStatus: 'Schedule Assigned' } });
      const spies = stubWorld(world);

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(403);
      expect(spies.create).not.toHaveBeenCalled();
    });

    it('answers 404 when the account has no student record', async () => {
      const world = makeWorld();
      const spies = stubWorld(world);
      spies.studentFindOne.mockReturnValue(query(null));

      const res = await submit(world, validBody(world));

      expect(res.status).toBe(404);
    });

    it.each(['put', 'patch', 'delete'])('has no %s route on /me', async (method) => {
      const res = await request(app)[method]('/api/slot-change-requests/me').set('Authorization', tokenFor('Student'));
      expect(res.status).toBe(404);
    });
  });
});

describe('GET /api/slot-change-requests/me/eligibility (req 40)', () => {
  const check = (world) =>
    request(app).get('/api/slot-change-requests/me/eligibility').set('Authorization', tokenFor('Student', world.userId));

  it('is open while Ready for Student Review and before the deadline, listing pending slots', async () => {
    const world = makeWorld();
    const pendingSlot = oid();
    const spies = stubWorld(world, { pending: [{ currentSlot: pendingSlot }] });

    const res = await check(world);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      canRequest: true,
      reason: null,
      workflowStatus: 'Ready for Student Review',
      term: { id: String(world.term._id), label: '2026/2027 Winter' },
      pendingSlotIds: [String(pendingSlot)],
    });
    expect(spies.find).toHaveBeenCalledWith({ student: world.student._id, term: world.term._id, status: 'Pending' });
  });

  it('is closed after the deadline and says why', async () => {
    const world = makeWorld({ term: { advisingDeadline: new Date(Date.now() - 5 * DAY_MS) } });
    stubWorld(world);

    const res = await check(world);

    expect(res.status).toBe(200);
    expect(res.body.canRequest).toBe(false);
    expect(res.body.reason).toMatch(/advising deadline .* has passed/);
  });

  it('is closed when the schedule is not Ready for Student Review', async () => {
    const world = makeWorld({ student: { workflowStatus: 'Draft' } });
    stubWorld(world);

    const res = await check(world);

    expect(res.body.canRequest).toBe(false);
    expect(res.body.term).toBeNull();
    expect(res.body.pendingSlotIds).toEqual([]);
  });

  it('refuses a Normal Student', async () => {
    const world = makeWorld({ student: { studentType: 'Normal Student' } });
    stubWorld(world);

    const res = await check(world);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/slot-change-requests/me (req 41)', () => {
  const list = (world, path = '/api/slot-change-requests/me') =>
    request(app).get(path).set('Authorization', tokenFor('Student', world.userId));

  /** A stored request as the populated, lean query returns it. */
  const storedRequest = (world, overrides = {}) => ({
    _id: oid(),
    student: world.student._id,
    term: { _id: world.term._id, academicYear: world.term.academicYear, season: world.term.season },
    course: world.course,
    slotType: 'Tutorial',
    currentSlot: world.slot._id,
    currentSlotSnapshot: { groupNumber: 4, dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '11:30', room: 'C7.201' },
    preferenceNote: 'Group 2 please',
    status: 'Pending',
    replacementSlot: null,
    responseNote: '',
    respondedBy: null,
    respondedAt: null,
    withdrawnAt: null,
    createdAt: new Date('2026-11-10T09:00:00Z'),
    ...overrides,
  });

  it("lists only the caller's own requests, newest first", async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    const q = query([storedRequest(world)]);
    spies.find.mockReturnValue(q);

    const res = await list(world);

    expect(res.status).toBe(200);
    expect(spies.find).toHaveBeenCalledWith({ student: world.student._id });
    expect(q.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(res.body.requests).toHaveLength(1);
  });

  it('ignores any student id supplied in the query string', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    spies.find.mockReturnValue(query([]));

    const res = await list(world, `/api/slot-change-requests/me?student=${oid()}&studentId=64-99999`);

    expect(res.status).toBe(200);
    expect(spies.find).toHaveBeenCalledWith({ student: world.student._id });
  });

  it('returns an empty list when the student has no requests', async () => {
    const world = makeWorld({ student: { workflowStatus: 'Change Request Pending' } });
    const spies = stubWorld(world);
    spies.find.mockReturnValue(query([]));

    const res = await list(world);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requests: [] });
  });

  it('serializes a Pending request with its term, course, current slot and no response', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    const stored = storedRequest(world);
    spies.find.mockReturnValue(query([stored]));

    const res = await list(world);

    expect(res.body.requests[0]).toEqual({
      id: String(stored._id),
      status: 'Pending',
      course: { id: String(world.course._id), code: 'CSEN 501', name: 'Databases I' },
      term: { id: String(world.term._id), label: '2026/2027 Winter' },
      slotType: 'Tutorial',
      currentSlot: {
        id: String(world.slot._id),
        groupNumber: 4,
        dayOfWeek: 'Tuesday',
        startTime: '10:00',
        endTime: '11:30',
        room: 'C7.201',
      },
      preferenceNote: 'Group 2 please',
      submittedAt: '2026-11-10T09:00:00.000Z',
      withdrawnAt: null,
      response: null,
    });
  });

  it('includes the approved replacement slot and who approved it', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    const replacement = { _id: oid(), groupNumber: 2, dayOfWeek: 'Sunday', startTime: '08:30', endTime: '10:00', roomId: 'C6.101' };
    spies.find.mockReturnValue(
      query([
        storedRequest(world, {
          status: 'Approved',
          replacementSlot: replacement,
          responseNote: 'Moved you to group 2.',
          respondedBy: { _id: oid(), fullName: 'Mona Adel', role: 'Advisor' },
          respondedAt: new Date('2026-11-11T12:00:00Z'),
        }),
      ])
    );

    const res = await list(world);

    expect(res.body.requests[0].response).toEqual({
      note: 'Moved you to group 2.',
      respondedBy: { name: 'Mona Adel', role: 'Advisor' },
      respondedAt: '2026-11-11T12:00:00.000Z',
      replacementSlot: {
        id: String(replacement._id),
        groupNumber: 2,
        dayOfWeek: 'Sunday',
        startTime: '08:30',
        endTime: '10:00',
        room: 'C6.101',
      },
    });
  });

  it('shows a rejection with the Coordinator response and no replacement slot', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    spies.find.mockReturnValue(
      query([
        storedRequest(world, {
          status: 'Rejected',
          responseNote: 'No seats left in other groups.',
          respondedBy: { _id: oid(), fullName: 'Coordinator One', role: 'Coordinator' },
          respondedAt: new Date('2026-11-11T12:00:00Z'),
        }),
      ])
    );

    const res = await list(world);

    expect(res.body.requests[0].status).toBe('Rejected');
    expect(res.body.requests[0].response).toMatchObject({
      note: 'No seats left in other groups.',
      respondedBy: { name: 'Coordinator One', role: 'Coordinator' },
      replacementSlot: null,
    });
  });

  it('shows a withdrawn request with its withdrawal time and no response', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    spies.find.mockReturnValue(
      query([storedRequest(world, { status: 'Withdrawn', withdrawnAt: new Date('2026-11-12T08:00:00Z') })])
    );

    const res = await list(world);

    expect(res.body.requests[0]).toMatchObject({
      status: 'Withdrawn',
      withdrawnAt: '2026-11-12T08:00:00.000Z',
      response: null,
    });
  });

  it('copes with a deleted course, term, replacement slot or responder', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    spies.find.mockReturnValue(
      query([storedRequest(world, { status: 'Approved', course: null, term: null, replacementSlot: null, respondedBy: null })])
    );

    const res = await list(world);

    expect(res.status).toBe(200);
    expect(res.body.requests[0]).toMatchObject({
      course: null,
      term: null,
      response: { respondedBy: null, replacementSlot: null },
    });
  });

  it('never writes anything', async () => {
    const world = makeWorld();
    const spies = stubWorld(world);
    spies.find.mockReturnValue(query([storedRequest(world)]));

    await list(world);

    expect(spies.create).not.toHaveBeenCalled();
    spies.writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  describe('access', () => {
    it('requires a session', async () => {
      const res = await request(app).get('/api/slot-change-requests/me');
      expect(res.status).toBe(401);
    });

    it.each(['Advisor', 'Coordinator', 'Administrator'])('is closed to %s accounts', async (role) => {
      const find = jest.spyOn(SlotChangeRequest, 'find');

      const res = await request(app).get('/api/slot-change-requests/me').set('Authorization', tokenFor(role));

      expect(res.status).toBe(403);
      expect(find).not.toHaveBeenCalled();
    });

    it('refuses a Normal Student', async () => {
      const world = makeWorld({ student: { studentType: 'Normal Student' } });
      const spies = stubWorld(world);

      const res = await list(world);

      expect(res.status).toBe(403);
      expect(spies.find).not.toHaveBeenCalled();
    });

    it('answers 404 when the account has no student record', async () => {
      const world = makeWorld();
      const spies = stubWorld(world);
      spies.studentFindOne.mockReturnValue(query(null));

      const res = await list(world);

      expect(res.status).toBe(404);
      expect(spies.find).not.toHaveBeenCalled();
    });

    it('has no route that takes a request or student id', async () => {
      const world = makeWorld();
      stubWorld(world);

      const res = await list(world, `/api/slot-change-requests/${oid()}`);

      expect(res.status).toBe(404);
    });
  });
});

describe('PATCH /api/slot-change-requests/me/:id/withdraw (req 42)', () => {
  const withdraw = (world, id, body = {}) =>
    request(app)
      .patch(`/api/slot-change-requests/me/${id}/withdraw`)
      .set('Authorization', tokenFor('Student', world.userId))
      .send(body);

  /** The request as the atomic update returns it once withdrawn (populated, lean). */
  const withdrawnDoc = (world, overrides = {}) => ({
    _id: oid(),
    student: world.student._id,
    term: { _id: world.term._id, academicYear: world.term.academicYear, season: world.term.season },
    course: world.course,
    slotType: 'Tutorial',
    currentSlot: world.slot._id,
    currentSlotSnapshot: { groupNumber: 4, dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '11:30', room: 'C7.201' },
    preferenceNote: 'Group 2 please',
    status: 'Withdrawn',
    replacementSlot: null,
    responseNote: '',
    respondedBy: null,
    respondedAt: null,
    withdrawnAt: new Date('2026-11-13T10:00:00Z'),
    createdAt: new Date('2026-11-10T09:00:00Z'),
    ...overrides,
  });

  /**
   * Stubs the atomic update and the follow-up lookup. `updated` is what the
   * conditional update returns (null when nothing matched); `existing` is the
   * caller's own request when it exists but is no longer Pending.
   */
  const stubWithdraw = (world, { updated, existing = null } = {}) => {
    const spies = stubWorld(world);
    const updateQuery = query(updated === undefined ? withdrawnDoc(world) : updated);
    spies.update = jest.spyOn(SlotChangeRequest, 'findOneAndUpdate').mockReturnValue(updateQuery);
    spies.updateQuery = updateQuery;
    spies.findOne = jest.spyOn(SlotChangeRequest, 'findOne').mockReturnValue(query(existing));
    spies.requestWrites = [
      jest.spyOn(SlotChangeRequest, 'updateOne'),
      jest.spyOn(SlotChangeRequest, 'updateMany'),
      jest.spyOn(SlotChangeRequest, 'findByIdAndUpdate'),
      jest.spyOn(SlotChangeRequest.prototype, 'save'),
    ];
    spies.studentWrites = [
      jest.spyOn(Student, 'updateOne'),
      jest.spyOn(Student, 'findByIdAndUpdate'),
      jest.spyOn(Student, 'findOneAndUpdate'),
      jest.spyOn(Student.prototype, 'save'),
    ];
    return spies;
  };

  beforeEach(() => {
    publishNotificationEvent.mockReset();
    publishNotificationEvent.mockResolvedValue({});
  });

  it('withdraws a Pending request and returns it in the list format', async () => {
    const world = makeWorld();
    const doc = withdrawnDoc(world);
    stubWithdraw(world, { updated: doc });

    const res = await withdraw(world, doc._id);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/withdrawn/);
    expect(res.body.request).toMatchObject({
      id: String(doc._id),
      status: 'Withdrawn',
      withdrawnAt: '2026-11-13T10:00:00.000Z',
      course: { code: 'CSEN 501' },
      term: { label: '2026/2027 Winter' },
      response: null,
    });
  });

  describe('atomic update', () => {
    it('filters by request id, the token student and Pending status in a single update', async () => {
      const world = makeWorld();
      const spies = stubWithdraw(world);
      const id = oid();
      const before = Date.now();

      await withdraw(world, id);

      expect(spies.update).toHaveBeenCalledTimes(1);
      const [filter, update, options] = spies.update.mock.calls[0];
      expect(filter).toEqual({ _id: String(id), student: world.student._id, status: 'Pending' });
      expect(Object.keys(update)).toEqual(['$set']);
      expect(Object.keys(update.$set).sort()).toEqual(['status', 'withdrawnAt']);
      expect(update.$set.status).toBe('Withdrawn');
      expect(update.$set.withdrawnAt).toBeInstanceOf(Date);
      expect(update.$set.withdrawnAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(options).toEqual({ new: true });
    });

    it('never reads then saves the request', async () => {
      const world = makeWorld();
      const spies = stubWithdraw(world);

      await withdraw(world, oid());

      spies.requestWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
      expect(spies.findOne).not.toHaveBeenCalled();
    });

    it('answers 409 when a decision lands between the request and the update (race)', async () => {
      const world = makeWorld();
      // The conditional update matched nothing because the request was approved meanwhile.
      const spies = stubWithdraw(world, { updated: null, existing: { status: 'Approved' } });
      const id = oid();

      const res = await withdraw(world, id);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already Approved/);
      expect(spies.findOne).toHaveBeenCalledWith({ _id: String(id), student: world.student._id });
      expect(publishNotificationEvent).not.toHaveBeenCalled();
    });
  });

  describe('only a Pending request can be withdrawn', () => {
    it.each(['Approved', 'Rejected', 'Withdrawn'])('refuses a %s request with 409', async (status) => {
      const world = makeWorld();
      stubWithdraw(world, { updated: null, existing: { status } });

      const res = await withdraw(world, oid());

      expect(res.status).toBe(409);
      expect(res.body.message).toContain(`already ${status}`);
      expect(publishNotificationEvent).not.toHaveBeenCalled();
    });

    it('refuses a second withdrawal of the same request', async () => {
      const world = makeWorld();
      const doc = withdrawnDoc(world);
      const spies = stubWithdraw(world, { updated: doc });

      const first = await withdraw(world, doc._id);
      spies.update.mockReturnValue(query(null));
      spies.findOne.mockReturnValue(query({ status: 'Withdrawn' }));
      const second = await withdraw(world, doc._id);

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      expect(publishNotificationEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('ownership', () => {
    it("answers 404 for another student's request without revealing it", async () => {
      const world = makeWorld();
      // The request exists but belongs to someone else, so neither query matches the caller.
      const spies = stubWithdraw(world, { updated: null, existing: null });

      const res = await withdraw(world, oid());

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Slot-change request not found.');
      expect(spies.update.mock.calls[0][0].student).toBe(world.student._id);
      expect(spies.findOne.mock.calls[0][0].student).toBe(world.student._id);
    });

    it('answers 404 for an unknown id', async () => {
      const world = makeWorld();
      stubWithdraw(world, { updated: null, existing: null });

      const res = await withdraw(world, oid());

      expect(res.status).toBe(404);
    });

    it('answers 400 for an invalid id without querying', async () => {
      const world = makeWorld();
      const spies = stubWithdraw(world);

      const res = await withdraw(world, 'not-an-id');

      expect(res.status).toBe(400);
      expect(spies.update).not.toHaveBeenCalled();
    });

    it('ignores body fields that try to pick the status, time, owner or response', async () => {
      const world = makeWorld();
      const spies = stubWithdraw(world);

      const res = await withdraw(world, oid(), {
        status: 'Approved',
        withdrawnAt: '2000-01-01T00:00:00Z',
        student: String(oid()),
        responseNote: 'self-approved',
        replacementSlot: String(oid()),
        respondedBy: String(oid()),
      });

      expect(res.status).toBe(200);
      const [filter, update] = spies.update.mock.calls[0];
      expect(filter.student).toBe(world.student._id);
      expect(update.$set.status).toBe('Withdrawn');
      expect(update.$set.withdrawnAt.getFullYear()).not.toBe(2000);
      expect(Object.keys(update.$set).sort()).toEqual(['status', 'withdrawnAt']);
    });
  });

  describe('side effects', () => {
    it('never touches the schedule, seat counts or workflow status', async () => {
      const world = makeWorld();
      const spies = stubWithdraw(world);

      await withdraw(world, oid());

      spies.writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
      spies.studentWrites.forEach((spy) => expect(spy).not.toHaveBeenCalled());
      expect(world.student.save).not.toHaveBeenCalled();
      expect(world.student.workflowStatus).toBe('Ready for Student Review');
    });

    it('notifies the assigned Advisor through slot_change.withdrawn', async () => {
      const world = makeWorld();
      const doc = withdrawnDoc(world);
      const spies = stubWithdraw(world, { updated: doc });

      await withdraw(world, doc._id);

      expect(publishNotificationEvent).toHaveBeenCalledTimes(1);
      expect(publishNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
        name: 'slot_change.withdrawn',
        entityId: doc._id,
        occurrence: 'withdrawn',
        studentId: world.student._id,
        link: `/schedule/${world.student._id}`,
      }));
      expect(publishNotificationEvent.mock.calls[0][0].message).toContain('CSEN 501 Tutorial group 4');
      // No direct or Coordinator notifications.
      expect(spies.insertMany).not.toHaveBeenCalled();
      expect(spies.userFind).not.toHaveBeenCalled();
    });

    it('notifies nobody when the student has no Advisor', async () => {
      const world = makeWorld({ student: { assignedAdvisor: null } });
      const spies = stubWithdraw(world);

      const res = await withdraw(world, oid());

      expect(res.status).toBe(200);
      expect(publishNotificationEvent).not.toHaveBeenCalled();
      expect(spies.insertMany).not.toHaveBeenCalled();
      expect(spies.userFind).not.toHaveBeenCalled();
    });

    it('still withdraws when the notification fails', async () => {
      const world = makeWorld();
      const spies = stubWithdraw(world);
      publishNotificationEvent.mockRejectedValue(new Error('notifications down'));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await withdraw(world, oid());

      expect(res.status).toBe(200);
      expect(res.body.request.status).toBe('Withdrawn');
      expect(spies.update).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();
    });
  });

  describe('access', () => {
    it('requires a session', async () => {
      const res = await request(app).patch(`/api/slot-change-requests/me/${oid()}/withdraw`);
      expect(res.status).toBe(401);
    });

    it.each(['Advisor', 'Coordinator', 'Administrator'])('is closed to %s accounts', async (role) => {
      const update = jest.spyOn(SlotChangeRequest, 'findOneAndUpdate');

      const res = await request(app)
        .patch(`/api/slot-change-requests/me/${oid()}/withdraw`)
        .set('Authorization', tokenFor(role));

      expect(res.status).toBe(403);
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a Normal Student', async () => {
      const world = makeWorld({ student: { studentType: 'Normal Student' } });
      const spies = stubWithdraw(world);

      const res = await withdraw(world, oid());

      expect(res.status).toBe(403);
      expect(spies.update).not.toHaveBeenCalled();
    });

    it('answers 404 when the account has no student record', async () => {
      const world = makeWorld();
      const spies = stubWithdraw(world);
      spies.studentFindOne.mockReturnValue(query(null));

      const res = await withdraw(world, oid());

      expect(res.status).toBe(404);
      expect(spies.update).not.toHaveBeenCalled();
    });

    it.each(['get', 'post', 'put', 'delete'])('has no %s route for withdrawal', async (method) => {
      const res = await request(app)
        [method](`/api/slot-change-requests/me/${oid()}/withdraw`)
        .set('Authorization', tokenFor('Student'));
      expect(res.status).toBe(404);
    });
  });
});

describe('GET /api/slot-change-requests (req 43)', () => {
  const listAs = (role, userId = oid(), path = '/api/slot-change-requests') =>
    request(app).get(path).set('Authorization', tokenFor(role, userId));

  const advisor = { _id: oid(), fullName: 'Mona Adel' };
  const course = { _id: oid(), code: 'CSEN 501', name: 'Databases I' };
  const term = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };

  /** A stored request as the populated, lean query returns it. */
  const stored = (overrides = {}) => ({
    _id: oid(),
    student: { _id: oid(), fullName: 'Salma Ibrahim', studentId: '64-30010', assignedAdvisor: advisor },
    term,
    course,
    slotType: 'Lab',
    currentSlot: oid(),
    currentSlotSnapshot: { groupNumber: 3, dayOfWeek: 'Monday', startTime: '12:00', endTime: '13:30', room: 'C3.110' },
    preferenceNote: 'Any Wednesday group',
    status: 'Pending',
    replacementSlot: null,
    responseNote: '',
    respondedBy: null,
    respondedAt: null,
    withdrawnAt: null,
    createdAt: new Date('2026-11-12T09:00:00Z'),
    ...overrides,
  });

  /**
   * `assigned` is what the Advisor-roster lookup returns; `requests` is what
   * the request query returns. Every write path is spied so tests can prove
   * the list never changes anything.
   */
  const stubStaff = ({ assigned = [], requests = [] } = {}) => {
    const spies = {};
    spies.studentFind = jest.spyOn(Student, 'find').mockReturnValue(query(assigned));
    spies.requestQuery = query(requests);
    spies.find = jest.spyOn(SlotChangeRequest, 'find').mockReturnValue(spies.requestQuery);
    spies.userFindById = jest.spyOn(User, 'findById');
    spies.studentFindOne = jest.spyOn(Student, 'findOne');
    spies.writes = [
      jest.spyOn(SlotChangeRequest, 'create'),
      jest.spyOn(SlotChangeRequest, 'updateOne'),
      jest.spyOn(SlotChangeRequest, 'updateMany'),
      jest.spyOn(SlotChangeRequest, 'findOneAndUpdate'),
      jest.spyOn(SlotChangeRequest, 'findByIdAndUpdate'),
      jest.spyOn(SlotChangeRequest, 'deleteMany'),
      jest.spyOn(SlotChangeRequest.prototype, 'save'),
      jest.spyOn(Student, 'updateOne'),
      jest.spyOn(Student, 'findByIdAndUpdate'),
      jest.spyOn(StudentSchedule, 'updateOne'),
      jest.spyOn(CourseSlot, 'updateOne'),
    ];
    return spies;
  };

  describe('Advisor scope', () => {
    it('lists only requests from Advising Students currently assigned to the signed-in Advisor', async () => {
      const advisorId = oid();
      const mine = [{ _id: oid() }, { _id: oid() }];
      const spies = stubStaff({ assigned: mine, requests: [stored()] });

      const res = await listAs('Advisor', advisorId);

      expect(res.status).toBe(200);
      expect(res.body.scope).toBe('assigned');
      expect(spies.studentFind).toHaveBeenCalledWith({
        assignedAdvisor: String(advisorId),
        studentType: 'Advising Student',
      });
      expect(spies.find).toHaveBeenCalledWith({ student: { $in: mine.map((s) => s._id) } });
      expect(res.body.requests).toHaveLength(1);
    });

    it.each([
      ['advisor', () => String(oid())],
      ['assignedAdvisor', () => String(oid())],
      ['student', () => String(oid())],
      ['studentId', () => '64-99999'],
      ['scope', () => 'all'],
      ['role', () => 'Coordinator'],
    ])('ignores a ?%s= query parameter that tries to widen the scope', async (param, value) => {
      const advisorId = oid();
      const mine = [{ _id: oid() }];
      const spies = stubStaff({ assigned: mine });

      const res = await listAs('Advisor', advisorId, `/api/slot-change-requests?${param}=${encodeURIComponent(value())}`);

      expect(res.status).toBe(200);
      expect(res.body.scope).toBe('assigned');
      expect(spies.studentFind).toHaveBeenCalledWith({
        assignedAdvisor: String(advisorId),
        studentType: 'Advising Student',
      });
      expect(spies.find).toHaveBeenCalledWith({ student: { $in: [mine[0]._id] } });
    });

    it('returns an empty list without querying requests when nobody is assigned', async () => {
      const spies = stubStaff({ assigned: [] });

      const res = await listAs('Advisor');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scope: 'assigned', requests: [] });
      expect(spies.find).not.toHaveBeenCalled();
    });

    it('never resolves a student record from the token', async () => {
      const spies = stubStaff({ assigned: [{ _id: oid() }] });

      await listAs('Advisor');

      expect(spies.userFindById).not.toHaveBeenCalled();
      expect(spies.studentFindOne).not.toHaveBeenCalled();
    });
  });

  describe('Coordinator scope', () => {
    it('lists every request without an Advisor lookup', async () => {
      const spies = stubStaff({ requests: [stored(), stored()] });

      const res = await listAs('Coordinator');

      expect(res.status).toBe(200);
      expect(res.body.scope).toBe('all');
      expect(spies.find).toHaveBeenCalledWith({});
      expect(spies.studentFind).not.toHaveBeenCalled();
      expect(res.body.requests).toHaveLength(2);
    });

    it.each(['advisor', 'student'])('is not narrowed or changed by ?%s=', async (param) => {
      const spies = stubStaff();

      await listAs('Coordinator', oid(), `/api/slot-change-requests?${param}=${oid()}`);

      expect(spies.find).toHaveBeenCalledWith({});
    });
  });

  describe('listing', () => {
    it('sorts newest first', async () => {
      const spies = stubStaff();

      await listAs('Coordinator');

      expect(spies.requestQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    });

    it('loads the student and their current Advisor with the request details', async () => {
      const spies = stubStaff();

      await listAs('Coordinator');

      const paths = spies.requestQuery.populate.mock.calls.map(([arg]) => (typeof arg === 'string' ? arg : arg.path));
      expect(paths).toEqual(expect.arrayContaining(['student', 'course', 'term', 'replacementSlot', 'respondedBy']));
      const studentPopulate = spies.requestQuery.populate.mock.calls.find(([arg]) => arg.path === 'student')[0];
      expect(studentPopulate.populate).toEqual({ path: 'assignedAdvisor', select: 'fullName' });
      expect(spies.requestQuery.lean).toHaveBeenCalled();
    });

    it.each(['Pending', 'Approved', 'Rejected', 'Withdrawn'])('includes %s requests', async (status) => {
      stubStaff({ requests: [stored({ status })] });

      const res = await listAs('Coordinator');

      expect(res.body.requests[0].status).toBe(status);
    });

    it('serializes the student, current Advisor, course, slot and request details', async () => {
      const doc = stored();
      stubStaff({ requests: [doc] });

      const res = await listAs('Coordinator');

      expect(res.body.requests[0]).toEqual({
        id: String(doc._id),
        status: 'Pending',
        student: { id: String(doc.student._id), studentId: '64-30010', fullName: 'Salma Ibrahim' },
        advisor: { id: String(advisor._id), fullName: 'Mona Adel' },
        course: { id: String(course._id), code: 'CSEN 501', name: 'Databases I' },
        term: { id: String(term._id), label: '2026/2027 Winter' },
        slotType: 'Lab',
        currentSlot: {
          id: String(doc.currentSlot),
          groupNumber: 3,
          dayOfWeek: 'Monday',
          startTime: '12:00',
          endTime: '13:30',
          room: 'C3.110',
        },
        preferenceNote: 'Any Wednesday group',
        submittedAt: '2026-11-12T09:00:00.000Z',
        withdrawnAt: null,
        response: null,
      });
    });

    it('includes the decision and approved replacement slot', async () => {
      const replacement = { _id: oid(), groupNumber: 1, dayOfWeek: 'Sunday', startTime: '08:30', endTime: '10:00', roomId: 'C6.101' };
      stubStaff({
        requests: [
          stored({
            status: 'Approved',
            replacementSlot: replacement,
            responseNote: 'Moved to group 1.',
            respondedBy: { _id: oid(), fullName: 'Coordinator One', role: 'Coordinator' },
            respondedAt: new Date('2026-11-12T12:00:00Z'),
          }),
        ],
      });

      const res = await listAs('Coordinator');

      expect(res.body.requests[0].response).toMatchObject({
        note: 'Moved to group 1.',
        respondedBy: { name: 'Coordinator One', role: 'Coordinator' },
        replacementSlot: { id: String(replacement._id), groupNumber: 1, room: 'C6.101' },
      });
    });

    it('shows advisor null for a student with no Advisor', async () => {
      const doc = stored();
      doc.student.assignedAdvisor = null;
      stubStaff({ requests: [doc] });

      const res = await listAs('Coordinator');

      expect(res.body.requests[0].advisor).toBeNull();
      expect(res.body.requests[0].student).not.toBeNull();
    });

    it('keeps a request whose student record was deleted visible to Coordinators', async () => {
      stubStaff({ requests: [stored({ student: null })] });

      const res = await listAs('Coordinator');

      expect(res.status).toBe(200);
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0]).toMatchObject({ student: null, advisor: null, status: 'Pending' });
    });

    it('copes with a deleted course, term, replacement slot or responder', async () => {
      stubStaff({
        requests: [stored({ status: 'Approved', course: null, term: null, replacementSlot: null, respondedBy: null })],
      });

      const res = await listAs('Coordinator');

      expect(res.status).toBe(200);
      expect(res.body.requests[0]).toMatchObject({
        course: null,
        term: null,
        response: { respondedBy: null, replacementSlot: null },
      });
    });

    it('never writes anything', async () => {
      const spies = stubStaff({ assigned: [{ _id: oid() }], requests: [stored()] });

      await listAs('Advisor');
      await listAs('Coordinator');

      spies.writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    });

    it('answers 500 with a message when the query fails', async () => {
      const spies = stubStaff();
      spies.find.mockImplementation(() => {
        throw new Error('db down');
      });

      const res = await listAs('Coordinator');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Could not load slot-change requests');
    });
  });

  describe('access', () => {
    it('requires a session', async () => {
      const res = await request(app).get('/api/slot-change-requests');
      expect(res.status).toBe(401);
    });

    it.each(['Student', 'Administrator'])('refuses %s accounts before any query', async (role) => {
      const spies = stubStaff();

      const res = await listAs(role);

      expect(res.status).toBe(403);
      expect(spies.find).not.toHaveBeenCalled();
      expect(spies.studentFind).not.toHaveBeenCalled();
    });
  });

  describe('staffRequestScope', () => {
    const { staffRequestScope } = require('../services/slotChangeRequestService');

    it('gives a Coordinator every request', async () => {
      await expect(staffRequestScope({ role: 'Coordinator', userId: String(oid()) })).resolves.toEqual({
        scope: 'all',
        filter: {},
      });
    });

    it.each(['Student', 'Administrator', undefined])('gives %s no scope', async (role) => {
      await expect(staffRequestScope({ role, userId: String(oid()) })).resolves.toBeNull();
    });

    it('gives an Advisor with an invalid id nothing, without querying', async () => {
      const find = jest.spyOn(Student, 'find');
      await expect(staffRequestScope({ role: 'Advisor', userId: 'nope' })).resolves.toEqual({
        scope: 'assigned',
        filter: null,
      });
      expect(find).not.toHaveBeenCalled();
    });
  });
});

describe('GET /api/slot-change-requests?search= (req 44)', () => {
  const {
    parseStaffSearch,
    courseCodePattern,
    buildStaffRequestFilter,
    SEARCH_LIMIT,
  } = require('../services/slotChangeRequestService');

  const listAs = (role, userId = oid(), search, extra = '') => {
    const params = search === undefined ? '' : `search=${encodeURIComponent(search)}`;
    const qs = [params, extra].filter(Boolean).join('&');
    return request(app)
      .get(`/api/slot-change-requests${qs ? `?${qs}` : ''}`)
      .set('Authorization', tokenFor(role, userId));
  };

  const stored = (overrides = {}) => ({
    _id: oid(),
    student: { _id: oid(), fullName: 'Salma Ibrahim', studentId: '64-30010', assignedAdvisor: null },
    term: { _id: oid(), academicYear: '2026/2027', season: 'Winter' },
    course: { _id: oid(), code: 'CSEN 501', name: 'Databases I' },
    slotType: 'Lab',
    currentSlot: oid(),
    currentSlotSnapshot: { groupNumber: 3, dayOfWeek: 'Monday', startTime: '12:00', endTime: '13:30', room: 'C3.110' },
    preferenceNote: '',
    status: 'Pending',
    replacementSlot: null,
    responseNote: '',
    respondedBy: null,
    respondedAt: null,
    withdrawnAt: null,
    createdAt: new Date('2026-11-12T09:00:00Z'),
    ...overrides,
  });

  /**
   * `roster` answers the Advisor-scope lookup (a filter on assignedAdvisor);
   * `students` answers the search lookup; `courses` answers the course-code
   * lookup; `requests` answers the request query. Writes are spied so every
   * test can prove the search changes nothing.
   */
  const stubSearch = ({ roster = [], students = [], courses = [], requests = [] } = {}) => {
    const spies = {};
    spies.studentFind = jest
      .spyOn(Student, 'find')
      .mockImplementation((filter) => query('assignedAdvisor' in filter ? roster : students));
    spies.courseFind = jest.spyOn(Course, 'find').mockReturnValue(query(courses));
    spies.requestQuery = query(requests);
    spies.find = jest.spyOn(SlotChangeRequest, 'find').mockReturnValue(spies.requestQuery);
    spies.writes = [
      jest.spyOn(SlotChangeRequest, 'create'),
      jest.spyOn(SlotChangeRequest, 'updateOne'),
      jest.spyOn(SlotChangeRequest, 'updateMany'),
      jest.spyOn(SlotChangeRequest, 'findOneAndUpdate'),
      jest.spyOn(SlotChangeRequest, 'findByIdAndUpdate'),
      jest.spyOn(SlotChangeRequest, 'deleteMany'),
      jest.spyOn(SlotChangeRequest.prototype, 'save'),
      jest.spyOn(Student, 'updateOne'),
      jest.spyOn(Student, 'findByIdAndUpdate'),
      jest.spyOn(Course, 'updateOne'),
      jest.spyOn(StudentSchedule, 'updateOne'),
      jest.spyOn(CourseSlot, 'updateOne'),
      jest.spyOn(Notification, 'create'),
    ];
    return spies;
  };

  /** The filter the student-search lookup ran with (not the roster lookup). */
  const studentSearchFilter = (spies) =>
    spies.studentFind.mock.calls.map(([filter]) => filter).find((filter) => !('assignedAdvisor' in filter));
  const courseSearchFilter = (spies) => spies.courseFind.mock.calls[0][0];
  const asRegExp = ({ $regex, $options }) => new RegExp($regex, $options);
  const nameRegex = (spies) =>
    asRegExp(studentSearchFilter(spies).$or.find((clause) => clause.fullName).fullName);
  const idVariants = (spies) => studentSearchFilter(spies).$or.find((clause) => clause.studentId).studentId.$in;
  const codeRegex = (spies) => asRegExp(courseSearchFilter(spies).code);

  describe('student name', () => {
    it.each(['Salma', 'salma ibr', 'IBRAHIM', 'lma Ib'])('matches "%s" partially and case-insensitively', async (term) => {
      const spies = stubSearch({ students: [{ _id: oid() }] });

      const res = await listAs('Coordinator', oid(), term);

      expect(res.status).toBe(200);
      expect(nameRegex(spies).test('Salma Ibrahim')).toBe(true);
    });

    it('does not match a different name', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), 'Omar');

      expect(nameRegex(spies).test('Salma Ibrahim')).toBe(false);
    });
  });

  describe('student ID', () => {
    it('matches the hyphenated ID exactly', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), '64-30010');

      expect(idVariants(spies)).toEqual(['64-30010']);
    });

    it('accepts the ID without the hyphen', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), '6430010');

      expect(idVariants(spies)).toEqual(['6430010', '64-30010']);
    });

    it('is exact, not partial: a fragment is not turned into a pattern', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), '64-300');

      expect(idVariants(spies)).toEqual(['64-300']);
      const idClause = studentSearchFilter(spies).$or.find((clause) => clause.studentId);
      expect(idClause.studentId.$regex).toBeUndefined();
    });

    it('trims surrounding whitespace before matching', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), '  64-30010  ');

      expect(idVariants(spies)).toEqual(['64-30010']);
    });
  });

  describe('course code', () => {
    it.each(['CSEN 501', 'csen501', 'csen 501', 'SEN5', '501', 'c s e n 5 0 1'])(
      'matches "%s" against CSEN 501 (partial, case-insensitive, spaces ignored)',
      async (term) => {
        const spies = stubSearch({ courses: [{ _id: oid() }] });

        await listAs('Coordinator', oid(), term);

        expect(codeRegex(spies).test('CSEN 501')).toBe(true);
      }
    );

    it('does not match a different code', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), 'CSEN502');

      expect(codeRegex(spies).test('CSEN 501')).toBe(false);
    });

    it('searches the course code only, never the course name', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), 'Databases');

      expect(Object.keys(courseSearchFilter(spies))).toEqual(['code']);
      expect(spies.courseFind.mock.calls[0][0].name).toBeUndefined();
    });
  });

  describe('combining with the access scope', () => {
    it('gives a Coordinator every request matching a student or a course', async () => {
      const student = { _id: oid() };
      const course = { _id: oid() };
      const spies = stubSearch({ students: [student], courses: [course], requests: [stored()] });

      const res = await listAs('Coordinator', oid(), 'CSEN');

      expect(res.status).toBe(200);
      expect(res.body.scope).toBe('all');
      expect(spies.find).toHaveBeenCalledWith({
        $and: [{}, { $or: [{ student: { $in: [student._id] } }, { course: { $in: [course._id] } }] }],
      });
      expect(res.body.requests).toHaveLength(1);
    });

    it('only adds the clauses that matched something', async () => {
      const student = { _id: oid() };
      const spies = stubSearch({ students: [student] });

      await listAs('Coordinator', oid(), 'Salma');

      expect(spies.find).toHaveBeenCalledWith({ $and: [{}, { $or: [{ student: { $in: [student._id] } }] }] });
    });

    it('keeps the Advisor roster as the first $and clause, untouched', async () => {
      const advisorId = oid();
      const roster = [{ _id: oid() }, { _id: oid() }];
      const outsider = { _id: oid() };
      const spies = stubSearch({ roster, students: [roster[0], outsider] });

      const res = await listAs('Advisor', advisorId, 'Salma');

      expect(res.status).toBe(200);
      expect(res.body.scope).toBe('assigned');
      expect(spies.studentFind).toHaveBeenCalledWith({
        assignedAdvisor: String(advisorId),
        studentType: 'Advising Student',
      });
      const [filter] = spies.find.mock.calls[0];
      expect(Object.keys(filter)).toEqual(['$and']);
      expect(filter.$and[0]).toEqual({ student: { $in: roster.map((s) => s._id) } });
      // An outside student matched by name only narrows further; the roster
      // clause above still has to hold, so their requests cannot be returned.
      expect(filter.$and[1]).toEqual({ $or: [{ student: { $in: [roster[0]._id, outsider._id] } }] });
    });

    it('keeps the Advisor roster when searching by course code', async () => {
      const roster = [{ _id: oid() }];
      const course = { _id: oid() };
      const spies = stubSearch({ roster, courses: [course] });

      await listAs('Advisor', oid(), 'CSEN 501');

      expect(spies.find).toHaveBeenCalledWith({
        $and: [{ student: { $in: [roster[0]._id] } }, { $or: [{ course: { $in: [course._id] } }] }],
      });
    });

    it.each([
      ['advisor', () => String(oid())],
      ['student', () => String(oid())],
      ['scope', () => 'all'],
      ['role', () => 'Coordinator'],
    ])('ignores ?%s= alongside a search from an Advisor', async (param, value) => {
      const roster = [{ _id: oid() }];
      const spies = stubSearch({ roster, students: [{ _id: oid() }] });

      const res = await listAs('Advisor', oid(), 'Salma', `${param}=${encodeURIComponent(value())}`);

      expect(res.body.scope).toBe('assigned');
      expect(spies.find.mock.calls[0][0].$and[0]).toEqual({ student: { $in: [roster[0]._id] } });
    });

    it('answers an Advisor with nobody assigned with nothing, without running the search', async () => {
      const spies = stubSearch({ roster: [], students: [{ _id: oid() }], courses: [{ _id: oid() }] });

      const res = await listAs('Advisor', oid(), 'Salma');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scope: 'assigned', requests: [] });
      expect(studentSearchFilter(spies)).toBeUndefined();
      expect(spies.courseFind).not.toHaveBeenCalled();
      expect(spies.find).not.toHaveBeenCalled();
    });

    it('keeps the req 43 sort, population and response format', async () => {
      const doc = stored();
      const spies = stubSearch({ students: [{ _id: doc.student._id }], requests: [doc] });

      const res = await listAs('Coordinator', oid(), 'Salma');

      expect(spies.requestQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      const paths = spies.requestQuery.populate.mock.calls.map(([arg]) => (typeof arg === 'string' ? arg : arg.path));
      expect(paths).toEqual(expect.arrayContaining(['student', 'course', 'term', 'replacementSlot', 'respondedBy']));
      expect(Object.keys(res.body)).toEqual(['scope', 'requests']);
      expect(res.body.requests[0]).toMatchObject({
        id: String(doc._id),
        student: { id: String(doc.student._id), studentId: '64-30010', fullName: 'Salma Ibrahim' },
        course: { code: 'CSEN 501' },
        status: 'Pending',
      });
    });
  });

  describe('empty search keeps req 43 behaviour', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['whitespace', '   '],
    ])('a %s search lists the Coordinator scope unchanged', async (_label, term) => {
      const spies = stubSearch({ requests: [stored()] });

      const res = await listAs('Coordinator', oid(), term);

      expect(res.status).toBe(200);
      expect(spies.find).toHaveBeenCalledWith({});
      expect(spies.studentFind).not.toHaveBeenCalled();
      expect(spies.courseFind).not.toHaveBeenCalled();
      expect(res.body.requests).toHaveLength(1);
    });

    it('a blank search lists the Advisor roster unchanged', async () => {
      const roster = [{ _id: oid() }];
      const spies = stubSearch({ roster });

      await listAs('Advisor', oid(), '  ');

      expect(spies.find).toHaveBeenCalledWith({ student: { $in: [roster[0]._id] } });
      expect(spies.studentFind).toHaveBeenCalledTimes(1);
      expect(spies.courseFind).not.toHaveBeenCalled();
    });
  });

  describe('no matches', () => {
    it('returns an empty list without querying requests', async () => {
      const spies = stubSearch({ students: [], courses: [] });

      const res = await listAs('Coordinator', oid(), 'nobody');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scope: 'all', requests: [] });
      expect(spies.find).not.toHaveBeenCalled();
    });

    it('does the same for an Advisor', async () => {
      const spies = stubSearch({ roster: [{ _id: oid() }] });

      const res = await listAs('Advisor', oid(), 'nobody');

      expect(res.body).toEqual({ scope: 'assigned', requests: [] });
      expect(spies.find).not.toHaveBeenCalled();
    });
  });

  describe('regex escaping', () => {
    it.each(['a.*', '(', '[x', 'CSEN+501', '^$', 'a|b', '\\'])('treats "%s" literally without failing', async (term) => {
      const spies = stubSearch();

      const res = await listAs('Coordinator', oid(), term);

      expect(res.status).toBe(200);
      expect(() => nameRegex(spies)).not.toThrow();
      expect(() => codeRegex(spies)).not.toThrow();
      expect(nameRegex(spies).test(term)).toBe(true);
    });

    it('does not let ".*" match every name or code', async () => {
      const spies = stubSearch();

      await listAs('Coordinator', oid(), '.*');

      expect(nameRegex(spies).test('Salma Ibrahim')).toBe(false);
      expect(codeRegex(spies).test('CSEN 501')).toBe(false);
    });
  });

  describe('input validation', () => {
    it('refuses a repeated search parameter', async () => {
      const spies = stubSearch();

      const res = await request(app)
        .get('/api/slot-change-requests?search=a&search=b')
        .set('Authorization', tokenFor('Coordinator'));

      expect(res.status).toBe(400);
      expect(spies.find).not.toHaveBeenCalled();
    });

    it('refuses an operator object such as ?search[$ne]=x', async () => {
      const spies = stubSearch();

      const res = await request(app)
        .get('/api/slot-change-requests?search[$ne]=x')
        .set('Authorization', tokenFor('Advisor'));

      expect(res.status).toBe(400);
      expect(spies.find).not.toHaveBeenCalled();
      expect(spies.courseFind).not.toHaveBeenCalled();
    });

    it(`accepts ${SEARCH_LIMIT} characters and refuses more`, async () => {
      stubSearch();

      const ok = await listAs('Coordinator', oid(), 'a'.repeat(SEARCH_LIMIT));
      const tooLong = await listAs('Coordinator', oid(), 'a'.repeat(SEARCH_LIMIT + 1));

      expect(ok.status).toBe(200);
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.message).toBe(`Search can be at most ${SEARCH_LIMIT} characters.`);
    });
  });

  describe('access', () => {
    it('requires a session', async () => {
      const res = await request(app).get('/api/slot-change-requests?search=Salma');
      expect(res.status).toBe(401);
    });

    it.each(['Student', 'Administrator'])('refuses %s accounts before any lookup', async (role) => {
      const spies = stubSearch();

      const res = await listAs(role, oid(), 'Salma');

      expect(res.status).toBe(403);
      expect(spies.studentFind).not.toHaveBeenCalled();
      expect(spies.courseFind).not.toHaveBeenCalled();
      expect(spies.find).not.toHaveBeenCalled();
    });
  });

  it('never writes anything', async () => {
    const spies = stubSearch({ roster: [{ _id: oid() }], students: [{ _id: oid() }], courses: [{ _id: oid() }] });

    await listAs('Advisor', oid(), 'Salma');
    await listAs('Coordinator', oid(), 'CSEN 501');
    await listAs('Coordinator', oid(), 'nobody');

    spies.writes.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('answers 500 with a message when a search lookup fails', async () => {
    const spies = stubSearch();
    spies.courseFind.mockImplementation(() => {
      throw new Error('db down');
    });

    const res = await listAs('Coordinator', oid(), 'CSEN');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Could not load slot-change requests');
  });

  describe('service helpers', () => {
    it.each([
      [undefined, { term: '' }],
      ['', { term: '' }],
      ['  Salma  ', { term: 'Salma' }],
      [['a', 'b'], { error: 'Search must be a single text value.' }],
      [{ $ne: 'x' }, { error: 'Search must be a single text value.' }],
      [42, { error: 'Search must be a single text value.' }],
    ])('parseStaffSearch(%p)', (raw, expected) => {
      expect(parseStaffSearch(raw)).toEqual(expected);
    });

    it('courseCodePattern escapes each character and allows spaces between them', () => {
      expect(courseCodePattern('C+ 1')).toBe('C\\s*\\+\\s*1');
    });

    it('buildStaffRequestFilter returns the scope itself for no search', async () => {
      const scope = { student: { $in: [oid()] } };
      await expect(buildStaffRequestFilter(scope)).resolves.toBe(scope);
      await expect(buildStaffRequestFilter(scope, { search: '' })).resolves.toBe(scope);
    });

    it('buildStaffRequestFilter returns null for no scope, without searching', async () => {
      const find = jest.spyOn(Student, 'find');
      const courseFind = jest.spyOn(Course, 'find');

      await expect(buildStaffRequestFilter(null, { search: 'Salma' })).resolves.toBeNull();
      expect(find).not.toHaveBeenCalled();
      expect(courseFind).not.toHaveBeenCalled();
    });
  });
});

describe('SlotChangeRequest model', () => {
  const valid = () => ({
    student: oid(),
    term: oid(),
    scheduleEntry: oid(),
    course: oid(),
    offering: oid(),
    slotType: 'Lab',
    currentSlot: oid(),
    currentSlotSnapshot: { groupNumber: 1, dayOfWeek: 'Sunday', startTime: '08:30', endTime: '10:00', room: 'C6.101' },
  });

  it('defaults to Pending with empty response fields', () => {
    const doc = new SlotChangeRequest(valid());
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe('Pending');
    expect(doc.preferenceNote).toBe('');
    expect(doc.replacementSlot).toBeNull();
    expect(doc.respondedBy).toBeNull();
  });

  it('knows the statuses later requirements need', () => {
    expect(SlotChangeRequest.STATUSES).toEqual(['Pending', 'Approved', 'Rejected', 'Withdrawn']);
  });

  it('rejects an unknown component type and an over-long note', () => {
    const errors = new SlotChangeRequest({ ...valid(), slotType: 'Seminar', preferenceNote: 'x'.repeat(501) }).validateSync()
      .errors;
    expect(errors.slotType).toBeDefined();
    expect(errors.preferenceNote).toBeDefined();
  });

  it('allows only one pending request per student and slot', () => {
    const index = SlotChangeRequest.schema
      .indexes()
      .find(([fields]) => fields.student === 1 && fields.currentSlot === 1);
    expect(index[1]).toMatchObject({ unique: true, partialFilterExpression: { status: 'Pending' } });
  });
});

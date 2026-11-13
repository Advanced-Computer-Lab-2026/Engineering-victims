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

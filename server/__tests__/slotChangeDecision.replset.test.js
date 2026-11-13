/**
 * Req 48 integration tests against a REAL local replica set: transactions,
 * concurrency, rollback and capacity consistency cannot be proved with mocks.
 *
 * Opt-in. Skipped unless MONGO_REPLSET_URI is set, so `npm test` stays
 * mock-only. Run with (PowerShell, from server/):
 *
 *   $env:MONGO_REPLSET_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0'; npx jest slotChangeDecision.replset
 *
 * Safety: the URI must be exactly the local replica set (127.0.0.1:27017,
 * replicaSet=rs0, no credentials) and the only database ever used is the
 * disposable `university_schedule_r48_it`, which is emptied before each test
 * and dropped at the end. Both are re-checked against the live connection
 * before anything is dropped. university_schedule_test, Atlas and the seed
 * are never touched.
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
const CourseOffering = require('../models/CourseOffering');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const Notification = require('../models/Notification');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const slotChangeRequestRoutes = require('../routes/slotChangeRequestRoutes');
const { slotsOverlap } = require('../services/conflictService');

const URI = process.env.MONGO_REPLSET_URI;
const DB_NAME = 'university_schedule_r48_it';
const describeReplSet = URI ? describe : describe.skip;

/** Refuses anything but the verified local replica set. */
const assertSafeTarget = (uri) => {
  if (!/^mongodb:\/\//.test(uri)) throw new Error(`Refusing ${uri}: only a plain mongodb:// URI to the local replica set is allowed.`);
  let url;
  try {
    url = new URL(uri);
  } catch {
    throw new Error(`Refusing ${uri}: not a single-host URI.`);
  }
  if (url.username || url.password) throw new Error('Refusing a URI with credentials.');
  if (url.host !== '127.0.0.1:27017') throw new Error(`Refusing host ${url.host}: only 127.0.0.1:27017 is allowed.`);
  const pathDb = url.pathname.replace(/^\//, '');
  if (pathDb && pathDb !== DB_NAME) throw new Error(`Refusing database ${pathDb}: only ${DB_NAME} is allowed.`);
  if (url.searchParams.get('replicaSet') !== 'rs0') throw new Error('Refusing: the URI must name replicaSet=rs0.');
};

const app = express();
app.use(express.json());
app.use('/api/slot-change-requests', slotChangeRequestRoutes);

const oid = () => new mongoose.Types.ObjectId();
const tokenFor = (role, userId) => `Bearer ${jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET)}`;
const REVIEW = 'Ready for Student Review';
const MODELS = [User, Student, StudentSchedule, CourseSlot, CourseOffering, Course, AcademicTerm, Notification, SlotChangeRequest];

let counter = 0;
const nextId = () => {
  counter += 1;
  return counter;
};

/** Raw inserts: shaped like real documents, without unrelated hooks (password hashing etc.). */
const insert = async (Model, doc) => {
  const full = { _id: oid(), createdAt: new Date(), updatedAt: new Date(), __v: 0, ...doc };
  await Model.collection.insertOne(full);
  return full;
};

jest.setTimeout(60000);

describeReplSet('Req 48 decisions on a real replica set', () => {
  let w; // the per-test world

  beforeAll(async () => {
    assertSafeTarget(URI);
    await mongoose.connect(URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 5000 });
    const { db } = mongoose.connection;
    const hello = await db.admin().command({ hello: 1 });
    if (db.databaseName !== DB_NAME) throw new Error(`Connected to ${db.databaseName}, expected ${DB_NAME}.`);
    if (hello.setName !== 'rs0' || !hello.isWritablePrimary || hello.hosts.join(',') !== '127.0.0.1:27017') {
      throw new Error(`Not the local rs0 primary: ${JSON.stringify({ setName: hello.setName, hosts: hello.hosts })}`);
    }
    await db.dropDatabase();
    for (const Model of MODELS) {
      await Model.createCollection();
      await Model.syncIndexes();
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db.databaseName === DB_NAME) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
  });

  afterEach(() => jest.restoreAllMocks());

  /**
   * A fresh, small world for every test: one Winter term, CSEN 501 and
   * CSEN 301, two Advisors and a Coordinator. Slots and students are added
   * per test with the helpers below, keeping assignedCount equal to the
   * number of assigned rows unless a test deliberately makes it drift.
   */
  beforeEach(async () => {
    for (const Model of MODELS) await Model.deleteMany({});
    const term = await insert(AcademicTerm, {
      academicYear: '2026/2027',
      season: 'Winter',
      termStartDate: new Date('2026-09-15'),
      termEndDate: new Date('2026-12-20'),
      advisingDeadline: new Date('2027-01-15'),
    });
    const otherTerm = await insert(AcademicTerm, { academicYear: '2026/2027', season: 'Spring' });
    const csen501 = await insert(Course, { code: 'CSEN 501', name: 'Data Base I', creditHours: 6 });
    const csen301 = await insert(Course, { code: 'CSEN 301', name: 'Data Structures and Algorithms', creditHours: 6 });
    const advisorA = await insert(User, { fullName: 'Dr. Mona Adel', email: 'mona.it@guc.edu.eg', role: 'Advisor', isActive: true });
    const advisorB = await insert(User, { fullName: 'Dr. Karim Fahmy', email: 'karim.it@guc.edu.eg', role: 'Advisor', isActive: true });
    const coordinator = await insert(User, { fullName: 'Nour Coordinator', email: 'coord.it@guc.edu.eg', role: 'Coordinator', isActive: true });
    w = {
      term,
      offering: await insert(CourseOffering, { courseId: csen501._id, termId: term._id, publicationStatus: 'Published' }),
      otherOffering: await insert(CourseOffering, { courseId: csen301._id, termId: term._id, publicationStatus: 'Published' }),
      springOffering: await insert(CourseOffering, { courseId: csen501._id, termId: otherTerm._id, publicationStatus: 'Published' }),
      advisorA,
      advisorB,
      coordinator,
      as: {
        A: tokenFor('Advisor', advisorA._id),
        B: tokenFor('Advisor', advisorB._id),
        C: tokenFor('Coordinator', coordinator._id),
      },
    };
  });

  const addSlot = (offering, slotType, groupNumber, dayOfWeek, startTime, endTime, maxCapacity = 30) =>
    insert(CourseSlot, {
      offeringId: offering._id,
      instructorId: w.advisorA._id,
      slotType,
      groupNumber,
      dayOfWeek,
      startTime,
      endTime,
      roomId: `IT-${slotType[0]}${groupNumber}-${nextId()}`,
      maxCapacity,
      assignedCount: 0,
    });

  const addStudent = async (fullName, advisor = w.advisorA, workflowStatus = REVIEW) => {
    const n = nextId();
    const email = `it.student${n}@student.guc.edu.eg`;
    const user = await insert(User, { fullName, email, role: 'Student', isActive: true });
    const student = await insert(Student, {
      fullName,
      email,
      studentId: `70-${String(10000 + n).slice(-5)}`,
      studentType: 'Advising Student',
      major: 'Computer Science',
      currentSemester: 5,
      academicStanding: 'Good Standing',
      assignedAdvisor: advisor ? advisor._id : null,
      workflowStatus,
      isActive: true,
      lastUpdateAt: new Date('2026-11-01T00:00:00Z'),
    });
    return { ...student, user, token: tokenFor('Student', user._id) };
  };

  /** An assigned row; bumps the slot's counter unless `count` is false (to simulate drift). */
  const assign = async (student, slot, { status = 'Active', count = true, termId = w.term._id } = {}) => {
    const row = await insert(StudentSchedule, { studentId: student._id, slotId: slot._id, termId, status });
    if (count) await CourseSlot.collection.updateOne({ _id: slot._id }, { $inc: { assignedCount: 1 } });
    return row;
  };

  /** Fills `n` seats of a slot with other students, consistently (rows and counter). */
  const fill = async (slot, n) => {
    for (let i = 0; i < n; i += 1) {
      const filler = await addStudent(`Filler ${nextId()}`, w.advisorB);
      await assign(filler, slot);
    }
  };

  const addRequest = (student, row, slot, offering = w.offering, overrides = {}) =>
    insert(SlotChangeRequest, {
      student: student._id,
      term: w.term._id,
      scheduleEntry: row._id,
      course: offering.courseId,
      offering: offering._id,
      slotType: slot.slotType,
      currentSlot: slot._id,
      currentSlotSnapshot: {
        groupNumber: slot.groupNumber,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.roomId,
      },
      preferenceNote: '',
      status: 'Pending',
      replacementSlot: null,
      responseNote: '',
      respondedBy: null,
      respondedAt: null,
      withdrawnAt: null,
      ...overrides,
    });

  const approve = (token, req, slot, responseNote) =>
    request(app)
      .patch(`/api/slot-change-requests/${req._id}/approve`)
      .set('Authorization', token)
      .send({ replacementSlotId: String(slot._id), ...(responseNote === undefined ? {} : { responseNote }) });
  const reject = (token, req, responseNote) =>
    request(app)
      .patch(`/api/slot-change-requests/${req._id}/reject`)
      .set('Authorization', token)
      .send(responseNote === undefined ? {} : { responseNote });

  const slotDoc = (slot) => CourseSlot.findById(slot._id).lean();
  const requestDoc = (req) => SlotChangeRequest.findById(req._id).lean();

  /** Everything a decision could touch, for "nothing changed" checks. */
  const snapshot = async () => ({
    slots: await CourseSlot.find().sort({ _id: 1 }).lean(),
    rows: await StudentSchedule.find().sort({ _id: 1 }).lean(),
    requests: await SlotChangeRequest.find().sort({ _id: 1 }).lean(),
    students: await Student.find().sort({ _id: 1 }).lean(),
  });

  /** assignedCount equals the number of assigned (Active/Processed) rows, for every slot. */
  const expectCountsConsistent = async () => {
    const slots = await CourseSlot.find().lean();
    for (const slot of slots) {
      const rows = await StudentSchedule.countDocuments({ slotId: slot._id, status: { $in: ['Active', 'Processed'] } });
      expect({ slot: String(slot._id), assignedCount: slot.assignedCount }).toEqual({ slot: String(slot._id), assignedCount: rows });
      expect(slot.assignedCount).toBeLessThanOrEqual(slot.maxCapacity);
    }
  };

  /** No two of a student's assigned slots overlap. */
  const expectNoClash = async (student) => {
    const rows = await StudentSchedule.find({ studentId: student._id, status: { $in: ['Active', 'Processed'] } }).lean();
    const slots = await CourseSlot.find({ _id: { $in: rows.map((r) => r.slotId) } }).lean();
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) expect(slotsOverlap(slots[i], slots[j])).toBe(false);
    }
  };

  /** A student in review with a Pending request on `current`, wanting another group. */
  const pendingOn = async (current, { advisor = w.advisorA, name = 'Salma Ibrahim' } = {}) => {
    const student = await addStudent(name, advisor);
    const row = await assign(student, current);
    const req = await addRequest(student, row, current);
    return { student, row, req };
  };

  describe('approval', () => {
    it('moves the student into the exact replacement and updates both counts and the request together', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      await fill(g1, 3);
      await fill(g2, 4);
      const { student, row, req } = await pendingOn(g1);

      const res = await approve(w.as.A, req, g2, '  Moved to Sunday.  ');

      expect(res.status).toBe(200);
      expect((await StudentSchedule.findById(row._id).lean()).slotId).toEqual(g2._id);
      expect((await slotDoc(g1)).assignedCount).toBe(3);
      expect((await slotDoc(g2)).assignedCount).toBe(5);
      const saved = await requestDoc(req);
      expect(saved).toMatchObject({ status: 'Approved', responseNote: 'Moved to Sunday.' });
      expect(saved.replacementSlot).toEqual(g2._id);
      expect(saved.respondedBy).toEqual(w.advisorA._id);
      expect(saved.respondedAt).toBeInstanceOf(Date);
      expect((await Student.findById(student._id).lean()).workflowStatus).toBe(REVIEW);
      expect(res.body.request).toMatchObject({
        id: String(req._id),
        status: 'Approved',
        response: { note: 'Moved to Sunday.', replacementSlot: { groupNumber: 2, dayOfWeek: 'Sunday' } },
      });
      await expectCountsConsistent();
    });

    it('lets a Coordinator approve without a note', async () => {
      const g1 = await addSlot(w.offering, 'Lab', 1, 'Monday', '08:00', '09:30');
      const g2 = await addSlot(w.offering, 'Lab', 2, 'Tuesday', '08:00', '09:30');
      const { req } = await pendingOn(g1, { advisor: w.advisorB });

      const res = await approve(w.as.C, req, g2);

      expect(res.status).toBe(200);
      expect(await requestDoc(req)).toMatchObject({ status: 'Approved', responseNote: '' });
      await expectCountsConsistent();
    });

    it('keeps the status Ready for Student Review while another request stays Pending', async () => {
      const lec1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '08:00', '09:30');
      const lec2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      const tut1 = await addSlot(w.offering, 'Tutorial', 1, 'Tuesday', '08:00', '09:30');
      const student = await addStudent('Two Requests');
      const lecRow = await assign(student, lec1);
      const tutRow = await assign(student, tut1);
      const lecReq = await addRequest(student, lecRow, lec1);
      const tutReq = await addRequest(student, tutRow, tut1);

      expect((await approve(w.as.A, lecReq, lec2)).status).toBe(200);

      expect((await Student.findById(student._id).lean()).workflowStatus).toBe(REVIEW);
      expect((await requestDoc(tutReq)).status).toBe('Pending');
    });

    it('accepts a group that ends exactly when another of the student’s slots starts', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const adjacent = await addSlot(w.offering, 'Lecture', 5, 'Tuesday', '11:30', '13:15');
      const tutorial = await addSlot(w.offering, 'Tutorial', 1, 'Tuesday', '13:15', '14:45');
      const { student, req } = await pendingOn(g1);
      await assign(student, tutorial);

      expect((await approve(w.as.A, req, adjacent)).status).toBe(200);
      await expectNoClash(student);
    });
  });

  describe('approval refusals leave everything unchanged', () => {
    const refuses = async (res, status, messagePart) => {
      expect(res.status).toBe(status);
      if (messagePart) expect(res.body.message).toMatch(messagePart);
    };

    it.each([
      ['a full group', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30', 2);
        await fill(g2, 2);
        const { req } = await pendingOn(g1);
        return [w.as.A, req, g2, 409, /full/];
      }],
      ['a group whose counter drifted below its real rows', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30', 2);
        for (let i = 0; i < 2; i += 1) await assign(await addStudent(`Drift ${i}`, w.advisorB), g2, { count: false });
        const { req } = await pendingOn(g1);
        return [w.as.A, req, g2, 409, /full/];
      }],
      ['a group that clashes with another course', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g3 = await addSlot(w.offering, 'Lecture', 3, 'Wednesday', '09:45', '11:15');
        const other = await addSlot(w.otherOffering, 'Lecture', 1, 'Wednesday', '09:45', '11:15');
        const { student, req } = await pendingOn(g1);
        await assign(student, other);
        return [w.as.A, req, g3, 409, /clashes with the student's CSEN 301 Lecture G1/];
      }],
      ['a group from another course offering', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const other = await addSlot(w.otherOffering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
        const { req } = await pendingOn(g1);
        return [w.as.A, req, other, 400, /same course offering/];
      }],
      ['the same course in another term', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const spring = await addSlot(w.springOffering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
        const { req } = await pendingOn(g1);
        return [w.as.A, req, spring, 400, /same course offering/];
      }],
      ['another component', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const tut = await addSlot(w.offering, 'Tutorial', 2, 'Sunday', '08:00', '09:30');
        const { req } = await pendingOn(g1);
        return [w.as.A, req, tut, 400, /another Lecture group/];
      }],
      ['the current group itself', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const { req } = await pendingOn(g1);
        return [w.as.A, req, g1, 400, /other than the current one/];
      }],
      ['a deleted group', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const { req } = await pendingOn(g1);
        return [w.as.A, req, { _id: oid() }, 409, /no longer exists/];
      }],
      ['a student who is no longer Ready for Student Review', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
        const { student, req } = await pendingOn(g1);
        await Student.collection.updateOne({ _id: student._id }, { $set: { workflowStatus: 'Processed' } });
        return [w.as.A, req, g2, 409, /Ready for Student Review; it is now Processed/];
      }],
      ['a request that is no longer Pending', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
        const { req } = await pendingOn(g1);
        await SlotChangeRequest.collection.updateOne({ _id: req._id }, { $set: { status: 'Withdrawn' } });
        return [w.as.A, req, g2, 409, /already withdrawn/];
      }],
      ['a schedule row that no longer holds the slot', async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
        const { row, req } = await pendingOn(g1);
        await StudentSchedule.collection.updateOne({ _id: row._id }, { $set: { status: 'Draft' } });
        return [w.as.A, req, g2, 409, /no longer holds/];
      }],
      ["another Advisor's student", async () => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
        await pendingOn(g1, { advisor: w.advisorB, name: 'Not Mine' });
        const { req } = await pendingOn(g1, { advisor: w.advisorA });
        // Advisor B owns a different student; this request belongs to A's student.
        return [w.as.B, req, g2, 404, /not found/];
      }],
    ])('refuses %s', async (_label, setup) => {
      const [token, req, slot, status, message] = await setup();
      const before = await snapshot();

      await refuses(await approve(token, req, slot), status, message);

      expect(await snapshot()).toEqual(before);
    });

    it('rolls everything back when the unique index catches a hidden draft row', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      const { student, req } = await pendingOn(g1);
      // A Draft row for G2 is not part of the timetable checks, but the (student, slot) index rejects the move.
      await assign(student, g2, { status: 'Draft', count: false });
      const before = await snapshot();

      const res = await approve(w.as.A, req, g2);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already has that group/);
      expect(await snapshot()).toEqual(before);
    });

    it('rolls back the claim, the seat and the move when a later write fails', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      await fill(g1, 2);
      const { req } = await pendingOn(g1);
      const before = await snapshot();
      const original = CourseSlot.updateOne.bind(CourseSlot);
      let calls = 0;
      // 1st updateOne takes the new seat; the 2nd (freeing the old seat) fails after the row has moved.
      jest.spyOn(CourseSlot, 'updateOne').mockImplementation((...args) => {
        calls += 1;
        if (calls === 2) throw new Error('simulated failure after the row moved');
        return original(...args);
      });

      const res = await approve(w.as.A, req, g2);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Could not approve the slot-change request. Nothing was changed.');
      jest.restoreAllMocks();
      expect(await snapshot()).toEqual(before);
      await expectCountsConsistent();
    });
  });

  describe('rejection', () => {
    it('records the decision and note and touches no schedule row or count', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      const { student, req } = await pendingOn(g1);
      const before = await snapshot();

      const res = await reject(w.as.A, req, '  No free group fits.  ');

      expect(res.status).toBe(200);
      const after = await snapshot();
      expect(after.slots).toEqual(before.slots);
      expect(after.rows).toEqual(before.rows);
      // The only student change is the per-student lock (lastUpdateAt, and the updatedAt timestamp it bumps).
      const withoutLock = (students) => students.map(({ lastUpdateAt, updatedAt, ...rest }) => rest);
      expect(withoutLock(after.students)).toEqual(withoutLock(before.students));
      const saved = await requestDoc(req);
      expect(saved).toMatchObject({ status: 'Rejected', responseNote: 'No free group fits.', replacementSlot: null });
      expect(saved.respondedBy).toEqual(w.advisorA._id);
      expect((await Student.findById(student._id).lean()).workflowStatus).toBe(REVIEW);
      expect(res.body.request).toMatchObject({ status: 'Rejected', response: { note: 'No free group fits.', replacementSlot: null } });
    });

    it('allows no note', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const { req } = await pendingOn(g1);

      expect((await reject(w.as.C, req)).status).toBe(200);
      expect(await requestDoc(req)).toMatchObject({ status: 'Rejected', responseNote: '' });
    });

    it("refuses another Advisor's request and a decided request without changing anything", async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const { req } = await pendingOn(g1);
      await pendingOn(g1, { advisor: w.advisorB, name: 'B Student' });
      const before = await snapshot();

      expect((await reject(w.as.B, req)).status).toBe(404);
      expect(await snapshot()).toEqual(before);

      await SlotChangeRequest.collection.updateOne({ _id: req._id }, { $set: { status: 'Approved' } });
      expect((await reject(w.as.A, req)).status).toBe(409);
    });
  });

  describe('concurrency', () => {
    it.each([1, 2, 3, 4, 5])('gives the last seat to exactly one of two simultaneous approvals (round %i)', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30', 3);
      await fill(g2, 2); // one seat left
      const first = await pendingOn(g1, { name: 'First' });
      const second = await pendingOn(g1, { name: 'Second' });

      const results = await Promise.all([approve(w.as.A, first.req, g2), approve(w.as.C, second.req, g2)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409).body.message).toMatch(/full/);
      expect((await slotDoc(g2)).assignedCount).toBe(3);
      expect((await slotDoc(g1)).assignedCount).toBe(1);
      const statuses = [await requestDoc(first.req), await requestDoc(second.req)].map((r) => r.status).sort();
      expect(statuses).toEqual(['Approved', 'Pending']);
      await expectCountsConsistent();
    });

    it('never overfills a group when many approvals race for its last two seats', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30', 5);
      await fill(g2, 3); // two seats left
      const contenders = [];
      for (let i = 0; i < 6; i += 1) contenders.push(await pendingOn(g1, { name: `Contender ${i}` }));

      const results = await Promise.all(contenders.map((c, i) => approve(i % 2 ? w.as.C : w.as.A, c.req, g2)));

      expect(results.filter((r) => r.status === 200)).toHaveLength(2);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect((await slotDoc(g2)).assignedCount).toBe(5);
      expect(await StudentSchedule.countDocuments({ slotId: g2._id })).toBe(5);
      await expectCountsConsistent();
    });

    it.each([1, 2, 3, 4, 5])(
      'lets only one of two approvals for the same student through when the new groups clash with each other (round %i)',
      async () => {
        const lec1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '08:00', '09:30');
        const tut1 = await addSlot(w.offering, 'Tutorial', 1, 'Tuesday', '08:00', '09:30');
        // Each is fine alone, but they overlap each other on Thursday.
        const lec2 = await addSlot(w.offering, 'Lecture', 2, 'Thursday', '10:00', '11:30');
        const tut2 = await addSlot(w.offering, 'Tutorial', 2, 'Thursday', '10:30', '12:00');
        const student = await addStudent('Same Student');
        const lecRow = await assign(student, lec1);
        const tutRow = await assign(student, tut1);
        const lecReq = await addRequest(student, lecRow, lec1);
        const tutReq = await addRequest(student, tutRow, tut1);

        const results = await Promise.all([approve(w.as.A, lecReq, lec2), approve(w.as.C, tutReq, tut2)]);

        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(results.find((r) => r.status === 409).body.message).toMatch(/clashes/);
        await expectNoClash(student);
        await expectCountsConsistent();
        expect((await Student.findById(student._id).lean()).workflowStatus).toBe(REVIEW);
      }
    );

    it('decides the same request only once when two staff approve it at the same moment', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      const g3 = await addSlot(w.offering, 'Lecture', 3, 'Saturday', '08:00', '09:30');
      const { row, req } = await pendingOn(g1);

      const results = await Promise.all([approve(w.as.A, req, g2), approve(w.as.C, req, g3)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const saved = await requestDoc(req);
      const moved = await StudentSchedule.findById(row._id).lean();
      expect(moved.slotId).toEqual(saved.replacementSlot);
      expect((await slotDoc(g2)).assignedCount + (await slotDoc(g3)).assignedCount).toBe(1);
      await expectCountsConsistent();
    });

    it('lets either an approval or a rejection win, never both', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      const { row, req } = await pendingOn(g1);

      const [approved, rejected] = await Promise.all([approve(w.as.A, req, g2), reject(w.as.C, req, 'No')]);

      expect([approved.status, rejected.status].sort()).toEqual([200, 409]);
      const saved = await requestDoc(req);
      const finalRow = await StudentSchedule.findById(row._id).lean();
      if (saved.status === 'Approved') expect(finalRow.slotId).toEqual(g2._id);
      else expect(finalRow.slotId).toEqual(g1._id);
      await expectCountsConsistent();
    });

    it.each(['reject', 'approve'])(
      'never lets a %s commit once the student has left review, even if the status changes mid-transaction',
      async (action) => {
        const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
        const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
        const { student, row, req } = await pendingOn(g1);
        // Right after the decision has read the student (still in review), the
        // schedule is processed outside the transaction, as req 81 would do it.
        const realUpdateOne = Student.updateOne.bind(Student);
        let interfered = false;
        jest.spyOn(Student, 'updateOne').mockImplementation(async (...args) => {
          if (!interfered) {
            interfered = true;
            await Student.collection.updateOne({ _id: student._id }, { $set: { workflowStatus: 'Processed' } });
          }
          return realUpdateOne(...args);
        });

        const res = action === 'reject' ? await reject(w.as.A, req, 'No') : await approve(w.as.A, req, g2);

        expect(interfered).toBe(true);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/it is now Processed.$/);
        expect(await requestDoc(req)).toMatchObject({ status: 'Pending', responseNote: '' });
        expect((await StudentSchedule.findById(row._id).lean()).slotId).toEqual(g1._id);
        expect((await slotDoc(g2)).assignedCount).toBe(0);
        await expectCountsConsistent();
      }
    );

    it("keeps an approval and the student's own withdrawal consistent", async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30');
      const { student, row, req } = await pendingOn(g1);

      const [approved, withdrawn] = await Promise.all([
        approve(w.as.A, req, g2),
        request(app).patch(`/api/slot-change-requests/me/${req._id}/withdraw`).set('Authorization', student.token),
      ]);

      expect([approved.status, withdrawn.status].sort()).toEqual([200, 409]);
      const saved = await requestDoc(req);
      const finalRow = await StudentSchedule.findById(row._id).lean();
      expect(finalRow.slotId).toEqual(saved.status === 'Approved' ? g2._id : g1._id);
      await expectCountsConsistent();
    });

    it('keeps every counter equal to its rows after a mixed burst of decisions', async () => {
      const g1 = await addSlot(w.offering, 'Lecture', 1, 'Monday', '13:15', '14:45');
      const g2 = await addSlot(w.offering, 'Lecture', 2, 'Sunday', '08:00', '09:30', 2);
      const g3 = await addSlot(w.offering, 'Lecture', 3, 'Saturday', '08:00', '09:30', 2);
      const people = [];
      for (let i = 0; i < 6; i += 1) people.push(await pendingOn(g1, { name: `Burst ${i}` }));

      await Promise.all(
        people.map((p, i) => (i === 5 ? reject(w.as.C, p.req) : approve(i % 2 ? w.as.C : w.as.A, p.req, i < 3 ? g2 : g3)))
      );

      await expectCountsConsistent();
      expect((await slotDoc(g2)).assignedCount).toBeLessThanOrEqual(2);
      expect((await slotDoc(g3)).assignedCount).toBeLessThanOrEqual(2);
    });
  });
});

describe('Req 48 replica-set test guard', () => {
  it.each([
    'mongodb://localhost:27017/?replicaSet=rs0',
    'mongodb://127.0.0.1:27018/?replicaSet=rs0',
    'mongodb://127.0.0.1:27017/university_schedule_test?replicaSet=rs0',
    'mongodb://127.0.0.1:27017/?replicaSet=other',
    'mongodb://127.0.0.1:27017/',
    'mongodb://user:pass@127.0.0.1:27017/?replicaSet=rs0',
    'mongodb+srv://cluster.example.mongodb.net/?replicaSet=rs0',
    'mongodb://127.0.0.1:27017,127.0.0.2:27017/?replicaSet=rs0',
  ])('refuses %s', (uri) => {
    expect(() => assertSafeTarget(uri)).toThrow(/Refusing/);
  });

  it.each([
    'mongodb://127.0.0.1:27017/?replicaSet=rs0',
    `mongodb://127.0.0.1:27017/${DB_NAME}?replicaSet=rs0`,
  ])('accepts %s', (uri) => {
    expect(() => assertSafeTarget(uri)).not.toThrow();
  });
});

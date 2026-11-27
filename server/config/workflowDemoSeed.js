const StudentSchedule = require('../models/StudentSchedule');
const CourseSlot = require('../models/CourseSlot');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const ExitExamRequest = require('../models/ExitExamRequest');
const SemesterStanding = require('../models/SemesterStanding');
const GraduationPlan = require('../models/GraduationPlan');
const { deadlineEnd } = require('../services/schedulingPreferenceService');
const { remainingCoursesFor } = require('../services/graduationPlanService');
const { validateRequest, applyDecision } = require('../services/exitExamRequestService');
const { semesterOrdinal } = require('../services/probationService');

const EXIT_EXAM_STUDENT_ID = '64-30011';
/** Has exactly one failed course left, so his exit exam can also be decided. */
const DECIDED_EXIT_EXAM_STUDENT_ID = '64-20045';

/** One fixed instant for every decided demo request, so a reseed reads the same. */
const DECIDED_AT = new Date('2026-11-12T10:00:00.000Z');

const PREFERENCE_NOTES = {
  Lecture: 'A different lecture group on Sunday would fit my schedule better.',
  Tutorial: 'A later tutorial group would suit my timetable better.',
  Lab: 'A lab group on Wednesday would be preferable if available.',
};

/**
 * Req 48 demo decisions. Without these every seeded request stays Pending and
 * the review screen, its status filters and the student's own request history
 * never show an outcome.
 *
 * One student per outcome, chosen so the outcome is *true* of the data:
 *
 *   approve  the requested course runs a single group, so the demo first
 *            publishes a second group and moves the student into it — the
 *            approval writes exactly what the service writes (request status,
 *            replacement slot, response fields and the moved schedule row).
 *   reject   the requested course runs a single group this term, so there is
 *            genuinely nothing to move to.
 *   withdraw the student pulls their own request back before a decision.
 *
 * Everything else stays Pending, which is what the review queue is for.
 *
 * The writes are made directly rather than through approveSlotChangeRequest():
 * that service stamps `respondedAt` and a notification occurrence with the
 * wall clock, and scripts/verify-seed-state.cjs requires a fresh seed and the
 * shared database to agree. The fields, the seat math and the row move are the
 * ones the service performs, and the seed's final reconcile pass recounts every
 * CourseSlot.assignedCount afterwards.
 */
const DECISION_PLAN = [
  { studentId: '64-20045', slotType: 'Lecture', action: 'approve' },
  { studentId: '64-30010', slotType: 'Tutorial', action: 'reject' },
  { studentId: '65-60015', slotType: 'Lab', action: 'withdraw' },
];

const DEMO_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday', 'Sunday', 'Friday'];
const DEMO_BLOCKS = [
  ['08:00', '09:30'],
  ['09:45', '11:15'],
  ['11:30', '13:00'],
  ['13:15', '14:45'],
  ['15:00', '16:30'],
  ['16:45', '18:15'],
];

const inRange = (day, start, end) => (slot) =>
  slot.dayOfWeek === day && start < slot.endTime && slot.startTime < end;

/** Every group of the offering the request is about, the current one included. */
const siblingSlots = (slots, request) => {
  const current = slots.find((slot) => String(slot._id) === String(request.currentSlot));
  if (!current) {
    throw new Error('The slot-change demo request points at a slot that no longer exists.');
  }
  const siblings = slots.filter(
    (slot) =>
      String(slot.offeringId) === String(current.offeringId) && slot.slotType === request.slotType
  );
  return { current, siblings };
};

/**
 * A group the student may be moved into: another group of the same offering,
 * free seat, not already on their timetable and no clash — the same four checks
 * approveSlotChangeRequest runs, plus occupancy counted from real rows.
 */
const firstFreeAlternative = ({ siblings, current, held, occupancy }) =>
  [...siblings]
    .filter((slot) => String(slot._id) !== String(current._id))
    .filter((slot) => !held.some((other) => String(other._id) === String(slot._id)))
    .filter((slot) => (occupancy.get(String(slot._id)) ?? 0) < Number(slot.maxCapacity))
    .filter(
      (slot) => !held.some((other) => inRange(slot.dayOfWeek, slot.startTime, slot.endTime)(other))
    )
    .sort((a, b) => a.groupNumber - b.groupNumber)[0] ?? null;

/** Publishes one more group of the offering, at the first genuinely free cell. */
const publishGroup = async ({ current, held, slots, student }) => {
  const rooms = [...new Set(slots.map((slot) => slot.roomId))].sort();
  const instructorBusy = slots.filter(
    (slot) => String(slot.instructorId) === String(current.instructorId)
  );

  for (const dayOfWeek of DEMO_DAYS) {
    for (const [startTime, endTime] of DEMO_BLOCKS) {
      if (instructorBusy.some(inRange(dayOfWeek, startTime, endTime))) continue;
      if (held.some(inRange(dayOfWeek, startTime, endTime))) continue;
      const roomId = rooms.find(
        (room) => !slots.some((slot) => slot.roomId === room && inRange(dayOfWeek, startTime, endTime)(slot))
      );
      if (!roomId) continue;

      // Numbered after this offering's own groups, never after another course's.
      const offeringGroups = slots.filter(
        (slot) =>
          String(slot.offeringId) === String(current.offeringId) &&
          slot.slotType === current.slotType
      );
      const groupNumber = Math.max(...offeringGroups.map((slot) => slot.groupNumber)) + 1;
      return CourseSlot.create({
        offeringId: current.offeringId,
        instructorId: current.instructorId,
        slotType: current.slotType,
        groupNumber,
        dayOfWeek,
        startTime,
        endTime,
        roomId,
        maxCapacity: current.maxCapacity,
        assignedCount: 0,
      });
    }
  }
  throw new Error(
    `The slot-change demo could not find a free ${current.slotType} slot for ${student.studentId}.`
  );
};

const loadScheduleContext = async ({ student, request }) => {
  const rows = await StudentSchedule.find({
    studentId: student._id,
    termId: request.term,
    status: 'Active',
  }).lean();
  if (!rows.length) {
    throw new Error(`The slot-change demo data needs an assigned schedule for ${student.studentId}.`);
  }
  const slots = await CourseSlot.find({}).lean();
  const byId = new Map(slots.map((slot) => [String(slot._id), slot]));
  const held = rows.map((row) => byId.get(String(row.slotId))).filter(Boolean);

  const occupancyRows = await StudentSchedule.find({}).select('slotId').lean();
  const occupancy = new Map();
  occupancyRows.forEach((row) => {
    const key = String(row.slotId);
    occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  });
  return { rows, slots, byId, held, occupancy };
};

/** One request per outcome; the plan is keyed by student and slot type. */
const applyDemoDecision = async ({ request, student, users, now }) => {
  const plan = DECISION_PLAN.find(
    (entry) => entry.studentId === student.studentId && entry.slotType === request.slotType
  );
  if (!plan) return 'Pending';

  const advisor =
    users.find((user) => String(user._id) === String(student.assignedAdvisor)) ??
    users.find((user) => user.role === 'Coordinator');
  if (!advisor) {
    throw new Error(`The slot-change demo data could not find a reviewer for ${student.studentId}.`);
  }
  const { slots, held, occupancy } = await loadScheduleContext({ student, request });
  const { current, siblings } = siblingSlots(slots, request);
  const courseCode = request.courseCode ?? 'this course';

  if (plan.action === 'approve') {
    const alternative =
      firstFreeAlternative({ siblings, current, held, occupancy }) ??
      (await publishGroup({ current, held, slots, student }));

    await SlotChangeRequest.updateOne(
      { _id: request._id, status: 'Pending' },
      {
        $set: {
          status: 'Approved',
          replacementSlot: alternative._id,
          responseNote: `Approved for the demo: moved to ${current.slotType} group ${alternative.groupNumber}.`,
          respondedBy: advisor._id,
          respondedAt: now,
        },
      }
    );
    const moved = await StudentSchedule.updateOne(
      { _id: request.scheduleEntry, studentId: student._id, slotId: request.currentSlot, status: 'Active' },
      { $set: { slotId: alternative._id } }
    );
    if (moved.modifiedCount !== 1) {
      throw new Error(`The slot-change demo could not move ${student.studentId}'s schedule row.`);
    }
    return 'Approved';
  }

  if (plan.action === 'reject') {
    const alone = siblings.length === 1;
    const responseNote = alone
      ? `${courseCode} runs a single ${current.slotType} group this term, so there is no other group to move to.`
      : `No alternative ${current.slotType} group of ${courseCode} fits this timetable.`;
    await SlotChangeRequest.updateOne(
      { _id: request._id, status: 'Pending' },
      {
        $set: {
          status: 'Rejected',
          replacementSlot: null,
          responseNote,
          respondedBy: advisor._id,
          respondedAt: now,
        },
      }
    );
    return 'Rejected';
  }

  await SlotChangeRequest.updateOne(
    { _id: request._id, status: 'Pending' },
    { $set: { status: 'Withdrawn', replacementSlot: null, withdrawnAt: now } }
  );
  return 'Withdrawn';
};

const seedSlotChangeRequests = async ({ students, terms, courses, users, now = new Date() }) => {
  // "Change Request Pending" students are included as well: their status says a
  // request is waiting on the Advisor, so the review screen has to have one.
  const readyStudents = students.filter(
    (student) =>
      student.studentType === 'Advising Student' &&
      ['Ready for Student Review', 'Change Request Pending'].includes(student.workflowStatus)
  );
  if (!readyStudents.length) return 0;

  const term = terms.find(
    (candidate) =>
      new Date(candidate.termStartDate) <= now &&
      deadlineEnd(candidate) >= now
  );
  if (!term) {
    throw new Error('The slot-change demo data requires an open advising term.');
  }

  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  const requestDocs = [];
  /** The code of each request's course, index-aligned with requestDocs. */
  const courseCodes = [];

  for (const student of readyStudents) {
    const scheduleRows = await StudentSchedule.find({
      studentId: student._id,
      termId: term._id,
      status: 'Active',
    }).lean();
    if (!scheduleRows.length) {
      throw new Error(`The slot-change demo data requires a review-ready schedule for ${student.studentId}.`);
    }

    const slots = await CourseSlot.find({
      _id: { $in: scheduleRows.map((row) => row.slotId) },
    })
      .populate('offeringId', 'courseId termId')
      .lean();
    const slotById = new Map(slots.map((slot) => [String(slot._id), slot]));
    const addedTypes = new Set();

    for (const row of scheduleRows) {
      const slot = slotById.get(String(row.slotId));
      if (!slot?.offeringId || addedTypes.has(slot.slotType)) continue;

      const course = courseById.get(String(slot.offeringId.courseId));
      if (!course) {
        throw new Error(`The slot-change demo data could not find a course for slot ${slot._id}.`);
      }

      requestDocs.push({
        student: student._id,
        term: term._id,
        scheduleEntry: row._id,
        course: course._id,
        offering: slot.offeringId._id,
        slotType: slot.slotType,
        currentSlot: slot._id,
        currentSlotSnapshot: {
          groupNumber: slot.groupNumber,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: slot.roomId,
        },
        preferenceNote: PREFERENCE_NOTES[slot.slotType],
        status: 'Pending',
      });
      courseCodes.push(course.code);
      addedTypes.add(slot.slotType);
    }
  }

  if (!requestDocs.length) {
    throw new Error('The slot-change demo data could not find any assigned slots to request.');
  }

  const inserted = await SlotChangeRequest.insertMany(requestDocs);
  const outcomes = { Pending: 0, Approved: 0, Rejected: 0, Withdrawn: 0 };
  for (const [index, doc] of inserted.entries()) {
    const student = readyStudents.find((candidate) => String(candidate._id) === String(doc.student));
    if (!student) continue;
    const outcome = await applyDemoDecision({
      request: { ...doc.toObject(), courseCode: courseCodes[index] },
      student,
      users,
      now: DECIDED_AT,
    });
    outcomes[outcome] += 1;
  }
  return { created: inserted.length, ...outcomes };
};

/**
 * The two exit-exam requests the demo needs: one waiting on the Coordinator
 * and one already decided, so both the queue and the outcome view open on
 * real rows.
 *
 * Both students genuinely have exactly one failed course left — the rule
 * validateRequest enforces — so there is no third case to invent: every other
 * Advising Student has zero failed courses remaining.
 */
const EXIT_EXAM_CASES = [
  { studentId: EXIT_EXAM_STUDENT_ID, status: 'Pending' },
  {
    studentId: DECIDED_EXIT_EXAM_STUDENT_ID,
    status: 'Approved',
    note: 'Approved for the demo: the failed course cannot be repeated before the expected graduation.',
  },
];

const seedExitExamRequests = async ({ students, users }) => {
  const coordinator = users.find((user) => user.role === 'Coordinator');
  if (!coordinator) throw new Error('The exit-exam demo data requires a seeded Coordinator.');
  let created = 0;

  for (const testCase of EXIT_EXAM_CASES) {
    const student = students.find((candidate) => candidate.studentId === testCase.studentId);
    if (!student || student.studentType !== 'Advising Student' || !student.assignedAdvisor) {
      throw new Error(`The exit-exam demo data requires assigned Advising Student ${testCase.studentId}.`);
    }

    const advisor = users.find(
      (user) => user.role === 'Advisor' && String(user._id) === String(student.assignedAdvisor)
    );
    if (!advisor) {
      throw new Error(`The exit-exam demo data could not find ${student.studentId}'s Advisor.`);
    }

    if (testCase.status === 'Pending') {
      const draftPlan = await GraduationPlan.exists({
        student: student._id,
        advisor: advisor._id,
        status: 'Draft',
      });
      if (!draftPlan) {
        throw new Error(`The exit-exam demo data requires a draft graduation plan for ${student.studentId}.`);
      }
    }

    const remaining = await remainingCoursesFor(student);
    const failedCourses = remaining.filter((course) => course.isRetake);
    if (failedCourses.length !== 1) {
      throw new Error(`The exit-exam demo data requires exactly one remaining failed course for ${student.studentId}.`);
    }

    const course = failedCourses[0];
    const reason = 'The remaining failed course is not offered before my expected graduation.';
    const validationError = validateRequest({ student, remaining, courseId: course.id, reason });
    if (validationError) {
      throw new Error(`The exit-exam demo request is invalid: ${validationError}`);
    }

    const request = await ExitExamRequest.create({
      student: student._id,
      advisor: advisor._id,
      course: course.id,
      reason,
      status: 'Pending',
    });

    if (testCase.status === 'Approved') {
      // The real decision rule, with the demo's fixed instant so a reseed and
      // the shared database agree on decidedAt.
      const error = applyDecision({
        request,
        decision: 'approve',
        note: testCase.note,
        coordinatorId: coordinator._id,
        now: DECIDED_AT,
      });
      if (error) throw new Error(`The exit-exam demo decision is invalid: ${error}`);
      await request.save();
    }
    created += 1;
  }
  return created;
};

const seedSemesterStandingHistory = async ({ students, terms, users, now = new Date() }) => {
  const eligibleStudents = students.filter(
    (student) =>
      student.studentType === 'Advising Student' &&
      student.currentSemester > 1 &&
      student.academicStanding !== 'Dismissed'
  );
  if (!eligibleStudents.length) return 0;

  const term = terms
    .filter((candidate) => new Date(candidate.termEndDate) < now)
    .sort((a, b) => new Date(b.termEndDate) - new Date(a.termEndDate))[0];
  if (!term) {
    throw new Error('The semester-standing demo data requires a completed academic term.');
  }

  const coordinator = users.find((user) => user.role === 'Coordinator');
  if (!coordinator) {
    throw new Error('The semester-standing demo data requires the seeded Coordinator.');
  }

  const ordinal = semesterOrdinal(term.academicYear, term.season);
  const finalizedAt = new Date(new Date(term.termEndDate).getTime() + 24 * 60 * 60 * 1000);
  const rows = eligibleStudents.map((student) => {
    const standing = student.academicStanding === 'Probation' ? 'Probation' : 'Good Standing';
    return {
      student: student._id,
      term: term._id,
      academicYear: term.academicYear,
      season: term.season,
      ordinal,
      cumulativeGpa: standing === 'Probation' ? 3.7 : 3.5,
      standing,
      revision: 1,
      finalizedAt,
      finalizedBy: coordinator._id,
      checkPending: false,
    };
  });

  await SemesterStanding.insertMany(rows);
  return rows.length;
};

module.exports = {
  seedSlotChangeRequests,
  seedExitExamRequests,
  seedSemesterStandingHistory,
};

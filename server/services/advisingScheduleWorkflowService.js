const mongoose = require('mongoose');
const AcademicTerm = require('../models/AcademicTerm');
const AdvisingScheduleDraft = require('../models/AdvisingScheduleDraft');
const Course = require('../models/Course');
const CourseOffering = require('../models/CourseOffering');
const CourseRecord = require('../models/CourseRecord');
const CourseSlot = require('../models/CourseSlot');
const ExtraHoursRequest = require('../models/ExtraHoursRequest');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const { buildAcademicHistory } = require('./academicHistoryService');
const { deriveAllowance } = require('./advisingOverviewService');
const { buildMandatoryCandidates } = require('./mandatoryCourseService');
const { slotsOverlap } = require('./conflictService');
const { idOf, requiredCount, validateAdvisingDraft } = require('./advisingScheduleValidation');

const EDITABLE_STATUSES = new Set(['Not Started', 'Draft', 'Reopened']);
const SCHEDULE_STATUSES = ['Draft', 'Active', 'Processed'];
const TRANSACTION_OPTIONS = {
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
};

const fail = (status, message, details = undefined) =>
  Object.assign(new Error(message), { status, details });

const withSession = (query, session) => query.session(session);

const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    }, TRANSACTION_OPTIONS);
    return result;
  } finally {
    await session.endSession();
  }
};

const canManageStudent = (user, student) =>
  user?.role === 'Coordinator' ||
  (user?.role === 'Advisor' && idOf(student.assignedAdvisor) === String(user.userId));

const loadStudentForEdit = async ({ user, studentId, termId, session, expectedStatus = null }) => {
  if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(termId)) {
    throw fail(400, 'Choose a valid advising student and academic term.');
  }

  const student = await withSession(Student.findById(studentId), session);
  if (!student || student.studentType !== 'Advising Student') {
    throw fail(404, 'Advising student not found.');
  }
  if (!canManageStudent(user, student)) throw fail(403, 'You can only manage students assigned to you.');
  if (expectedStatus && ![].concat(expectedStatus).includes(student.workflowStatus)) {
    const expected = [].concat(expectedStatus).join(' or ');
    throw fail(409, `The schedule must be ${expected}; it is currently ${student.workflowStatus}.`);
  }
  if (!expectedStatus && !EDITABLE_STATUSES.has(student.workflowStatus)) {
    throw fail(409, 'This advising schedule is no longer an editable draft.');
  }

  const term = await withSession(AcademicTerm.findById(termId), session);
  if (!term) throw fail(404, 'Academic term not found.');

  return { student, term };
};

const lockStudent = async (studentId, session) => {
  if (!mongoose.isValidObjectId(studentId)) throw fail(400, 'That student link is not valid.');
  const result = await Student.updateOne(
    { _id: studentId },
    { $inc: { __v: 1 }, $set: { lastUpdateAt: new Date() } },
    { session }
  );
  if (!result.matchedCount) throw fail(404, 'Advising student not found.');
};

const loadScheduleRows = ({ studentId, termId, session }) =>
  withSession(
    StudentSchedule.find({ studentId, termId, status: { $in: SCHEDULE_STATUSES } })
      .populate({
        path: 'slotId',
        populate: { path: 'offeringId', populate: { path: 'courseId' } },
      })
      .lean(),
    session
  );

const loadDraftValidation = async ({ student, term, session }) => {
  const draft = await withSession(
    AdvisingScheduleDraft.findOne({ student: student._id, term: term._id }).populate(
      'courses.course',
      'code name courseType creditHours lectureHours tutorialHours labHours prerequisites majors recommendedSemester offeringSeasons isActive'
    ),
    session
  );
  if (!draft) {
    return {
      draft: null,
      rows: [],
      validation: { valid: false, selectedHours: 0, allowedHours: 0, issues: [{ code: 'missing-draft', message: 'Create a draft schedule before marking it ready.' }] },
    };
  }

  let mandatoryCandidates;
  let courseRecords;
  let scheduleRows;
  let history;
  let extraRequests;
  if (session) {
    mandatoryCandidates = await buildMandatoryCandidates(student);
    courseRecords = await withSession(
      CourseRecord.find({ student: student._id }).select('course status grade').lean(),
      session
    );
    scheduleRows = await loadScheduleRows({ studentId: student._id, termId: term._id, session });
    history = await buildAcademicHistory(student);
    extraRequests = await withSession(
      ExtraHoursRequest.find({
        student: student._id,
        term: term._id,
        decision: 'Approved',
        settlementStatus: { $in: ['Awaiting Payment Choice', 'Paid', 'Deferred to Next Installment'] },
      })
        .select('requestedHours activatedHours')
        .lean(),
      session
    );
  } else {
    [mandatoryCandidates, courseRecords, scheduleRows, history, extraRequests] = await Promise.all([
      buildMandatoryCandidates(student),
      CourseRecord.find({ student: student._id }).select('course status grade').lean(),
      loadScheduleRows({ studentId: student._id, termId: term._id, session: null }),
      buildAcademicHistory(student),
      ExtraHoursRequest.find({
        student: student._id,
        term: term._id,
        decision: 'Approved',
        settlementStatus: { $in: ['Awaiting Payment Choice', 'Paid', 'Deferred to Next Installment'] },
      })
        .select('requestedHours activatedHours')
        .lean(),
    ]);
  }

  const courseIds = draft.courses.map((entry) => entry.course?._id).filter(Boolean);
  const offerings = await withSession(
    CourseOffering.find({ termId: term._id, courseId: { $in: courseIds } })
      .populate('courseId', 'code name')
      .lean(),
    session
  );
  const offeringIds = offerings.map((offering) => offering._id);
  const slotDocs = await withSession(
    CourseSlot.find({ offeringId: { $in: offeringIds } }).lean(),
    session
  );
  const slotIds = slotDocs.map((slot) => slot._id);
  const occupancyRows = slotIds.length
    ? await withSession(StudentSchedule.find({ slotId: { $in: slotIds } }).select('slotId').lean(), session)
    : [];
  const slotOccupancy = new Map();
  occupancyRows.forEach((row) => {
    const key = String(row.slotId);
    slotOccupancy.set(key, (slotOccupancy.get(key) ?? 0) + 1);
  });

  const allowance = deriveAllowance({ student, gpa: history.summary.gpa });
  const approvedExtraHours = extraRequests.reduce(
    (total, request) => total + (Number(request.activatedHours) || Number(request.requestedHours) || 0),
    0
  );
  const courses = draft.courses.filter((entry) => entry.course);
  const assignments = scheduleRows.filter((row) => row.slotId);
  const validation = validateAdvisingDraft({
    courses,
    mandatoryCandidates,
    courseRecords,
    offerings,
    assignments,
    slotOccupancy,
    allowedHours: allowance.allowedHours,
    approvedExtraHours,
    bachelorProject: draft.bachelorProject ?? null,
  });

  return { draft, rows: assignments, offerings, slots: slotDocs, slotOccupancy, validation };
};

const serializeSlot = (slot, occupancy, assignedToStudent, clashes) => ({
  id: String(slot._id),
  slotType: slot.slotType,
  groupNumber: slot.groupNumber,
  dayOfWeek: slot.dayOfWeek,
  startTime: slot.startTime,
  endTime: slot.endTime,
  roomId: slot.roomId,
  maxCapacity: slot.maxCapacity,
  assignedCount: occupancy,
  remainingCapacity: Math.max(0, Number(slot.maxCapacity) - occupancy + (assignedToStudent ? 1 : 0)),
  assignedToStudent,
  clashes,
});

const buildSlotAssignments = ({ courses, offerings, rows, slots, slotOccupancy }) => {
  const offeringsByCourse = new Map();
  const slotsByOffering = new Map();
  const assignedByCourse = new Map();

  offerings.forEach((offering) => {
    offeringsByCourse.set(idOf(offering.courseId), offering);
  });
  slots.forEach((slot) => {
    const offeringId = String(slot.offeringId);
    slotsByOffering.set(offeringId, [...(slotsByOffering.get(offeringId) ?? []), slot]);
  });
  rows.forEach((row) => {
    const courseId = idOf(row.slotId?.offeringId?.courseId);
    if (courseId) assignedByCourse.set(courseId, [...(assignedByCourse.get(courseId) ?? []), row]);
  });

  return courses.map((entry) => {
    const course = entry.course;
    const courseId = idOf(course);
    const offering = offeringsByCourse.get(courseId) ?? null;
    const courseRows = assignedByCourse.get(courseId) ?? [];
    const availableSlots = offering ? slotsByOffering.get(String(offering._id)) ?? [] : [];
    const components = ['Lecture', 'Tutorial', 'Lab'].map((slotType) => {
      const required = requiredCount(course, slotType);
      const componentRows = courseRows.filter((row) => row.slotId?.slotType === slotType);
      return {
        slotType,
        required,
        assignments: componentRows.map((row) => {
          const current = row.slotId;
          const clashes = rows
            .filter((other) => String(other._id) !== String(row._id) && slotsOverlap(current, other.slotId))
            .map((other) => String(other._id));
          return {
            id: String(row._id),
            slot: serializeSlot(current, slotOccupancy.get(String(current._id)) ?? 0, true, clashes),
          };
        }),
        options: availableSlots
          .filter((slot) => slot.slotType === slotType)
          .map((slot) => {
            const assignedToStudent = courseRows.some((row) => String(row.slotId?._id) === String(slot._id));
            const clashes = rows
              .filter((row) => String(row.slotId?._id) !== String(slot._id) && slotsOverlap(slot, row.slotId))
              .map((row) => String(row._id));
            return serializeSlot(slot, slotOccupancy.get(String(slot._id)) ?? 0, assignedToStudent, clashes);
          }),
      };
    });
    return { courseId, components };
  });
};

const requireDraftCourse = async ({ studentId, termId, courseId, session }) => {
  const draft = await withSession(
    AdvisingScheduleDraft.findOne({ student: studentId, term: termId }).select('courses').lean(),
    session
  );
  if (!draft || !draft.courses.some((entry) => idOf(entry.course) === String(courseId))) {
    throw fail(409, 'Save this course in the draft before assigning its slots.');
  }
  const course = await withSession(Course.findById(courseId), session);
  if (!course || course.isActive === false) throw fail(404, 'Course not found or inactive.');
  return course;
};

const loadStudentRowsForEdit = ({ studentId, termId, session }) =>
  withSession(
    StudentSchedule.find({ studentId, termId, status: 'Draft' }).populate({
      path: 'slotId',
      populate: { path: 'offeringId', populate: { path: 'courseId' } },
    }),
    session
  );

const ensureNoClash = (candidate, rows, excludedRowId = null) => {
  const conflicting = rows.find(
    (row) => String(row._id) !== String(excludedRowId) && row.slotId && slotsOverlap(candidate, row.slotId)
  );
  if (conflicting) {
    throw fail(409, `That slot clashes with an assigned ${conflicting.slotId.slotType.toLowerCase()} group ${conflicting.slotId.groupNumber}.`);
  }
};

const reserveSlot = async (slot, session) => {
  const occupants = await withSession(StudentSchedule.countDocuments({ slotId: slot._id }), session);
  await CourseSlot.updateOne({ _id: slot._id }, { $set: { assignedCount: occupants } }, { session });
  const reserved = await CourseSlot.updateOne(
    { _id: slot._id, $expr: { $lt: ['$assignedCount', '$maxCapacity'] } },
    { $inc: { assignedCount: 1 } },
    { session }
  );
  if (reserved.modifiedCount !== 1) throw fail(409, `Lecture/tutorial/lab group ${slot.groupNumber} is full.`);
};

const reconcileSlotCount = async (slotId, session) => {
  const occupants = await withSession(StudentSchedule.countDocuments({ slotId }), session);
  await CourseSlot.updateOne({ _id: slotId }, { $set: { assignedCount: occupants } }, { session });
};

const assignCourseSlot = async ({ user, studentId, termId, courseId, slotType, slotId }) =>
  runInTransaction(async (session) => {
    await lockStudent(studentId, session);
    const { student, term } = await loadStudentForEdit({ user, studentId, termId, session });
    if (!['Lecture', 'Tutorial', 'Lab'].includes(slotType)) throw fail(400, 'Choose a lecture, tutorial or lab slot.');
    const course = await requireDraftCourse({ studentId, termId: term._id, courseId, session });
    const offering = await withSession(
      CourseOffering.findOne({ courseId: course._id, termId: term._id, publicationStatus: 'Published' }),
      session
    );
    if (!offering) throw fail(409, 'This course has no published offering for the selected term.');
    const slot = await withSession(CourseSlot.findById(slotId), session);
    if (!slot || String(slot.offeringId) !== String(offering._id) || slot.slotType !== slotType) {
      throw fail(400, 'Choose an available slot for this course and component.');
    }

    const rows = await loadStudentRowsForEdit({ studentId: student._id, termId: term._id, session });
    const sameComponent = rows.filter(
      (row) => String(row.slotId?.offeringId?.courseId?._id) === String(course._id) && row.slotId?.slotType === slotType
    );
    const required = requiredCount(course, slotType);
    if (sameComponent.length >= required) throw fail(409, `All required ${slotType.toLowerCase()} slots are already assigned.`);
    ensureNoClash(slot, rows);
    await reserveSlot(slot, session);
    await StudentSchedule.create([{ studentId: student._id, termId: term._id, slotId: slot._id, status: 'Draft' }], { session });
    student.lastUpdateAt = new Date();
    await student.save({ session });
    return { message: `${slotType} group ${slot.groupNumber} assigned to ${course.code}.` };
  });

const changeCourseSlot = async ({ user, studentId, termId, scheduleId, slotId }) =>
  runInTransaction(async (session) => {
    await lockStudent(studentId, session);
    const { student, term } = await loadStudentForEdit({ user, studentId, termId, session });
    const row = await withSession(
      StudentSchedule.findOne({ _id: scheduleId, studentId: student._id, termId: term._id, status: 'Draft' }).populate({
        path: 'slotId',
        populate: { path: 'offeringId', populate: { path: 'courseId' } },
      }),
      session
    );
    if (!row?.slotId) throw fail(404, 'Draft slot assignment not found.');
    const nextSlot = await withSession(CourseSlot.findById(slotId), session);
    if (!nextSlot || String(nextSlot.offeringId) !== String(row.slotId.offeringId?._id) || nextSlot.slotType !== row.slotId.slotType) {
      throw fail(400, 'Choose another slot for the same course and component.');
    }
    if (String(nextSlot._id) === String(row.slotId._id)) return { message: 'This slot is already assigned.' };

    const rows = await loadStudentRowsForEdit({ studentId: student._id, termId: term._id, session });
    ensureNoClash(nextSlot, rows, row._id);
    await reserveSlot(nextSlot, session);
    row.slotId = nextSlot._id;
    await row.save({ session });
    const oldSlotId = rows.find((item) => String(item._id) === String(row._id))?.slotId?._id;
    await reconcileSlotCount(oldSlotId, session);
    student.lastUpdateAt = new Date();
    await student.save({ session });
    return { message: `${nextSlot.slotType} assignment changed to group ${nextSlot.groupNumber}.` };
  });

const removeCourseSlot = async ({ user, studentId, termId, scheduleId }) =>
  runInTransaction(async (session) => {
    await lockStudent(studentId, session);
    const { student, term } = await loadStudentForEdit({ user, studentId, termId, session });
    const row = await withSession(
      StudentSchedule.findOne({ _id: scheduleId, studentId: student._id, termId: term._id, status: 'Draft' }),
      session
    );
    if (!row) throw fail(404, 'Draft slot assignment not found.');
    const oldSlotId = row.slotId;
    await row.deleteOne({ session });
    await reconcileSlotCount(oldSlotId, session);
    student.lastUpdateAt = new Date();
    await student.save({ session });
    return { message: 'Slot removed from the draft schedule.' };
  });

const removeCourseFromDraft = async ({ user, studentId, termId, courseId }) =>
  runInTransaction(async (session) => {
    await lockStudent(studentId, session);
    const { student, term } = await loadStudentForEdit({ user, studentId, termId, session });
    const draft = await withSession(
      AdvisingScheduleDraft.findOne({ student: student._id, term: term._id }),
      session
    );
    if (!draft) throw fail(404, 'Draft schedule not found.');
    const entry = draft.courses.find((item) => idOf(item.course) === String(courseId));
    if (!entry || entry.mandatory) throw fail(404, 'That non-mandatory course is not in this draft schedule.');

    const offering = await withSession(
      CourseOffering.findOne({ courseId, termId: term._id }).select('_id'),
      session
    );
    if (offering) {
      const slots = await withSession(
        CourseSlot.find({ offeringId: offering._id }).select('_id'),
        session
      );
      const slotIds = slots.map((slot) => slot._id);
      if (slotIds.length) {
        await StudentSchedule.deleteMany({
          studentId: student._id,
          termId: term._id,
          status: 'Draft',
          slotId: { $in: slotIds },
        }, { session });
        for (const slotId of slotIds) await reconcileSlotCount(slotId, session);
      }
    }

    draft.courses.pull({ course: courseId, mandatory: false });
    draft.updatedBy = user.userId;
    await draft.save({ session });
    student.lastUpdateAt = new Date();
    await student.save({ session });
    return { draft };
  });

const validateForStudent = async ({ user, studentId, termId, session = null, expectedStatus = null }) => {
  const { student, term } = await loadStudentForEdit({ user, studentId, termId, session, expectedStatus });
  return { student, term, ...(await loadDraftValidation({ student, term, session })) };
};

const markReadyForReview = async ({ user, studentId, termId }) =>
  runInTransaction(async (session) => {
    await lockStudent(studentId, session);
    const result = await validateForStudent({ user, studentId, termId, session });
    if (!result.validation.valid) {
      throw fail(409, 'Resolve the draft validation issues before sending it for student review.', result.validation);
    }
    await StudentSchedule.updateMany(
      { studentId: result.student._id, termId: result.term._id, status: 'Draft' },
      { $set: { status: 'Active' } },
      { session }
    );
    result.student.workflowStatus = 'Ready for Student Review';
    result.student.lastUpdateAt = new Date();
    await result.student.save({ session });
    return { validation: result.validation, workflowStatus: result.student.workflowStatus };
  });

const assertNoProcessingBlockers = async ({ studentId, termId, session }) => {
  const pendingSlotChange = await withSession(
    SlotChangeRequest.exists({ student: studentId, term: termId, status: 'Pending' }),
    session
  );
  const unresolvedExtraHours = await withSession(
    ExtraHoursRequest.exists({
      student: studentId,
      term: termId,
      $or: [
        { decision: 'Pending' },
        { decision: 'Approved', settlementStatus: 'Awaiting Payment Choice' },
      ],
    }),
    session
  );
  if (pendingSlotChange) throw fail(409, 'Resolve all pending slot-change requests before processing this schedule.');
  if (unresolvedExtraHours) throw fail(409, 'Resolve the required approval or payment choice before processing this schedule.');
};

const assertValidForProcessing = async ({ user, studentId, termId, session }) => {
  const result = await validateForStudent({
    user,
    studentId,
    termId,
    session,
    expectedStatus: ['Ready for Student Review', 'Ready to Process'],
  });
  if (!result.validation.valid) {
    throw fail(409, 'Resolve the draft validation issues before processing this schedule.', result.validation);
  }
  await assertNoProcessingBlockers({ studentId: result.student._id, termId: result.term._id, session });
  return result;
};

const processSchedule = async ({ user, studentId, termId }) =>
  runInTransaction(async (session) => {
    await lockStudent(studentId, session);
    const result = await assertValidForProcessing({ user, studentId, termId, session });
    await StudentSchedule.updateMany(
      { studentId: result.student._id, termId: result.term._id, status: { $in: ['Draft', 'Active'] } },
      { $set: { status: 'Processed' } },
      { session }
    );
    result.student.workflowStatus = 'Processed';
    result.student.lastUpdateAt = new Date();
    await result.student.save({ session });
    return { student: result.student, term: result.term, validation: result.validation };
  });

const reopenSchedule = async ({ user, studentId, termId, reason }) =>
  runInTransaction(async (session) => {
    const normalizedReason = String(reason ?? '').trim();
    if (!normalizedReason) throw fail(400, 'A reopening reason is required.');
    await lockStudent(studentId, session);
    const { student, term } = await loadStudentForEdit({
      user,
      studentId,
      termId,
      session,
      expectedStatus: 'Processed',
    });
    await StudentSchedule.updateMany(
      { studentId: student._id, termId: term._id, status: 'Processed' },
      { $set: { status: 'Draft' } },
      { session }
    );
    student.workflowStatus = 'Reopened';
    student.lastUpdateAt = new Date();
    await student.save({ session });
    return { student, term, reason: normalizedReason };
  });

const createPendingSlotChangeRequest = async ({ studentId, termId, request }) =>
  runInTransaction(async (session) => {
    await lockStudent(studentId, session);
    const student = await withSession(Student.findById(studentId), session).lean();
    if (!student || student.studentType !== 'Advising Student') {
      throw fail(404, 'Advising student not found.');
    }
    if (student.workflowStatus !== 'Ready for Student Review') {
      throw fail(409, `Slot-change requests can only be submitted while the schedule is Ready for Student Review; it is now ${student.workflowStatus}.`);
    }
    const entry = await withSession(
      StudentSchedule.findOne({
        _id: request.scheduleEntry,
        studentId,
        slotId: request.currentSlot,
        termId,
        status: 'Active',
      }).select('_id'),
      session
    );
    if (!entry) throw fail(409, 'That slot is no longer part of the schedule under review.');
    const duplicate = await withSession(
      SlotChangeRequest.exists({ student: studentId, currentSlot: request.currentSlot, status: 'Pending' }),
      session
    );
    if (duplicate) throw fail(409, 'You already have a pending change request for this slot.');

    const [created] = await SlotChangeRequest.create([request], { session });
    return created;
  });

module.exports = {
  EDITABLE_STATUSES,
  runInTransaction,
  loadDraftValidation,
  buildSlotAssignments,
  assignCourseSlot,
  changeCourseSlot,
  removeCourseSlot,
  removeCourseFromDraft,
  validateForStudent,
  markReadyForReview,
  assertValidForProcessing,
  processSchedule,
  reopenSchedule,
  createPendingSlotChangeRequest,
  loadStudentForEdit,
  canManageStudent,
};
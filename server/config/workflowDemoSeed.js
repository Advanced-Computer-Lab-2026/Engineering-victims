const StudentSchedule = require('../models/StudentSchedule');
const CourseSlot = require('../models/CourseSlot');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const ExitExamRequest = require('../models/ExitExamRequest');
const SemesterStanding = require('../models/SemesterStanding');
const GraduationPlan = require('../models/GraduationPlan');
const { deadlineEnd } = require('../services/schedulingPreferenceService');
const { remainingCoursesFor } = require('../services/graduationPlanService');
const { validateRequest } = require('../services/exitExamRequestService');
const { semesterOrdinal } = require('../services/probationService');

const EXIT_EXAM_STUDENT_ID = '64-30011';

const PREFERENCE_NOTES = {
  Lecture: 'A different lecture group on Sunday would fit my schedule better.',
  Tutorial: 'A later tutorial group would suit my timetable better.',
  Lab: 'A lab group on Wednesday would be preferable if available.',
};

const seedSlotChangeRequests = async ({ students, terms, courses, now = new Date() }) => {
  const readyStudents = students.filter(
    (student) =>
      student.studentType === 'Advising Student' &&
      student.workflowStatus === 'Ready for Student Review'
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
      addedTypes.add(slot.slotType);
    }
  }

  if (!requestDocs.length) {
    throw new Error('The slot-change demo data could not find any assigned slots to request.');
  }

  await SlotChangeRequest.insertMany(requestDocs);
  return requestDocs.length;
};

const seedExitExamRequests = async ({ students, users }) => {
  const student = students.find((candidate) => candidate.studentId === EXIT_EXAM_STUDENT_ID);
  if (!student || student.studentType !== 'Advising Student' || !student.assignedAdvisor) {
    throw new Error(`The exit-exam demo data requires assigned Advising Student ${EXIT_EXAM_STUDENT_ID}.`);
  }

  const advisor = users.find(
    (user) => user.role === 'Advisor' && String(user._id) === String(student.assignedAdvisor)
  );
  if (!advisor) {
    throw new Error(`The exit-exam demo data could not find ${student.studentId}'s Advisor.`);
  }

  const draftPlan = await GraduationPlan.exists({
    student: student._id,
    advisor: advisor._id,
    status: 'Draft',
  });
  if (!draftPlan) {
    throw new Error(`The exit-exam demo data requires a draft graduation plan for ${student.studentId}.`);
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

  await ExitExamRequest.create({
    student: student._id,
    advisor: advisor._id,
    course: course.id,
    reason,
    status: 'Pending',
  });
  return 1;
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

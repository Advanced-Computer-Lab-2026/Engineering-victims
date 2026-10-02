const AcademicTerm = require('../models/AcademicTerm');
const StudentSchedule = require('../models/StudentSchedule');

/**
 * Req 31: a student's current weekly schedule.
 *
 * Schedules are stored as one StudentSchedule row per course slot. A row's
 * status says how far the schedule has got:
 *   Draft     - an Advisor is still building it (incomplete);
 *   Active    - a completed draft that is in play (review, approval, payment);
 *   Processed - the final schedule.
 * The offering screens already treat Active and Processed as "in use" when an
 * offering is unpublished, so the same three meanings are kept here.
 */

/** The GUC teaching week. Friday is the weekend and is only shown if used. */
const TEACHING_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const WEEK_ORDER = [...TEACHING_DAYS, 'Friday'];

/**
 * Where an Advising Student's schedule stands, from their workflow status.
 * The workflow status is calculated by workflowService, so it is the single
 * source of truth for whether a draft is complete or still being built.
 */
const ADVISING_STAGE = {
  'Not Started': null,
  Draft: 'Draft',
  Reopened: 'Draft',
  'Ready for Student Review': 'Review-ready',
  'Change Request Pending': 'Review-ready',
  'Pending Approval': 'Review-ready',
  'Awaiting Payment Choice': 'Review-ready',
  'Deferred to Next Installment': 'Review-ready',
  'Ready to Process': 'Review-ready',
  Processed: 'Processed',
};

/** Stages an Advising Student may see. Incomplete drafts stay hidden from them. */
const STUDENT_VISIBLE_STAGES = new Set(['Review-ready', 'Processed']);

const stageFor = (student) =>
  student.studentType === 'Advising Student' ? ADVISING_STAGE[student.workflowStatus] ?? null : 'Processed';

const termLabel = (term) => `${term.academicYear} ${term.season}`;

/**
 * "Current" means the term running today. A student whose schedule is for a
 * term that has not started yet (an even-semester student registered for
 * Spring) gets that upcoming term instead, and only if nothing is current or
 * upcoming does the latest past term show.
 */
const pickTerm = (terms, now = new Date()) => {
  const running = terms.find((term) => term.termStartDate <= now && term.termEndDate >= now);
  if (running) return running;

  const upcoming = terms
    .filter((term) => term.termStartDate > now)
    .sort((a, b) => a.termStartDate - b.termStartDate)[0];
  if (upcoming) return upcoming;

  return [...terms].sort((a, b) => b.termEndDate - a.termEndDate)[0] ?? null;
};

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Builds the schedule a given viewer is allowed to see.
 *
 * `asStudent` is true when the student is looking at their own schedule, which
 * is when the visibility rules apply: a Normal Student sees only their
 * processed schedule, and an Advising Student sees nothing until their draft
 * is complete and marked Ready for Student Review.
 */
const buildWeeklySchedule = async (student, { asStudent }) => {
  const stage = stageFor(student);
  const base = {
    stage,
    workflowStatus: student.workflowStatus,
    visible: false,
    hiddenReason: null,
    term: null,
    days: [],
    daysOff: [],
    sessions: [],
  };

  if (!stage) {
    return { ...base, hiddenReason: 'No schedule has been started yet.' };
  }
  if (asStudent && !STUDENT_VISIBLE_STAGES.has(stage)) {
    return {
      ...base,
      // The draft exists but is incomplete, so even its existence is all the
      // student is told; no session data is sent.
      stage: null,
      hiddenReason: 'Your advisor is still preparing your schedule. You will see it once it is ready for your review.',
    };
  }

  // A Normal Student's schedule is only ever the processed one.
  const statuses = student.studentType === 'Normal Student' ? ['Processed'] : ['Draft', 'Active', 'Processed'];
  const rows = await StudentSchedule.find({ studentId: student._id, status: { $in: statuses } })
    .populate({
      path: 'slotId',
      populate: [
        { path: 'offeringId', populate: { path: 'courseId', select: 'code name creditHours' } },
        { path: 'instructorId', select: 'fullName' },
      ],
    })
    .lean();

  const termIds = [...new Set(rows.map((row) => String(row.termId)))];
  const terms = await AcademicTerm.find({ _id: { $in: termIds } }).lean();
  const term = pickTerm(terms);
  if (!term) {
    return { ...base, hiddenReason: 'No schedule has been registered yet.' };
  }

  const sessions = rows
    .filter((row) => String(row.termId) === String(term._id) && row.slotId?.offeringId?.courseId)
    .map((row) => {
      const slot = row.slotId;
      const course = slot.offeringId.courseId;
      return {
        id: row._id,
        courseCode: course.code,
        courseName: course.name,
        creditHours: course.creditHours,
        slotType: slot.slotType,
        groupNumber: slot.groupNumber,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.roomId,
        instructor: slot.instructorId?.fullName ?? null,
      };
    })
    .sort(
      (a, b) =>
        WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
        toMinutes(a.startTime) - toMinutes(b.startTime)
    );

  const usedDays = new Set(sessions.map((session) => session.dayOfWeek));
  const days = WEEK_ORDER.filter((day) => TEACHING_DAYS.includes(day) || usedDays.has(day));

  return {
    ...base,
    visible: true,
    term: {
      id: term._id,
      label: termLabel(term),
      termStartDate: term.termStartDate,
      termEndDate: term.termEndDate,
    },
    days,
    // A day off is a teaching day with nothing on it; Friday is the weekend.
    daysOff: TEACHING_DAYS.filter((day) => !usedDays.has(day)),
    sessions,
  };
};

module.exports = { buildWeeklySchedule, stageFor, ADVISING_STAGE, TEACHING_DAYS };

const mongoose = require('mongoose');
const AcademicTerm = require('../models/AcademicTerm');
const StudentSchedule = require('../models/StudentSchedule');
const SlotChangeRequest = require('../models/SlotChangeRequest');
const { deadlineEnd } = require('./schedulingPreferenceService');

const { SLOT_TYPES, NOTE_LIMIT } = SlotChangeRequest;

/** The only workflow status in which a student may ask for a slot change. */
const REVIEW_STATUS = 'Ready for Student Review';

/**
 * Req 40: whether this Advising Student may submit a slot-change request now,
 * and against which term.
 *
 * The term is the one the student's completed schedule belongs to — the term
 * of their latest Active rows — not whichever term has the next advising
 * deadline, so the deadline checked is the deadline of the schedule being
 * reviewed. Returns { term, isOpen, reason }: `reason` says why it is closed,
 * and `status` is the HTTP status to answer a submission with in that case.
 */
const reviewWindowFor = async (student, now = new Date()) => {
  if (student.workflowStatus !== REVIEW_STATUS) {
    return {
      term: null,
      isOpen: false,
      status: 409,
      reason: 'Slot-change requests can only be made while your schedule is Ready for Student Review.',
    };
  }

  const latest = await StudentSchedule.findOne({ studentId: student._id, status: 'Active' })
    .sort({ createdAt: -1 })
    .select('termId')
    .lean();
  const term = latest ? await AcademicTerm.findById(latest.termId).lean() : null;
  if (!term) {
    return {
      term: null,
      isOpen: false,
      status: 409,
      reason: 'You have no completed schedule to request a change in.',
    };
  }

  if (deadlineEnd(term) < now) {
    return {
      term,
      isOpen: false,
      status: 403,
      reason: `The advising deadline for ${term.academicYear} ${term.season} has passed, so slot-change requests can no longer be made.`,
    };
  }

  return { term, isOpen: true, status: 200, reason: null };
};

/**
 * Cleans and checks a submitted request body. Only the four known fields are
 * read, so nothing else in the body can reach the database. Returns the clean
 * values, or { error } with a message the student can act on.
 */
const validateRequestInput = (body) => {
  const { courseId, slotType, slotId, preferenceNote } = body ?? {};

  if (!courseId || !mongoose.isValidObjectId(courseId)) return { error: 'Choose the course the slot belongs to.' };
  if (!SLOT_TYPES.includes(slotType)) return { error: 'Component type must be Lecture, Tutorial or Lab.' };
  if (!slotId || !mongoose.isValidObjectId(slotId)) return { error: 'Choose the slot you want changed.' };

  if (preferenceNote != null && typeof preferenceNote !== 'string') {
    return { error: 'The preference note must be text.' };
  }
  const note = (preferenceNote ?? '').trim();
  if (note.length > NOTE_LIMIT) return { error: `The preference note can be at most ${NOTE_LIMIT} characters.` };

  return { courseId: String(courseId), slotType, slotId: String(slotId), preferenceNote: note };
};

module.exports = { reviewWindowFor, validateRequestInput, REVIEW_STATUS };

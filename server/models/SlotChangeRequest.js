const mongoose = require('mongoose');

/**
 * Req 40: an Advising Student's request to change one assigned lecture,
 * tutorial or lab slot in their completed (Ready for Student Review) schedule.
 *
 * A request never changes the schedule itself (the student cannot move their
 * own slot); it only records what they asked for. The status and response
 * fields are declared now, empty, so the later requirements that read,
 * withdraw and resolve requests (41-48) reuse this collection as it is:
 *   Pending   - submitted, waiting on an Advisor or Coordinator (req 40);
 *   Withdrawn - pulled back by the student (req 42);
 *   Approved  - resolved with `replacementSlot` (req 48);
 *   Rejected  - resolved without a change (req 48).
 */
const STATUSES = ['Pending', 'Approved', 'Rejected', 'Withdrawn'];
const SLOT_TYPES = ['Lecture', 'Tutorial', 'Lab'];
const NOTE_LIMIT = 500;

/**
 * The current slot as it was when the request was made. An approval later
 * moves the student to another slot (and an Administrator may edit the slot),
 * so the request keeps its own copy of what "current" meant.
 */
const slotSnapshotSchema = new mongoose.Schema(
  {
    groupNumber: { type: Number, required: true },
    dayOfWeek: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    room: { type: String, required: true },
  },
  { _id: false }
);

const slotChangeRequestSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
    /** The exact StudentSchedule row the request is about. */
    scheduleEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentSchedule', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    offering: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true },
    slotType: { type: String, enum: SLOT_TYPES, required: true },
    currentSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseSlot', required: true },
    currentSlotSnapshot: { type: slotSnapshotSchema, required: true },
    /** Optional free text, e.g. a preferred group or day. */
    preferenceNote: { type: String, trim: true, maxlength: NOTE_LIMIT, default: '' },
    status: { type: String, enum: STATUSES, default: 'Pending', required: true },

    // Filled in by later requirements; empty for every request req 40 creates.
    replacementSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseSlot', default: null },
    responseNote: { type: String, trim: true, maxlength: NOTE_LIMIT, default: '' },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A slot can have at most one open request at a time. Partial, so a slot whose
// earlier request was rejected or withdrawn can be requested again, and unique
// at the database level so two simultaneous submissions cannot both succeed.
slotChangeRequestSchema.index(
  { student: 1, currentSlot: 1 },
  { unique: true, partialFilterExpression: { status: 'Pending' } }
);
// The student's own list, newest first (req 41).
slotChangeRequestSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model('SlotChangeRequest', slotChangeRequestSchema);
module.exports.STATUSES = STATUSES;
module.exports.SLOT_TYPES = SLOT_TYPES;
module.exports.NOTE_LIMIT = NOTE_LIMIT;

const mongoose = require('mongoose');

const STATUSES = ['Pending', 'Approved', 'Rejected'];
const NOTE_LIMIT = 1000;

/**
 * Req 64: the valid cases for asking that a mandatory course be removed.
 * Stored as the wording the screens show, so a request reads the same in the
 * Advisor's history and the Coordinator's queue.
 */
const CATEGORIES = [
  'First-makeup eligibility',
  'Second-makeup eligibility',
  'Completed more than 157 hours',
  'Restricted course pair in the same term',
];

/**
 * Req 64-69: an Advisor's request to remove one mandatory course from one
 * advising student's mandatory list, and the Coordinator's decision on it.
 */
const mandatoryRemovalRequestSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    advisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    /** Only for a restricted pair: the other course of the pair. */
    pairedCourse: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    reason: { type: String, trim: true, required: true, maxlength: NOTE_LIMIT },
    status: { type: String, enum: STATUSES, default: 'Pending', required: true },
    responseNote: { type: String, trim: true, default: '', maxlength: NOTE_LIMIT },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

mandatoryRemovalRequestSchema.index({ student: 1, createdAt: -1 });
mandatoryRemovalRequestSchema.index({ status: 1, createdAt: -1 });
// One open request per student and course. A rejected one may be followed by a
// new request, so only Pending rows are held unique.
mandatoryRemovalRequestSchema.index(
  { student: 1, course: 1 },
  { unique: true, partialFilterExpression: { status: 'Pending' } }
);

module.exports = mongoose.model('MandatoryRemovalRequest', mandatoryRemovalRequestSchema);
module.exports.STATUSES = STATUSES;
module.exports.CATEGORIES = CATEGORIES;
module.exports.NOTE_LIMIT = NOTE_LIMIT;

const mongoose = require('mongoose');

const STATUSES = ['Pending', 'Approved', 'Rejected'];
const NOTE_LIMIT = 1000;

const exitExamRequestSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    advisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    reason: { type: String, trim: true, required: true, maxlength: NOTE_LIMIT },
    status: { type: String, enum: STATUSES, default: 'Pending', required: true },
    responseNote: { type: String, trim: true, default: '', maxlength: NOTE_LIMIT },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

exitExamRequestSchema.index({ student: 1, createdAt: -1 });
exitExamRequestSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('ExitExamRequest', exitExamRequestSchema);
module.exports.STATUSES = STATUSES;
module.exports.NOTE_LIMIT = NOTE_LIMIT;

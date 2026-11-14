const mongoose = require('mongoose');

const STATUSES = ['Open', 'Completed', 'Withdrawn', 'Expired'];

const slotSnapshotSchema = new mongoose.Schema(
  {
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseSlot', required: true },
    courseCode: { type: String, required: true },
    courseName: { type: String, required: true },
    creditHours: { type: Number, default: 0 },
    slotType: { type: String, enum: ['Lecture', 'Tutorial', 'Lab'], required: true },
    groupNumber: { type: Number, required: true },
    dayOfWeek: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    roomId: { type: String, required: true },
    instructorName: { type: String, default: null },
  },
  { _id: false }
);

const swapRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicTerm',
      required: true,
      index: true,
    },
    currentGroup: {
      type: String,
      required: true,
      trim: true,
    },
    desiredGroups: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'Select at least one desired group.',
      },
    },
    courseCodesSnapshot: {
      type: [String],
      required: true,
    },
    scheduleSnapshot: {
      type: [slotSnapshotSchema],
      default: [],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'Open',
      required: true,
      index: true,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    completedFromGroup: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Req 35: a student may have at most one active (Open) swap request per term.
swapRequestSchema.index(
  { requesterId: 1, termId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Open' },
  }
);

module.exports = mongoose.model('SwapRequest', swapRequestSchema);
module.exports.STATUSES = STATUSES;

const mongoose = require('mongoose');

const ACTIONS = ['Processed', 'Reopened'];
const STAFF_ROLES = ['Advisor', 'Coordinator', 'Administrator'];

const scheduleActivityLogSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    studentName: {
      type: String,
      default: '',
      trim: true,
    },
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicTerm',
      default: null,
    },
    action: {
      type: String,
      enum: ACTIONS,
      required: true,
      index: true,
    },
    scheduleVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    staffName: {
      type: String,
      required: true,
      trim: true,
    },
    staffEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    staffRole: {
      type: String,
      required: true,
      enum: STAFF_ROLES,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

scheduleActivityLogSchema.index({ occurredAt: -1 });
scheduleActivityLogSchema.index({ student: 1, scheduleVersion: -1 });

module.exports = mongoose.model('ScheduleActivityLog', scheduleActivityLogSchema);
module.exports.ACTIONS = ACTIONS;
module.exports.STAFF_ROLES = STAFF_ROLES;

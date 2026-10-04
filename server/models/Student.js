const mongoose = require('mongoose');

/**
 * Workflow status is derived from completed actions rather than set by hand, so
 * it lives on the student document and is recalculated by the workflow service.
 */
const NORMAL_STATUSES = [
  'Schedule Assigned',
  'Swap Request Open',
  'Swap Completed',
  'Swap Withdrawn',
  'Swap Expired',
];

const ADVISING_STATUSES = [
  'Not Started',
  'Draft',
  'Ready for Student Review',
  'Change Request Pending',
  'Pending Approval',
  'Awaiting Payment Choice',
  'Deferred to Next Installment',
  'Ready to Process',
  'Processed',
  'Reopened',
];

/**
 * Req 59 names the five reasons a student is on advising in the first place.
 * They are stored rather than derived: only probation and an undeclared major
 * can be read off other fields, and "transfer" cannot be inferred at all.
 */
const ADVISING_REASONS = [
  'Probation',
  'More than 2 failed courses in a season',
  'Unattended courses',
  'Undeclared CS or DMET major',
  'Transfer from another major or university',
];

const studentSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^@\s]+@student\.guc\.edu\.eg$/, 'Student emails must end in @student.guc.edu.eg'],
    },
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{2}-\d{5}$/, 'Student IDs use the XX-XXXX format, for example 64-12345'],
    },
    studentType: {
      type: String,
      enum: ['Normal Student', 'Advising Student'],
      required: true,
      default: 'Normal Student',
    },
    major: { type: String, required: true, trim: true, default: 'Undeclared' },
    currentSemester: { type: Number, min: 1, max: 8, default: 1 },
    studyGroup: { type: String, trim: true, default: null },
    academicStanding: {
      type: String,
      enum: ['Good Standing', 'Probation', 'Dismissed'],
      default: 'Good Standing',
    },
    /**
     * Why this student is on advising (req 59). Null for Normal Students and
     * for an Advising Student nobody has profiled yet, so the "no advising
     * reason" filter option has a real target.
     */
    advisingReason: {
      type: String,
      default: null,
      validate: {
        validator: (value) => value == null || ADVISING_REASONS.includes(value),
        message: `advisingReason must be one of: ${ADVISING_REASONS.join(', ')}`,
      },
    },
    assignedAdvisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    workflowStatus: { type: String, default: 'Not Started' },
    /** The step that must clear before the workflow can advance. */
    blockingStep: { type: String, default: 'Schedule assignment' },
    isActive: { type: Boolean, default: true },
    lastUpdateAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/**
 * The valid statuses depend on the student type, so validation lives here
 * instead of being duplicated at every call site.
 */
studentSchema.statics.statusesForType = function statusesForType(studentType) {
  return studentType === 'Advising Student' ? ADVISING_STATUSES : NORMAL_STATUSES;
};

studentSchema.pre('validate', function validate(next) {
  const valid = this.constructor.statusesForType(this.studentType);
  if (this.workflowStatus && !valid.includes(this.workflowStatus)) {
    // Surfaced to the API as a 400 rather than crashing the request.
    const err = new Error(`"${this.workflowStatus}" is not a valid ${this.studentType} status`);
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }
  next();
});

module.exports = mongoose.model('Student', studentSchema);
module.exports.NORMAL_STATUSES = NORMAL_STATUSES;
module.exports.ADVISING_STATUSES = ADVISING_STATUSES;
module.exports.ADVISING_REASONS = ADVISING_REASONS;

const mongoose = require('mongoose');

/**
 * Req 103-107: an Advisor's graduation plan for one Advising Student.
 *
 * A plan is a list of up to three upcoming Winter/Spring/Summer terms plus one
 * placement per remaining course. The remaining courses themselves are not
 * copied here: they are derived from the academic history every time the plan
 * is read, so the plan can never claim a course the student no longer owes.
 *
 * Req 106: a Draft is private to the Advisor who created it. Req 107: once
 * Submitted it is read-only while the Coordinator decides (req 113 adds the
 * Accepted/Rejected statuses; they are listed now so the collection does not
 * have to migrate).
 */
const STATUSES = ['Draft', 'Submitted', 'Accepted', 'Rejected'];
const SEASONS = ['Winter', 'Spring', 'Summer'];

/** A term bucket in the plan, e.g. 2026/2027 Spring. Order is the term order. */
const planTermSchema = new mongoose.Schema(
  {
    season: { type: String, enum: SEASONS, required: true },
    academicYear: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const placementSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    /** Index into `terms`; also defines prerequisite order. */
    termIndex: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const graduationPlanSchema = new mongoose.Schema(
  {
    advisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    status: { type: String, enum: STATUSES, default: 'Draft', required: true },
    terms: {
      type: [planTermSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 3,
        message: 'A graduation plan covers exactly the next Winter, Spring and Summer terms.',
      },
    },
    placements: { type: [placementSchema], default: [] },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Req 104-106: an Advisor has at most one private draft per student. A
// submitted plan does not block a later draft (a rejection in req 113 returns
// the plan as a draft), and the partial index only covers Draft rows.
graduationPlanSchema.index(
  { advisor: 1, student: 1 },
  { unique: true, partialFilterExpression: { status: 'Draft' } }
);
// The Advisor's own plan list, newest first (req 110).
graduationPlanSchema.index({ advisor: 1, updatedAt: -1 });

module.exports = mongoose.model('GraduationPlan', graduationPlanSchema);
module.exports.STATUSES = STATUSES;
module.exports.SEASONS = SEASONS;

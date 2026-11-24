const mongoose = require('mongoose');
const { SEASONS } = require('../services/bachelorProjectRules');

const draftCourseSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    mandatory: { type: Boolean, default: false, required: true },
  },
  { _id: false }
);

// Req 60: the bachelor project has no catalogue course, so it is recorded as the
// season it will be taken in. null means the student is not taking it this term.
const bachelorProjectSchema = new mongoose.Schema(
  {
    season: { type: String, enum: SEASONS, required: true },
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    setAt: { type: Date, required: true },
  },
  { _id: false }
);

const advisingScheduleDraftSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
    courses: { type: [draftCourseSchema], default: [] },
    bachelorProject: { type: bachelorProjectSchema, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

advisingScheduleDraftSchema.index({ student: 1, term: 1 }, { unique: true });

module.exports = mongoose.model('AdvisingScheduleDraft', advisingScheduleDraftSchema);

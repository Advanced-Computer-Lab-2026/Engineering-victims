const mongoose = require('mongoose');

const draftCourseSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    mandatory: { type: Boolean, default: false, required: true },
  },
  { _id: false }
);

const advisingScheduleDraftSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
    courses: { type: [draftCourseSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

advisingScheduleDraftSchema.index({ student: 1, term: 1 }, { unique: true });

module.exports = mongoose.model('AdvisingScheduleDraft', advisingScheduleDraftSchema);

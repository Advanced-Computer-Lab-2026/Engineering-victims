const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
  academicYear: { type: String, required: true },
  season: { type: String, enum: ['Winter', 'Spring'], required: true },
  ordinal: { type: Number, required: true },
  cumulativeGpa: { type: Number, min: 0.7, max: 5, required: true },
  standing: { type: String, enum: ['Good Standing', 'Probation'], required: true },
  revision: { type: Number, required: true },
  finalizedAt: { type: Date, required: true },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Preserve the authoritative values used before a correction.
  previousVersions: [{ cumulativeGpa: Number, standing: String, revision: Number, finalizedAt: Date, finalizedBy: mongoose.Schema.Types.ObjectId }],
  checkPending: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ student: 1, term: 1 }, { unique: true });
schema.index({ student: 1, ordinal: 1 }, { unique: true });
schema.index({ checkPending: 1 });
module.exports = mongoose.model('SemesterStanding', schema);

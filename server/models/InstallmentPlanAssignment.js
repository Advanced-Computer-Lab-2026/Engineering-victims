const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true },
  academicYear: { type: String, required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ student: 1, academicYear: 1 }, { unique: true });
module.exports = mongoose.model('InstallmentPlanAssignment', schema);

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const schema = new mongoose.Schema({
  reference: { type: String, unique: true, default: () => `INST-${randomUUID()}` },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  label: { type: String, required: true, trim: true, maxlength: 120 },
  dueDate: { type: Date, required: true },
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlanAssignment', default: null },
  academicYear: { type: String, default: null }, sequence: { type: Number, min: 1, default: null },
  baseAmount: { type: Number, min: 0, default: 0 }, currency: { type: String, enum: ['EGP'], default: 'EGP' },
  status: { type: String, enum: ['Scheduled', 'Paid', 'Cancelled'], default: 'Scheduled' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ student: 1, status: 1, dueDate: 1, _id: 1 });
module.exports = mongoose.model('UniversityInstallment', schema);

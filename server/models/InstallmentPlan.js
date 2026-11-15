const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  academicYear: { type: String, required: true }, currency: { type: String, enum: ['EGP'], default: 'EGP' },
  entries: [{ label: { type: String, required: true }, dueDate: { type: Date, required: true }, baseAmount: { type: Number, required: true, min: 0 }, _id: false }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
module.exports = mongoose.model('InstallmentPlan', schema);

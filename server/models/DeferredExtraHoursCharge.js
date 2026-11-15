const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const schema = new mongoose.Schema({
  reference: { type: String, unique: true, default: () => `DEF-${randomUUID()}` },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtraHoursRequest', required: true, unique: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  installment: { type: mongoose.Schema.Types.ObjectId, ref: 'UniversityInstallment', required: true },
  installmentReference: { type: String, required: true }, installmentLabel: { type: String, required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true, min: 1 }, currency: { type: String, enum: ['EGP'], default: 'EGP' },
  status: { type: String, enum: ['Outstanding', 'Paid', 'Cancelled'], default: 'Outstanding' },
  confirmedAt: { type: Date, required: true },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ installment: 1, status: 1 });
module.exports = mongoose.model('DeferredExtraHoursCharge', schema);

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  installment: { type: mongoose.Schema.Types.ObjectId, ref: 'UniversityInstallment', required: true, index: true },
  kind: { type: String, enum: ['Adjustment', 'Payment'], required: true },
  amount: { type: Number, required: true }, reason: { type: String, required: true, maxlength: 1000 },
  externalReference: { type: String, default: null },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submissionKey: { type: String, required: true }, fingerprint: { type: String, required: true },
}, { timestamps: true });
schema.index({ actor: 1, submissionKey: 1 }, { unique: true });
schema.index({ externalReference: 1 }, { unique: true, partialFilterExpression: { kind: 'Payment' } });
module.exports = mongoose.model('InstallmentLedgerEntry', schema);

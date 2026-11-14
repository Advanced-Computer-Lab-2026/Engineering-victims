const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
  termLabel: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseToken: { type: String, default: null },
  leaseUntil: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true });
schema.index({ student: 1, term: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1 });
module.exports = mongoose.model('ProbationWarning', schema);

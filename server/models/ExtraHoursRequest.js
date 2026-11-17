const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const itemSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  code: { type: String, required: true }, name: { type: String, required: true },
  creditHours: { type: Number, required: true, min: 1, max: 12, validate: Number.isInteger },
  requestedHours: { type: Number, required: true, min: 1, max: 12, validate: Number.isInteger },
  classification: { type: String, enum: ['New', 'Repeated'], required: true },
  ratePerHour: { type: Number, enum: [800, 1000], required: true },
  subtotal: { type: Number, min: 1, required: true },
}, { _id: false });
const schema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, default: () => `EHR-${randomUUID()}` },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
  requestingAdvisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submissionKey: String,
  submissionFingerprint: String,
  items: { type: [itemSchema], required: true, validate: (items) => items.length > 0 },
  requestedHours: { type: Number, required: true, min: 1, max: 34, validate: Number.isInteger },
  totalCost: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['EGP'], default: 'EGP' },
  eligibility: {
    standardHours: { type: Number, required: true }, allowedHours: { type: Number, required: true },
    selectedHours: { type: Number, required: true },
    maximumTotalHours: { type: Number, required: true }, gpa: { type: Number, default: null },
    graduationBasis: { type: String, required: true }, graduationSource: { type: String, default: null },
    checks: [{ code: String, passed: Boolean, message: String, _id: false }],
  },
  decision: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn'], default: 'Pending' },
  responseNote: { type: String, default: null },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  settlementOption: { type: String, enum: ['Wallet', 'Gateway', 'Next Installment'], default: null },
  // FR 90 intent is separate from a confirmed payment or installment charge.
  settlementPreference: { type: String, enum: ['Pay Now', 'Next Installment'], default: null },
  settlementPreferenceAt: { type: Date, default: null },
  gatewayAttempt: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtraHoursPayment', default: null },
  paymentReference: { type: String, default: null },
  deferredCharge: { type: mongoose.Schema.Types.ObjectId, ref: 'DeferredExtraHoursCharge', default: null },
  activatedAt: { type: Date, default: null },
  activatedHours: { type: Number, default: 0, min: 0, max: 34 },
  settlementStatus: { type: String, enum: ['Not Applicable', 'Awaiting Payment Choice', 'Paid', 'Deferred to Next Installment', 'Failed', 'Cancelled', 'Refunded'], default: 'Not Applicable' },
  // Req 102: what activation added, so a refund or cancellation removes only that.
  activation: {
    addedSchedules: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StudentSchedule' }],
    addedSlots: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CourseSlot' }],
    activatedDrafts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StudentSchedule' }],
  },
  // Req 102: the reversal record. Payment, charge and history rows are kept, never deleted.
  reversal: {
    kind: { type: String, enum: ['Refund', 'Deferred Charge Cancelled', null], default: null },
    reason: { type: String, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: null },
    amount: { type: Number, default: null },
    walletTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
    removedSchedules: { type: Number, default: 0 },
    restoredDrafts: { type: Number, default: 0 },
  },
  history: [{ action: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, note: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true });
schema.index({ requestingAdvisor: 1, decision: 1, createdAt: -1 });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ requestingAdvisor: 1, submissionKey: 1 }, { unique: true, partialFilterExpression: { submissionKey: { $type: 'string' } } });
schema.index({ settlementOption: 1, settlementStatus: 1, createdAt: -1 });
schema.pre('validate', function (next) {
  const items = this.items || [];
  const ids = items.map((item) => String(item.course));
  if (new Set(ids).size !== ids.length) this.invalidate('items', 'A course can appear only once per request.');
  for (const item of items) {
    if (item.requestedHours > item.creditHours || item.ratePerHour !== (item.classification === 'Repeated' ? 1000 : 800) || item.subtotal !== item.requestedHours * item.ratePerHour) {
      this.invalidate('items', 'Invalid requested hours or itemized price.');
    }
  }
  if (this.requestedHours !== items.reduce((sum, item) => sum + item.requestedHours, 0) || this.totalCost !== items.reduce((sum, item) => sum + item.subtotal, 0)) {
    this.invalidate('totalCost', 'Request totals must match their itemized hours and prices.');
  }
  next();
});
module.exports = mongoose.model('ExtraHoursRequest', schema);

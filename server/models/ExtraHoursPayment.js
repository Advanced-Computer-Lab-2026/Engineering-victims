const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const schema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtraHoursRequest', required: true, unique: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  reference: { type: String, default: () => `PAY-${randomUUID()}`, unique: true },
  method: { type: String, enum: ['Wallet', 'Gateway'], required: true },
  amount: { type: Number, required: true, min: 1 }, currency: { type: String, enum: ['EGP'], default: 'EGP' },
  status: { type: String, enum: ['Pending', 'Succeeded', 'RefundRequired', 'Refunded'], default: 'Pending' },
  stripeSessionId: { type: String, default: null }, stripePaymentIntent: { type: String, default: null },
  paidAt: Date, refundReference: String,
}, { timestamps: true });
module.exports = mongoose.model('ExtraHoursPayment', schema);

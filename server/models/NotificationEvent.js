const mongoose = require('mongoose');
const { EVENTS } = require('../services/notificationEvents');

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, enum: Object.keys(EVENTS), required: true },
  entityId: { type: String, required: true },
  occurrence: { type: String, required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  // Snapshot recipients when enqueued, so reassignment cannot reroute an old event.
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  payload: {
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, required: true },
  },
  status: { type: String, enum: ['pending', 'processing', 'delivered', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: { type: Date, default: null },
  leaseToken: { type: String, default: null },
  lastError: { type: String, default: null },
  deliveredAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
schema.index({ status: 1, leaseUntil: 1 });
module.exports = mongoose.model('NotificationEvent', schema);

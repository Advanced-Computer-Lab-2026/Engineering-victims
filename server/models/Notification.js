const mongoose = require('mongoose');

/**
 * In-app notification (FR 5.0).
 *
 * A record belongs to exactly one account, and every read or write filters on
 * `user`, so one account can never see or mark another account's notifications.
 */
const TYPES = ['info', 'success', 'warning', 'schedule', 'approval', 'payment'];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: TYPES, default: 'info' },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    /** Optional in-app destination, so a notification can deep-link to its page. */
    link: { type: String, default: null },
    /** Present only for durable workflow notifications; legacy rows stay valid. */
    eventKey: { type: String },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ eventKey: 1, user: 1 }, {
  unique: true,
  partialFilterExpression: { eventKey: { $type: 'string' } },
});

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.TYPES = TYPES;

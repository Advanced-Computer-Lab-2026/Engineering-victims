const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  googleSubject: { type: String, required: true },
  googleEmail: { type: String, default: null },
  refreshToken: { type: String, required: true, select: false },
  needsReconnect: { type: Boolean, default: false },
  lastSyncedAt: { type: Date, default: null },
  lockToken: { type: String, default: null },
  lockUntil: { type: Date, default: null },
}, { timestamps: true });
module.exports = mongoose.model('CalendarConnection', schema);

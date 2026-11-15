const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stateHash: { type: String, required: true, unique: true },
  verifier: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
module.exports = mongoose.model('CalendarOAuthState', schema);

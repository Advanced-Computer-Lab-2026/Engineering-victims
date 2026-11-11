const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  googleSubject: { type: String, required: true },
  term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
  slot: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseSlot', required: true },
  generation: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ user: 1, googleSubject: 1, term: 1, slot: 1 }, { unique: true });
module.exports = mongoose.model('CalendarEvent', schema);

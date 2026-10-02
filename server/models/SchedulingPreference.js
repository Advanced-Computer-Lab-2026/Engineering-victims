const mongoose = require('mongoose');

/**
 * Req 57: an Advising Student's scheduling preferences for one term.
 *
 * The list order is the priority: the first entry matters most. Preferences
 * are wishes, not rules; an Advisor may satisfy them when feasible (req 58)
 * but they never override mandatory courses, prerequisites, capacity or any
 * other scheduling rule. `updatedAt` is the "last update time" req 58 shows.
 */
const KINDS = ['Preferred day', 'Avoided day', 'Preferred time range', 'Avoided time range', 'Preferred group', 'Day off'];
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const preferenceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: KINDS, required: true },
    day: { type: String, enum: [...DAYS, null], default: null },
    startTime: { type: String, match: TIME, default: null },
    endTime: { type: String, match: TIME, default: null },
    groupNumber: { type: Number, min: 1, max: 99, default: null },
    /** Optional: the course the preferred group is for, e.g. CSEN 501. */
    courseCode: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const schedulingPreferenceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    term: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true },
    preferences: { type: [preferenceSchema], default: [] },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

// One set of preferences per student per term; an update replaces it.
schedulingPreferenceSchema.index({ student: 1, term: 1 }, { unique: true });

module.exports = mongoose.model('SchedulingPreference', schedulingPreferenceSchema);
module.exports.KINDS = KINDS;
module.exports.DAYS = DAYS;
module.exports.TIME = TIME;

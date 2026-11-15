const mongoose = require('mongoose');

const academicTermSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: 'Academic year is required.',
      trim: true,
      match: [/^\d{4}[-/]\d{4}$/, 'Academic year should look like 2026/2027.'],
    },
    season: {
      type: String,
      enum: { values: ['Winter', 'Spring', 'Summer'], message: 'Season must be Winter, Spring or Summer.' },
      required: 'Season is required.',
    },
    termStartDate: { type: Date, required: 'Term start is required.' },
    termEndDate: { type: Date, required: 'Term end is required.' },
    teachingStartDate: { type: Date, required: 'Teaching start is required.' },
    teachingEndDate: { type: Date, required: 'Teaching end is required.' },
    advisingDeadline: { type: Date, required: 'Advising deadline is required.' },
    swapDeadline: { type: Date, required: 'Swap deadline is required.' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

academicTermSchema.index({ academicYear: 1, season: 1 }, { unique: true });

/**
 * Short field names for validation messages — the raw path names
 * (e.g. `teachingStartDate`) are what used to leak into the UI.
 */
const FIELD_LABELS = {
  academicYear: 'Academic year',
  season: 'Season',
  termStartDate: 'Term start',
  termEndDate: 'Term end',
  teachingStartDate: 'Teaching start',
  teachingEndDate: 'Teaching end',
  advisingDeadline: 'Advising deadline',
  swapDeadline: 'Swap deadline',
};

academicTermSchema.pre('validate', function validate(next) {
  const dates = {
    termStartDate: this.termStartDate,
    termEndDate: this.termEndDate,
    teachingStartDate: this.teachingStartDate,
    teachingEndDate: this.teachingEndDate,
    advisingDeadline: this.advisingDeadline,
    swapDeadline: this.swapDeadline,
  };

  for (const [name, value] of Object.entries(dates)) {
    if (value && Number.isNaN(new Date(value).getTime())) {
      const err = new Error(`${FIELD_LABELS[name]} must be a valid date.`);
      err.name = 'ValidationError';
      err.status = 400;
      return next(err);
    }
  }

  if (this.termStartDate && this.termEndDate && this.termStartDate >= this.termEndDate) {
    const err = new Error('Term end must be after term start.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  if (this.teachingStartDate && this.teachingEndDate && this.teachingStartDate >= this.teachingEndDate) {
    const err = new Error('Teaching end must be after teaching start.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  if (this.advisingDeadline && this.termStartDate && this.advisingDeadline < this.termStartDate) {
    const err = new Error('Advising deadline must be on or after the term start.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  if (this.swapDeadline && this.advisingDeadline && this.swapDeadline > this.advisingDeadline) {
    const err = new Error('Swap deadline must be before the advising deadline.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  next();
});

module.exports = mongoose.model('AcademicTerm', academicTermSchema);
module.exports.FIELD_LABELS = FIELD_LABELS;

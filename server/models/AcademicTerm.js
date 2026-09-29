const mongoose = require('mongoose');

const academicTermSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    season: {
      type: String,
      enum: ['Winter', 'Spring', 'Summer'],
      required: true,
    },
    termStartDate: { type: Date, required: true },
    termEndDate: { type: Date, required: true },
    teachingStartDate: { type: Date, required: true },
    teachingEndDate: { type: Date, required: true },
    advisingDeadline: { type: Date, required: true },
    swapDeadline: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

academicTermSchema.index({ academicYear: 1, season: 1 }, { unique: true });

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
      const err = new Error(`"${name}" must be a valid date.`);
      err.name = 'ValidationError';
      err.status = 400;
      return next(err);
    }
  }

  if (this.termStartDate && this.termEndDate && this.termStartDate >= this.termEndDate) {
    const err = new Error('The academic term end date must be after the term start date.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  if (this.teachingStartDate && this.teachingEndDate && this.teachingStartDate >= this.teachingEndDate) {
    const err = new Error('The teaching end date must be after the teaching start date.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  if (this.advisingDeadline && this.termStartDate && this.advisingDeadline < this.termStartDate) {
    const err = new Error('The advising deadline must fall within the academic term.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  if (this.swapDeadline && this.advisingDeadline && this.swapDeadline > this.advisingDeadline) {
    const err = new Error('The whole-schedule swap deadline must be before the advising deadline.');
    err.name = 'ValidationError';
    err.status = 400;
    return next(err);
  }

  next();
});

module.exports = mongoose.model('AcademicTerm', academicTermSchema);

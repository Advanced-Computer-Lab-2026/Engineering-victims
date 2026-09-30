const mongoose = require('mongoose');

const COURSE_TYPES = ['Core', 'Elective', 'Huma'];
const MAJORS = ['Computer Science', 'DMET'];
const SEASONS = ['Winter', 'Spring', 'Summer'];

/**
 * "csen  501" and "CSEN501" are the same course as "CSEN 501". A mixed-case
 * prefix is kept as typed because the curriculum has codes such as CHEMp 102
 * and CHEMt 102, where the case carries meaning.
 */
const normalizeCode = (value) => {
  if (typeof value !== 'string') return value;
  const compact = value.trim().replace(/\s+/g, ' ');
  const match = compact.match(/^([A-Za-z]+)\s?(\d+)$/);
  if (!match) return compact;
  const prefix = match[1] === match[1].toLowerCase() ? match[1].toUpperCase() : match[1];
  return `${prefix} ${match[2]}`;
};

const hours = (label) => ({
  type: Number,
  default: 0,
  min: [0, `${label} cannot be negative.`],
  max: [12, `${label} cannot be more than 12.`],
  validate: { validator: Number.isInteger, message: `${label} must be a whole number.` },
});

const courseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: 'Course code is required.',
      set: normalizeCode,
      match: [/^[A-Za-z]{2,6} \d{3,4}$/, 'Course code should look like CSEN 501.'],
    },
    name: { type: String, required: 'Course name is required.', trim: true },
    creditHours: {
      type: Number,
      required: 'Credit hours are required.',
      min: [1, 'Credit hours must be at least 1.'],
      max: [12, 'Credit hours cannot be more than 12.'],
      validate: { validator: Number.isInteger, message: 'Credit hours must be a whole number.' },
    },
    // Weekly contact hours from the curriculum sheet (2 hours = 1 session).
    lectureHours: hours('Lecture hours'),
    tutorialHours: hours('Tutorial hours'),
    labHours: hours('Lab hours'),
    courseType: {
      type: String,
      enum: { values: COURSE_TYPES, message: 'Course type must be Core, Elective or Huma.' },
      required: 'Course type is required.',
    },
    faculty: { type: String, required: 'Faculty is required.', trim: true, default: 'MET' },
    majors: {
      type: [{ type: String, enum: { values: MAJORS, message: 'Major must be Computer Science or DMET.' } }],
      validate: { validator: (value) => value.length > 0, message: 'Choose at least one major.' },
    },
    recommendedSemester: {
      type: Number,
      required: 'Recommended semester is required.',
      min: [1, 'Recommended semester must be between 1 and 10.'],
      max: [10, 'Recommended semester must be between 1 and 10.'],
      validate: { validator: Number.isInteger, message: 'Recommended semester must be a whole number.' },
    },
    offeringSeasons: {
      type: [{ type: String, enum: { values: SEASONS, message: 'Season must be Winter, Spring or Summer.' } }],
      validate: { validator: (value) => value.length > 0, message: 'Choose at least one offering season.' },
    },
    prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Case-insensitive, so "csen 501" cannot sit next to "CSEN 501".
courseSchema.index({ code: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const FIELD_LABELS = {
  code: 'Course code',
  name: 'Course name',
  creditHours: 'Credit hours',
  lectureHours: 'Lecture hours',
  tutorialHours: 'Tutorial hours',
  labHours: 'Lab hours',
  courseType: 'Course type',
  faculty: 'Faculty',
  majors: 'Major',
  recommendedSemester: 'Recommended semester',
  offeringSeasons: 'Offering season',
  prerequisites: 'Prerequisites',
};

module.exports = mongoose.model('Course', courseSchema);
module.exports.FIELD_LABELS = FIELD_LABELS;
module.exports.COURSE_TYPES = COURSE_TYPES;
module.exports.MAJORS = MAJORS;
module.exports.SEASONS = SEASONS;
module.exports.normalizeCode = normalizeCode;

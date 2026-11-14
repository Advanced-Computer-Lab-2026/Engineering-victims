const mongoose = require('mongoose');

const courseOfferingSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicTerm',
      required: true,
    },
    publicationStatus: {
      type: String,
      enum: ['Draft', 'Published'],
      default: 'Draft',
      required: true,
    },
    eligibleMajors: [String],
    eligibleSemesters: [String],
  },
  { timestamps: true }
);

// Ensure a course is offered only once per term
courseOfferingSchema.index({ courseId: 1, termId: 1 }, { unique: true });

/** Readable names for the paths, so errors say "Course", not `courseId`. */
const FIELD_LABELS = {
  courseId: 'Course',
  termId: 'Term',
  publicationStatus: 'Publication status',
  eligibleMajors: 'Eligible majors',
  eligibleSemesters: 'Eligible semesters',
};

module.exports = mongoose.model('CourseOffering', courseOfferingSchema);
module.exports.FIELD_LABELS = FIELD_LABELS;

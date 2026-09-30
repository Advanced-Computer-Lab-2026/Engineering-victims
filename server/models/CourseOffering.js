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

module.exports = mongoose.model('CourseOffering', courseOfferingSchema);

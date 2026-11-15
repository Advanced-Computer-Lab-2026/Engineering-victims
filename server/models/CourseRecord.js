const mongoose = require('mongoose');

/**
 * Req 54: one course a student has taken or is taking.
 *
 * "Completed" rows carry a grade; "In Progress" rows are the current term's
 * courses and have none yet. Remaining courses are not stored at all: they are
 * whatever the student's major requires that no row here covers, so they can
 * never drift from the catalogue.
 *
 * Grades use the GUC (German) scale, where 0.7 is the best grade and 5.0 is a
 * fail. A failed attempt stays in the history and the course is still owed.
 */
const GRADE_POINTS = {
  'A+': 0.7,
  A: 1.0,
  'A-': 1.3,
  'B+': 1.7,
  B: 2.0,
  'B-': 2.3,
  'C+': 2.7,
  C: 3.0,
  'C-': 3.3,
  'D+': 3.7,
  D: 4.0,
  F: 5.0,
};
const GRADES = Object.keys(GRADE_POINTS);
const STATUSES = ['Completed', 'In Progress'];

const courseRecordSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    status: { type: String, enum: STATUSES, required: true },
    grade: {
      type: String,
      enum: { values: GRADES, message: 'Grade must be one of ' + GRADES.join(', ') + '.' },
      default: null,
      // A finished course needs its grade; a running one cannot have one yet.
      validate: {
        validator(value) {
          return this.status === 'Completed' ? Boolean(value) : value == null;
        },
        message: 'Completed courses need a grade and in-progress courses cannot have one.',
      },
    },
    /** The term label every screen uses, e.g. "2025/2026 Spring". */
    term: { type: String, required: true, trim: true },
    /** The student's semester number when they took the course. */
    semester: { type: Number, min: 1, max: 10, required: true },
  },
  { timestamps: true }
);

// A student takes a given course at most once per term.
courseRecordSchema.index({ student: 1, course: 1, term: 1 }, { unique: true });

module.exports = mongoose.model('CourseRecord', courseRecordSchema);
module.exports.GRADE_POINTS = GRADE_POINTS;
module.exports.GRADES = GRADES;
module.exports.STATUSES = STATUSES;

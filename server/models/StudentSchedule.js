const mongoose = require('mongoose');

const studentScheduleSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseSlot',
      required: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Active', 'Processed'],
      default: 'Draft',
      required: true,
    },
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicTerm',
      required: true,
    },
  },
  { timestamps: true }
);

// A student cannot be assigned to the same slot twice
studentScheduleSchema.index({ studentId: 1, slotId: 1 }, { unique: true });

module.exports = mongoose.model('StudentSchedule', studentScheduleSchema);

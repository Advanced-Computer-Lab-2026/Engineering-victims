const mongoose = require('mongoose');

const scheduleTemplateSchema = new mongoose.Schema(
  {
    major: {
      type: String,
      required: true,
      trim: true,
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    studyGroup: {
      type: String,
      required: true,
      trim: true,
    },
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicTerm',
      required: true,
    },
    slots: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CourseSlot',
        required: true,
      },
    ],
  },
  { timestamps: true }
);

// Ensure only one template exists per unique combination of major, semester, group, and term
scheduleTemplateSchema.index(
  { major: 1, semester: 1, studyGroup: 1, termId: 1 },
  { unique: true }
);

module.exports = mongoose.model('ScheduleTemplate', scheduleTemplateSchema);

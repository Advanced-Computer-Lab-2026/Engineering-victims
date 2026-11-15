const mongoose = require('mongoose');

const courseSlotSchema = new mongoose.Schema(
  {
    offeringId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseOffering',
      required: true,
    },
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    slotType: {
      type: String,
      enum: ['Lecture', 'Tutorial', 'Lab'],
      required: true,
    },
    groupNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    dayOfWeek: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be in HH:mm format'],
    },
    endTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be in HH:mm format'],
    },
    roomId: {
      type: String,
      required: true,
      trim: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
    },
    assignedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

/** Readable names for the paths, so errors say "Instructor ID", not `instructorId`. */
const FIELD_LABELS = {
  offeringId: 'Offering',
  instructorId: 'Instructor',
  slotType: 'Slot type',
  groupNumber: 'Group number',
  dayOfWeek: 'Day',
  startTime: 'Start time',
  endTime: 'End time',
  roomId: 'Room',
  maxCapacity: 'Max capacity',
  assignedCount: 'Assigned students',
};

module.exports = mongoose.model('CourseSlot', courseSlotSchema);
module.exports.FIELD_LABELS = FIELD_LABELS;

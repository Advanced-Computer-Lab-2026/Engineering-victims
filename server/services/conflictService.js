const CourseSlot = require('../models/CourseSlot');

/**
 * Checks if two time ranges overlap.
 * Times are assumed to be in "HH:mm" format.
 */
const timesOverlap = (start1, end1, start2, end2) => {
  return start1 < end2 && start2 < end1;
};

exports.checkSlotConflict = async (slotData, excludeSlotId = null) => {
  const { instructorId, roomId, dayOfWeek, startTime, endTime } = slotData;

  // 1. Instructor Conflict: Same instructor, same day, overlapping time
  const instructorConflict = await CourseSlot.findOne({
    _id: { $ne: excludeSlotId },
    instructorId,
    dayOfWeek,
    startTime: { $lt: endTime }, // Rough filter to reduce candidates
    endTime: { $gt: startTime },
  });

  if (instructorConflict) {
    // Double check overlap precisely
    if (timesOverlap(startTime, endTime, instructorConflict.startTime, instructorConflict.endTime)) {
      throw new Error(`Instructor is already assigned to another slot on ${dayOfWeek} at this time.`);
    }
  }

  // 2. Room Conflict: Same room, same day, overlapping time
  const roomConflict = await CourseSlot.findOne({
    _id: { $ne: excludeSlotId },
    roomId,
    dayOfWeek,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });

  if (roomConflict) {
    if (timesOverlap(startTime, endTime, roomConflict.startTime, roomConflict.endTime)) {
      throw new Error(`Room ${roomId} is already occupied on ${dayOfWeek} at this time.`);
    }
  }

  return true;
};

exports.validateCapacity = (newMaxCapacity, currentAssignedCount) => {
  if (newMaxCapacity < currentAssignedCount) {
    throw new Error(`Cannot reduce capacity to ${newMaxCapacity} because ${currentAssignedCount} students are already assigned.`);
  }
  return true;
};

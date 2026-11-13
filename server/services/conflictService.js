const CourseSlot = require('../models/CourseSlot');

/** Conflicts are the client's doing, not a server fault: 409, and a message
 *  that is already worded for the user, so callers can pass it through. */
const conflictError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

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
      throw conflictError(`Instructor is already assigned to another slot on ${dayOfWeek} at this time.`, 409);
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
      throw conflictError(`Room ${roomId} is already occupied on ${dayOfWeek} at this time.`, 409);
    }
  }

  return true;
};

exports.timesOverlap = timesOverlap;

/**
 * Req 47: whether two slots occupy the same time on the same day, using the
 * same rule as the room and instructor checks above. The bounds are strict,
 * so a slot ending exactly when another starts (13:15 and 13:15) is not a
 * clash. Times are the schema-validated, zero-padded "HH:mm" strings, which
 * order correctly as text.
 */
exports.slotsOverlap = (a, b) =>
  Boolean(a && b) && a.dayOfWeek === b.dayOfWeek && timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime);

exports.validateCapacity = (newMaxCapacity, currentAssignedCount) => {
  if (newMaxCapacity < currentAssignedCount) {
    throw conflictError(
      `Cannot reduce capacity to ${newMaxCapacity} because ${currentAssignedCount} students are already assigned.`,
      400
    );
  }
  return true;
};

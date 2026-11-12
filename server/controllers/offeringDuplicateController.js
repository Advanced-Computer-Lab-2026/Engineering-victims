const mongoose = require('mongoose');
const AcademicTerm = require('../models/AcademicTerm');
const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

const slotsOverlap = (a, b) => {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
};

/**
 * Req 24: Duplicate course offerings from a selected previous Winter, Spring or
 * Summer term into an existing target academic term.
 *
 * - Copies offered courses, assigned instructors, eligible major & semester
 *   groups, and lecture, tutorial and lab group structures (days, times, rooms,
 *   maximum capacities).
 * - Creates every copy as an unpublished Draft (`publicationStatus: 'Draft'`).
 * - Does not copy enrolled students, assigned-student counts (`assignedCount: 0`),
 *   remaining-capacity values (recalculated as `maxCapacity`), schedule
 *   assignments, swap or change requests, publication status or activity history.
 * - Flags room or instructor conflicts in the target term.
 * - Skips rather than overwrites any course offering that already exists in the
 *   target term.
 */
exports.duplicateOfferings = async (req, res) => {
  try {
    const { sourceTermId, sourceAcademicYear, sourceSeason, targetTermId } = req.body ?? {};

    if (!targetTermId || !mongoose.isValidObjectId(targetTermId)) {
      return res.status(400).json({ message: 'Select a valid target academic term.' });
    }

    const targetTerm = await AcademicTerm.findById(targetTermId).lean();
    if (!targetTerm) {
      return res.status(404).json({ message: 'Target academic term not found.' });
    }

    let sourceTerm = null;
    if (sourceTermId) {
      if (!mongoose.isValidObjectId(sourceTermId)) {
        return res.status(400).json({ message: 'Select a valid source academic term.' });
      }
      sourceTerm = await AcademicTerm.findById(sourceTermId).lean();
    } else if (sourceAcademicYear && sourceSeason) {
      sourceTerm = await AcademicTerm.findOne({
        academicYear: String(sourceAcademicYear).trim(),
        season: String(sourceSeason).trim(),
      }).lean();
    } else {
      return res.status(400).json({
        message: 'Select a source academic year and season (or source term) to duplicate from.',
      });
    }

    if (!sourceTerm) {
      return res.status(404).json({ message: 'Source academic term not found.' });
    }

    if (String(sourceTerm._id) === String(targetTerm._id)) {
      return res.status(400).json({
        message: 'Source term and target term must be different.',
      });
    }

    const sourceOfferings = await CourseOffering.find({ termId: sourceTerm._id })
      .populate('courseId', 'code name')
      .lean();

    if (sourceOfferings.length === 0) {
      return res.status(200).json({
        message: `No course offerings exist in ${sourceTerm.academicYear} ${sourceTerm.season} to duplicate.`,
        copiedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        copiedOfferings: [],
        skippedOfferings: [],
        conflicts: [],
      });
    }

    // Existing offerings & slots in the target term (to skip existing & check conflicts)
    const existingTargetOfferings = await CourseOffering.find({ termId: targetTerm._id })
      .populate('courseId', 'code name')
      .lean();

    const existingCourseIds = new Set(
      existingTargetOfferings.map((o) => String(o.courseId?._id ?? o.courseId))
    );

    const existingTargetOfferingIds = existingTargetOfferings.map((o) => o._id);
    const existingTargetSlots = existingTargetOfferingIds.length
      ? await CourseSlot.find({ offeringId: { $in: existingTargetOfferingIds } })
          .populate('instructorId', 'fullName email')
          .lean()
      : [];

    const offeringCodeMap = new Map(
      existingTargetOfferings.map((o) => [String(o._id), o.courseId?.code || 'Existing Course'])
    );

    const targetSlotsPool = existingTargetSlots.map((slot) => ({
      ...slot,
      courseCode: offeringCodeMap.get(String(slot.offeringId)) || 'Existing Course',
    }));

    const copiedOfferings = [];
    const skippedOfferings = [];
    const conflicts = [];

    for (const srcOffering of sourceOfferings) {
      const courseObjectId = srcOffering.courseId?._id ?? srcOffering.courseId;
      if (!courseObjectId) continue;

      const courseCode = srcOffering.courseId?.code || String(courseObjectId);
      const courseName = srcOffering.courseId?.name || 'Course';

      // Skip rather than overwrite any course offering that already exists in the target term
      if (existingCourseIds.has(String(courseObjectId))) {
        skippedOfferings.push({
          courseId: String(courseObjectId),
          courseCode,
          courseName,
          reason: 'Already offered in target term (skipped without overwriting).',
        });
        continue;
      }

      // Every copy is created as an unpublished Draft in the target term
      const newOffering = await CourseOffering.create({
        courseId: courseObjectId,
        termId: targetTerm._id,
        publicationStatus: 'Draft',
        eligibleMajors: Array.isArray(srcOffering.eligibleMajors)
          ? [...srcOffering.eligibleMajors]
          : [],
        eligibleSemesters: Array.isArray(srcOffering.eligibleSemesters)
          ? [...srcOffering.eligibleSemesters]
          : [],
      });

      existingCourseIds.add(String(courseObjectId));

      const srcSlots = await CourseSlot.find({ offeringId: srcOffering._id })
        .populate('instructorId', 'fullName email')
        .lean();

      const createdSlots = [];

      for (const srcSlot of srcSlots) {
        const instructorObjectId = srcSlot.instructorId?._id ?? srcSlot.instructorId;
        const instructorName = srcSlot.instructorId?.fullName || 'Assigned Instructor';

        const slotPayload = {
          offeringId: newOffering._id,
          instructorId: instructorObjectId,
          slotType: srcSlot.slotType,
          groupNumber: srcSlot.groupNumber,
          dayOfWeek: srcSlot.dayOfWeek,
          startTime: srcSlot.startTime,
          endTime: srcSlot.endTime,
          roomId: srcSlot.roomId,
          maxCapacity: srcSlot.maxCapacity,
          // Never copy enrolled students or assigned-student counts
          assignedCount: 0,
        };

        // Flag room or instructor conflicts in the target term
        for (const other of targetSlotsPool) {
          if (!slotsOverlap(slotPayload, other)) continue;

          if (slotPayload.roomId && other.roomId && slotPayload.roomId === other.roomId) {
            conflicts.push({
              type: 'room',
              courseCode,
              conflictingCourseCode: other.courseCode,
              slotType: slotPayload.slotType,
              groupNumber: slotPayload.groupNumber,
              dayOfWeek: slotPayload.dayOfWeek,
              startTime: slotPayload.startTime,
              endTime: slotPayload.endTime,
              roomId: slotPayload.roomId,
              message: `Room ${slotPayload.roomId} conflict on ${slotPayload.dayOfWeek} (${slotPayload.startTime}–${slotPayload.endTime}) between ${courseCode} (${slotPayload.slotType} G${slotPayload.groupNumber}) and ${other.courseCode}.`,
            });
          }

          const instrA = String(instructorObjectId ?? '');
          const instrB = String(other.instructorId?._id ?? other.instructorId ?? '');
          if (instrA && instrB && instrA === instrB) {
            conflicts.push({
              type: 'instructor',
              courseCode,
              conflictingCourseCode: other.courseCode,
              slotType: slotPayload.slotType,
              groupNumber: slotPayload.groupNumber,
              dayOfWeek: slotPayload.dayOfWeek,
              startTime: slotPayload.startTime,
              endTime: slotPayload.endTime,
              instructorName,
              message: `Instructor conflict (${instructorName}) on ${slotPayload.dayOfWeek} (${slotPayload.startTime}–${slotPayload.endTime}) between ${courseCode} (${slotPayload.slotType} G${slotPayload.groupNumber}) and ${other.courseCode}.`,
            });
          }
        }

        const createdSlot = await CourseSlot.create(slotPayload);
        createdSlots.push({
          id: String(createdSlot._id),
          slotType: createdSlot.slotType,
          groupNumber: createdSlot.groupNumber,
          dayOfWeek: createdSlot.dayOfWeek,
          startTime: createdSlot.startTime,
          endTime: createdSlot.endTime,
          roomId: createdSlot.roomId,
          maxCapacity: createdSlot.maxCapacity,
          assignedCount: 0,
          remainingCapacity: createdSlot.maxCapacity,
        });

        targetSlotsPool.push({
          ...slotPayload,
          _id: createdSlot._id,
          instructorId: srcSlot.instructorId,
          courseCode,
        });
      }

      copiedOfferings.push({
        id: String(newOffering._id),
        courseId: String(courseObjectId),
        courseCode,
        courseName,
        publicationStatus: 'Draft',
        slotsCopied: createdSlots.length,
        totalMaxCapacity: createdSlots.reduce((sum, s) => sum + s.maxCapacity, 0),
        totalRemainingCapacity: createdSlots.reduce((sum, s) => sum + s.remainingCapacity, 0),
      });
    }

    return res.status(201).json({
      message: `Duplicated ${copiedOfferings.length} course offering(s) into ${targetTerm.academicYear} ${targetTerm.season} as unpublished Drafts.${
        skippedOfferings.length ? ` Skipped ${skippedOfferings.length} existing offering(s).` : ''
      }${conflicts.length ? ` Flagged ${conflicts.length} conflict(s) for review.` : ''}`,
      sourceTerm: {
        id: String(sourceTerm._id),
        academicYear: sourceTerm.academicYear,
        season: sourceTerm.season,
      },
      targetTerm: {
        id: String(targetTerm._id),
        academicYear: targetTerm.academicYear,
        season: targetTerm.season,
      },
      copiedCount: copiedOfferings.length,
      skippedCount: skippedOfferings.length,
      conflictCount: conflicts.length,
      copiedOfferings,
      skippedOfferings,
      conflicts,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not duplicate course offerings.',
      error: error.message,
    });
  }
};

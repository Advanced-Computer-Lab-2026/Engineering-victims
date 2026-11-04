const mongoose = require('mongoose');
const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');
const StudentSchedule = require('../models/StudentSchedule');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const User = require('../models/User');
const { checkSlotConflict, validateCapacity } = require('../services/conflictService');

const { FIELD_LABELS: OFFERING_LABELS } = CourseOffering;
const { FIELD_LABELS: SLOT_LABELS } = CourseSlot;

/** This endpoint saves offerings *and* their slots, so both label sets apply. */
const FIELD_LABELS = { ...OFFERING_LABELS, ...SLOT_LABELS };
const FIELD_ORDER = Object.keys(FIELD_LABELS);

/** Model labels first, then the path rendered as words, so no error can fall
 *  back to something as vague as "One of the fields is not a valid selection.". */
const labelFor = (path) => {
  const root = path.split('.')[0];
  if (FIELD_LABELS[root]) return FIELD_LABELS[root];
  const words = root.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`.replace(/\bid\b/g, 'ID');
};

const schemaFor = (path) => {
  const root = path.split('.')[0];
  if (CourseOffering.schema.path(root)) return CourseOffering.schema;
  if (CourseSlot.schema.path(root)) return CourseSlot.schema;
  return null;
};

/**
 * Same idea as the course and academic term errors: plain sentences the form
 * can show as-is. Without this the UI ends up displaying
 * `CourseOffering validation failed: courseId: Cast to ObjectId failed for
 * value "" (type string) at path "courseId" because of "BSONError", ...`
 * instead of "Course is required. Term is required.".
 */
const castMessage = (path, value, idMessage) => {
  if (path === '_id') return idMessage;
  const label = labelFor(path);
  // An empty id trips the cast before the `required` check ever runs.
  return value === '' || value == null ? `${label} is required.` : `${label} has an invalid value.`;
};

/**
 * A tab left open across a re-seed still posts well-formed ObjectIds for rows
 * that no longer exist. The cast and the required check both pass, so the write
 * succeeds — and every later read then returns a null reference that used to
 * take the whole page down. Returns a plain message, or null when all
 * references are usable.
 */
const checkReferences = async ({ courseId, termId }) => {
  if (courseId !== undefined) {
    if (!mongoose.isValidObjectId(courseId)) return 'Select a course before saving.';
    if (!(await Course.exists({ _id: courseId }))) {
      return 'That course no longer exists. Refresh the page and pick another.';
    }
  }
  if (termId !== undefined) {
    if (!mongoose.isValidObjectId(termId)) return 'Select a term before saving.';
    if (!(await AcademicTerm.exists({ _id: termId }))) {
      return 'That academic term no longer exists. Refresh the page and pick another.';
    }
  }
  return null;
};

/** The same staleness guard for the instructors picked inside slots. */
const checkInstructors = async (instructorIds) => {
  const ids = [...new Set(instructorIds.filter(Boolean))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) {
    return 'Pick an instructor from the list before saving.';
  }
  if (ids.length === 0) return null;
  const found = await User.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) {
    return 'That instructor no longer exists. Refresh the page and pick another.';
  }
  return null;
};

const formatOfferingError = (error, fallback, idMessage = 'That offering link is not valid.') => {
  if (!error) return fallback;

  // Same course offered twice in the same term (unique index).
  if (error.code === 11000) return 'This course is already offered in that term.';

  if (error.name === 'ValidationError') {
    const positionOf = (path) => {
      const index = FIELD_ORDER.indexOf(path.split('.')[0]);
      return index === -1 ? FIELD_ORDER.length : index;
    };

    const messages = Object.values(error.errors ?? {})
      .sort((a, b) => positionOf(a.path) - positionOf(b.path))
      .map((detail) => {
        if (detail.name === 'CastError') return castMessage(detail.path, detail.value, idMessage);

        const label = labelFor(detail.path);
        if (detail.kind === 'required') return `${label} is required.`;
        if (detail.kind === 'min') return `${label} must be at least ${detail.properties?.min}.`;
        if (detail.kind === 'max') return `${label} must be no more than ${detail.properties?.max}.`;
        if (detail.kind === 'enum') {
          const values = schemaFor(detail.path)?.path(detail.path)?.enumValues;
          if (Array.isArray(values) && values.length <= 5) return `${label} must be ${values.join(' or ')}.`;
          return `${label} is not a valid option.`;
        }
        // Match/regex validators carry their own wording
        // ("Start time must be in HH:mm format"), so pass them through.
        return detail.message;
      })
      .filter(Boolean);

    if (messages.length > 0) return [...new Set(messages)].join(' ');
    return fallback;
  }

  if (error.name === 'CastError') return castMessage(error.path, error.value, idMessage);

  // Conflicts (instructor/room/capacity) and explicit rejections are already
  // worded for the user.
  if (error.status) return error.message;

  return fallback;
};

/** 409 for duplicates/conflicts, 400 for bad input, 500 for real faults. */
const errorStatus = (error) => {
  if (error.status) return error.status;
  if (error.code === 11000) return 409;
  return error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500;
};

const hasActiveOrProcessedSchedules = async (offeringId) => {
  const slots = await CourseSlot.find({ offeringId }).select('_id');
  return StudentSchedule.exists({
    slotId: { $in: slots.map((slot) => slot._id) },
    status: { $in: ['Active', 'Processed'] },
  });
};

const hasAssignedStudents = async (slotIds) => {
  return Boolean(await StudentSchedule.exists({ slotId: { $in: slotIds } }));
};

/** The schedule rows are the source of truth; CourseSlot.assignedCount is a
 *  denormalised counter that older flows never updated. */
const assignedCountForSlot = (slotId) => StudentSchedule.countDocuments({ slotId });

const OFFERING_EDITABLE_FIELDS = [
  'courseId',
  'termId',
  'publicationStatus',
  'eligibleMajors',
  'eligibleSemesters',
];

const SLOT_EDITABLE_FIELDS = [
  'instructorId',
  'slotType',
  'groupNumber',
  'dayOfWeek',
  'startTime',
  'endTime',
  'roomId',
  'maxCapacity',
];

/** Drops `_id`, timestamps and derived counters a client may echo back. */
const pickFields = (body, fields) => {
  const picked = {};
  for (const field of fields) {
    if (body[field] !== undefined) picked[field] = body[field];
  }
  return picked;
};

exports.createOffering = async (req, res) => {
  try {
    const { courseId, termId, publicationStatus, eligibleMajors, eligibleSemesters, slots } = req.body;

    // Stale ids (re-seeded database, form left open) are rejected here instead
    // of being stored as references nothing can resolve later.
    const refProblem = await checkReferences({ courseId, termId });
    if (refProblem) return res.status(400).json({ message: refProblem });

    const instructorProblem = await checkInstructors(
      (Array.isArray(slots) ? slots : []).map((slot) => slot && slot.instructorId),
    );
    if (instructorProblem) return res.status(400).json({ message: instructorProblem });

    const offering = new CourseOffering({
      courseId,
      termId,
      publicationStatus,
      eligibleMajors,
      eligibleSemesters,
    });

    // Check every slot before writing anything: saving the offering first
    // would leave it behind on failure, and the retry would then answer
    // "already offered in that term" instead of the real problem.
    const slotDocs = [];
    if (slots && Array.isArray(slots)) {
      for (const slotData of slots) {
        await checkSlotConflict({ ...slotData, offeringId: offering._id });
        slotDocs.push(new CourseSlot({ ...slotData, offeringId: offering._id }));
      }
      for (const slotDoc of slotDocs) {
        const invalid = slotDoc.validateSync();
        if (invalid) throw invalid;
      }
    }

    await offering.save();
    for (const slotDoc of slotDocs) await slotDoc.save();

    res.status(201).json({
      message: 'Course offering and slots created successfully.',
      offering: offering,
    });
  } catch (error) {
    res.status(errorStatus(error)).json({
      message: formatOfferingError(error, 'Could not create the course offering.'),
    });
  }
};

/** lean() docs only carry `_id`; the client types and React keys read `id`. */
const withId = (doc) => ({ ...doc, id: String(doc._id) });

exports.getOfferings = async (req, res) => {
  try {
    const { termId } = req.query;
    const filter = termId ? { termId } : {};

    const offerings = await CourseOffering.find(filter)
      .populate('courseId', 'code name')
      .populate('termId', 'academicYear season')
      .lean();

    res.status(200).json({ offerings: offerings.map(withId) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load course offerings', error: error.message });
  }
};

exports.getOfferingDetails = async (req, res) => {
  try {
    const offering = await CourseOffering.findById(req.params.id)
      .populate('courseId', 'code name')
      .populate('termId', 'academicYear season')
      .lean();

    if (!offering) {
      return res.status(404).json({ message: 'Offering not found' });
    }

    const slots = await CourseSlot.find({ offeringId: offering._id })
      .populate('instructorId', 'fullName email')
      .lean();

    const scheduleCounts = await StudentSchedule.aggregate([
      { $match: { slotId: { $in: slots.map((slot) => slot._id) } } },
      { $group: { _id: '$slotId', assignedCount: { $sum: 1 } } },
    ]);
    const assignedCountBySlot = new Map(
      scheduleCounts.map(({ _id, assignedCount }) => [String(_id), assignedCount])
    );

    res.status(200).json({
      offering: withId(offering),
      slots: slots.map((slot) => withId({
        ...slot,
        assignedCount: assignedCountBySlot.get(String(slot._id)) ?? 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load offering details', error: error.message });
  }
};

exports.updateOffering = async (req, res) => {
  try {
    const refProblem = await checkReferences(req.body);
    if (refProblem) return res.status(400).json({ message: refProblem });

    const currentOffering = await CourseOffering.findById(req.params.id);
    if (!currentOffering) {
      return res.status(404).json({ message: 'Offering not found' });
    }

    if (
      req.body.publicationStatus === 'Draft' &&
      currentOffering.publicationStatus === 'Published' &&
      await hasActiveOrProcessedSchedules(currentOffering._id)
    ) {
      return res.status(400).json({
        message: 'Cannot unpublish offering: One or more students have an active or processed schedule that depends on this offering.',
      });
    }

    const offering = await CourseOffering.findByIdAndUpdate(
      req.params.id,
      pickFields(req.body, OFFERING_EDITABLE_FIELDS),
      // Same reason as updateSlot: enums (publication status, majors) and
      // numeric fields must be validated on the way in, not only on create.
      { new: true, runValidators: true }
    );

    if (!offering) {
      return res.status(404).json({ message: 'Offering not found' });
    }

    res.status(200).json({
      message: 'Offering updated successfully.',
      offering,
    });
  } catch (error) {
    res.status(errorStatus(error)).json({
      message: formatOfferingError(error, 'Could not update the course offering.'),
    });
  }
};

exports.updateSlot = async (req, res) => {
  try {
    const slotId = req.params.id;
    // Only the fields the form edits may be written. In particular, the
    // assigned-student count is derived from StudentSchedule rows and must not
    // be overwritten with whatever copy the client happened to load.
    const updates = pickFields(req.body, SLOT_EDITABLE_FIELDS);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'There are no slot changes to save.' });
    }

    // Same staleness guard as create — checked before any lookup so a stale
    // instructor id answers 400 instead of reaching the database.
    if (updates.instructorId !== undefined) {
      const instructorProblem = await checkInstructors([updates.instructorId]);
      if (instructorProblem) return res.status(400).json({ message: instructorProblem });
    }

    const slot = await CourseSlot.findById(slotId);

    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    // Validate capacity if it's being changed. The offering details screen
    // shows the count derived from schedules, so validate against that same
    // number instead of the stale denormalised counter.
    if (updates.maxCapacity !== undefined) {
      validateCapacity(updates.maxCapacity, await assignedCountForSlot(slot._id));
    }

    // Validate conflicts if timing or resource changes
    if (updates.instructorId || updates.roomId || updates.dayOfWeek || updates.startTime || updates.endTime) {
      await checkSlotConflict(
        {
          ...slot.toObject(),
          ...updates,
        },
        slotId
      );
    }

    // runValidators, otherwise a hand-crafted payload stores times and days the
    // schema rejects on create (`startTime: "25:99"` would be accepted by an
    // update and then break every schedule that renders it).
    const updatedSlot = await CourseSlot.findByIdAndUpdate(slotId, updates, { new: true, runValidators: true });

    res.status(200).json({
      message: 'Slot updated successfully.',
      slot: updatedSlot,
    });
  } catch (error) {
    res.status(errorStatus(error)).json({
      message: formatOfferingError(error, 'Could not update the course slot.', 'That slot link is not valid.'),
    });
  }
};

exports.togglePublishStatus = async (req, res) => {
  try {
    const offeringId = req.params.id;
    const offering = await CourseOffering.findById(offeringId);

    if (!offering) {
      return res.status(404).json({ message: 'Offering not found' });
    }

    const newStatus = offering.publicationStatus === 'Published' ? 'Draft' : 'Published';

    if (newStatus === 'Draft') {
      if (await hasActiveOrProcessedSchedules(offeringId)) {
        return res.status(400).json({
          message: 'Cannot unpublish offering: One or more students have an active or processed schedule that depends on this offering.',
        });
      }
    }

    offering.publicationStatus = newStatus;
    await offering.save();

    res.status(200).json({
      message: `Offering ${newStatus === 'Published' ? 'published' : 'unpublished'} successfully.`,
      offering,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling publish status', error: error.message });
  }
};

exports.deleteOffering = async (req, res) => {
  try {
    const offeringId = req.params.id;
    const offering = await CourseOffering.findById(offeringId);
    if (!offering) {
      return res.status(404).json({ message: 'Offering not found' });
    }

    const slots = await CourseSlot.find({ offeringId }).select('_id');
    const slotIds = slots.map((slot) => slot._id);
    if (await hasAssignedStudents(slotIds)) {
      return res.status(400).json({
        message: 'Cannot delete offering: One or more slots have assigned students. Please move or remove students first.',
      });
    }

    // Delete all slots associated with the offering
    await CourseSlot.deleteMany({ offeringId });

    // Delete the offering itself
    await CourseOffering.findByIdAndDelete(offeringId);

    res.status(200).json({
      message: 'Course offering and all associated slots deleted successfully.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete offering', error: error.message });
  }
};

exports.deleteSlot = async (req, res) => {
  try {
    const slotId = req.params.id;
    const slot = await CourseSlot.findById(slotId);

    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    // The schedule records are authoritative; assignedCount can be stale.
    if (await hasAssignedStudents([slot._id])) {
      return res.status(400).json({
        message: 'Cannot delete slot: Students are currently assigned to this slot. Please move or remove them first.',
      });
    }

    await CourseSlot.findByIdAndDelete(slotId);

    res.status(200).json({
      message: 'Course slot deleted successfully.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete slot', error: error.message });
  }
};


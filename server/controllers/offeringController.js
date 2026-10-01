const mongoose = require('mongoose');
const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');
const StudentSchedule = require('../models/StudentSchedule');
const { checkSlotConflict, validateCapacity } = require('../services/conflictService');

exports.createOffering = async (req, res) => {
  try {
    const { courseId, termId, publicationStatus, eligibleMajors, eligibleSemesters, slots } = req.body;

    const offering = new CourseOffering({
      courseId,
      termId,
      publicationStatus,
      eligibleMajors,
      eligibleSemesters,
    });

    await offering.save();

    if (slots && Array.isArray(slots)) {
      for (const slotData of slots) {
        await checkSlotConflict({ ...slotData, offeringId: offering._id });
        await CourseSlot.create({
          ...slotData,
          offeringId: offering._id,
        });
      }
    }

    res.status(201).json({
      message: 'Course offering and slots created successfully.',
      offering: offering,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
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

    res.status(200).json({ offering: withId(offering), slots: slots.map(withId) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load offering details', error: error.message });
  }
};

exports.updateOffering = async (req, res) => {
  try {
    const offering = await CourseOffering.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!offering) {
      return res.status(404).json({ message: 'Offering not found' });
    }

    res.status(200).json({
      message: 'Offering updated successfully.',
      offering,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update offering', error: error.message });
  }
};

exports.updateSlot = async (req, res) => {
  try {
    const slotId = req.params.id;
    const updates = req.body;
    const slot = await CourseSlot.findById(slotId);

    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    // Validate capacity if it's being changed
    if (updates.maxCapacity !== undefined) {
      validateCapacity(updates.maxCapacity, slot.assignedCount);
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

    const updatedSlot = await CourseSlot.findByIdAndUpdate(slotId, updates, { new: true });

    res.status(200).json({
      message: 'Slot updated successfully.',
      slot: updatedSlot,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
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
      // Block unpublishing if any student has an Active or Processed schedule using slots from this offering
      const slots = await CourseSlot.find({ offeringId }).select('_id');
      const slotIds = slots.map((s) => s._id);

      const activeSchedules = await StudentSchedule.findOne({
        slotId: { $in: slotIds },
        status: { $in: ['Active', 'Processed'] },
      });

      if (activeSchedules) {
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

    // Check if any slot in this offering has assigned students
    const slotsWithStudents = await CourseSlot.findOne({
      offeringId,
      assignedCount: { $gt: 0 },
    });

    if (slotsWithStudents) {
      return res.status(400).json({
        message: 'Cannot delete offering: One or more slots have assigned students. Please move or remove students first.',
      });
    }

    // Delete all slots associated with the offering
    await CourseSlot.deleteMany({ offeringId });

    // Delete the offering itself
    const deletedOffering = await CourseOffering.findByIdAndDelete(offeringId);

    if (!deletedOffering) {
      return res.status(404).json({ message: 'Offering not found' });
    }

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

    // Block deletion if students are assigned
    if (slot.assignedCount > 0) {
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


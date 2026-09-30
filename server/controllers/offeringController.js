const mongoose = require('mongoose');
const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');
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

exports.getOfferings = async (req, res) => {
  try {
    const { termId } = req.query;
    const filter = termId ? { termId } : {};

    const offerings = await CourseOffering.find(filter)
      .populate('courseId', 'code name')
      .populate('termId', 'academicYear season')
      .lean();

    res.status(200).json({ offerings });
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

    res.status(200).json({ offering, slots });
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
}

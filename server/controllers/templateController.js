const mongoose = require('mongoose');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const CourseSlot = require('../models/CourseSlot');

const validateTemplateSlots = async ({ major, semester, termId, slots }) => {
  if (!Array.isArray(slots) || slots.length === 0) {
    return 'Select at least one course slot for this template.';
  }

  const slotIds = slots.map(String);
  if (slotIds.some((id) => !mongoose.isValidObjectId(id)) || new Set(slotIds).size !== slotIds.length) {
    return 'Course slots must be valid and cannot be repeated.';
  }

  const courseSlots = await CourseSlot.find({ _id: { $in: slotIds } }).populate('offeringId');
  if (courseSlots.length !== slotIds.length) {
    return 'One or more selected course slots no longer exist.';
  }

  for (const slot of courseSlots) {
    const offering = slot.offeringId;
    if (!offering || String(offering.termId) !== String(termId) || offering.publicationStatus !== 'Published') {
      return 'Templates can only use published course slots from the selected academic term.';
    }
    if (offering.eligibleMajors?.length && !offering.eligibleMajors.includes(major)) {
      return `A selected course slot is not available to ${major}.`;
    }
    if (offering.eligibleSemesters?.length && !offering.eligibleSemesters.includes(String(semester))) {
      return `A selected course slot is not available in semester ${semester}.`;
    }
  }

  return null;
};

exports.createTemplate = async (req, res) => {
  try {
    const { major, semester, studyGroup, termId, slots } = req.body;

    if (!major?.trim() || !semester || !studyGroup?.trim() || !termId || !mongoose.isValidObjectId(termId)) {
      return res.status(400).json({ message: 'All fields (major, semester, studyGroup, termId, slots) are required.' });
    }

    const slotError = await validateTemplateSlots({ major, semester, termId, slots });
    if (slotError) return res.status(400).json({ message: slotError });

    const template = new ScheduleTemplate({
      major: major.trim(),
      semester,
      studyGroup: studyGroup.trim(),
      termId,
      slots,
    });

    await template.save();

    res.status(201).json({
      message: 'Standard schedule template created successfully.',
      template,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A template for this major, semester, group, and term already exists.' });
    }
    res.status(500).json({ message: 'Could not create schedule template', error: error.message });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const { termId, major, semester } = req.query;
    const filter = {};
    if (termId) filter.termId = termId;
    if (major) filter.major = major;
    if (semester) filter.semester = Number(semester);

    const templates = await ScheduleTemplate.find(filter)
      .populate({
        path: 'slots',
        populate: { path: 'offeringId', select: 'publicationStatus termId' },
      })
      .lean();

    res.status(200).json({
      templates: templates.map((template) => {
        const slotsArePublished = template.slots.every((slot) =>
          slot?.offeringId &&
          String(slot.offeringId.termId) === String(template.termId) &&
          slot.offeringId.publicationStatus === 'Published'
        );
        return {
          ...template,
          publicationStatus: template.publicationStatus === 'Draft' || !slotsArePublished
            ? 'Draft'
            : 'Published',
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load schedule templates', error: error.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { major, semester, studyGroup, termId, slots } = req.body;

    const template = await ScheduleTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const nextDefinition = {
      major: major ?? template.major,
      semester: semester ?? template.semester,
      studyGroup: studyGroup ?? template.studyGroup,
      termId: termId ?? template.termId,
      slots: slots ?? template.slots,
    };
    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({ message: 'Slots must be an array.' });
      }
    }

    const slotError = await validateTemplateSlots(nextDefinition);
    if (slotError) return res.status(400).json({ message: slotError });

    const changed = ['major', 'semester', 'studyGroup', 'termId', 'slots'].some((field) => {
      const before = field === 'slots' ? template.slots.map(String) : String(template[field]);
      const after = field === 'slots' ? nextDefinition.slots.map(String) : String(nextDefinition[field]);
      return Array.isArray(before) ? before.join(',') !== after.join(',') : before !== after;
    });

    Object.assign(template, nextDefinition);
    if (changed) template.publicationStatus = 'Draft';

    await template.save();

    res.status(200).json({
      message: 'Standard schedule template updated successfully.',
      template,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An update would create a duplicate template for this major, semester, group, and term.' });
    }
    res.status(500).json({ message: 'Could not update schedule template', error: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const template = await ScheduleTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.status(200).json({ message: 'Schedule template deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete schedule template', error: error.message });
  }
};

exports.setTemplatePublicationStatus = async (req, res) => {
  try {
    const { publicationStatus } = req.body;
    if (!['Draft', 'Published'].includes(publicationStatus)) {
      return res.status(400).json({ message: 'publicationStatus must be Draft or Published.' });
    }

    const template = await ScheduleTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    if (publicationStatus === 'Published') {
      const slotError = await validateTemplateSlots(template);
      if (slotError) return res.status(400).json({ message: slotError });
    }

    template.publicationStatus = publicationStatus;
    await template.save();
    res.status(200).json({ message: `Template ${publicationStatus.toLowerCase()} successfully.`, template });
  } catch (error) {
    res.status(500).json({ message: 'Could not update template publication status', error: error.message });
  }
};

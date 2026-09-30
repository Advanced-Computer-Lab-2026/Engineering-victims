const mongoose = require('mongoose');
const ScheduleTemplate = require('../models/ScheduleTemplate');

exports.createTemplate = async (req, res) => {
  try {
    const { major, semester, studyGroup, termId, slots } = req.body;

    if (!major || !semester || !studyGroup || !termId || !slots || !Array.isArray(slots)) {
      return res.status(400).json({ message: 'All fields (major, semester, studyGroup, termId, slots) are required.' });
    }

    const template = new ScheduleTemplate({
      major,
      semester,
      studyGroup,
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
    const { termId, major } = req.query;
    const filter = {};
    if (termId) filter.termId = termId;
    if (major) filter.major = major;

    const templates = await ScheduleTemplate.find(filter)
      .populate('slots')
      .lean();

    res.status(200).json({ templates });
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

    // Only update provided fields
    if (major !== undefined) template.major = major;
    if (semester !== undefined) template.semester = semester;
    if (studyGroup !== undefined) template.studyGroup = studyGroup;
    if (termId !== undefined) template.termId = termId;
    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return res.status(400).json({ message: 'Slots must be an array.' });
      }
      template.slots = slots;
    }

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

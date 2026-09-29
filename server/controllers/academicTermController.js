const AcademicTerm = require('../models/AcademicTerm');

const normalizeDateFields = (payload = {}) => {
  const next = { ...payload };
  const dateFields = [
    'termStartDate',
    'termEndDate',
    'teachingStartDate',
    'teachingEndDate',
    'advisingDeadline',
    'swapDeadline',
  ];

  for (const field of dateFields) {
    if (typeof next[field] === 'string' && next[field].trim() !== '') {
      next[field] = new Date(next[field]);
    }
  }

  return next;
};

exports.listTerms = async (req, res) => {
  try {
    const terms = await AcademicTerm.find().sort({ academicYear: -1, season: 1 }).lean();
    res.status(200).json({ terms });
  } catch (error) {
    res.status(500).json({ message: 'Could not load academic terms', error: error.message });
  }
};

exports.createTerm = async (req, res) => {
  try {
    const body = normalizeDateFields(req.body);
    const term = new AcademicTerm({
      ...body,
      createdBy: req.user?.userId ?? null,
    });

    await term.validate();
    await term.save();

    res.status(201).json({ term });
  } catch (error) {
    const status = error.status || 400;
    res.status(status).json({
      message: error.message || 'Could not create the academic term.',
    });
  }
};

exports.updateTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findById(req.params.id);
    if (!term) {
      return res.status(404).json({ message: 'Academic term not found.' });
    }

    const nextValues = normalizeDateFields(req.body);
    Object.assign(term, nextValues);

    await term.validate();
    await term.save();

    res.status(200).json({ term });
  } catch (error) {
    const status = error.status || 400;
    res.status(status).json({
      message: error.message || 'Could not update the academic term.',
    });
  }
};

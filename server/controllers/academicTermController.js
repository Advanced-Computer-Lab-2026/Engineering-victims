const AcademicTerm = require('../models/AcademicTerm');
const { FIELD_LABELS } = AcademicTerm;

/**
 * Turns Mongo/Mongoose's technical failures into short sentences the form can
 * show as-is. Without this the UI ends up displaying things like
 * `Path "teachingStartDate" is required.` or the raw E11000 duplicate key dump.
 */
const FIELD_ORDER = Object.keys(FIELD_LABELS);

const formatTermError = (error) => {
  if (!error) return 'Could not save the academic term.';

  // Same academic year + season already exists (unique index).
  if (error.code === 11000) {
    const { academicYear, season } = error.keyValue ?? {};
    if (academicYear && season) return `A ${season} ${academicYear} term already exists.`;
    return 'That academic term already exists.';
  }

  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors ?? {});

    if (details.length > 0) {
      const positionOf = (path) => {
        const index = FIELD_ORDER.indexOf(path);
        return index === -1 ? FIELD_ORDER.length : index;
      };

      // Reported in field order (term start, term end, ...) rather than the
      // order Mongoose happens to collect them in.
      const messages = details
        .slice()
        .sort((a, b) => positionOf(a.path) - positionOf(b.path))
        .map((detail) =>
          // A bad date string surfaces as a CastError nested in the validation
          // error, and its text still names the raw path.
          detail.name === 'CastError'
            ? `${FIELD_LABELS[detail.path] ?? 'One of the dates'} must be a valid date.`
            : detail.message
        )
        .filter(Boolean);

      if (messages.length > 0) return messages.join(' ');
    }

    // Raised directly by the schema's pre-validate checks; already plain text.
    return error.message || 'Could not save the academic term.';
  }

  if (error.name === 'CastError') {
    const label = FIELD_LABELS[error.path] ?? 'One of the dates';
    return `${label} must be a valid date.`;
  }

  return 'Could not save the academic term.';
};

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

/**
 * The terms page identifies a term by `id`, but Mongo documents only carry
 * `_id`. Without this the page cannot tell which term was selected, so saving
 * an edit falls through to creating a duplicate term.
 */
const toTermResponse = (term) => {
  const plain = typeof term.toObject === 'function' ? term.toObject() : term;
  return { ...plain, id: String(plain._id) };
};

exports.listTerms = async (req, res) => {
  try {
    const terms = await AcademicTerm.find().sort({ academicYear: -1, season: 1 }).lean();
    res.status(200).json({ terms: terms.map(toTermResponse) });
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

    res.status(201).json({ term: toTermResponse(term) });
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : 400);
    res.status(status).json({ message: formatTermError(error) });
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

    res.status(200).json({ term: toTermResponse(term) });
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : 400);
    res.status(status).json({ message: formatTermError(error) });
  }
};

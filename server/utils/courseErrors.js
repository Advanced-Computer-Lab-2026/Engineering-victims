const { FIELD_LABELS } = require('../models/Course');

const FIELD_ORDER = Object.keys(FIELD_LABELS);

/** One sentence per failed field of a Mongoose ValidationError, in form order. */
const validationMessages = (error) => {
  const positionOf = (path) => {
    const index = FIELD_ORDER.indexOf(path.split('.')[0]);
    return index === -1 ? FIELD_ORDER.length : index;
  };

  const messages = Object.values(error.errors ?? {})
    .sort((a, b) => positionOf(a.path) - positionOf(b.path))
    .map((detail) => {
      if (detail.name !== 'CastError') return detail.message;
      const label = FIELD_LABELS[detail.path.split('.')[0]] ?? 'One of the fields';
      return `${label} has an invalid value.`;
    })
    .filter(Boolean);

  return [...new Set(messages)];
};

/**
 * Same idea as the academic term errors: plain sentences the form can show
 * as-is instead of `Path "creditHours" ...` or a raw E11000 dump.
 */
const formatCourseError = (error, code) => {
  if (!error) return 'Could not save the course.';

  // The code index is case-insensitive, so error.keyValue holds a collation
  // key rather than readable text; the caller passes the code it tried to save.
  if (error.code === 11000) {
    return code ? `A course with the code ${code} already exists.` : 'That course already exists.';
  }

  if (error.name === 'ValidationError') {
    const messages = validationMessages(error);
    if (messages.length > 0) return messages.join(' ');
    return error.message || 'Could not save the course.';
  }

  if (error.status) return error.message;
  return 'Could not save the course.';
};

module.exports = { formatCourseError, validationMessages, FIELD_ORDER };

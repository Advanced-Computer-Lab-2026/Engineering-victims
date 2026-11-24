const mongoose = require('mongoose');
const Student = require('../models/Student');
const Course = require('../models/Course');
const User = require('../models/User');
const MandatoryRemovalRequest = require('../models/MandatoryRemovalRequest');
const { parseDateBound, submittedCondition } = require('./slotChangeRequestService');

/**
 * Reqs 65-67: what a Coordinator can ask of the removal-request list.
 *
 * - Req 66 `search`: a student ID, a course code, or an Advisor's name or GUC email.
 * - Req 67 filters: `advisor` (the Advisor who asked), `status`, and
 *   `submittedFrom` / `submittedTo`.
 *
 * Everything combines with AND. The date bounds are read exactly as the
 * slot-change list's submission dates are (req 45): a calendar date in UTC,
 * with the end date's whole day included.
 */

const SEARCH_LIMIT = 80;
const STATUSES = ['Pending', 'Approved', 'Rejected'];
const FILTER_KEYS = ['search', 'status', 'advisor', 'submittedFrom', 'submittedTo'];

/** The text as a literal, so "." or "(" typed into the search box is not read as a pattern. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads every list parameter from the query string. Blank means "not set".
 * Anything that is not a single string, or not a value the list knows, is
 * refused with a message rather than guessed at, so no parameter can turn into
 * a query operator or quietly match everything.
 *
 * Returns { values } (all strings, '' when not set) or { error }.
 */
const parseListQuery = (query = {}) => {
  const values = {};
  for (const key of FILTER_KEYS) {
    const raw = query[key];
    if (raw === undefined) {
      values[key] = '';
    } else if (typeof raw !== 'string') {
      return { error: 'Each search and filter must be a single value.' };
    } else {
      values[key] = raw.trim();
    }
  }

  if (values.search.length > SEARCH_LIMIT) {
    return { error: `Search text can be at most ${SEARCH_LIMIT} characters.` };
  }
  if (values.status && !STATUSES.includes(values.status)) {
    return { error: `Status must be one of ${STATUSES.join(', ')}.` };
  }
  if (values.advisor && !mongoose.isValidObjectId(values.advisor)) {
    return { error: 'That Advisor filter is not valid.' };
  }

  const from = values.submittedFrom ? parseDateBound(values.submittedFrom) : null;
  const to = values.submittedTo ? parseDateBound(values.submittedTo) : null;
  if ((values.submittedFrom && !from) || (values.submittedTo && !to)) {
    return { error: 'Enter a valid submission date.' };
  }
  if (from && to && from > to) {
    return { error: 'The submission start date must be on or before the end date.' };
  }

  return { values };
};

/** Req 66: the requests whose student ID, course code, or Advisor name or email contains `text`. */
const searchCondition = async (text) => {
  const pattern = new RegExp(escapeRegex(text), 'i');
  const [students, courses, advisors] = await Promise.all([
    Student.find({ studentId: pattern }).select('_id').lean(),
    Course.find({ code: pattern }).select('_id').lean(),
    User.find({ role: 'Advisor', $or: [{ fullName: pattern }, { email: pattern }] }).select('_id').lean(),
  ]);
  const ids = (rows) => rows.map((row) => row._id);
  return {
    $or: [
      { student: { $in: ids(students) } },
      { course: { $in: ids(courses) } },
      { advisor: { $in: ids(advisors) } },
    ],
  };
};

/** The MongoDB filter for parsed `values`: {} for none, one condition as it is, several ANDed. */
const buildListFilter = async (values) => {
  const conditions = [];
  if (values.search) conditions.push(await searchCondition(values.search));
  if (values.status) conditions.push({ status: values.status });
  if (values.advisor) conditions.push({ advisor: values.advisor });
  const submitted = submittedCondition(values);
  if (submitted) conditions.push(submitted);

  if (!conditions.length) return {};
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

/**
 * Req 67: the Advisors the Advisor filter offers, namely those who have asked
 * for a removal. Taken from every request, not the filtered list, so choosing
 * one Advisor does not shrink the choices.
 */
const advisorFilterOptions = async () => {
  const ids = await MandatoryRemovalRequest.distinct('advisor');
  if (!ids.length) return [];
  const advisors = await User.find({ _id: { $in: ids } })
    .select('fullName email')
    .sort({ fullName: 1 })
    .lean();
  return advisors.map((advisor) => ({ id: advisor._id, fullName: advisor.fullName, email: advisor.email }));
};

module.exports = { SEARCH_LIMIT, STATUSES, parseListQuery, buildListFilter, advisorFilterOptions };

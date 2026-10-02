const User = require('../models/User');
const Student = require('../models/Student');
const SchedulingPreference = require('../models/SchedulingPreference');
const { advisingTerm, validatePreferences, deadlineEnd, MAX_PREFERENCES } = require('../services/schedulingPreferenceService');

/** Resolves the signed-in Advising Student, or sends the right error. */
const resolveStudent = async (req, res) => {
  const user = await User.findById(req.user.userId).select('email').lean();
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return null;
  }
  const student = await Student.findOne({ email: user.email });
  if (!student) {
    res.status(404).json({ message: 'No student record is linked to this account.' });
    return null;
  }
  if (student.studentType !== 'Advising Student') {
    res.status(403).json({ message: 'Scheduling preferences are only for Advising Students.' });
    return null;
  }
  return student;
};

const serializeTerm = (term, isOpen) =>
  term
    ? {
        id: term._id,
        label: `${term.academicYear} ${term.season}`,
        advisingDeadline: term.advisingDeadline,
        closesAt: deadlineEnd(term),
        isOpen,
      }
    : null;

const serializePreference = (doc) =>
  doc
    ? {
        preferences: doc.preferences.map((entry, index) => ({
          priority: index + 1,
          kind: entry.kind,
          day: entry.day,
          startTime: entry.startTime,
          endTime: entry.endTime,
          groupNumber: entry.groupNumber,
          courseCode: entry.courseCode,
        })),
        note: doc.note,
        submittedAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }
    : null;

const OPTIONS = {
  kinds: SchedulingPreference.KINDS,
  days: SchedulingPreference.DAYS,
  maxPreferences: MAX_PREFERENCES,
};

/** Req 57: the signed-in Advising Student's preferences for the advising term. */
exports.getMyPreferences = async (req, res) => {
  try {
    const student = await resolveStudent(req, res);
    if (!student) return;

    const advising = await advisingTerm();
    let { term } = advising;
    let saved = term ? await SchedulingPreference.findOne({ student: student._id, term: term._id }).lean() : null;

    // Once every deadline has passed, show the student the last preferences
    // they submitted (read-only) rather than an empty form for some other term.
    if (!advising.isOpen) {
      const last = await SchedulingPreference.findOne({ student: student._id })
        .sort({ updatedAt: -1 })
        .populate('term')
        .lean();
      if (last?.term) {
        term = last.term;
        saved = last;
      }
    }

    res.status(200).json({ term: serializeTerm(term, advising.isOpen), preference: serializePreference(saved), options: OPTIONS });
  } catch (error) {
    res.status(500).json({ message: 'Could not load your preferences', error: error.message });
  }
};

/**
 * Req 57: submit or update preferences, only before the advising deadline.
 * The whole ranked list is replaced on every save, so reordering, editing and
 * removing all go through the same request.
 */
exports.saveMyPreferences = async (req, res) => {
  try {
    const student = await resolveStudent(req, res);
    if (!student) return;

    const { term, isOpen } = await advisingTerm();
    if (!term) return res.status(400).json({ message: 'There is no academic term to submit preferences for.' });
    if (!isOpen) {
      return res.status(403).json({
        message: `The advising deadline for ${term.academicYear} ${term.season} has passed, so preferences can no longer be changed.`,
      });
    }

    const result = await validatePreferences(req.body ?? {});
    if (result.error) return res.status(400).json({ message: result.error });

    const existing = await SchedulingPreference.findOne({ student: student._id, term: term._id });
    const doc = existing ?? new SchedulingPreference({ student: student._id, term: term._id });
    doc.preferences = result.preferences;
    doc.note = result.note;
    await doc.save();

    res.status(existing ? 200 : 201).json({
      message: existing ? 'Your preferences were updated.' : 'Your preferences were submitted.',
      term: serializeTerm(term, isOpen),
      preference: serializePreference(doc),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not save your preferences', error: error.message });
  }
};

const AcademicTerm = require('../models/AcademicTerm');
const Course = require('../models/Course');
const { KINDS, DAYS, TIME } = require('../models/SchedulingPreference');

const MAX_PREFERENCES = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The advising deadline is a date, so it stays open until that day ends. */
const deadlineEnd = (term) => new Date(new Date(term.advisingDeadline).getTime() + DAY_MS - 1);

/**
 * The term students are currently giving preferences for: the one whose
 * advising deadline is the next to pass. When every deadline has passed, the
 * most recent term is returned closed, so its saved preferences stay readable.
 */
const advisingTerm = async (now = new Date()) => {
  const terms = await AcademicTerm.find().lean();
  const open = terms
    .filter((term) => deadlineEnd(term) >= now)
    .sort((a, b) => new Date(a.advisingDeadline) - new Date(b.advisingDeadline))[0];
  if (open) return { term: open, isOpen: true };

  const latest = [...terms].sort(
    (a, b) =>
      new Date(b.advisingDeadline) - new Date(a.advisingDeadline) ||
      new Date(b.termStartDate) - new Date(a.termStartDate)
  )[0];
  return { term: latest ?? null, isOpen: false };
};

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** A stable key per entry, used to spot duplicates. */
const keyOf = (entry) =>
  [entry.kind, entry.day, entry.startTime, entry.endTime, entry.groupNumber, entry.courseCode].join('|');

/**
 * Cleans and checks a submitted preference list. Returns { preferences, note }
 * ready to save, or { error } with a message the student can act on.
 *
 * Only the fields that belong to each kind are kept, so a "Preferred day"
 * cannot carry a stray time range into the database.
 */
const validatePreferences = async ({ preferences, note }) => {
  if (!Array.isArray(preferences)) return { error: 'Preferences must be a list.' };
  if (preferences.length > MAX_PREFERENCES) {
    return { error: `You can rank at most ${MAX_PREFERENCES} preferences.` };
  }

  const cleanNote = typeof note === 'string' ? note.trim() : '';
  if (cleanNote.length > 500) return { error: 'The note can be at most 500 characters.' };

  const cleaned = [];
  for (const [index, raw] of preferences.entries()) {
    const position = `Preference ${index + 1}`;
    if (!raw || !KINDS.includes(raw.kind)) {
      return { error: `${position}: choose a preference type.` };
    }

    const entry = { kind: raw.kind, day: null, startTime: null, endTime: null, groupNumber: null, courseCode: null };

    if (['Preferred day', 'Avoided day', 'Day off'].includes(raw.kind)) {
      if (!DAYS.includes(raw.day)) return { error: `${position}: choose a day from Saturday to Thursday.` };
      entry.day = raw.day;
    }

    if (['Preferred time range', 'Avoided time range'].includes(raw.kind)) {
      if (!TIME.test(raw.startTime ?? '') || !TIME.test(raw.endTime ?? '')) {
        return { error: `${position}: enter a start and end time like 08:30.` };
      }
      if (toMinutes(raw.startTime) >= toMinutes(raw.endTime)) {
        return { error: `${position}: the end time must be after the start time.` };
      }
      entry.startTime = raw.startTime;
      entry.endTime = raw.endTime;
    }

    if (raw.kind === 'Preferred group') {
      const group = Number(raw.groupNumber);
      if (!Number.isInteger(group) || group < 1 || group > 99) {
        return { error: `${position}: enter a group number between 1 and 99.` };
      }
      entry.groupNumber = group;
      if (raw.courseCode && String(raw.courseCode).trim()) {
        const code = Course.normalizeCode(String(raw.courseCode));
        const course = await Course.findOne({ code, isActive: true }).collation({ locale: 'en', strength: 2 }).lean();
        if (!course) return { error: `${position}: ${code} is not a course in the catalogue.` };
        entry.courseCode = course.code;
      }
    }

    cleaned.push(entry);
  }

  const seen = new Set();
  for (const entry of cleaned) {
    const key = keyOf(entry);
    if (seen.has(key)) return { error: 'The same preference is listed twice. Remove the duplicate.' };
    seen.add(key);
  }

  // Contradictions the Advisor could not act on.
  const daysOf = (kind) => new Set(cleaned.filter((entry) => entry.kind === kind).map((entry) => entry.day));
  const preferredDays = daysOf('Preferred day');
  const avoidedDays = daysOf('Avoided day');
  const daysOff = daysOf('Day off');
  for (const day of preferredDays) {
    if (avoidedDays.has(day)) return { error: `${day} is both preferred and avoided. Keep only one.` };
    if (daysOff.has(day)) return { error: `${day} is both a preferred day and a day off. Keep only one.` };
  }
  if (daysOff.size >= DAYS.length) {
    return { error: 'You cannot ask for every teaching day off.' };
  }

  const ranges = (kind) => cleaned.filter((entry) => entry.kind === kind);
  for (const wanted of ranges('Preferred time range')) {
    for (const avoided of ranges('Avoided time range')) {
      if (toMinutes(wanted.startTime) < toMinutes(avoided.endTime) && toMinutes(avoided.startTime) < toMinutes(wanted.endTime)) {
        return {
          error: `${wanted.startTime}-${wanted.endTime} is preferred but overlaps the avoided time ${avoided.startTime}-${avoided.endTime}.`,
        };
      }
    }
  }

  if (cleaned.length === 0 && !cleanNote) {
    return { error: 'Add at least one preference or a note before submitting.' };
  }

  return { preferences: cleaned, note: cleanNote };
};

module.exports = { advisingTerm, validatePreferences, deadlineEnd, MAX_PREFERENCES };

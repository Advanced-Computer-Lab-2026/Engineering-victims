const SchedulingPreference = require('../models/SchedulingPreference');
const { advisingTerm, validatePreferences } = require('../services/schedulingPreferenceService');

/**
 * Req 57 demo preferences, for the term currently being advised.
 *
 * Given to the students whose Advisor is building their draft right now
 * (Draft and Reopened), which is exactly when req 58 shows preferences to the
 * Advisor, plus one student whose draft is already done. Every list goes
 * through the same validation as the API, so the seed cannot store anything a
 * student could not have submitted. Laila Hassan is left without preferences
 * so the "submit for the first time" path has a real account.
 */
const PREFERENCES = {
  'omar.nabil@student.guc.edu.eg': {
    preferences: [
      { kind: 'Day off', day: 'Thursday' },
      { kind: 'Avoided time range', startTime: '08:00', endTime: '09:30' },
      { kind: 'Preferred group', groupNumber: 1, courseCode: 'CSEN 501' },
    ],
    note: 'I commute from 6th of October, so early starts are hard for me.',
  },
  'hassan.rifaat@student.guc.edu.eg': {
    preferences: [
      { kind: 'Preferred day', day: 'Monday' },
      { kind: 'Preferred day', day: 'Tuesday' },
      { kind: 'Preferred time range', startTime: '09:45', endTime: '14:45' },
    ],
    note: '',
  },
  'nour.elsayed@student.guc.edu.eg': {
    preferences: [
      { kind: 'Day off', day: 'Saturday' },
      { kind: 'Avoided day', day: 'Wednesday' },
    ],
    note: 'I train with the university team on Wednesday afternoons.',
  },
  'salma.ibrahim@student.guc.edu.eg': {
    preferences: [{ kind: 'Avoided time range', startTime: '16:45', endTime: '18:15' }],
    note: '',
  },
};

const seedSchedulingPreferences = async (students) => {
  await SchedulingPreference.deleteMany({});

  const { term, isOpen } = await advisingTerm();
  if (!term || !isOpen) return 0;

  const byEmail = new Map(students.map((student) => [student.email, student]));
  let count = 0;

  for (const [email, submission] of Object.entries(PREFERENCES)) {
    const student = byEmail.get(email);
    if (!student) throw new Error(`Preference seed references an unknown student: ${email}`);
    if (student.studentType !== 'Advising Student') {
      throw new Error(`Preference seed gives preferences to ${email}, who is not an Advising Student.`);
    }

    const result = await validatePreferences(submission);
    if (result.error) throw new Error(`Preference seed for ${email} is invalid: ${result.error}`);

    await SchedulingPreference.create({ student: student._id, term: term._id, ...result });
    count += 1;
  }

  return count;
};

module.exports = { seedSchedulingPreferences };

const AdvisingScheduleDraft = require('../models/AdvisingScheduleDraft');
const CourseSlot = require('../models/CourseSlot');
const CourseOffering = require('../models/CourseOffering');
const ScheduleActivityLog = require('../models/ScheduleActivityLog');
const StudentSchedule = require('../models/StudentSchedule');
const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');

/**
 * Demo coverage that is pure seed data and nothing else: the cases an
 * evaluation looks for on a screen but that no other seeder happens to build.
 *
 *   1. Full course slots (Req 47 seats). Every seeded group is seeded with a
 *      capacity far above its real occupancy, so "no seats left" is never on
 *      screen. These three groups are filled to their exact row count instead,
 *      which is what the seat meter, the "Full" badge and the draft editor's
 *      "no seats left" pickers read.
 *   2. Saved advising schedule drafts (Req 60). The draft editor only migrates
 *      a student's Draft rows into an AdvisingScheduleDraft on first read, so
 *      a fresh database opens the editor on an empty course list and writes a
 *      row the next seed would not have. Seeding the row the migration would
 *      build keeps the editor populated and the database seed-exact.
 *   3. Schedule activity history (Req 123-126). Without persisted rows the
 *      history page only shows four lazily derived events for three students;
 *      search, the action and date filters and CSV export all run against a
 *      nearly empty list. These rows give the screens a real spread of
 *      students, staff roles, actions, reasons, terms and dates.
 *
 * All three run after every other seeder has finished writing schedule rows,
 * so the counts they read are the ones the app will see. The seed's final
 * reconcileAssignedCounts() pass then re-derives CourseSlot.assignedCount.
 */

/** The groups the demo shows as full, keyed the way the screens name them. */
const FULL_SLOTS = [
  { code: 'CSEN 301', slotType: 'Tutorial', groupNumber: 1 },
  { code: 'CSEN 503', slotType: 'Tutorial', groupNumber: 1 },
  { code: 'CSEN 605', slotType: 'Tutorial', groupNumber: 1 },
];

const currentTermFor = (terms, now = new Date()) =>
  terms.find(
    (term) => new Date(term.termStartDate) <= now && new Date(term.termEndDate) >= now
  ) ?? terms[terms.length - 1] ?? null;

/**
 * Fills `FULL_SLOTS` up to exactly the number of real schedule rows they hold.
 *
 * maxCapacity is derived from the rows rather than set to a round number, so
 * `rows <= maxCapacity` and `assignedCount == rows` both stay true after the
 * reconcile pass, and the seat meter reads "0 of N left" truthfully.
 */
const seedFullSlots = async ({ terms, now = new Date() }) => {
  const term = currentTermFor(terms, now);
  if (!term) throw new Error('The full-slot demo data requires an academic term.');

  const offerings = await CourseOffering.find({ termId: term._id })
    .populate('courseId', 'code')
    .lean();
  const rows = await StudentSchedule.find({ termId: term._id }).lean();
  const occupancy = new Map();
  rows.forEach((row) => {
    const key = String(row.slotId);
    occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  });

  let marked = 0;
  for (const key of FULL_SLOTS) {
    const offering = offerings.find((candidate) => candidate.courseId?.code === key.code);
    if (!offering) {
      throw new Error(`The full-slot demo data could not find ${key.code} in the current term.`);
    }
    const slot = await CourseSlot.findOne({
      offeringId: offering._id,
      slotType: key.slotType,
      groupNumber: key.groupNumber,
    }).lean();
    if (!slot) {
      throw new Error(
        `The full-slot demo data could not find ${key.code} ${key.slotType} group ${key.groupNumber}.`
      );
    }
    const used = occupancy.get(String(slot._id)) ?? 0;
    if (used < 1) {
      throw new Error(
        `The full-slot demo data needs students in ${key.code} ${key.slotType} group ${key.groupNumber}.`
      );
    }
    if (Number(slot.maxCapacity) !== used) {
      await CourseSlot.updateOne({ _id: slot._id }, { $set: { maxCapacity: used } });
    }
    marked += 1;
  }
  return marked;
};

/**
 * Writes the AdvisingScheduleDraft rows `findOrMigrateDraft` would create on
 * first read: one per Draft or Reopened student that holds Draft schedule rows
 * for the term, with the same courses and the same mandatory flags, so the
 * editor opens on real content instead of an empty course list.
 *
 * Every other workflow status keeps no draft — the schedule is already Active
 * there, and the editor says so rather than showing a stale course list.
 */
const seedAdvisingDrafts = async ({ students, terms, users, now = new Date() }) => {
  const term = currentTermFor(terms, now);
  if (!term) throw new Error('The advising-draft demo data requires an academic term.');

  const draftable = students.filter(
    (student) =>
      student.studentType === 'Advising Student' &&
      ['Draft', 'Reopened'].includes(student.workflowStatus)
  );
  if (!draftable.length) return 0;

  const coordinator = users.find((user) => user.role === 'Coordinator') ?? users[0];
  const rows = await StudentSchedule.find({
    studentId: { $in: draftable.map((student) => student._id) },
    termId: term._id,
    status: 'Draft',
  })
    .populate({ path: 'slotId', populate: { path: 'offeringId', populate: { path: 'courseId' } } })
    .lean();

  let created = 0;
  for (const student of draftable.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId)))) {
    const mine = rows.filter((row) => String(row.studentId) === String(student._id));
    if (!mine.length) continue;

    const byCourse = new Map();
    mine.forEach((row) => {
      const course = row.slotId?.offeringId?.courseId;
      if (course) byCourse.set(String(course._id), course);
    });
    const mandatoryIds = new Set(
      (await buildMandatoryCandidates(student)).map((candidate) => String(candidate.course.id))
    );
    const owner =
      users.find((user) => String(user._id) === String(student.assignedAdvisor)) ?? coordinator;

    await AdvisingScheduleDraft.updateOne(
      { student: student._id, term: term._id },
      {
        $setOnInsert: {
          student: student._id,
          term: term._id,
          courses: [...byCourse.values()]
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((course) => ({
              course: course._id,
              mandatory: mandatoryIds.has(String(course._id)),
            })),
          bachelorProject: null,
          createdBy: owner._id,
          updatedBy: owner._id,
        },
      },
      { upsert: true }
    );
    created += 1;
  }
  return created;
};

/**
 * Req 123-126 history. Each entry is keyed by the student number in STUDENTS
 * and the staff member who performed it. Version numbers are deliberate: they
 * deliberately replace the versions the controller would otherwise derive for
 * Processed/Reopened students, so the seeded row is the one shown.
 *
 * `term: 'current'` uses the Winter term being advised; `'previous'` uses the
 * closed Spring term, so a student can truthfully have a processed history in
 * one term while being back in advising for the next.
 */
const ACTIVITY_PLAN = [
  { studentId: '64-40078', term: 'current', action: 'Processed', version: 1,
    at: '2026-10-05T10:00:00.000Z', staff: 'coordinator@guc.edu.eg' },
  { studentId: '65-60016', term: 'current', action: 'Processed', version: 1,
    at: '2026-10-12T11:30:00.000Z', staff: 'karim.fahmy@guc.edu.eg' },
  { studentId: '64-50033', term: 'current', action: 'Processed', version: 1,
    at: '2026-10-18T09:15:00.000Z', staff: 'advisor@guc.edu.eg' },
  { studentId: '64-50033', term: 'current', action: 'Reopened', version: 2,
    at: '2026-10-20T14:45:00.000Z', staff: 'coordinator@guc.edu.eg',
    reason: 'Reopened to adjust tutorial slot timing per advising review.' },
  { studentId: '64-20045', term: 'previous', action: 'Processed', version: 1,
    at: '2026-09-28T08:30:00.000Z', staff: 'mona.adel@guc.edu.eg' },
  { studentId: '64-20045', term: 'previous', action: 'Reopened', version: 2,
    at: '2026-10-02T12:00:00.000Z', staff: 'admin@guc.edu.eg',
    reason: 'Reopened after probation review to reduce the course load.' },
  { studentId: '64-30011', term: 'previous', action: 'Processed', version: 1,
    at: '2026-10-08T10:20:00.000Z', staff: 'advisor@guc.edu.eg' },
  { studentId: '64-30010', term: 'previous', action: 'Processed', version: 1,
    at: '2026-10-14T13:00:00.000Z', staff: 'coordinator@guc.edu.eg' },
  { studentId: '64-30012', term: 'previous', action: 'Processed', version: 1,
    at: '2026-09-30T15:10:00.000Z', staff: 'karim.fahmy@guc.edu.eg' },
  { studentId: '64-30012', term: 'previous', action: 'Reopened', version: 2,
    at: '2026-10-16T09:45:00.000Z', staff: 'mona.adel@guc.edu.eg',
    reason: 'Reopened to replace a lab group after a seat conflict.' },
  { studentId: '65-60015', term: 'previous', action: 'Processed', version: 1,
    at: '2026-10-21T16:00:00.000Z', staff: 'admin@guc.edu.eg' },
];

/** Writes the persisted side of the history screen; dates and staff are fixed. */
const seedScheduleActivityHistory = async ({ students, users, terms, now = new Date() }) => {
  const term = currentTermFor(terms, now);
  if (!term) throw new Error('The history demo data requires an academic term.');
  const previous = terms
    .filter((candidate) => new Date(candidate.termEndDate) < new Date(term.termStartDate))
    .sort((a, b) => new Date(b.termEndDate) - new Date(a.termEndDate))[0] ?? term;

  const byNumber = new Map(students.map((student) => [student.studentId, student]));
  const userByEmail = new Map(users.map((user) => [user.email, user]));
  const rows = ACTIVITY_PLAN.map((entry) => {
    const student = byNumber.get(entry.studentId);
    const staff = userByEmail.get(entry.staff);
    if (!student || !staff) {
      throw new Error(
        `The history demo data could not resolve ${entry.studentId} / ${entry.staff}.`
      );
    }
    return {
      student: student._id,
      studentId: student.studentId,
      studentName: student.fullName,
      termId: (entry.term === 'previous' ? previous : term)._id,
      action: entry.action,
      scheduleVersion: entry.version,
      performedBy: staff._id,
      staffName: staff.fullName,
      staffEmail: staff.email,
      staffRole: staff.role,
      reason: entry.reason ?? null,
      occurredAt: new Date(entry.at),
    };
  });

  await ScheduleActivityLog.insertMany(rows);
  return rows.length;
};

module.exports = {
  seedFullSlots,
  seedAdvisingDrafts,
  seedScheduleActivityHistory,
  currentTermFor,
};

const ScheduleTemplate = require('../models/ScheduleTemplate');
const StudentSchedule = require('../models/StudentSchedule');
const CourseSlot = require('../models/CourseSlot');

/**
 * Standard schedule groups ("Schedule Groups" on the Coordinator's screen) and
 * the processed schedules of the Normal Students that sit in them.
 *
 * seed() already rebuilds offerings and their slots, but a group is what turns
 * those slots into something a student can actually be registered for:
 *
 * - one published ScheduleTemplate per (term, cohort), holding a conflict-free
 *   week of slots picked from that term's published offerings;
 * - every Normal Student is a member of their cohort's group, which means a
 *   real StudentSchedule row per slot and `student.studyGroup` set, so the
 *   group table shows students and the directory stops claiming a swap status
 *   ("Swap Request Open", "Swap Completed", ...) for a schedule that does not
 *   exist in the database.
 *
 * Everything here goes through the same models the API writes with, so the
 * rows the UI reads after a boot are ordinary data, not a special case.
 */

/** The group label every seeded cohort gets; the UI reads it verbatim. */
const GROUP_LABEL = 'G1';

/**
 * A timetable never shows two sessions at once, and a Coordinator editing a
 * seeded group must not trip over one either, so a group holds at most one
 * slot per (day, time) cell — about a full week's worth of courses.
 */
const MAX_SLOTS_PER_GROUP = 12;

/** Two slots collide for a student when they share a day and a start time. */
const cellKeyOf = (slot) => `${slot.dayOfWeek}|${slot.startTime}`;

/**
 * Which term a cohort's own schedule belongs to: odd semesters are taught in
 * Winter, even ones in Spring (courseCatalogue.js makes the same split), so a
 * semester 5 student's schedule is registered in a Winter term.
 *
 * Several terms can share a season — the demo keeps a closed one for history —
 * so the schedule lands in the soonest term that has not finished yet, and only
 * falls back to the most recent closed one if every match is behind us.
 */
const homeTermFor = (semester, terms) => {
  const wanted = semester % 2 === 1 ? 'Winter' : 'Spring';
  const matching = terms.filter((term) => term.season === wanted);
  if (!matching.length) return terms[0];

  const now = Date.now();
  const open = matching.filter((term) => new Date(term.termEndDate).getTime() >= now);
  const candidates = open.length ? open : matching;

  return candidates.reduce((soonest, term) =>
    new Date(term.termEndDate) < new Date(soonest.termEndDate) ? term : soonest
  );
};

const seedScheduleGroups = async ({ terms, offerings, courses, students }) => {
  const summary = { groups: 0, schedules: 0, grouped: 0 };

  // Without a term there is no termId to file a group under, and without one
  // the whole screen is an empty list anyway.
  if (!terms.length) return summary;

  const courseById = new Map(courses.map((course) => [String(course._id), course]));

  // Published offerings per term, each paired with its course so a cohort can
  // be offered the courses closest to its own semester first.
  const publishedByTerm = new Map();
  for (const offering of offerings) {
    if (offering.publicationStatus !== 'Published') continue;
    const course = courseById.get(String(offering.courseId));
    if (!course) continue;

    const key = String(offering.termId);
    const bucket = publishedByTerm.get(key) ?? [];
    bucket.push({ offering, course });
    publishedByTerm.set(key, bucket);
  }

  // Slots by offering, in insertion order, so a course reads lecture, tutorial,
  // lab when its slots are picked.
  const slotDocs = await CourseSlot.find({}).sort({ _id: 1 });
  const slotsByOffering = new Map();
  for (const slot of slotDocs) {
    const key = String(slot.offeringId);
    const bucket = slotsByOffering.get(key) ?? [];
    bucket.push(slot);
    slotsByOffering.set(key, bucket);
  }

  // Cohorts: the Normal Students grouped by what a schedule group is keyed on.
  const cohorts = new Map();
  for (const student of students) {
    if (student.studentType !== 'Normal Student') continue;
    const key = `${student.major}::${student.currentSemester}`;
    const cohort = cohorts.get(key) ?? {
      major: student.major,
      semester: student.currentSemester,
      students: [],
    };
    cohort.students.push(student);
    cohorts.set(key, cohort);
  }

  /** Eligibility exactly as templateController.validateTemplateSlots checks it. */
  const eligibleFor = ({ offering }, major, semester) =>
    (!offering.eligibleMajors?.length || offering.eligibleMajors.includes(major)) &&
    (!offering.eligibleSemesters?.length || offering.eligibleSemesters.includes(String(semester)));

  /** Slots for one group: nearest courses first, one session per time cell. */
  const slotsForGroup = (pool, major, semester) => {
    const ranked = pool
      .filter((entry) => eligibleFor(entry, major, semester))
      .map((entry, index) => ({
        entry,
        index,
        distance: Math.abs((entry.course.recommendedSemester ?? 0) - semester),
      }))
      // Closest to the cohort's semester first; catalogue order breaks ties so
      // the same group comes out on every reseed.
      .sort((a, b) => a.distance - b.distance || a.index - b.index);

    const chosen = [];
    const usedCells = new Set();

    for (const { entry } of ranked) {
      for (const slot of slotsByOffering.get(String(entry.offering._id)) ?? []) {
        const cell = cellKeyOf(slot);
        if (usedCells.has(cell)) continue;

        usedCells.add(cell);
        chosen.push(slot);
        if (chosen.length >= MAX_SLOTS_PER_GROUP) return chosen;
      }
    }

    return chosen;
  };

  /** termId -> `${major}::${semester}` -> the group created there. */
  const created = new Map();

  for (const term of terms) {
    const pool = publishedByTerm.get(String(term._id)) ?? [];

    for (const { major, semester } of cohorts.values()) {
      const slots = slotsForGroup(pool, major, semester);
      if (!slots.length) continue;

      const template = await ScheduleTemplate.create({
        major,
        semester,
        studyGroup: GROUP_LABEL,
        termId: term._id,
        publicationStatus: 'Published',
        slots: slots.map((slot) => slot._id),
      });

      summary.groups += 1;
      const key = `${major}::${semester}`;
      const byCohort = created.get(String(term._id)) ?? new Map();
      byCohort.set(key, { template, slots });
      created.set(String(term._id), byCohort);
    }
  }

  // Register the cohort in its own term: one processed schedule row per slot,
  // the group on the student's record, and the slots' occupancy counters
  // moved by exactly the number of students now sitting in them.
  for (const { major, semester, students: cohort } of cohorts.values()) {
    const homeTerm = homeTermFor(semester, terms);
    const group = created.get(String(homeTerm._id))?.get(`${major}::${semester}`);
    if (!group) continue;

    const slotIds = group.slots.map((slot) => slot._id);

    await StudentSchedule.deleteMany({
      studentId: { $in: cohort.map((student) => student._id) },
      termId: homeTerm._id,
    });
    await StudentSchedule.insertMany(
      cohort.flatMap((student) =>
        slotIds.map((slotId) => ({
          studentId: student._id,
          slotId,
          termId: homeTerm._id,
          status: 'Processed',
        }))
      )
    );

    for (const student of cohort) {
      // Only the group membership is written here: seed() has already derived
      // each student's workflow status (all five Normal-Student statuses
      // already assume a schedule exists), and its deliberately staggered
      // lastUpdateAt drives the directory's sort order.
      student.studyGroup = GROUP_LABEL;
      await student.save();
    }

    await CourseSlot.bulkWrite(
      slotIds.map((slotId) => ({
        updateOne: { filter: { _id: slotId }, update: { $inc: { assignedCount: cohort.length } } },
      }))
    );

    summary.schedules += slotIds.length * cohort.length;
    summary.grouped += cohort.length;
  }

  return summary;
};

module.exports = { seedScheduleGroups, GROUP_LABEL, MAX_SLOTS_PER_GROUP };

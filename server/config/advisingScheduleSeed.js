const CourseSlot = require('../models/CourseSlot');
const StudentSchedule = require('../models/StudentSchedule');
const { stageFor } = require('../services/weeklyScheduleService');

/**
 * Req 31 demo schedules for the Advising Students.
 *
 * scheduleSeed.js registers the Normal Students through their standard groups;
 * Advising Students are scheduled one by one by their Advisor instead, so each
 * one gets a schedule here that matches where their workflow stands:
 *
 * - Not Started                   -> no schedule at all;
 * - Draft, Reopened               -> an incomplete Draft (two courses only),
 *                                    which the student must not be able to see;
 * - review, approval, payment ... -> a complete Active draft (every lecture,
 *                                    tutorial and lab of each course);
 * - Processed                     -> the final Processed schedule.
 *
 * Courses come from the current term's published offerings for the student's
 * major, nearest to their semester first. A course is only added when all of
 * its slots fit around the ones already chosen and have a free seat, so no
 * schedule has a timetable clash or overfills a slot.
 */
const COMPLETE_COURSES = 4;
const INCOMPLETE_COURSES = 2;
const ROW_STATUS = { Draft: 'Draft', 'Review-ready': 'Active', Processed: 'Processed' };

const minutes = (time) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

const overlaps = (a, b) =>
  a.dayOfWeek === b.dayOfWeek && minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime);

/** The term running today, else the next one to start. */
const currentTermOf = (terms, now = new Date()) =>
  terms.find((term) => term.termStartDate <= now && term.termEndDate >= now) ??
  [...terms].filter((term) => term.termStartDate > now).sort((a, b) => a.termStartDate - b.termStartDate)[0] ??
  null;

const seedAdvisingSchedules = async ({ terms, offerings, courses, students }) => {
  const term = currentTermOf(terms);
  if (!term) return 0;

  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  const published = offerings.filter(
    (offering) => offering.publicationStatus === 'Published' && String(offering.termId) === String(term._id)
  );
  const slots = await CourseSlot.find({ offeringId: { $in: published.map((offering) => offering._id) } }).sort({ _id: 1 });
  const slotsByOffering = new Map();
  slots.forEach((slot) => {
    const key = String(slot.offeringId);
    slotsByOffering.set(key, [...(slotsByOffering.get(key) ?? []), slot]);
  });

  // Seats taken by this seed, on top of the counts already on the slots.
  const taken = new Map();
  const hasSeat = (slot) => slot.assignedCount + (taken.get(String(slot._id)) ?? 0) < slot.maxCapacity;

  const rows = [];

  students
    .filter((student) => student.studentType === 'Advising Student')
    .forEach((student) => {
      const stage = stageFor(student);
      if (!stage) return;

      const status = ROW_STATUS[stage];
      const wanted = stage === 'Draft' ? INCOMPLETE_COURSES : COMPLETE_COURSES;

      const candidates = published
        .map((offering) => ({ offering, course: courseById.get(String(offering.courseId)) }))
        .filter(({ course }) => course && course.majors.includes(student.major))
        .sort(
          (a, b) =>
            Math.abs(a.course.recommendedSemester - student.currentSemester) -
              Math.abs(b.course.recommendedSemester - student.currentSemester) ||
            a.course.code.localeCompare(b.course.code)
        );

      const chosen = [];
      let courseCount = 0;
      for (const { offering } of candidates) {
        if (courseCount >= wanted) break;
        const courseSlots = slotsByOffering.get(String(offering._id)) ?? [];
        const fits =
          courseSlots.length > 0 &&
          courseSlots.every((slot) => hasSeat(slot) && !chosen.some((picked) => overlaps(picked, slot)));
        if (!fits) continue;

        chosen.push(...courseSlots);
        courseCount += 1;
      }

      chosen.forEach((slot) => {
        rows.push({ studentId: student._id, slotId: slot._id, termId: term._id, status });
        // Only a completed or final schedule holds a seat; an incomplete draft
        // is still being built and does not count against capacity.
        if (status !== 'Draft') taken.set(String(slot._id), (taken.get(String(slot._id)) ?? 0) + 1);
      });
    });

  await StudentSchedule.insertMany(rows);
  if (taken.size) {
    await CourseSlot.bulkWrite(
      [...taken].map(([slotId, count]) => ({
        updateOne: { filter: { _id: slotId }, update: { $inc: { assignedCount: count } } },
      }))
    );
  }

  return rows.length;
};

module.exports = { seedAdvisingSchedules };

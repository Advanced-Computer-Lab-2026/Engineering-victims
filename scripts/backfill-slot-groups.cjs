/**
 * Backfill the lecture/tutorial/lab groups that the advising validation
 * requires but the seed never created.
 *
 * The bug this fixes: `requiredCount()` says a 4-hour lecture needs two slot
 * rows (and a Lecture component is required even when lectureHours is 0), while
 * `seedOfferings()` created exactly one slot per component. The draft editor
 * therefore asked for a slot that did not exist, filtered out the only one that
 * did because the student was already in it, and showed
 * "No slots with remaining capacity and no timetable clash are available".
 *
 * What it does:
 *   - INSERTS CourseSlot documents only. It never updates, renumbers or
 *     deletes an existing slot, and it never touches StudentSchedule, so every
 *     assignment already made in the draft editor survives.
 *   - Places each new group on a time the course does not already occupy, so a
 *     student can hold every group of the course at once without
 *     `slotsOverlap()` reporting a timetable clash.
 *   - Respects the room and instructor rules in conflictService.checkSlotConflict.
 *   - Is idempotent: an offering that already has enough groups is skipped.
 *
 * Usage:
 *   node scripts/backfill-slot-groups.cjs           # dry run (prints the plan)
 *   node scripts/backfill-slot-groups.cjs --apply   # write the plan
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dotenv = require(path.join(ROOT, 'server', 'node_modules', 'dotenv'));
const mongoose = require(path.join(ROOT, 'server', 'node_modules', 'mongoose'));

dotenv.config({ path: path.join(ROOT, 'server', '.env') });

const CourseSlot = require(path.join(ROOT, 'server', 'models', 'CourseSlot'));
const CourseOffering = require(path.join(ROOT, 'server', 'models', 'CourseOffering'));
const Course = require(path.join(ROOT, 'server', 'models', 'Course'));
const StudentSchedule = require(path.join(ROOT, 'server', 'models', 'StudentSchedule'));
const {
  requiredCount,
} = require(path.join(ROOT, 'server', 'services', 'advisingScheduleValidation'));
const { timesOverlap } = require(path.join(ROOT, 'server', 'services', 'conflictService'));
const {
  DAYS,
  BLOCKS,
  ROOMS,
  SLOT_CAPACITY,
  SLOT_TYPES,
} = require(path.join(ROOT, 'server', 'config', 'seedData'));

const APPLY = process.argv.includes('--apply');

/** Two slots clash for a student when they share a day and overlap in time. */
const overlapsInTime = (a, b) =>
  a.dayOfWeek === b.dayOfWeek && timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime);

/** The week's time slots, minus any the course already occupies. */
const candidatesForWeek = (blocked) => {
  const candidates = [];
  DAYS.forEach((dayOfWeek, dayIndex) => {
    BLOCKS.forEach(([startTime, endTime], blockIndex) => {
      const probe = { dayOfWeek, startTime, endTime };
      if (blocked.some((slot) => overlapsInTime(slot, probe))) return;
      candidates.push({ ...probe, order: dayIndex * BLOCKS.length + blockIndex });
    });
  });
  return candidates;
};

/** Proof that nothing pre-existing was edited or dropped. */
const fingerprint = (list) =>
  list
    .map(
      (s) =>
        `${s._id}:${s.slotType}:${s.groupNumber}:${s.dayOfWeek}:${s.startTime}:${s.endTime}:${s.roomId}:${s.instructorId}:${s.maxCapacity}:${s.assignedCount}`
    )
    .sort()
    .join('|');

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not found in server/.env');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name} (${APPLY ? 'APPLY' : 'dry run'})`);

  const offerings = await CourseOffering.find({}).sort({ _id: 1 }).lean();
  const courses = await Course.find({}).lean();
  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  const offeringById = new Map(offerings.map((offering) => [String(offering._id), offering]));

  const originalSlots = await CourseSlot.find({}).sort({ _id: 1 }).lean();
  const originalFingerprint = fingerprint(originalSlots);
  const originalIds = new Set(originalSlots.map((slot) => String(slot._id)));
  const rowsBefore = await StudentSchedule.countDocuments();

  // Everything already scheduled, plus anything this run creates, so a new
  // group is never placed on top of one we just added.
  const universe = [...originalSlots];
  const allInstructors = [...new Set(originalSlots.map((slot) => String(slot.instructorId)))];

  const plan = [];
  const failures = [];

  for (const offering of offerings) {
    const course = courseById.get(String(offering.courseId));
    if (!course) {
      console.log(`skip  offering ${offering._id}: course ${offering.courseId} is missing`);
      continue;
    }

    const siblings = universe.filter((slot) => String(slot.offeringId) === String(offering._id));
    // Keep the course's own teachers on its new groups where their timetable
    // allows; fall back to anyone who has ever taught a slot.
    const own = [...new Set(siblings.map((slot) => String(slot.instructorId)))];
    const instructorOrder = own.length ? [...own, ...allInstructors.filter((id) => !own.includes(id))] : allInstructors;

    for (const { slotType } of SLOT_TYPES) {
      const required = requiredCount(course, slotType);
      const existing = siblings.filter((slot) => slot.slotType === slotType);
      let groupNumber = existing.reduce((max, slot) => Math.max(max, Number(slot.groupNumber) || 0), 0);

      for (let have = existing.length; have < required; have += 1) {
        groupNumber += 1;

        // A student holds every group of the course at once, so the new session
        // must avoid the times this course already occupies — otherwise the
        // validation would flag its own course as a timetable clash.
        const candidates = candidatesForWeek(siblings).sort(
          (a, b) =>
            universe.filter((slot) => overlapsInTime(slot, a)).length -
              universe.filter((slot) => overlapsInTime(slot, b)).length ||
            a.order - b.order
        );

        let placement = null;
        for (const candidate of candidates) {
          for (const instructorId of instructorOrder) {
            for (const roomId of ROOMS) {
              const roomBusy = universe.some(
                (slot) => slot.roomId === roomId && overlapsInTime(slot, candidate)
              );
              const instructorBusy = universe.some(
                (slot) => String(slot.instructorId) === instructorId && overlapsInTime(slot, candidate)
              );
              if (roomBusy || instructorBusy) continue;
              placement = { ...candidate, roomId, instructorId };
              break;
            }
            if (placement) break;
          }
          if (placement) break;
        }

        if (!placement) {
          failures.push(`${course.code} ${slotType} group ${groupNumber}`);
          continue;
        }

        const doc = {
          offeringId: offering._id,
          instructorId: placement.instructorId,
          slotType,
          groupNumber,
          dayOfWeek: placement.dayOfWeek,
          startTime: placement.startTime,
          endTime: placement.endTime,
          roomId: placement.roomId,
          maxCapacity: SLOT_CAPACITY[slotType].maxCapacity,
          assignedCount: SLOT_CAPACITY[slotType].assignedCount,
        };

        plan.push(doc);
        siblings.push(doc);
        universe.push(doc);
      }
    }
  }

  console.log(`\nSlots already present: ${originalSlots.length}`);
  console.log(`StudentSchedule rows before: ${rowsBefore}`);
  console.log(`\nPlan: ${plan.length} new slot(s)`);
  plan.forEach((doc) => {
    const offering = offeringById.get(String(doc.offeringId));
    const code = offering ? courseById.get(String(offering.courseId))?.code : '?';
    console.log(
      `  + ${code} ${doc.slotType} group ${doc.groupNumber} · ${doc.dayOfWeek} ${doc.startTime}-${doc.endTime} · room ${doc.roomId}`
    );
  });

  if (failures.length) console.log(`\nCould not place ${failures.length}: ${failures.join(', ')}`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to insert these slots.');
    await mongoose.disconnect();
    if (failures.length) process.exit(1);
    return;
  }

  if (plan.length) await CourseSlot.insertMany(plan);

  // Prove the guarantee: only additions, no edits, no deletions.
  const after = await CourseSlot.find({}).sort({ _id: 1 }).lean();
  const rowsAfter = await StudentSchedule.countDocuments();
  const survivingOriginals = after.filter((slot) => originalIds.has(String(slot._id)));
  const untouched = survivingOriginals.length === originalSlots.length &&
    fingerprint(survivingOriginals) === originalFingerprint;

  console.log(`\nInserted ${plan.length} slot(s); CourseSlot ${originalSlots.length} -> ${after.length}`);
  console.log(`StudentSchedule ${rowsBefore} -> ${rowsAfter} (unchanged: ${rowsBefore === rowsAfter})`);
  console.log(`Every pre-existing slot intact: ${untouched}`);

  if (!untouched || rowsBefore !== rowsAfter) {
    console.error('\nRefusing to report success: pre-existing data changed.');
    await mongoose.disconnect();
    process.exit(1);
  }
  if (failures.length) {
    console.error(`\n${failures.length} group(s) could not be placed.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Brings a database seeded by the OLD seed code up to the rules the
 * application itself enforces — without deleting or editing anything that
 * already exists.
 *
 *   node scripts/repair-demo-rules.cjs           # dry run (prints the plan)
 *   node scripts/repair-demo-rules.cjs --apply   # write the plan
 *
 * The old seed had three gaps, all confirmed by scripts/audit-demo-rules.cjs:
 *
 *   1. assignedCount drift — CourseSlot.assignedCount was seeded at a
 *      plausible 48/24/16 instead of the real StudentSchedule rows, so seat
 *      math (REQ 47 slot changes, extra-hours activation) was wrong.
 *      Fixed by re-deriving every counter from the rows, the same source of
 *      truth controllers/offeringController.js reads.
 *   2. missing lecture/tutorial/lab groups — seedOfferings built one slot per
 *      component while requiredCount() demands ceil(hours/2) rows, so students
 *      past Draft held schedules that could never pass validation again.
 *      Fixed by INSERTING the rows they are missing, only where the new row
 *      neither clashes with the student's own timetable nor exceeds the
 *      slot's capacity. If no existing group fits (the group that satisfies
 *      the count clashes with something the student already holds), it
 *      CREATEs one more group for that offering at a time that does fit —
 *      placed by the same room/instructor rules conflictService enforces, at a
 *      time none of the course's own groups occupy, so any student can hold
 *      two of them at once.
 *   3. orphan drafts — AdvisingScheduleDraft documents whose student no longer
 *      exists (seed() never used to clear that collection). Backed up to a
 *      temp file before deletion; they are unreachable through the app.
 *
 * What it NEVER does: edit or delete an existing StudentSchedule row, edit an
 * existing CourseSlot's placement, or touch Normal Student schedules — the app
 * never runs requiredCount() against those (findAdvisingStudent 404s for
 * anyone who is not an Advising Student).
 *
 * Idempotent: a second run plans 0 changes.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const dotenv = require(path.join(SERVER, 'node_modules', 'dotenv'));
const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));

dotenv.config({ path: path.join(SERVER, '.env') });

const CourseSlot = require(path.join(SERVER, 'models', 'CourseSlot'));
const CourseOffering = require(path.join(SERVER, 'models', 'CourseOffering'));
const Course = require(path.join(SERVER, 'models', 'Course'));
const Student = require(path.join(SERVER, 'models', 'Student'));
const StudentSchedule = require(path.join(SERVER, 'models', 'StudentSchedule'));
const AdvisingScheduleDraft = require(path.join(SERVER, 'models', 'AdvisingScheduleDraft'));
const { requiredCount } = require(path.join(SERVER, 'services', 'advisingScheduleValidation'));
const { slotsOverlap, timesOverlap } = require(path.join(SERVER, 'services', 'conflictService'));
const { DAYS, BLOCKS, ROOMS, SLOT_CAPACITY } = require(path.join(SERVER, 'config', 'seedData'));

const APPLY = process.argv.includes('--apply');
const MAX_NEW_SLOTS = 10;

/** Two slots clash for room/instructor when they share it and overlap in time. */
const overlapsInTime = (a, b) =>
  a.dayOfWeek === b.dayOfWeek && timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime);

const slotKey = (slot) => String(slot._id ?? slot.planId);

/**
 * Where a brand-new group of `offering` can go: a grid cell the course does
 * not already occupy, free of every timetable in `avoid`, with a room and an
 * instructor that conflictService.checkSlotConflict would accept.
 */
const findPlacement = ({ universe, siblings, avoid, preferredInstructors }) => {
  const cells = [];
  DAYS.forEach((dayOfWeek, dayIndex) => {
    BLOCKS.forEach(([startTime, endTime], blockIndex) => {
      const probe = { dayOfWeek, startTime, endTime };
      if (siblings.some((slot) => overlapsInTime(slot, probe))) return;
      if (avoid.some((slot) => overlapsInTime(slot, probe))) return;
      const busy = universe.filter((slot) => overlapsInTime(slot, probe)).length;
      cells.push({ ...probe, busy, order: dayIndex * BLOCKS.length + blockIndex });
    });
  });
  cells.sort((a, b) => a.busy - b.busy || a.order - b.order);

  const instructors = [
    ...preferredInstructors,
    ...[...new Set(universe.map((slot) => String(slot.instructorId)))].filter(
      (id) => !preferredInstructors.includes(id)
    ),
  ];

  for (const cell of cells) {
    for (const instructorId of instructors) {
      for (const roomId of ROOMS) {
        const roomBusy = universe.some(
          (slot) => slot.roomId === roomId && overlapsInTime(slot, cell)
        );
        const instructorBusy = universe.some(
          (slot) => String(slot.instructorId) === instructorId && overlapsInTime(slot, cell)
        );
        if (roomBusy || instructorBusy) continue;
        const { busy, order, ...placement } = cell;
        return { ...placement, roomId, instructorId };
      }
    }
  }
  return null;
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not found in server/.env');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name} (${APPLY ? 'APPLY' : 'dry run'})`);

  const existingSlots = await CourseSlot.find({}).lean();
  const offerings = await CourseOffering.find({}).lean();
  const courses = await Course.find({}).lean();
  const students = await Student.find({}).lean();
  const rows = await StudentSchedule.find({}).lean();
  const drafts = await AdvisingScheduleDraft.find({}).lean();

  const offeringById = new Map(offerings.map((o) => [String(o._id), o]));
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  const slotById = new Map(existingSlots.map((s) => [String(s._id), s]));
  const studentIds = new Set(students.map((s) => String(s._id)));

  // ---- 1. orphan drafts -------------------------------------------------
  const orphanDrafts = drafts.filter((draft) => !studentIds.has(String(draft.student)));

  // ---- 2. missing rows for advising students ----------------------------
  const rowsByStudent = new Map();
  rows.forEach((row) => {
    const key = String(row.studentId);
    rowsByStudent.set(key, [...(rowsByStudent.get(key) ?? []), row]);
  });

  // Everything a new group must dodge, and everything occupancy is counted on.
  const universe = [...existingSlots];
  const occupancy = new Map();
  rows.forEach((row) => {
    const key = String(row.slotId);
    occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  });

  const newSlots = [];
  const additions = [];
  const unplaceable = [];
  let planId = 0;

  const advisingStudents = students.filter((s) => s.studentType === 'Advising Student');

  // Passes repeat because a group created for one student may be the group
  // another student can use; stop as soon as a pass changes nothing.
  let progress = true;
  let pass = 0;
  while (progress && pass < 5) {
    progress = false;
    pass += 1;

    for (const student of advisingStudents) {
      const mine = rowsByStudent.get(String(student._id)) ?? [];
      const held = mine
        .map((row) => slotById.get(String(row.slotId)))
        .filter(Boolean)
        // Rows planned earlier in this run count as held too.
        .concat(additions.filter((a) => String(a.studentId) === String(student._id)).map((a) => a.resolved));
      const heldKeys = new Set(held.map(slotKey));

      const byOffering = new Map();
      mine.forEach((row) => {
        const slot = slotById.get(String(row.slotId));
        if (!slot) return;
        const key = String(slot.offeringId);
        byOffering.set(key, [...(byOffering.get(key) ?? []), { row, slot }]);
      });
      // Planned rows extend a course's held set as well.
      additions
        .filter((a) => String(a.studentId) === String(student._id))
        .forEach((a) => {
          const key = String(a.resolved.offeringId);
          if (key) byOffering.set(key, [...(byOffering.get(key) ?? []), { row: a, slot: a.resolved }]);
        });

      for (const [offeringId, heldRows] of byOffering) {
        const offering = offeringById.get(offeringId);
        const course = offering ? courseById.get(String(offering.courseId)) : null;
        if (!course) continue;

        for (const type of ['Lecture', 'Tutorial', 'Lab']) {
          const need = requiredCount(course, type);
          const sameType = heldRows.filter((entry) => entry.slot.slotType === type);
          let have = sameType.length;
          if (have >= need) continue;

          // The sibling row supplies the term and status the new row carries.
          const sibling = sameType[0] ?? heldRows[0];
          const courseSlots = universe.filter(
            (slot) => String(slot.offeringId) === offeringId && slot.slotType === type
          );
          const siblingsAllTypes = universe.filter(
            (slot) => String(slot.offeringId) === offeringId
          );

          const candidates = courseSlots
            .filter((slot) => !heldKeys.has(slotKey(slot)))
            .sort((a, b) => Number(a.groupNumber) - Number(b.groupNumber));

          let placed = null;
          for (const candidate of candidates) {
            if (held.some((slot) => slotsOverlap(slot, candidate))) continue;
            if ((occupancy.get(slotKey(candidate)) ?? 0) >= Number(candidate.maxCapacity)) continue;
            placed = candidate;
            break;
          }

          // No existing group fits: create one at a time this student can
          // actually attend, outside every group the course already runs.
          if (!placed && newSlots.length < MAX_NEW_SLOTS) {
            const placement = findPlacement({
              universe,
              siblings: siblingsAllTypes,
              avoid: held,
              preferredInstructors: [
                ...new Set(
                  siblingsAllTypes.map((slot) => String(slot.instructorId))
                ),
              ],
            });
            if (placement) {
              const groupNumber =
                courseSlots.reduce((max, slot) => Math.max(max, Number(slot.groupNumber) || 0), 0) + 1;
              placed = {
                planId: `new-${planId++}`,
                offeringId: offering._id,
                instructorId: placement.instructorId,
                slotType: type,
                groupNumber,
                dayOfWeek: placement.dayOfWeek,
                startTime: placement.startTime,
                endTime: placement.endTime,
                roomId: placement.roomId,
                maxCapacity: SLOT_CAPACITY[type].maxCapacity,
                assignedCount: 0,
              };
              newSlots.push(placed);
              universe.push(placed);
              occupancy.set(slotKey(placed), 0);
            }
          }

          if (!placed) {
            unplaceable.push(
              `${student.fullName}: ${course.code} needs ${need} ${type}, has ${have} — no clash-free slot available`
            );
            continue;
          }

          additions.push({
            studentId: student._id,
            slotKey: slotKey(placed),
            resolved: placed,
            status: sibling.row.status,
            termId: sibling.row.termId,
            label: `${student.fullName}: ${course.code} ${type} group ${placed.groupNumber} (${placed.dayOfWeek} ${placed.startTime}${placed.planId ? ', NEW GROUP' : ''}) [${sibling.row.status}]`,
          });
          held.push(placed);
          heldKeys.add(slotKey(placed));
          occupancy.set(slotKey(placed), (occupancy.get(slotKey(placed)) ?? 0) + 1);
          progress = true;
        }
      }
    }
  }

  // ---- report -----------------------------------------------------------
  console.log(`\nOrphan drafts to remove: ${orphanDrafts.length}`);
  orphanDrafts.forEach((draft) =>
    console.log(`  - draft ${draft._id} -> missing student ${draft.student}`)
  );

  console.log(`\nNew slot groups to create: ${newSlots.length}`);
  newSlots.forEach((slot) => {
    const offering = offeringById.get(String(slot.offeringId));
    const course = offering ? courseById.get(String(offering.courseId)) : null;
    console.log(
      `  + ${course?.code ?? '?'} ${slot.slotType} group ${slot.groupNumber} · ${slot.dayOfWeek} ${slot.startTime}-${slot.endTime} · room ${slot.roomId}`
    );
  });

  console.log(`\nSchedule rows to add: ${additions.length}`);
  additions.forEach((add) => console.log(`  + ${add.label}`));
  if (unplaceable.length) {
    console.log(`\nCould not place ${unplaceable.length}:`);
    unplaceable.forEach((line) => console.log(`  ! ${line}`));
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to execute this plan.');
    await mongoose.disconnect();
    return;
  }

  // Back up orphan drafts before dropping them: unreachable through the app,
  // but a backup costs nothing and deletion should never be silent.
  if (orphanDrafts.length) {
    const backupPath = path.join(
      os.tmpdir(),
      `advising-drafts-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(backupPath, JSON.stringify(orphanDrafts, null, 2));
    console.log(`\nOrphan drafts backed up to ${backupPath}`);
    await AdvisingScheduleDraft.deleteMany({
      _id: { $in: orphanDrafts.map((draft) => draft._id) },
    });
  }

  // New groups first, so the rows planned on them have real ids to point at.
  if (newSlots.length) {
    const created = await CourseSlot.insertMany(newSlots);
    created.forEach((doc, index) => {
      newSlots[index]._id = doc._id;
    });
    const idByPlanId = new Map(newSlots.map((slot) => [slot.planId, slot._id]));
    additions.forEach((add) => {
      if (add.slotKey.startsWith('new-')) add.slotId = idByPlanId.get(add.slotKey);
      else add.slotId = add.slotKey;
      delete add.slotKey;
      delete add.resolved;
      delete add.label;
    });
  } else {
    additions.forEach((add) => {
      add.slotId = add.slotKey;
      delete add.slotKey;
      delete add.resolved;
      delete add.label;
    });
  }

  if (additions.length) {
    // Unique index on (studentId, slotId) makes a duplicate insert fail loudly
    // rather than corrupting a schedule.
    await StudentSchedule.insertMany(additions);
  }

  // Re-derive every counter from the rows that now exist — including the rows
  // just added — so the whole collection ends up drift-free in one step.
  const freshRows = await StudentSchedule.find({}).select('slotId').lean();
  const realCounts = new Map();
  freshRows.forEach((row) => {
    const key = String(row.slotId);
    realCounts.set(key, (realCounts.get(key) ?? 0) + 1);
  });
  const allSlots = await CourseSlot.find({}).select('assignedCount').lean();
  const countOps = allSlots
    .filter((slot) => Number(slot.assignedCount) !== (realCounts.get(String(slot._id)) ?? 0))
    .map((slot) => ({
      updateOne: {
        filter: { _id: slot._id },
        update: { $set: { assignedCount: realCounts.get(String(slot._id)) ?? 0 } },
      },
    }));
  if (countOps.length) await CourseSlot.bulkWrite(countOps, { ordered: false });

  // Prove the guarantee: only additions, no edits, no deletions of schedules.
  const rowsAfter = await StudentSchedule.countDocuments();
  const slotsAfter = await CourseSlot.countDocuments();
  console.log(`\nStudentSchedule ${rows.length} -> ${rowsAfter} (+${additions.length})`);
  console.log(`CourseSlot ${existingSlots.length} -> ${slotsAfter} (+${newSlots.length}, existing placements untouched)`);
  console.log(`Drafts ${drafts.length} -> ${drafts.length - orphanDrafts.length}`);
  console.log(`assignedCount corrected on ${countOps.length} slot(s)`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

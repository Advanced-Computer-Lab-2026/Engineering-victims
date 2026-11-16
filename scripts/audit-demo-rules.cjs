/**
 * Runs the app's own rules over a database and reports every violation.
 *
 *   node scripts/audit-demo-rules.cjs           # audit the live database
 *   node scripts/audit-demo-rules.cjs --fresh   # seed a throwaway DB first, audit that, drop it
 *
 * Rules checked (all of them are ones the application itself enforces):
 *   1. room/instructor double-booking   conflictService.checkSlotConflict
 *   2. timetable clashes inside one student's own schedule  conflictService.slotsOverlap
 *   3. capacity                         rows <= maxCapacity
 *   4. CourseSlot.assignedCount vs real StudentSchedule rows (REQ 47 seats)
 *   5. required lecture/tutorial/lab counts per course       requiredCount
 *      (Advising Students only — the only ones findAdvisingStudent serves;
 *       Normal Student partial schedules are printed as info, not violations)
 *   6. drafts pointing at students that no longer exist
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const dotenv = require(path.join(SERVER, 'node_modules', 'dotenv'));
const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));

dotenv.config({ path: path.join(SERVER, '.env') });

const CourseSlot = require(path.join(SERVER, 'models', 'CourseSlot'));
const CourseOffering = require(path.join(SERVER, 'models', 'CourseOffering'));
const Course = require(path.join(SERVER, 'models', 'Course'));
const Student = require(path.join(SERVER, 'models', 'Student'));
const User = require(path.join(SERVER, 'models', 'User'));
const StudentSchedule = require(path.join(SERVER, 'models', 'StudentSchedule'));
const AdvisingScheduleDraft = require(path.join(SERVER, 'models', 'AdvisingScheduleDraft'));
const { requiredCount } = require(path.join(SERVER, 'services', 'advisingScheduleValidation'));
const { slotsOverlap, timesOverlap } = require(path.join(SERVER, 'services', 'conflictService'));

const TEMP_DB = 'eng_victims_ruleaudit';
const FRESH = process.argv.includes('--fresh');

const audit = async (label) => {
  const problems = [];
  const note = (rule, detail) => problems.push({ rule, detail });

  const slots = await CourseSlot.find({}).lean();
  const offerings = await CourseOffering.find({}).lean();
  const courses = await Course.find({}).lean();
  const students = await Student.find({}).lean();
  const rows = await StudentSchedule.find({}).lean();
  const drafts = await AdvisingScheduleDraft.find({}).lean();

  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  const offeringById = new Map(offerings.map((o) => [String(o._id), o]));
  const slotById = new Map(slots.map((s) => [String(s._id), s]));
  const studentIds = new Set(students.map((s) => String(s._id)));

  // 1. room / instructor double-booking
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i];
      const b = slots[j];
      if (!timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime) || a.dayOfWeek !== b.dayOfWeek) continue;
      if (String(a.roomId) === String(b.roomId)) {
        note('room double-booked', `${a.roomId} ${a.dayOfWeek} ${a.startTime}: two slots`);
      }
      if (String(a.instructorId) === String(b.instructorId)) {
        note('instructor double-booked', `instructor ${a.instructorId} ${a.dayOfWeek} ${a.startTime}: two slots`);
      }
    }
  }

  // 2 + 3 + 4 per student schedule
  const byStudentTerm = new Map();
  rows.forEach((row) => {
    const key = `${row.studentId}::${row.termId}`;
    byStudentTerm.set(key, [...(byStudentTerm.get(key) ?? []), row]);
  });

  const occupancy = new Map();
  rows.forEach((row) => {
    const key = String(row.slotId);
    occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  });

  for (const [key, group] of byStudentTerm) {
    const held = group.map((row) => slotById.get(String(row.slotId))).filter(Boolean);
    for (let i = 0; i < held.length; i += 1) {
      for (let j = i + 1; j < held.length; j += 1) {
        if (slotsOverlap(held[i], held[j])) {
          const who = students.find((s) => String(s._id) === key.split('::')[0]);
          note('timetable clash', `${who?.fullName ?? key}: ${held[i].slotType} g${held[i].groupNumber} vs ${held[j].slotType} g${held[j].groupNumber} on ${held[i].dayOfWeek} ${held[i].startTime}`);
        }
      }
    }
  }

  slots.forEach((slot) => {
    const used = occupancy.get(String(slot._id)) ?? 0;
    if (used > Number(slot.maxCapacity)) {
      note('over capacity', `${slot.slotType} g${slot.groupNumber}: ${used} rows > ${slot.maxCapacity}`);
    }
    if (Number(slot.assignedCount) !== used) {
      note('assignedCount drift', `${slot.slotType} g${slot.groupNumber} ${slot.dayOfWeek} ${slot.startTime}: counter=${slot.assignedCount} real rows=${used}`);
    }
  });

  // 5. required component counts, per student per course.
  //
  // Only Advising Students are a violation: findAdvisingStudent() 404s for
  // anyone else, so requiredCount() is only ever enforced against advising
  // schedules (REQ 79). Normal Students get their timetables assigned by the
  // system's standard groups, which never run this validation — their partial
  // schedules are reported separately as information, not as rule breaks.
  const requirementFailures = [];
  const normalStudentNotes = [];
  for (const [key, group] of byStudentTerm) {
    const student = students.find((s) => String(s._id) === key.split('::')[0]);
    if (!student) continue;
    const isAdvising = student.studentType === 'Advising Student';
    const byCourse = new Map();
    group.forEach((row) => {
      const slot = slotById.get(String(row.slotId));
      const offering = slot ? offeringById.get(String(slot.offeringId)) : null;
      if (!offering) return;
      const cid = String(offering.courseId);
      byCourse.set(cid, [...(byCourse.get(cid) ?? []), slot]);
    });
    for (const [cid, held] of byCourse) {
      const course = courseById.get(cid);
      if (!course) continue;
      for (const type of ['Lecture', 'Tutorial', 'Lab']) {
        const need = requiredCount(course, type);
        const have = held.filter((s) => s.slotType === type).length;
        if (need !== have) {
          const line = `${student.fullName}: ${course.code} needs ${need} ${type}, has ${have}`;
          if (isAdvising) requirementFailures.push(line);
          else normalStudentNotes.push(line);
        }
      }
    }
  }

  // 6. orphan drafts
  drafts.forEach((draft) => {
    if (!studentIds.has(String(draft.student))) {
      note('orphan draft', `draft ${draft._id} points at missing student ${draft.student}`);
    }
  });

  console.log(`\n===== ${label} =====`);
  console.log(`slots=${slots.length} offerings=${offerings.length} students=${students.length} rows=${rows.length} drafts=${drafts.length}`);

  const grouped = new Map();
  problems.forEach((p) => grouped.set(p.rule, [...(grouped.get(p.rule) ?? []), p.detail]));
  if (!problems.length) console.log('rule violations: none');
  for (const [rule, details] of grouped) {
    console.log(`  ${rule}: ${details.length}`);
    [...new Set(details)].slice(0, 6).forEach((d) => console.log(`      - ${d}`));
    if (new Set(details).size > 6) console.log(`      ... and ${new Set(details).size - 6} more`);
  }

  if (requirementFailures.length) {
    console.log(`  required-slot mismatches (Advising Students — real violations): ${requirementFailures.length}`);
    [...new Set(requirementFailures)].slice(0, 8).forEach((d) => console.log(`      - ${d}`));
    if (new Set(requirementFailures).size > 8) {
      console.log(`      ... and ${new Set(requirementFailures).size - 8} more`);
    }
  } else {
    console.log('  required-slot mismatches: none');
  }
  if (normalStudentNotes.length) {
    // Informational: the app never validates these, so they do not fail the audit.
    console.log(
      `  (info) Normal Student partial schedules: ${normalStudentNotes.length} — not validated by the app`
    );
    [...new Set(normalStudentNotes)].slice(0, 4).forEach((d) => console.log(`      - ${d}`));
    if (new Set(normalStudentNotes).size > 4) {
      console.log(`      ... and ${new Set(normalStudentNotes).size - 4} more`);
    }
  }

  return problems.length + requirementFailures.length;
};

const main = async () => {
  const sharedUri = process.env.MONGODB_URI;
  if (!sharedUri) throw new Error('MONGODB_URI is not set in server/.env');

  let total = 0;

  if (FRESH) {
    const [base, query] = sharedUri.split('?');
    const freshUri = `${base.slice(0, base.lastIndexOf('/') + 1)}${TEMP_DB}${query ? `?${query}` : ''}`;
    await mongoose.connect(freshUri, { dbName: TEMP_DB });
    const { seed } = require(path.join(SERVER, 'config', 'seedData'));
    const summary = await seed();
    console.log('fresh seed:', JSON.stringify(summary));
    total += await audit('FRESH DEMO SEED (what the seed builds)');
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log(`\ndropped ${TEMP_DB}`);
  }

  await mongoose.connect(sharedUri);
  total += await audit('LIVE DATABASE (what the app runs on)');
  await mongoose.disconnect();

  console.log(`\ntotal rule violations: ${total}`);
  process.exit(total ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

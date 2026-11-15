/**
 * Verifies the seeded scheduling data end to end:
 *   1. no orphaned references (offerings -> course/term, slots -> offering, ...)
 *   2. every (term, major, semester) the Schedule Groups screen can select has
 *      published slots to choose from — the exact filter the UI applies
 *   3. every seeded group would survive the API's own template validation
 *   4. every Normal Student sits in its cohort's group with real schedules
 *   5. no instructor/room double-booked, no group has two sessions at once
 *   6. slot occupancy counters stay inside capacity
 */
const path = require('path');
const dotenv = require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv'));
const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const terms = await db.collection('academicterms').find({}).toArray();
  const courses = await db.collection('courses').find({}).toArray();
  const offerings = await db.collection('courseofferings').find({}).toArray();
  const slots = await db.collection('courseslots').find({}).toArray();
  const templates = await db.collection('scheduletemplates').find({}).toArray();
  const schedules = await db.collection('studentschedules').find({}).toArray();
  const students = await db.collection('students').find({}).toArray();

  console.log(
    `terms=${terms.length} courses=${courses.length} offerings=${offerings.length} slots=${slots.length} groups=${templates.length} schedules=${schedules.length} students=${students.length}`
  );

  const courseIds = new Set(courses.map((c) => String(c._id)));
  const termIds = new Set(terms.map((t) => String(t._id)));
  const offeringById = new Map(offerings.map((o) => [String(o._id), o]));
  const slotById = new Map(slots.map((s) => [String(s._id), s]));
  const studentById = new Map(students.map((s) => [String(s._id), s]));

  // 1. no orphans
  for (const o of offerings) {
    check(courseIds.has(String(o.courseId)), `offering ${o._id} -> missing course ${o.courseId}`);
    check(termIds.has(String(o.termId)), `offering ${o._id} -> missing term ${o.termId}`);
  }
  for (const s of slots) {
    check(offeringById.has(String(s.offeringId)), `slot ${s._id} -> missing offering ${s.offeringId}`);
  }

  // 2. the UI's slot picker, term x major x semester
  const majors = ['Computer Science', 'DMET'];
  const slotOptions = (termId, major, semester) =>
    offerings
      .filter(
        (o) =>
          String(o.termId) === termId &&
          o.publicationStatus === 'Published' &&
          (!o.eligibleMajors?.length || o.eligibleMajors.includes(major)) &&
          (!o.eligibleSemesters?.length || o.eligibleSemesters.includes(String(semester)))
      )
      .flatMap((o) => slots.filter((s) => String(s.offeringId) === String(o._id)));

  console.log('\npublished slot options by term (min..max across majors x semesters 1..8):');
  for (const term of terms) {
    let min = Infinity;
    let max = 0;
    const perSemester = [];
    for (const semester of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let lowest = Infinity;
      for (const major of majors) {
        const count = slotOptions(String(term._id), major, semester).length;
        lowest = Math.min(lowest, count);
        min = Math.min(min, count);
        max = Math.max(max, count);
      }
      perSemester.push(`s${semester}:${lowest === Infinity ? '-' : lowest}`);
      check(lowest > 0, `no slot options for ${term.academicYear} ${term.season}, semester ${semester}`);
    }
    console.log(
      `  ${term.academicYear} ${term.season}: min=${min} max=${max} (${perSemester.join(' ')})`
    );
  }

  // 3. group validation, mirroring templateController.validateTemplateSlots
  for (const t of templates) {
    check(t.slots?.length > 0, `group ${t._id} has no slots`);
    check(t.publicationStatus === 'Published', `group ${t._id} is not published`);
    const seenCells = new Set();
    for (const slotId of t.slots.map(String)) {
      const slot = slotById.get(slotId);
      check(!!slot, `group ${t._id} -> missing slot ${slotId}`);
      if (!slot) continue;

      const offering = offeringById.get(String(slot.offeringId));
      check(!!offering, `slot ${slotId} -> missing offering`);
      if (!offering) continue;

      check(String(offering.termId) === String(t.termId), `group ${t._id}: slot ${slotId} belongs to another term`);
      check(offering.publicationStatus === 'Published', `group ${t._id}: slot ${slotId} offering is Draft`);
      check(
        !offering.eligibleMajors?.length || offering.eligibleMajors.includes(t.major),
        `group ${t._id} (${t.major}): slot ${slotId} not offered to that major`
      );
      check(
        !offering.eligibleSemesters?.length || offering.eligibleSemesters.includes(String(t.semester)),
        `group ${t._id} (sem ${t.semester}): slot ${slotId} not offered to that semester`
      );

      const cell = `${slot.dayOfWeek}|${slot.startTime}`;
      check(!seenCells.has(cell), `group ${t._id}: two sessions at ${cell} (student time conflict)`);
      seenCells.add(cell);
    }
  }

  // 4. students in groups
  const normal = students.filter((s) => s.studentType === 'Normal Student');
  // The same rule scheduleSeed.js applies: the soonest season-matched term
  // that has not finished (falling back to the most recent closed one).
  const homeTermOf = (student) => {
    const wanted = student.currentSemester % 2 === 1 ? 'Winter' : 'Spring';
    const matching = terms.filter((t) => t.season === wanted);
    const open = matching.filter((t) => new Date(t.termEndDate).getTime() >= Date.now());
    const candidates = open.length ? open : matching;
    return candidates.length
      ? candidates.reduce((soonest, t) =>
          new Date(t.termEndDate) < new Date(soonest.termEndDate) ? t : soonest
        )
      : terms[0];
  };
  const templateByKey = new Map(
    templates.map((t) => [`${String(t.termId)}::${t.major}::${t.semester}::${t.studyGroup}`, t])
  );
  for (const student of normal) {
    check(!!student.studyGroup, `${student.fullName} has no studyGroup`);
    const homeTerm = homeTermOf(student);
    const template = templateByKey.get(
      `${String(homeTerm._id)}::${student.major}::${student.currentSemester}::${student.studyGroup}`
    );
    check(!!template, `${student.fullName}: no group ${student.studyGroup} in their home term`);

    const mine = schedules.filter(
      (row) => String(row.studentId) === String(student._id) && String(row.termId) === String(homeTerm._id)
    );
    check(
      template ? mine.length === template.slots.length : false,
      `${student.fullName}: ${mine.length} schedule rows, group has ${template?.slots.length} slots`
    );
    check(
      mine.every((row) => row.status === 'Processed'),
      `${student.fullName}: schedule rows are not all Processed`
    );
    check(
      mine.every((row) => template?.slots.map(String).includes(String(row.slotId))),
      `${student.fullName}: schedule rows do not match their group's slots`
    );
  }

  // every schedule row points at real documents
  for (const row of schedules) {
    check(studentById.has(String(row.studentId)), `schedule ${row._id} -> missing student`);
    check(slotById.has(String(row.slotId)), `schedule ${row._id} -> missing slot`);
    check(termIds.has(String(row.termId)), `schedule ${row._id} -> missing term`);
  }

  // 5. conflict rules, exactly as conflictService checks them
  const booked = new Map();
  for (const slot of slots) {
    for (const [kind, id] of [
      ['instructor', String(slot.instructorId)],
      ['room', String(slot.roomId)],
    ]) {
      const key = `${kind}:${id}:${slot.dayOfWeek}`;
      for (const other of booked.get(key) ?? []) {
        const overlaps = slot.startTime < other.endTime && other.startTime < slot.endTime;
        check(
          !overlaps,
          `${kind} conflict on ${slot.dayOfWeek}: ${other.startTime}-${other.endTime} vs ${slot.startTime}-${slot.endTime}`
        );
      }
      booked.set(key, [...(booked.get(key) ?? []), slot]);
    }
  }

  // 6. occupancy counters
  for (const slot of slots) {
    check(
      slot.assignedCount <= slot.maxCapacity,
      `slot ${slot._id}: assignedCount ${slot.assignedCount} > capacity ${slot.maxCapacity}`
    );
    check(slot.assignedCount >= 0, `slot ${slot._id}: negative assignedCount`);
  }

  // a quick look at the groups themselves
  console.log('\nseeded groups:');
  for (const t of templates.sort((a, b) => String(a.major).localeCompare(String(b.major)) || a.semester - b.semester)) {
    const term = terms.find((x) => String(x._id) === String(t.termId));
    const members = normal.filter(
      (s) =>
        s.major === t.major &&
        s.currentSemester === t.semester &&
        s.studyGroup === t.studyGroup &&
        String(homeTermOf(s)._id) === String(t.termId)
    );
    console.log(
      `  ${term.academicYear} ${term.season} | ${t.major} sem ${t.semester} | ${t.studyGroup} | ${t.slots.length} slots | ${members.length} student(s)`
    );
  }

  await mongoose.disconnect();

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nall scheduling checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

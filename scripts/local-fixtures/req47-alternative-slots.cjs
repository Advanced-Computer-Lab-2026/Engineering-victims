/**
 * LOCAL-ONLY GUI fixture for requirement 47 (compare slot alternatives).
 *
 * The seeded 2026/2027 Winter term has a single group (G1) for every lecture,
 * tutorial and lab, so the comparison drawer has nothing to compare. This
 * script adds four clearly tagged CSEN 501 Lecture groups to the existing
 * local CSEN 501 Winter offering, shaped around Salma Ibrahim (64-30010),
 * whose pending request is for CSEN 501 Lecture G1 (Mon 13:15-14:45):
 *
 *   G2  Sun 08:00-09:30   50 of 60 free   -> available (no clash)
 *   G3  Wed 09:45-11:15   55 of 60 free   -> clashes with her CSEN 301 Lecture
 *   G4  Sun 11:30-13:00    0 of 40 free   -> full
 *   G5  Tue 11:30-13:15    1 of 60 free   -> ends as her CSEN 501 Tutorial starts:
 *                                           adjacent, so NOT a clash
 *
 * Safety:
 * - The connection string and database name are fixed below. The script never
 *   reads server/.env or MONGODB_URI, so it cannot reach Atlas, and it refuses
 *   to run if those constants are changed to anything else.
 * - Every inserted slot carries `testFixtureTag` and a "TEST47-" room, and
 *   cleanup deletes only documents with that tag.
 * - Existing seed records are never updated or deleted. The fixture inserts
 *   new CourseSlot documents only; G1's counts and every schedule row stay as
 *   they are. The fixture's assignedCount values are synthetic (no student
 *   schedule rows back them); they only exist to show seats in the GUI.
 * - Before planning, it finds Salma's Pending request on CSEN 501 Lecture G1
 *   and refuses unless it belongs to 64-30010, its course, term and offering
 *   are the located CSEN 501 Winter 2026/2027 offering, its component is
 *   Lecture, its current slot is that offering's only G1, and it is Pending.
 * - It refuses unless G5 really ends at the start of one of Salma's slots
 *   (Tuesday 13:15), rather than assuming an adjacent, non-clashing result.
 * - It refuses to insert if the offering already has Lecture groups 2-5, if
 *   the chosen instructor or rooms would double-book, or if Salma's timetable
 *   no longer produces the expected outcome for each group.
 *
 * Usage (from the repository root):
 *   node scripts/local-fixtures/req47-alternative-slots.cjs            # dry run: checks and prints the plan
 *   node scripts/local-fixtures/req47-alternative-slots.cjs --apply    # inserts the four tagged slots
 *   node scripts/local-fixtures/req47-alternative-slots.cjs --cleanup  # deletes only the tagged slots
 */
const path = require('node:path');
const { MongoClient } = require(path.join(__dirname, '..', '..', 'server', 'node_modules', 'mongodb'));

const LOCAL_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'university_schedule_test';
const TAG = 'req47-local-alternatives';
const ROOM_PREFIX = 'TEST47-';

const COURSE_CODE = 'CSEN 501';
const TERM = { academicYear: '2026/2027', season: 'Winter' };
const SLOT_TYPE = 'Lecture';
const STUDENT_ID = '64-30010'; // Salma Ibrahim
const INSTRUCTOR_EMAIL = 'meriam.khalifa@guc.edu.eg'; // TA account; seeded with no teaching slots

const PLAN = [
  { groupNumber: 2, dayOfWeek: 'Sunday', startTime: '08:00', endTime: '09:30', maxCapacity: 60, assignedCount: 10, expect: 'available' },
  { groupNumber: 3, dayOfWeek: 'Wednesday', startTime: '09:45', endTime: '11:15', maxCapacity: 60, assignedCount: 5, expect: 'clash' },
  { groupNumber: 4, dayOfWeek: 'Sunday', startTime: '11:30', endTime: '13:00', maxCapacity: 40, assignedCount: 40, expect: 'full' },
  // Must end exactly when one of Salma's slots begins, to show adjacency is not a clash.
  { groupNumber: 5, dayOfWeek: 'Tuesday', startTime: '11:30', endTime: '13:15', maxCapacity: 60, assignedCount: 59, expect: 'available',
    adjacentTo: { dayOfWeek: 'Tuesday', startTime: '13:15' } },
];

const mode = process.argv.includes('--cleanup') ? 'cleanup' : process.argv.includes('--apply') ? 'apply' : 'dry-run';

// Same rule as server/services/conflictService.js: strict bounds, so adjacent slots do not overlap.
const overlaps = (a, b) => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime;

const fail = (message) => {
  console.error(`\nREFUSED: ${message}`);
  process.exit(1);
};

const assertLocalTarget = () => {
  const url = new URL(LOCAL_URI);
  if (LOCAL_URI !== 'mongodb://127.0.0.1:27017' || url.protocol !== 'mongodb:' || url.hostname !== '127.0.0.1' || url.port !== '27017') {
    fail(`this fixture only runs against mongodb://127.0.0.1:27017 (got ${LOCAL_URI}).`);
  }
  if (DB_NAME !== 'university_schedule_test') fail(`this fixture only runs against university_schedule_test (got ${DB_NAME}).`);
};

const main = async () => {
  assertLocalTarget();
  console.log(`Target: ${LOCAL_URI}/${DB_NAME}   Mode: ${mode}   Tag: ${TAG}`);

  const client = new MongoClient(LOCAL_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const names = (await client.db().admin().listDatabases({ nameOnly: true })).databases.map((d) => d.name);
    if (!names.includes(DB_NAME)) fail(`${DB_NAME} does not exist on the local server; seed it first.`);
    const db = client.db(DB_NAME);
    const slots = db.collection('courseslots');

    if (mode === 'cleanup') {
      const tagged = await slots.find({ testFixtureTag: TAG }).project({ _id: 1, groupNumber: 1 }).toArray();
      if (!tagged.length) {
        console.log('Nothing to clean up: no slots carry the fixture tag.');
        return;
      }
      const ids = tagged.map((s) => s._id);
      const [rows, requests] = await Promise.all([
        db.collection('studentschedules').countDocuments({ slotId: { $in: ids } }),
        db.collection('slotchangerequests').countDocuments({ $or: [{ currentSlot: { $in: ids } }, { replacementSlot: { $in: ids } }] }),
      ]);
      if (rows || requests) {
        fail(
          `${rows} schedule row(s) and ${requests} slot-change request(s) now reference the fixture slots ` +
            '(probably from GUI testing of req 48). Deleting the slots would leave them dangling. ' +
            'Reset the local test database by re-seeding it instead.'
        );
      }
      const result = await slots.deleteMany({ testFixtureTag: TAG });
      console.log(`Deleted ${result.deletedCount} tagged slot(s): groups ${tagged.map((s) => s.groupNumber).join(', ')}.`);
      return;
    }

    // ---- Look everything up by name, never by hard-coded id ----
    const course = await db.collection('courses').findOne({ code: COURSE_CODE });
    if (!course) fail(`course ${COURSE_CODE} not found.`);
    const term = await db.collection('academicterms').findOne(TERM);
    if (!term) fail(`term ${TERM.academicYear} ${TERM.season} not found.`);
    const offering = await db.collection('courseofferings').findOne({ courseId: course._id, termId: term._id });
    if (!offering) fail(`no ${COURSE_CODE} offering in ${TERM.academicYear} ${TERM.season}.`);
    const instructor = await db.collection('users').findOne({ email: INSTRUCTOR_EMAIL, role: 'Advisor' });
    if (!instructor) fail(`instructor ${INSTRUCTOR_EMAIL} not found.`);
    const student = await db.collection('students').findOne({ studentId: STUDENT_ID });
    if (!student) fail(`student ${STUDENT_ID} not found.`);

    const already = await slots.countDocuments({ testFixtureTag: TAG });
    if (already) {
      console.log(`The fixture is already applied (${already} tagged slot(s)). Run --cleanup first to re-apply.`);
      return;
    }
    const existing = await slots
      .find({ offeringId: offering._id, slotType: SLOT_TYPE })
      .project({ groupNumber: 1, dayOfWeek: 1, startTime: 1, endTime: 1 })
      .toArray();
    const taken = existing.map((s) => s.groupNumber).filter((g) => PLAN.some((p) => p.groupNumber === g));
    if (taken.length) fail(`${COURSE_CODE} ${SLOT_TYPE} already has group(s) ${taken.join(', ')}; not overwriting real data.`);
    const g1 = existing.filter((s) => s.groupNumber === 1);
    if (g1.length !== 1) fail(`expected exactly one ${COURSE_CODE} ${SLOT_TYPE} G1, found ${g1.length}.`);
    const current = g1[0];

    // ---- The request the fixture is built for must be exactly what the plan assumes ----
    // Located by student and current slot; at most one can be Pending (unique partial index).
    const candidates = await db
      .collection('slotchangerequests')
      .find({ student: student._id, currentSlot: current._id })
      .toArray();
    const pending = candidates.filter((r) => r.status === 'Pending');
    if (pending.length !== 1) {
      fail(
        `expected exactly one Pending request from ${STUDENT_ID} for ${COURSE_CODE} ${SLOT_TYPE} G1, found ${pending.length}` +
          (candidates.length ? ` (statuses on that slot: ${candidates.map((r) => r.status).join(', ')})` : '') +
          '. Submit it as Salma in the GUI first.'
      );
    }
    const target = pending[0];
    const owner = await db.collection('students').findOne({ _id: target.student }, { projection: { studentId: 1 } });
    const same = (a, b) => a != null && b != null && String(a) === String(b);
    const requestChecks = [
      ['belongs to Salma (64-30010)', owner?.studentId === STUDENT_ID],
      [`course is ${COURSE_CODE}`, same(target.course, course._id) && same(target.course, offering.courseId)],
      [`term is ${TERM.academicYear} ${TERM.season}`, same(target.term, term._id) && same(target.term, offering.termId)],
      ['offering is the located CSEN 501 Winter offering', same(target.offering, offering._id)],
      [`component is ${SLOT_TYPE}`, target.slotType === SLOT_TYPE],
      ['current slot is the offering G1', same(target.currentSlot, current._id)],
      ['status is Pending', target.status === 'Pending'],
    ];
    console.log(`\nRequest ${target._id}:`);
    requestChecks.forEach(([label, ok]) => console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`));
    const failedChecks = requestChecks.filter(([, ok]) => !ok).map(([label]) => label);
    if (failedChecks.length) fail(`request ${target._id} does not match the plan: ${failedChecks.join('; ')}.`);

    // ---- Same conflict rules the offering editor applies: instructor and room ----
    const instructorSlots = await slots.find({ instructorId: instructor._id }).toArray();
    const docs = PLAN.map((p) => ({
      offeringId: offering._id,
      instructorId: instructor._id,
      slotType: SLOT_TYPE,
      groupNumber: p.groupNumber,
      dayOfWeek: p.dayOfWeek,
      startTime: p.startTime,
      endTime: p.endTime,
      roomId: `${ROOM_PREFIX}${COURSE_CODE.replace(' ', '')}-L${p.groupNumber}`,
      maxCapacity: p.maxCapacity,
      assignedCount: p.assignedCount,
      testFixtureTag: TAG,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    }));
    for (const doc of docs) {
      const busy = instructorSlots.find((s) => overlaps(s, doc));
      if (busy) fail(`${INSTRUCTOR_EMAIL} already teaches ${busy.dayOfWeek} ${busy.startTime}-${busy.endTime}; G${doc.groupNumber} would double-book.`);
      const roomBusy = await slots.findOne({ roomId: doc.roomId });
      if (roomBusy) fail(`room ${doc.roomId} already exists; not reusing it.`);
    }

    // ---- Prove each group will show the intended outcome for Salma ----
    const rows = await db
      .collection('studentschedules')
      .find({ studentId: student._id, termId: term._id, status: { $in: ['Active', 'Processed'] }, slotId: { $ne: current._id } })
      .toArray();
    const timetable = await slots.find({ _id: { $in: rows.map((r) => r.slotId) } }).toArray();

    // ---- Adjacency must be real, not assumed: the slot it touches has to exist ----
    for (const [i, p] of PLAN.entries()) {
      if (!p.adjacentTo) continue;
      const doc = docs[i];
      if (doc.dayOfWeek !== p.adjacentTo.dayOfWeek || doc.endTime !== p.adjacentTo.startTime) {
        fail(
          `G${doc.groupNumber} is ${doc.dayOfWeek} ${doc.startTime}-${doc.endTime} but is meant to end exactly at ` +
            `${p.adjacentTo.dayOfWeek} ${p.adjacentTo.startTime}.`
        );
      }
      const touching = timetable.filter((s) => s.dayOfWeek === p.adjacentTo.dayOfWeek && s.startTime === p.adjacentTo.startTime);
      if (!touching.length) {
        fail(
          `Salma has no assigned slot starting ${p.adjacentTo.dayOfWeek} ${p.adjacentTo.startTime}, so G${doc.groupNumber} ` +
            'would not demonstrate an adjacent (non-clashing) slot.'
        );
      }
      console.log(
        `  ok    G${doc.groupNumber} ends ${doc.dayOfWeek} ${doc.endTime}, exactly when Salma's ` +
          touching.map((s) => `${s.slotType} G${s.groupNumber} (${s.startTime}-${s.endTime})`).join(', ') +
          ' begins'
      );
    }

    const verdicts = docs.map((doc) => {
      const clashes = timetable.filter((s) => overlaps(s, doc));
      const full = doc.maxCapacity - doc.assignedCount <= 0;
      const outcome = full ? 'full' : clashes.length ? 'clash' : 'available';
      return { doc, clashes, outcome };
    });

    console.log(`\nOffering ${COURSE_CODE} ${TERM.academicYear} ${TERM.season} (${offering._id}); current ${SLOT_TYPE} G1 ${current.dayOfWeek} ${current.startTime}-${current.endTime}`);
    console.log(`Instructor for the fixture groups: ${instructor.fullName} (${INSTRUCTOR_EMAIL})\n`);
    verdicts.forEach(({ doc, clashes, outcome }, i) => {
      const seats = doc.maxCapacity - doc.assignedCount;
      console.log(
        `  G${doc.groupNumber}  ${doc.dayOfWeek.padEnd(9)} ${doc.startTime}-${doc.endTime}  ${doc.roomId.padEnd(18)} ` +
          `${String(seats).padStart(2)} of ${doc.maxCapacity} free  -> ${outcome}` +
          (clashes.length ? ` (with ${clashes.map((s) => `${s.dayOfWeek} ${s.startTime}-${s.endTime}`).join(', ')})` : '') +
          (outcome !== PLAN[i].expect ? `   EXPECTED ${PLAN[i].expect}` : '')
      );
    });
    const wrong = verdicts.filter(({ outcome }, i) => outcome !== PLAN[i].expect);
    if (wrong.length) fail("Salma's timetable no longer matches the plan; nothing was inserted.");

    if (mode === 'dry-run') {
      console.log('\nDry run only: nothing was written. Re-run with --apply to insert these four tagged slots.');
      return;
    }

    const result = await slots.insertMany(docs);
    console.log(`\nInserted ${result.insertedCount} tagged slot(s). Remove them with --cleanup.`);
  } finally {
    await client.close();
  }
};

main().catch((err) => {
  console.error('ERROR', err.message);
  process.exit(1);
});

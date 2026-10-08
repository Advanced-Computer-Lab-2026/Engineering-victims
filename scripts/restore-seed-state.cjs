/**
 * Puts the shared demo database back to seed-exact state after a run of
 * scripts/api-smoke.cjs.
 *
 *   node scripts/restore-seed-state.cjs           # dry run, changes nothing
 *   node scripts/restore-seed-state.cjs --apply   # write the changes
 *
 * The smoke script performs the real Req 30 flow against whatever database the
 * server is pointed at: it assigns the first Normal Student in the directory to
 * group G2 of the first term. That student's own cohort term is Winter, so the
 * run leaves three kinds of drift behind:
 *
 *   1. `studyGroup` no longer matches the round-robin label scheduleSeed.js
 *      writes for the cohort (G1/G2 by position in the seed order);
 *   2. processed schedule rows exist in a term that is not the student's home
 *      term (odd semesters sit in Winter, even ones in Spring);
 *   3. `lastUpdateAt` / `updatedAt` were bumped to the moment of the run
 *      instead of the seed's staggered values.
 *
 * It also clears "Your password was changed" notifications: those are only ever
 * written by the password-change flow, never by the seed.
 *
 * Expected values are recomputed from config/seedData.js rather than stored, so
 * the script stays correct if the seed data changes. Read flags on notifications
 * and any other content drift are reported by scripts/verify-seed-state.cjs;
 * `node seed/seed.cjs` rebuilds the whole database when that is what is wanted.
 */
const path = require('path');
const dotenv = require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv'));
const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const SERVER = path.join(__dirname, '..', 'server');
const APPLY = process.argv.includes('--apply');
const HOUR = 60 * 60 * 1000;
const STAGGER = 18 * HOUR; // seedData.js staggers lastUpdateAt by (index + 1) * 18h
/** The seed writes the whole directory within a second of wall-clock time, so
 *  a real tamper is hours or days away and a millisecond of insert spread is
 *  not drift at all. */
const TIMESTAMP_SLACK = 5 * 1000;
/**
 * `updatedAt` moves again a few seconds later, when the seed derives the swap
 * statuses of the Normal Students, so the directory holds two clusters of
 * values about 13 seconds apart. Ten minutes of slack still separates those
 * from a smoke run or a demo edit, which lands hours or days later.
 */
const UPDATED_AT_SLACK = 10 * 60 * 1000;
const near = (a, b, slack = TIMESTAMP_SLACK) => Math.abs(a - b) <= slack;
const GROUP_LABELS = ['G1', 'G2']; // scheduleSeed.js

/** Same rule scheduleSeed.js uses: odd semesters in Winter, even in Spring. */
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

/** Median, so one student whose timestamp was bumped cannot skew the seed time. */
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const { STUDENTS } = require(path.join(SERVER, 'config', 'seedData'));
  const terms = await db.collection('academicterms').find({}).toArray();
  const students = await db.collection('students').find({}).toArray();
  const templates = await db.collection('scheduletemplates').find({}).toArray();
  const byEmail = new Map(students.map((s) => [s.email, s]));

  // The instant the seed wrote the directory: every untouched student still
  // carries lastUpdateAt = seedTime - (index + 1) * 18h.
  const seedTime = median(
    STUDENTS.map((s, index) => {
      const doc = byEmail.get(s.email);
      return doc ? new Date(doc.lastUpdateAt).getTime() + (index + 1) * STAGGER : null;
    }).filter((v) => v !== null)
  );
  const seedUpdatedAt = new Map(
    [...new Set(students.map((s) => s.studentType))].map((type) => {
      const values = students
        .filter((s) => s.studentType === type)
        .map((s) => new Date(s.updatedAt).getTime());
      return [type, median(values)];
    })
  );

  // Cohorts in seed order, so each student's expected G1/G2 label is known.
  const cohorts = new Map();
  STUDENTS.forEach((student, index) => {
    if (student.studentType !== 'Normal Student') return;
    const key = `${student.major}::${student.currentSemester}`;
    const cohort = cohorts.get(key) ?? [];
    cohort.push({ email: student.email, index });
    cohorts.set(key, cohort);
  });

  const fixes = [];
  const notes = [];

  for (const [key, cohort] of cohorts) {
    const homeTerm = homeTermFor(Number(key.split('::')[1]), terms);
    const groupTemplate = templates.find(
      (t) => String(t.termId) === String(homeTerm?._id) && `${t.major}::${t.semester}` === key && t.studyGroup === GROUP_LABELS[0]
    );
    const expectedRows = groupTemplate ? groupTemplate.slots.length : null;

    for (const [position, member] of cohort.entries()) {
      const doc = byEmail.get(member.email);
      if (!doc) { notes.push(`${member.email}: not in the students collection`); return; }

      const expectedGroup = GROUP_LABELS[position % GROUP_LABELS.length];
      const expectedLastUpdate = new Date(seedTime - (member.index + 1) * STAGGER);

      if (doc.studyGroup !== expectedGroup) {
        fixes.push({
          label: `${member.email}: studyGroup ${doc.studyGroup} -> ${expectedGroup}`,
          run: () => db.collection('students').updateOne({ _id: doc._id }, { $set: { studyGroup: expectedGroup } }),
        });
      }
      if (!near(new Date(doc.lastUpdateAt).getTime(), expectedLastUpdate.getTime(), TIMESTAMP_SLACK)) {
        fixes.push({
          label: `${member.email}: lastUpdateAt ${new Date(doc.lastUpdateAt).toISOString()} -> ${expectedLastUpdate.toISOString()}`,
          run: () => db.collection('students').updateOne({ _id: doc._id }, { $set: { lastUpdateAt: expectedLastUpdate } }),
        });
      }
      const expectedUpdatedAt = seedUpdatedAt.get(doc.studentType);
      if (!near(new Date(doc.updatedAt).getTime(), expectedUpdatedAt, UPDATED_AT_SLACK)) {
        fixes.push({
          label: `${member.email}: updatedAt ${new Date(doc.updatedAt).toISOString()} -> ${new Date(expectedUpdatedAt).toISOString()} (seed median for ${doc.studentType}s)`,
          run: () => db.collection('students').updateOne({ _id: doc._id }, { $set: { updatedAt: new Date(expectedUpdatedAt) } }),
        });
      }

      // Rows anywhere but the home term are smoke-run leftovers.
      const strayTerms = await db
        .collection('studentschedules')
        .distinct('termId', { studentId: doc._id, termId: { $ne: homeTerm?._id } });
      if (strayTerms.length) {
        fixes.push({
          label: `${member.email}: delete schedule rows outside the home term (${homeTerm ? `${homeTerm.academicYear} ${homeTerm.season}` : 'unset'})`,
          run: async () => {
            const res = await db.collection('studentschedules').deleteMany({ studentId: doc._id, termId: { $ne: homeTerm?._id } });
            return res.deletedCount;
          },
        });
      }

      if (expectedRows !== null) {
        const homeRows = await db.collection('studentschedules').countDocuments({ studentId: doc._id, termId: homeTerm._id });
        if (homeRows !== expectedRows) {
          notes.push(
            `${member.email}: home term holds ${homeRows} rows, the ${GROUP_LABELS[0]} template has ${expectedRows} — needs a manual look (a reseed via \`node seed/seed.cjs\` rebuilds it)`
          );
        }
      }
    }
  }

  // Advising Students never join a standard group, but the seed writes their
  // directory timestamps the same way, so they get the same two checks.
  const cohortEmails = new Set([...cohorts.values()].flat().map((member) => member.email));
  for (const doc of students) {
    if (cohortEmails.has(doc.email)) continue;
    const index = STUDENTS.findIndex((s) => s.email === doc.email);
    if (index < 0) { notes.push(`${doc.email}: not listed in the seed`); continue; }

    const expectedLastUpdate = new Date(seedTime - (index + 1) * STAGGER);
    if (!near(new Date(doc.lastUpdateAt).getTime(), expectedLastUpdate.getTime())) {
      fixes.push({
        label: `${doc.email}: lastUpdateAt ${new Date(doc.lastUpdateAt).toISOString()} -> ${expectedLastUpdate.toISOString()}`,
        run: () => db.collection('students').updateOne({ _id: doc._id }, { $set: { lastUpdateAt: expectedLastUpdate } }),
      });
    }

    const expectedUpdatedAt = seedUpdatedAt.get(doc.studentType);
    if (!near(new Date(doc.updatedAt).getTime(), expectedUpdatedAt, UPDATED_AT_SLACK)) {
      fixes.push({
        label: `${doc.email}: updatedAt ${new Date(doc.updatedAt).toISOString()} -> ${new Date(expectedUpdatedAt).toISOString()} (seed median for ${doc.studentType}s)`,
        run: () => db.collection('students').updateOne({ _id: doc._id }, { $set: { updatedAt: new Date(expectedUpdatedAt) } }),
      });
    }
  }

  // workflowStatus is derived, never typed in by hand (Req 6): the seed writes
  // the status listed in STUDENTS and derives the blocking step from it, while
  // an assign run overwrites both with "Schedule Assigned" / null.
  const { WORKFLOW } = require(path.join(SERVER, 'services', 'workflowService'));
  for (const doc of students) {
    const seeded = STUDENTS.find((s) => s.email === doc.email);
    if (!seeded) continue;
    const table = WORKFLOW[doc.studentType] || WORKFLOW['Normal Student'];
    const expectedBlocking = table.find((entry) => entry.status === seeded.workflowStatus)?.blockingStep ?? null;
    const statusOk = doc.workflowStatus === seeded.workflowStatus;
    const blockingOk = (doc.blockingStep ?? null) === expectedBlocking;
    if (!statusOk || !blockingOk) {
      fixes.push({
        label: `${doc.email}: workflow ${doc.workflowStatus}/${doc.blockingStep ?? 'null'} -> ${seeded.workflowStatus}/${expectedBlocking ?? 'null'}`,
        run: () =>
          db.collection('students').updateOne(
            { _id: doc._id },
            { $set: { workflowStatus: seeded.workflowStatus, blockingStep: expectedBlocking } }
          ),
      });
    }
  }

  // Notifications only the password-change flow writes; the seed never does.
  const strayNotifications = await db.collection('notifications').find({ title: 'Your password was changed' }).toArray();
  if (strayNotifications.length) {
    fixes.push({
      label: `delete ${strayNotifications.length} notification(s) titled "Your password was changed"`,
      run: async () => {
        const res = await db.collection('notifications').deleteMany({ _id: { $in: strayNotifications.map((n) => n._id) } });
        return res.deletedCount;
      },
    });
  }

  console.log(`inferred seed time: ${new Date(seedTime).toISOString()}`);
  console.log(`planned changes: ${fixes.length}`);
  fixes.forEach((fix) => console.log(`  - ${fix.label}`));
  notes.forEach((note) => console.log(`  ! ${note}`));

  if (!APPLY) {
    console.log('\ndry run — pass --apply to write these changes');
    await mongoose.disconnect();
    return;
  }

  let changed = 0;
  for (const fix of fixes) {
    const result = await fix.run();
    if (typeof result === 'number') changed += result;
    else changed += 1;
  }
  console.log(`\napplied ${fixes.length} fix(es), ${changed} document(s) touched`);
  console.log('confirm with: node scripts/verify-seed-state.cjs');
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });

/**
 * Proves the shared demo database still matches what `config/seedData.js`
 * would build from scratch.
 *
 *   node scripts/verify-seed-state.cjs
 *
 * It seeds a throwaway database (`eng_victims_seedcmp`) from the project's own
 * seed on the same Atlas cluster, then diffs that fresh copy against the
 * database the app actually runs on, collection by collection. The throwaway
 * database is dropped afterwards; the shared one is only ever read.
 *
 * Volatile fields are excluded from the comparison, because a reseed always
 * changes them: document _ids, reference ids, bcrypt hashes and timestamps
 * that are relative to when the seed ran. Everything else — counts, statuses,
 * group membership, slot capacity counters, notification titles and read
 * flags — has to match exactly.
 *
 * Passwords get their own check: every seeded account's hash is compared
 * against the plaintext the README and seedData.js document.
 */
const path = require('path');
const dotenv = require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv'));
const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const TEMP_DB = 'eng_victims_seedcmp';
const SERVER = path.join(__dirname, '..', 'server');

const isVolatileKey = (key) =>
  ['_id', '__v', 'password', 'createdAt', 'updatedAt', 'lastUpdateAt', 'readAt', 'resetPasswordToken', 'resetPasswordExpires'].includes(key);

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return undefined; // dropped: relative to seed time
  if (value && typeof value === 'object' && value._bsontype === 'ObjectId') return undefined; // dropped: regenerated
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (isVolatileKey(key)) continue;
      const v = canonical(value[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return value;
};

const fingerprint = (docs, resolver) => docs.map((doc) => JSON.stringify(canonical(resolver ? resolver(doc) : doc))).sort();

const diff = (label, shared, fresh) => {
  const count = (list) => {
    const map = new Map();
    list.forEach((item) => map.set(item, (map.get(item) ?? 0) + 1));
    return map;
  };
  const a = count(shared);
  const b = count(fresh);
  const onlyShared = [...a.entries()].filter(([item, n]) => (b.get(item) ?? 0) !== n);
  const onlyFresh = [...b.entries()].filter(([item, n]) => (a.get(item) ?? 0) !== n);
  const ok = !onlyShared.length && !onlyFresh.length && shared.length === fresh.length;
  console.log(`  ${ok ? 'OK  ' : 'DIFF'} ${label} (shared ${shared.length}, fresh ${fresh.length})`);
  if (!ok) {
    onlyShared.slice(0, 6).forEach(([item]) => console.log(`       only in shared: ${item.slice(0, 200)}`));
    onlyFresh.slice(0, 6).forEach(([item]) => console.log(`       only in fresh : ${item.slice(0, 200)}`));
  }
  return ok;
};

const dump = async (db) => {
  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  const out = {};
  for (const name of names) out[name] = await db.collection(name).find({}).toArray();
  return out;
};

/** Fingerprints for the collections that are mostly ids: resolve refs to labels first. */
const buildChecks = (data) => {
  const terms = new Map(data.academicterms.map((t) => [String(t._id), `${t.academicYear} ${t.season}`]));
  const students = new Map(data.students.map((s) => [String(s._id), `${s.major}::${s.currentSemester}::${s.studentType}`]));
  const studentNumbers = new Map(data.students.map((s) => [String(s._id), s.studentId]));
  const slots = new Map(data.courseslots.map((s) => [String(s._id), `${s.dayOfWeek}|${s.startTime}|${s.slotType}`]));
  const courses = new Map(data.courses.map((c) => [String(c._id), c.courseCode]));
  const removalCourses = new Map(data.courses.map((c) => [String(c._id), c.code]));
  const userEmails = new Map(data.users.map((u) => [String(u._id), u.email]));

  return [
    // password hashes are dropped here and verified separately
    ['users', fingerprint(data.users)],
    ['students', fingerprint(data.students)],
    ['academicterms', fingerprint(data.academicterms)],
    ['courses', fingerprint(data.courses)],
    [
      'courseofferings',
      fingerprint(data.courseofferings, (o) => ({
        ...o,
        courseId: courses.get(String(o.courseId)),
        termId: terms.get(String(o.termId)),
        instructorId: undefined,
      })),
    ],
    // includes assignedCount, the capacity counter the UI reads
    ['courseslots (incl. assignedCount)', fingerprint(data.courseslots, (s) => ({ ...s, offeringId: undefined }))],
    [
      'scheduletemplates',
      fingerprint(data.scheduletemplates, (t) => ({
        ...t,
        termId: terms.get(String(t.termId)),
        slots: (t.slots ?? []).map((id) => slots.get(String(id))).sort(),
      })),
    ],
    [
      'studentschedules',
      fingerprint(data.studentschedules, (row) => ({
        status: row.status,
        student: students.get(String(row.studentId)),
        term: terms.get(String(row.termId)),
        slot: slots.get(String(row.slotId)),
      })),
    ],
    // readAt is a seed-relative timestamp; whether it is set is not
    ['notifications', fingerprint(data.notifications, (n) => ({ ...n, readAt: undefined, readAtState: n.readAt == null ? 'null' : 'set' }))],
    ['wallets', fingerprint(data.wallets, (w) => ({ ...w, studentId: students.get(String(w.studentId)) }))],
    ['wallettransactions', fingerprint(data.wallettransactions, (t) => ({ ...t, studentId: students.get(String(t.studentId)) }))],
    ['schedulingpreferences', fingerprint(data.schedulingpreferences, (p) => ({ ...p, studentId: students.get(String(p.studentId)) }))],
    [
      'courserecords',
      fingerprint(data.courserecords, (r) => ({
        ...r,
        studentId: students.get(String(r.studentId)),
        courseId: courses.get(String(r.courseId)),
      })),
    ],
    [
      'mandatoryremovalrequests',
      fingerprint(data.mandatoryremovalrequests ?? [], (request) => ({
        ...request,
        student: studentNumbers.get(String(request.student)),
        course: removalCourses.get(String(request.course)),
        advisor: userEmails.get(String(request.advisor)),
        pairedCourse: removalCourses.get(String(request.pairedCourse)),
        decidedBy: userEmails.get(String(request.decidedBy)),
      })),
    ],
  ];
};

const checkPasswords = async (shared) => {
  const { ADVISORS, STAFF, STUDENTS } = require(path.join(SERVER, 'config', 'seedData'));
  const expected = [
    ...ADVISORS.map((a) => ({ email: a.email, password: 'password123', role: 'Advisor' })),
    ...STAFF.map((u) => ({ email: u.email, password: u.password, role: u.role })),
    ...STUDENTS.map((s) => ({ email: s.email, password: s.password, role: 'Student' })),
  ];
  const byEmail = new Map(shared.users.map((u) => [u.email, u]));
  const problems = [];
  for (const account of expected) {
    const user = byEmail.get(account.email);
    if (!user) { problems.push(`missing account ${account.email}`); continue; }
    if (user.role !== account.role) problems.push(`role drift ${account.email}: ${user.role} vs ${account.role}`);
    if (!(await bcrypt.compare(account.password, user.password))) problems.push(`password drift ${account.email} (documented: ${account.password})`);
  }
  shared.users.forEach((u) => { if (!byEmail.get(u.email) || !expected.find((e) => e.email === u.email)) problems.push(`unexpected account ${u.email}`); });
  return problems;
};

(async () => {
  const sharedUri = process.env.MONGODB_URI;
  if (!sharedUri) throw new Error('MONGODB_URI is not set in server/.env');
  const [base, query] = sharedUri.split('?');
  const freshUri = `${base.slice(0, base.lastIndexOf('/') + 1)}${TEMP_DB}${query ? `?${query}` : ''}`;

  console.log('reading the shared database...');
  await mongoose.connect(sharedUri);
  const shared = await dump(mongoose.connection.db);
  await mongoose.disconnect();

  console.log(`seeding ${TEMP_DB} for comparison...`);
  await mongoose.connect(freshUri, { dbName: TEMP_DB });
  const { seed } = require(path.join(SERVER, 'config', 'seedData'));
  const summary = await seed();
  console.log('fresh seed:', JSON.stringify(summary));
  const fresh = await dump(mongoose.connection.db);

  let problems = 0;

  console.log('\ncollection counts:');
  for (const name of [...new Set([...Object.keys(shared), ...Object.keys(fresh)])].sort()) {
    const a = shared[name]?.length ?? 0;
    const b = fresh[name]?.length ?? 0;
    if (a !== b) problems += 1;
    console.log(`  ${a === b ? 'OK  ' : 'DIFF'} ${name}: shared ${a}, fresh ${b}`);
  }

  console.log('\ncontent (volatile fields dropped):');
  const sharedChecks = buildChecks(shared);
  const freshChecks = buildChecks(fresh);
  sharedChecks.forEach(([label, rows], index) => {
    if (!diff(label, rows, freshChecks[index][1])) problems += 1;
  });

  console.log('\npasswords:');
  const passwordProblems = await checkPasswords(shared);
  if (passwordProblems.length) {
    problems += passwordProblems.length;
    passwordProblems.forEach((p) => console.log(`  DIFF ${p}`));
  } else {
    console.log(`  OK   all ${shared.users.length} accounts match their documented password`);
  }

  console.log(`\ndropping ${TEMP_DB}...`);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  if (problems) {
    console.error(`\n${problems} difference(s) between the shared database and a fresh seed`);
    console.error('restore with: node scripts/restore-seed-state.cjs --apply');
    process.exit(1);
  }
  console.log('\nshared database matches a fresh seed exactly');
})().catch((err) => { console.error(err); process.exit(1); });

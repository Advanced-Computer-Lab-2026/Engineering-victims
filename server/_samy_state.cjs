/** Reports Samy's current doc + the exact seed time inferred from peers. */
require('dotenv').config();
const mongoose = require('mongoose');
const { STUDENTS } = require('./config/seedData');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const students = await db.collection('students').find({}).toArray();
  const byEmail = new Map(students.map((s) => [s.email, s]));

  const H = 18 * 60 * 60 * 1000;
  const inferred = STUDENTS.map((s, k) => {
    const doc = byEmail.get(s.email);
    if (!doc) return null;
    return { email: s.email, k, T: new Date(new Date(doc.lastUpdateAt).getTime() + (k + 1) * H) };
  }).filter(Boolean);

  const samy = inferred.find((r) => r.email.includes('samy'));
  const others = inferred.filter((r) => !r.email.includes('samy'));
  const uniqueTs = [...new Set(others.map((r) => r.T.getTime()))];
  console.log('peer-inferred seed instants:', uniqueTs.map((t) => new Date(t).toISOString()));
  console.log('Samy-inferred (drifted):', samy.T.toISOString());
  const T = uniqueTs.length === 1 ? uniqueTs[0] : Math.round(others.reduce((a, r) => a + r.T.getTime(), 0) / others.length);
  console.log('seed instant T =', new Date(T).toISOString());
  console.log('Samy expected lastUpdateAt =', new Date(T - 1 * H).toISOString(), '(k=0 => T - 18h)');

  const doc = byEmail.get('samy.elgedaily@student.guc.edu.eg');
  console.log('\nSamy current doc:');
  console.log({
    _id: String(doc._id),
    studyGroup: doc.studyGroup,
    workflowStatus: doc.workflowStatus,
    blockingStep: doc.blockingStep,
    lastUpdateAt: new Date(doc.lastUpdateAt).toISOString(),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  });

  const createdAts = students.map((s) => new Date(s.createdAt).getTime()).sort((a, b) => a - b);
  const updatedAts = students.map((s) => new Date(s.updatedAt).getTime()).sort((a, b) => a - b);
  console.log('\npeer createdAt range:', new Date(createdAts[0]).toISOString(), '..', new Date(createdAts[createdAts.length - 1]).toISOString());
  console.log('peer updatedAt range:', new Date(updatedAts[0]).toISOString(), '..', new Date(updatedAts[updatedAts.length - 1]).toISOString());

  const spring = (await db.collection('academicterms').find({}).toArray()).find(
    (t) => `${t.academicYear} ${t.season}` === '2026/2027 Spring'
  );
  const winter = (await db.collection('academicterms').find({}).toArray()).find(
    (t) => `${t.academicYear} ${t.season}` === '2026/2027 Winter'
  );
  const rows = await db.collection('studentschedules').find({ studentId: doc._id }).toArray();
  const perTerm = {};
  rows.forEach((r) => { perTerm[String(r.termId)] = (perTerm[String(r.termId)] ?? 0) + 1; });
  console.log('\nSamy schedule rows per term:', {
    '2026/2027 Winter (home)': perTerm[String(winter._id)] ?? 0,
    '2026/2027 Spring (extra)': perTerm[String(spring._id)] ?? 0,
    other: Object.entries(perTerm).filter(([k]) => k !== String(winter._id) && k !== String(spring._id)),
  });
  console.log('spring rows ids sample:', rows.filter((r) => String(r.termId) === String(spring._id)).map((r) => String(r._id)).slice(0, 3));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

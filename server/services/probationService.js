const { randomUUID } = require('crypto');
const Student = require('../models/Student');
const Term = require('../models/AcademicTerm');
const Standing = require('../models/SemesterStanding');
const Warning = require('../models/ProbationWarning');
const { sendMail } = require('./mailService');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function semesterOrdinal(academicYear, season) {
  const match = /^(\d{4})[/-](\d{4})$/.exec(academicYear);
  if (!match || Number(match[2]) !== Number(match[1]) + 1 || !['Winter', 'Spring'].includes(season)) {
    throw fail('Only valid Winter and Spring academic semesters count for probation.');
  }
  return Number(match[1]) * 2 + (season === 'Spring' ? 1 : 0);
}
function evaluateStandings(records) {
  const sorted = [...records].sort((a, b) => a.ordinal - b.ordinal);
  let count = 0;
  let previous = null;
  let second = null;
  for (const row of sorted) {
    if (row.standing !== 'Probation') { count = 0; second = null; }
    else {
      if (previous == null || row.ordinal !== previous + 1) { count = 0; second = null; }
      count += 1;
      if (count === 2) second = row;
    }
    previous = row.ordinal;
  }
  return { latest: sorted.at(-1) || null, count, second };
}

// Input is an authoritative cumulative GPA at semester close, not today's GPA
// reconstructed from course records. Revisions require optimistic concurrency.
async function finalizeStanding({ studentId, termId, cumulativeGpa, expectedRevision, actorId }, now = new Date()) {
  if (typeof cumulativeGpa !== 'number' || !Number.isFinite(cumulativeGpa) || cumulativeGpa < 0.7 || cumulativeGpa > 5) throw fail('Cumulative GPA must be a number from 0.70 to 5.00.');
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw fail('expectedRevision is required (0 for a new finalization).');
  const [student, term] = await Promise.all([Student.findById(studentId), Term.findById(termId)]);
  if (!student || student.studentType !== 'Advising Student') throw fail('An advising student is required.', 404);
  if (!term) throw fail('Academic term not found.', 404);
  const ordinal = semesterOrdinal(term.academicYear, term.season);
  if (new Date(term.termEndDate) > now) throw fail('The semester must end before its standing can be finalized.', 409);
  const existing = await Standing.findOne({ student: studentId, term: termId });
  if (existing && existing.cumulativeGpa === cumulativeGpa && existing.revision === expectedRevision + 1) return existing;
  if ((existing?.revision || 0) !== expectedRevision) throw fail('Standing changed. Reload its revision before finalizing again.', 409);
  const values = { academicYear: term.academicYear, season: term.season, ordinal, cumulativeGpa,
    standing: cumulativeGpa >= 3.70 ? 'Probation' : 'Good Standing',
    finalizedAt: now, finalizedBy: actorId, checkPending: true };
  try {
    const update = { $set: values, $inc: { revision: 1 } };
    if (existing) update.$push = { previousVersions: {
      cumulativeGpa: existing.cumulativeGpa, standing: existing.standing, revision: existing.revision,
      finalizedAt: existing.finalizedAt, finalizedBy: existing.finalizedBy,
    } };
    const saved = await Standing.findOneAndUpdate({ student: studentId, term: termId, revision: expectedRevision }, update,
      { upsert: !existing, new: true, runValidators: true, setDefaultsOnInsert: false });
    if (!saved) throw fail('Standing changed. Reload before retrying.', 409);
    return saved;
  } catch (error) {
    if (error.code === 11000) throw fail('This semester was finalized concurrently. Reload before retrying.', 409);
    throw error;
  }
}

async function reconcileStudent(studentId) {
  const records = await Standing.find({ student: studentId }).sort({ ordinal: 1 }).lean();
  const evaluation = evaluateStandings(records);
  if (!evaluation.latest) return evaluation;
  // Never infer advising eligibility or reverse an explicit dismissal here.
  await Student.updateOne({ _id: studentId, academicStanding: { $ne: 'Dismissed' } }, { $set: {
    academicStanding: evaluation.latest.standing,
    consecutiveProbationSemesters: evaluation.count,
  } });
  const eligible = evaluation.second;
  await Warning.updateMany({ student: studentId, status: { $in: ['pending', 'failed'] },
    ...(eligible ? { term: { $ne: eligible.term } } : {}),
  }, { $set: { status: 'cancelled' } });
  if (eligible) {
    await Warning.findOneAndUpdate({ student: studentId, term: eligible.term }, { $setOnInsert: {
      student: studentId, term: eligible.term, termLabel: `${eligible.academicYear} ${eligible.season}`,
    } }, { upsert: true, new: true });
    // If a correction makes the same sequence eligible again, restore an unsent
    // cancelled warning; sent warnings always remain immutable audit records.
    await Warning.updateOne({ student: studentId, term: eligible.term, status: 'cancelled' }, {
      $set: { status: 'pending', nextAttemptAt: new Date(), attempts: 0, lastError: null },
    });
  }
  for (const row of records) {
    // Do not acknowledge a correction committed while this pass was running.
    await Standing.updateOne({ _id: row._id, revision: row.revision }, { $set: { checkPending: false } });
  }
  return evaluation;
}

function warningEmail(to, termLabel) {
  return { to, subject: 'Academic probation warning — two consecutive semesters',
    text: `Your finalized academic standing for ${termLabel} completes two consecutive semesters on probation.\n\n` +
      'If you do not leave probation in the following semester, you may be exposed to termination from the university.\n\n' +
      'Please contact your academic advisor to discuss your academic progress.' };
}
async function deliverNextWarning(now = new Date()) {
  const leaseToken = randomUUID();
  const warning = await Warning.findOneAndUpdate({ $or: [
    { status: 'pending', nextAttemptAt: { $lte: now } },
    { status: 'sending', leaseUntil: { $lte: now } },
  ] }, { $set: { status: 'sending', leaseToken, leaseUntil: new Date(now.getTime() + 120000) }, $inc: { attempts: 1 } },
  { new: true, sort: { nextAttemptAt: 1 } });
  if (!warning) return false;
  const owned = { _id: warning._id, leaseToken };
  try {
    const [student, records] = await Promise.all([
      Student.findById(warning.student), Standing.find({ student: warning.student }).sort({ ordinal: 1 }).lean(),
    ]);
    const evaluation = evaluateStandings(records);
    if (!student?.isActive || student.studentType !== 'Advising Student' || student.academicStanding === 'Dismissed' ||
        !/^[^@\s]+@student\.guc\.edu\.eg$/.test(student.email) ||
        !evaluation.second || String(evaluation.second.term) !== String(warning.term)) {
      await Warning.updateOne(owned, { $set: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
      return true;
    }
    const mail = await sendMail(warningEmail(student.email, warning.termLabel));
    if (!mail.ok) throw new Error('SMTP did not accept the probation warning. Check mail configuration and retry.');
    await Warning.updateOne(owned, { $set: { status: 'sent', sentAt: new Date(), lastError: null, leaseToken: null, leaseUntil: null } });
  } catch {
    await Warning.updateOne(owned, { $set: {
      status: warning.attempts >= 8 ? 'failed' : 'pending', lastError: 'Warning delivery failed; check mail service and database availability.',
      nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** Math.min(warning.attempts, 6))),
      leaseToken: null, leaseUntil: null,
    } });
  }
  return true;
}
function startProbationWorker({ intervalMs = 30000, onError = console.error } = {}) {
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const pending = await Standing.find({ checkPending: true }).select('student').limit(100).lean();
      for (const studentId of new Set(pending.map((row) => String(row.student)))) {
        if (stopped) break;
        await reconcileStudent(studentId);
      }
      for (let i = 0; i < 5 && !stopped; i += 1) if (!await deliverNextWarning()) break;
    } catch { onError('[probation] Worker could not complete its pass; pending records will be retried.'); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
module.exports = { semesterOrdinal, evaluateStandings, finalizeStanding, reconcileStudent, warningEmail, deliverNextWarning, startProbationWorker };

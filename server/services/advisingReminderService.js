const AcademicTerm = require('../models/AcademicTerm');
const Student = require('../models/Student');
const User = require('../models/User');
const { publishNotificationEvent } = require('./notificationEventService');

/**
 * Req 121: Advisors and Coordinators are reminded before the advising deadline
 * about assigned advising schedules that are still open.
 *
 * - The deadline is inclusive through the end of its day, matching the other
 *   advising-deadline checks (schedulingPreferenceService, swapRequestController).
 * - Reminders fire at fixed lead-time thresholds (7, 3 and 1 day before the end
 *   of the deadline day). Each open schedule gets at most one reminder per
 *   threshold per recipient group. A run only publishes the most urgent
 *   threshold that has been reached, so a scheduler outage never causes a burst
 *   of stale reminders.
 * - "Open" means any Advising Student workflow status other than Processed.
 * - Delivery uses the durable NotificationEvent queue. The occurrence encodes the
 *   term, the deadline version (its timestamp) and the threshold, so reruns and
 *   concurrent workers are deduplicated by the event key, while a moved deadline
 *   re-arms the reminders for the new date. Advisor occurrences also encode the
 *   advisor, so a newly assigned advisor is reminded too.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLDS = Object.freeze([
  { key: '1d', days: 1 },
  { key: '3d', days: 3 },
  { key: '7d', days: 7 },
]);
const CLOSED_STATUSES = Object.freeze(['Processed']);

const deadlineEnd = (term) => {
  const deadline = term?.advisingDeadline ? new Date(term.advisingDeadline) : null;
  if (!deadline || Number.isNaN(deadline.getTime())) return null;
  return new Date(deadline.getTime() + DAY_MS - 1);
};

/** The most urgent threshold reached for this term at `now`, or null when none applies. */
function dueThreshold(term, now = new Date()) {
  const end = deadlineEnd(term);
  if (!end) return null;
  const remaining = end.getTime() - now.getTime();
  if (remaining < 0) return null;
  return THRESHOLDS.find((threshold) => remaining <= threshold.days * DAY_MS) || null;
}

const termLabel = (term) => `${term.academicYear} ${term.season}`;
const formatDate = (date) => date.toISOString().slice(0, 10);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function buildReminder({ audience, student, term, threshold }) {
  const deadline = formatDate(new Date(term.advisingDeadline));
  const who = `${student.fullName} (${student.studentId})`;
  const lead = `Advising for ${termLabel(term)} closes at the end of ${deadline}, within ${plural(threshold.days, 'day')}.`;
  const message = audience === 'advisor'
    ? `Your assigned student ${who} still has an open advising schedule (${student.workflowStatus}). ${lead}`
    : `${who} still has an open advising schedule (${student.workflowStatus}). ${lead}`;
  return { title: 'Advising deadline reminder', message, link: `/students/${student._id}` };
}

/**
 * One scheduler pass. Safe to run repeatedly and from several processes:
 * already-published reminders resolve to the existing event instead of a new one.
 */
async function runAdvisingDeadlineReminders(now = new Date(), { onError = console.error } = {}) {
  const summary = { terms: 0, students: 0, published: 0, failed: 0 };
  // Candidate terms: the deadline day has not ended and the widest threshold is reached.
  const widest = Math.max(...THRESHOLDS.map((threshold) => threshold.days));
  const terms = await AcademicTerm.find({
    advisingDeadline: {
      $gte: new Date(now.getTime() - DAY_MS + 1),
      $lte: new Date(now.getTime() + widest * DAY_MS),
    },
  }).lean();

  const due = terms.map((term) => ({ term, threshold: dueThreshold(term, now) })).filter((row) => row.threshold);
  if (!due.length) return summary;
  summary.terms = due.length;

  const [students, advisors] = await Promise.all([
    Student.find({
      studentType: 'Advising Student',
      isActive: true,
      workflowStatus: { $nin: CLOSED_STATUSES },
    }).select('_id fullName studentId workflowStatus assignedAdvisor').lean(),
    User.find({ role: 'Advisor', isActive: true }).select('_id').lean(),
  ]);
  const activeAdvisors = new Set(advisors.map((advisor) => String(advisor._id)));
  summary.students = students.length;

  const publish = async (event) => {
    try {
      await publishNotificationEvent(event);
      summary.published += 1;
    } catch (error) {
      summary.failed += 1;
      onError('[advising-reminders] Could not enqueue reminder; it will be retried next pass:', error.message);
    }
  };

  for (const { term, threshold } of due) {
    const base = `${term._id}:${new Date(term.advisingDeadline).toISOString()}:${threshold.key}`;
    for (const student of students) {
      const advisorId = student.assignedAdvisor ? String(student.assignedAdvisor) : null;
      if (advisorId && activeAdvisors.has(advisorId)) {
        await publish({
          name: 'advising.reminder.advisor',
          entityId: term._id,
          occurrence: `${base}:${advisorId}`,
          studentId: student._id,
          ...buildReminder({ audience: 'advisor', student, term, threshold }),
        });
      }
      await publish({
        name: 'advising.reminder.coordinator',
        entityId: term._id,
        occurrence: base,
        studentId: student._id,
        ...buildReminder({ audience: 'coordinator', student, term, threshold }),
      });
    }
  }
  return summary;
}

function startAdvisingReminderWorker({ intervalMs = 15 * 60 * 1000, onError = console.error } = {}) {
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      await runAdvisingDeadlineReminders(new Date(), { onError });
    } catch (error) {
      onError('[advising-reminders] Pass failed; it will run again on the next interval:', error.message);
    } finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}

module.exports = {
  THRESHOLDS, CLOSED_STATUSES, deadlineEnd, dueThreshold, buildReminder,
  runAdvisingDeadlineReminders, startAdvisingReminderWorker,
};

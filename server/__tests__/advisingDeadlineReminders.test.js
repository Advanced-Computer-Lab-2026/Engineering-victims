// Req 121: Advisors and Coordinators receive reminders before the advising
// deadline for assigned schedules that remain open. Runs against an in-memory
// replica set so the real unique indexes enforce duplicate prevention.
jest.setTimeout(180000);
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server-core');
const User = require('../models/User');
const Student = require('../models/Student');
const Term = require('../models/AcademicTerm');
const Notification = require('../models/Notification');
const NotificationEvent = require('../models/NotificationEvent');
const { deliverNextNotificationEvent } = require('../services/notificationEventService');
const {
  THRESHOLDS, deadlineEnd, dueThreshold, runAdvisingDeadlineReminders, startAdvisingReminderWorker,
} = require('../services/advisingReminderService');

const DAY = 24 * 60 * 60 * 1000;
const DEADLINE = new Date('2027-01-15T00:00:00.000Z');
const END = new Date(DEADLINE.getTime() + DAY - 1); // end of the inclusive deadline day
const at = (msBeforeEnd) => new Date(END.getTime() - msBeforeEnd);
const quiet = { onError: () => {} };

let repl, term, coordA, coordB, coordInactive, advisorA, advisorB, advisorInactive;
let open, processed, unassigned, normal, inactiveStudent, orphaned;

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'advising_reminders_test' });
  await Promise.all([User, Student, Term, Notification, NotificationEvent].map((model) => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); if (repl) await repl.stop(); });

const staff = (name, role, isActive = true) =>
  User.create({ fullName: name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@guc.edu.eg`, password: 'test', role, isActive });
let seq = 0;
const student = (fields) => {
  seq += 1;
  return Student.create({
    fullName: `Student ${seq}`, email: `s${seq}@student.guc.edu.eg`, studentId: `64-${String(10000 + seq)}`,
    studentType: 'Advising Student', major: 'Computer Science', workflowStatus: 'Draft', ...fields,
  });
};
const makeTerm = (fields = {}) => Term.create({
  academicYear: '2026/2027', season: 'Winter',
  termStartDate: new Date('2026-09-01'), termEndDate: new Date('2027-06-30'),
  teachingStartDate: new Date('2026-09-15'), teachingEndDate: new Date('2027-06-01'),
  advisingDeadline: DEADLINE, swapDeadline: new Date('2027-01-01'), ...fields,
});

async function deliverAll() {
  while (await deliverNextNotificationEvent()) { /* drain the queue */ }
}
async function inbox(user) {
  return Notification.find({ user: user._id }).sort({ createdAt: 1 }).lean();
}
const linksFor = async (user) => (await inbox(user)).map((row) => row.link).sort();

beforeEach(async () => {
  await Promise.all([User, Student, Term, Notification, NotificationEvent].map((model) => model.deleteMany({})));
  coordA = await staff('Coord A', 'Coordinator');
  coordB = await staff('Coord B', 'Coordinator');
  coordInactive = await staff('Coord Off', 'Coordinator', false);
  advisorA = await staff('Advisor A', 'Advisor');
  advisorB = await staff('Advisor B', 'Advisor');
  advisorInactive = await staff('Advisor Off', 'Advisor', false);
  open = await student({ workflowStatus: 'Draft', assignedAdvisor: advisorA._id });
  processed = await student({ workflowStatus: 'Processed', assignedAdvisor: advisorA._id });
  unassigned = await student({ workflowStatus: 'Pending Approval', assignedAdvisor: null });
  normal = await student({ studentType: 'Normal Student', workflowStatus: 'Schedule Assigned', assignedAdvisor: advisorA._id });
  inactiveStudent = await student({ workflowStatus: 'Draft', assignedAdvisor: advisorA._id, isActive: false });
  orphaned = await student({ workflowStatus: 'Reopened', assignedAdvisor: advisorInactive._id });
  term = await makeTerm();
});

describe('timing boundaries', () => {
  test('thresholds are 7, 3 and 1 day before the end of the deadline day', () => {
    expect(THRESHOLDS.map((t) => t.key).sort()).toEqual(['1d', '3d', '7d']);
    expect(deadlineEnd(term).toISOString()).toBe('2027-01-15T23:59:59.999Z');
  });

  test.each([
    ['just outside the 7-day window', 7 * DAY + 1, null],
    ['exactly 7 days before', 7 * DAY, '7d'],
    ['just outside the 3-day window', 3 * DAY + 1, '7d'],
    ['exactly 3 days before', 3 * DAY, '3d'],
    ['just outside the 1-day window', DAY + 1, '3d'],
    ['exactly 1 day before', DAY, '1d'],
    ['the last millisecond of the deadline day', 0, '1d'],
    ['one millisecond after the deadline day', -1, null],
    ['long after the deadline', -30 * DAY, null],
  ])('%s', (_label, before, expected) => {
    expect(dueThreshold(term, at(before))?.key ?? null).toBe(expected);
  });

  test('missing or invalid deadlines never produce a threshold', () => {
    expect(dueThreshold({}, at(DAY))).toBeNull();
    expect(dueThreshold({ advisingDeadline: null }, at(DAY))).toBeNull();
    expect(dueThreshold({ advisingDeadline: 'not a date' }, at(DAY))).toBeNull();
    expect(dueThreshold(null, at(DAY))).toBeNull();
  });
});

describe('recipients and open versus completed schedules', () => {
  test('assigned active advisor and every active coordinator are reminded about open schedules only', async () => {
    const summary = await runAdvisingDeadlineReminders(at(2 * DAY), quiet);
    expect(summary).toMatchObject({ terms: 1, failed: 0 });
    await deliverAll();

    // Advisor A: only their open, active, advising student; never the processed,
    // inactive or normal student even though they are assigned to A.
    const advisorRows = await inbox(advisorA);
    expect(advisorRows.map((row) => row.link)).toEqual([`/students/${open._id}`]);
    expect(advisorRows[0]).toMatchObject({ type: 'warning', title: 'Advising deadline reminder', isRead: false });
    expect(advisorRows[0].message).toContain(open.studentId);
    expect(advisorRows[0].message).toContain('Draft');
    expect(advisorRows[0].message).toContain('2026/2027 Winter');
    expect(advisorRows[0].message).toContain('2027-01-15');
    expect(advisorRows[0].message).toContain('3 days');

    // Every open advising schedule reaches each active coordinator, including
    // unassigned ones and those whose advisor is deactivated.
    const expected = [open, unassigned, orphaned].map((s) => `/students/${s._id}`).sort();
    expect(await linksFor(coordA)).toEqual(expected);
    expect(await linksFor(coordB)).toEqual(expected);

    expect(await inbox(coordInactive)).toHaveLength(0);
    expect(await inbox(advisorB)).toHaveLength(0);
    expect(await inbox(advisorInactive)).toHaveLength(0);
    expect(await Notification.countDocuments({ link: { $in: [processed, normal, inactiveStudent].map((s) => `/students/${s._id}`) } })).toBe(0);
  });

  test('a schedule completed between thresholds gets no further reminders', async () => {
    await runAdvisingDeadlineReminders(at(6 * DAY), quiet);
    await Student.updateOne({ _id: open._id }, { $set: { workflowStatus: 'Processed' } });
    await runAdvisingDeadlineReminders(at(2 * DAY), quiet);
    await deliverAll();

    expect(await inbox(advisorA)).toHaveLength(1);
    const coordRows = await inbox(coordA);
    expect(coordRows.filter((row) => row.link === `/students/${open._id}`)).toHaveLength(1);
    expect(coordRows.filter((row) => row.link === `/students/${unassigned._id}`)).toHaveLength(2);
  });

  test('a reopened schedule becomes eligible again', async () => {
    await Student.updateOne({ _id: processed._id }, { $set: { workflowStatus: 'Reopened' } });
    await runAdvisingDeadlineReminders(at(DAY), quiet);
    await deliverAll();
    expect(await linksFor(advisorA)).toEqual([`/students/${open._id}`, `/students/${processed._id}`].sort());
  });
});

describe('repeated runs and duplicate prevention', () => {
  test('rerunning inside the same threshold does not enqueue or deliver duplicates', async () => {
    await runAdvisingDeadlineReminders(at(2 * DAY), quiet);
    const events = await NotificationEvent.countDocuments();
    expect(events).toBe(4); // advisor(open) + coordinator(open, unassigned, orphaned)
    await deliverAll();

    await runAdvisingDeadlineReminders(at(2 * DAY), quiet);
    await runAdvisingDeadlineReminders(at(DAY + 1), quiet);
    await deliverAll();

    expect(await NotificationEvent.countDocuments()).toBe(events);
    expect(await inbox(advisorA)).toHaveLength(1);
    expect(await inbox(coordA)).toHaveLength(3);
  });

  test('concurrent passes (e.g. two server instances) produce one reminder each', async () => {
    await Promise.all([1, 2, 3].map(() => runAdvisingDeadlineReminders(at(2 * DAY), quiet)));
    await Promise.all([deliverAll(), deliverAll()]);
    expect(await NotificationEvent.countDocuments()).toBe(4);
    expect(await inbox(advisorA)).toHaveLength(1);
    expect(await inbox(coordA)).toHaveLength(3);
    expect(await inbox(coordB)).toHaveLength(3);
  });

  test('each threshold fires once as the deadline approaches', async () => {
    for (const before of [7 * DAY, 5 * DAY, 3 * DAY, 2 * DAY, DAY, 1000, 0]) {
      await runAdvisingDeadlineReminders(at(before), quiet);
    }
    await deliverAll();
    const rows = await inbox(advisorA);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.message.match(/within (\d+ days?)/)[1])).toEqual(['7 days', '3 days', '1 day']);
    expect(await inbox(coordA)).toHaveLength(9);
  });

  test('after scheduler downtime only the most urgent reached threshold is sent', async () => {
    await runAdvisingDeadlineReminders(at(DAY / 2), quiet);
    await deliverAll();
    const rows = await inbox(advisorA);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('within 1 day');
  });

  test('moving the deadline re-arms reminders for the new date', async () => {
    await runAdvisingDeadlineReminders(at(2 * DAY), quiet);
    const moved = new Date(DEADLINE.getTime() + 10 * DAY);
    await Term.updateOne({ _id: term._id }, { $set: { advisingDeadline: moved } });
    // At the old 2-days-before moment the moved deadline is 12 days away: nothing due.
    expect(await runAdvisingDeadlineReminders(at(2 * DAY), quiet)).toMatchObject({ terms: 0, published: 0 });
    await runAdvisingDeadlineReminders(new Date(END.getTime() + 10 * DAY - 2 * DAY), quiet);
    await deliverAll();
    const rows = await inbox(advisorA);
    expect(rows).toHaveLength(2);
    expect(rows[1].message).toContain('2027-01-25');
  });

  test('a newly assigned advisor is reminded without re-reminding the coordinators', async () => {
    await runAdvisingDeadlineReminders(at(2 * DAY), quiet);
    await deliverAll();
    await Student.updateOne({ _id: open._id }, { $set: { assignedAdvisor: advisorB._id } });
    await runAdvisingDeadlineReminders(at(2 * DAY - 1000), quiet);
    await deliverAll();
    expect(await inbox(advisorA)).toHaveLength(1);
    expect(await linksFor(advisorB)).toEqual([`/students/${open._id}`]);
    expect(await inbox(coordA)).toHaveLength(3);
  });
});

describe('missing or passed deadlines', () => {
  test('nothing is sent once the deadline day has ended', async () => {
    const summary = await runAdvisingDeadlineReminders(at(-1), quiet);
    expect(summary).toEqual({ terms: 0, students: 0, published: 0, failed: 0 });
    expect(await NotificationEvent.countDocuments()).toBe(0);
  });

  test('nothing is sent while the deadline is more than 7 days away', async () => {
    expect(await runAdvisingDeadlineReminders(at(30 * DAY), quiet)).toMatchObject({ terms: 0, published: 0 });
    expect(await NotificationEvent.countDocuments()).toBe(0);
  });

  test('nothing is sent when no term has an advising deadline in range', async () => {
    await Term.deleteMany({});
    // Terms require a deadline, so simulate a legacy row missing it.
    await Term.collection.insertOne({ academicYear: '2025/2026', season: 'Spring' });
    expect(await runAdvisingDeadlineReminders(at(DAY), quiet)).toMatchObject({ terms: 0, published: 0 });
    expect(await NotificationEvent.countDocuments()).toBe(0);
  });

  test('only the term whose window is open triggers reminders', async () => {
    await makeTerm({ season: 'Spring', advisingDeadline: new Date('2027-03-01'), swapDeadline: new Date('2027-02-20') });
    await runAdvisingDeadlineReminders(at(2 * DAY), quiet);
    const events = await NotificationEvent.find().lean();
    expect(new Set(events.map((event) => event.entityId))).toEqual(new Set([String(term._id)]));
  });
});

describe('failure handling and worker', () => {
  test('an enqueue failure for one reminder is reported and the rest still publish', async () => {
    const errors = [];
    // A student deleted mid-pass makes publishNotificationEvent reject with "Student not found".
    const find = Student.find.bind(Student);
    jest.spyOn(Student, 'find').mockImplementationOnce((...args) => {
      const query = find(...args);
      const exec = query.exec.bind(query);
      query.exec = async () => {
        const rows = await exec();
        await Student.deleteOne({ _id: open._id });
        return rows;
      };
      return query;
    });
    const summary = await runAdvisingDeadlineReminders(at(2 * DAY), { onError: (...args) => errors.push(args.join(' ')) });
    jest.restoreAllMocks();
    expect(summary.failed).toBe(2);
    expect(summary.published).toBe(2);
    expect(errors.join('\n')).toMatch(/Student not found/);
  });

  test('the worker runs a pass on start and stops cleanly', async () => {
    await Term.updateOne({ _id: term._id }, { $set: {
      advisingDeadline: new Date(Date.now() + DAY), swapDeadline: new Date(Date.now() - DAY),
    } });
    const stop = startAdvisingReminderWorker({ intervalMs: 60 * 60 * 1000, onError: () => {} });
    try {
      for (let i = 0; i < 100 && await NotificationEvent.countDocuments() < 4; i += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 50); });
      }
    } finally { stop(); }
    expect(await NotificationEvent.countDocuments()).toBe(4);
  });
});

const mongoose = require('mongoose');
const ScheduleActivityLog = require('../models/ScheduleActivityLog');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const User = require('../models/User');
const { recalculate } = require('../services/workflowService');
const { queueStudentNotification } = require('../services/studentNotificationService');

/**
 * Req 123: Automatically records a schedule processing or reopening action.
 * Can be called from any schedule controller/service or via the process/reopen
 * endpoints below.
 */
const recordScheduleActivity = async ({
  student,
  termId = null,
  action,
  user,
  reason = null,
  occurredAt = new Date(),
}) => {
  if (!student || !user) {
    throw new Error('Both student and staff user are required to record schedule activity.');
  }
  if (!['Processed', 'Reopened'].includes(action)) {
    throw new Error(`Invalid schedule activity action: ${action}`);
  }
  if (action === 'Reopened' && (!reason || !String(reason).trim())) {
    throw new Error('A reopening reason is required when reopening a processed schedule.');
  }

  const existingEntries = await buildMergedStudentEntries(student);
  const maxVersion = existingEntries.reduce(
    (max, item) => Math.max(max, Number(item.scheduleVersion) || 0),
    0
  );

  return ScheduleActivityLog.create({
    student: student._id,
    studentId: student.studentId,
    studentName: student.fullName,
    termId,
    action,
    scheduleVersion: maxVersion + 1,
    performedBy: user._id,
    staffName: user.fullName,
    staffEmail: user.email,
    staffRole: user.role,
    reason: action === 'Reopened' ? String(reason).trim() : null,
    occurredAt,
  });
};

/**
 * Synthesizes baseline activity entries for Advising Students who were seeded in
 * 'Processed' or 'Reopened' workflowStatus before runtime activity rows were
 * written, without mutating the database on boot (so verify-seed-state.cjs is
 * unaffected).
 */
const deriveBaselineEntriesForStudent = (student, fallbackCoordinator) => {
  if (student.studentType !== 'Advising Student') return [];
  if (!['Processed', 'Reopened'].includes(student.workflowStatus)) return [];

  const staff = student.assignedAdvisor || fallbackCoordinator || {
    fullName: 'Nour Coordinator',
    email: 'coordinator@guc.edu.eg',
    role: 'Coordinator',
  };
  const staffRole = student.assignedAdvisor ? 'Advisor' : 'Coordinator';
  const baseDate = student.lastUpdateAt ? new Date(student.lastUpdateAt) : new Date();

  if (student.workflowStatus === 'Processed') {
    return [
      {
        id: `seed-processed-${student._id}`,
        studentObjectId: String(student._id),
        studentId: student.studentId,
        studentName: student.fullName,
        action: 'Processed',
        scheduleVersion: 1,
        staffName: staff.fullName,
        staffEmail: staff.email,
        staffRole,
        reason: null,
        occurredAt: baseDate.toISOString(),
      },
    ];
  }

  // Reopened student had v1 Processed earlier, then v2 Reopened with a reason
  const earlierDate = new Date(baseDate.getTime() - 6 * 60 * 60 * 1000);
  return [
    {
      id: `seed-reopened-${student._id}`,
      studentObjectId: String(student._id),
      studentId: student.studentId,
      studentName: student.fullName,
      action: 'Reopened',
      scheduleVersion: 2,
      staffName: staff.fullName,
      staffEmail: staff.email,
      staffRole,
      reason: 'Reopened to adjust tutorial slot timing per advising review.',
      occurredAt: baseDate.toISOString(),
    },
    {
      id: `seed-processed-${student._id}`,
      studentObjectId: String(student._id),
      studentId: student.studentId,
      studentName: student.fullName,
      action: 'Processed',
      scheduleVersion: 1,
      staffName: staff.fullName,
      staffEmail: staff.email,
      staffRole,
      reason: null,
      occurredAt: earlierDate.toISOString(),
    },
  ];
};

const formatPersistedLog = (log, studentMap) => {
  const st = studentMap.get(String(log.student?._id ?? log.student));
  return {
    id: String(log._id),
    studentObjectId: String(log.student?._id ?? log.student),
    studentId: log.studentId || st?.studentId || '—',
    studentName: log.studentName || st?.fullName || 'Advising Student',
    action: log.action,
    scheduleVersion: log.scheduleVersion,
    staffName: log.staffName,
    staffEmail: log.staffEmail,
    staffRole: log.staffRole,
    reason: log.reason ?? null,
    occurredAt: (log.occurredAt || log.createdAt || new Date()).toISOString(),
  };
};

const buildMergedStudentEntries = async (studentDoc) => {
  const student = studentDoc.assignedAdvisor?.fullName
    ? studentDoc
    : await Student.findById(studentDoc._id).populate('assignedAdvisor', 'fullName email').lean();

  const coordinator = await User.findOne({ role: 'Coordinator' })
    .select('fullName email role')
    .lean();

  const persisted = await ScheduleActivityLog.find({ student: student._id })
    .sort({ occurredAt: -1, scheduleVersion: -1 })
    .lean();

  const studentMap = new Map([[String(student._id), student]]);
  const persistedFormatted = persisted.map((row) => formatPersistedLog(row, studentMap));
  const baseline = deriveBaselineEntriesForStudent(student, coordinator);

  // Include baseline entries whose scheduleVersion is not already in persisted
  const existingVersions = new Set(persistedFormatted.map((e) => e.scheduleVersion));
  const combined = [
    ...persistedFormatted,
    ...baseline.filter((b) => !existingVersions.has(b.scheduleVersion)),
  ];

  return combined.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() ||
      b.scheduleVersion - a.scheduleVersion
  );
};

const applyFilters = (entries, { action, startDate, endDate, search }) => {
  let result = entries;

  if (action && ['Processed', 'Reopened'].includes(action)) {
    result = result.filter((e) => e.action === action);
  }

  if (startDate) {
    const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
    if (!Number.isNaN(startMs)) {
      result = result.filter((e) => new Date(e.occurredAt).getTime() >= startMs);
    }
  }

  if (endDate) {
    const endMs = new Date(`${endDate}T23:59:59.999Z`).getTime();
    if (!Number.isNaN(endMs)) {
      result = result.filter((e) => new Date(e.occurredAt).getTime() <= endMs);
    }
  }

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    result = result.filter(
      (e) =>
        e.studentId.toLowerCase().includes(q) ||
        e.staffName.toLowerCase().includes(q) ||
        e.staffEmail.toLowerCase().includes(q) ||
        (e.studentName && e.studentName.toLowerCase().includes(q))
    );
  }

  return result;
};

exports.recordScheduleActivity = recordScheduleActivity;

/**
 * Req 123, 124, 125: Global schedule activity history across all advising
 * students, with filtering by action type & date range and searching by
 * student ID or staff member's name or GUC email.
 */
exports.getGlobalHistory = async (req, res) => {
  try {
    const [advisingStudents, coordinator, persistedLogs] = await Promise.all([
      Student.find({ studentType: 'Advising Student' })
        .populate('assignedAdvisor', 'fullName email')
        .lean(),
      User.findOne({ role: 'Coordinator' }).select('fullName email role').lean(),
      ScheduleActivityLog.find({}).sort({ occurredAt: -1, scheduleVersion: -1 }).lean(),
    ]);

    const studentMap = new Map(advisingStudents.map((s) => [String(s._id), s]));
    const persistedByStudent = new Map();

    for (const log of persistedLogs) {
      const key = String(log.student);
      const list = persistedByStudent.get(key) ?? [];
      list.push(formatPersistedLog(log, studentMap));
      persistedByStudent.set(key, list);
    }

    const allEntries = [];
    for (const st of advisingStudents) {
      const persistedList = persistedByStudent.get(String(st._id)) ?? [];
      const existingVersions = new Set(persistedList.map((e) => e.scheduleVersion));
      const baseline = deriveBaselineEntriesForStudent(st, coordinator).filter(
        (b) => !existingVersions.has(b.scheduleVersion)
      );
      allEntries.push(...persistedList, ...baseline);
    }

    allEntries.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() ||
        b.scheduleVersion - a.scheduleVersion
    );

    const filtered = applyFilters(allEntries, req.query);

    return res.status(200).json({
      logs: filtered,
      total: allEntries.length,
      matched: filtered.length,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not load schedule activity history.',
      error: error.message,
    });
  }
};

/**
 * Req 123, 124: Per-student schedule activity history shown inside a selected
 * student's advising details.
 */
exports.getStudentHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Invalid student link.' });
    }

    const student = await Student.findById(studentId)
      .populate('assignedAdvisor', 'fullName email')
      .lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const merged = await buildMergedStudentEntries(student);
    const filtered = applyFilters(merged, req.query);

    return res.status(200).json({
      student: {
        id: String(student._id),
        studentId: student.studentId,
        fullName: student.fullName,
        workflowStatus: student.workflowStatus,
      },
      logs: filtered,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not load the student’s schedule activity history.',
      error: error.message,
    });
  }
};

/**
 * Req 81 & Req 123: Process an advising student's schedule and automatically
 * record the Processed entry in the schedule activity history.
 */
exports.processAdvisingSchedule = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Invalid student ID.' });
    }

    const [student, staffUser] = await Promise.all([
      Student.findById(studentId).populate('assignedAdvisor', 'fullName email'),
      User.findById(req.user.userId).select('fullName email role').lean(),
    ]);

    if (!student) return res.status(404).json({ message: 'Student not found.' });
    if (!staffUser) return res.status(404).json({ message: 'Staff user not found.' });
    if (student.studentType !== 'Advising Student') {
      return res.status(400).json({ message: 'Only advising student schedules are processed here.' });
    }
    if (student.workflowStatus === 'Processed') {
      return res.status(409).json({ message: 'This schedule is already processed.' });
    }

    await StudentSchedule.updateMany(
      { studentId: student._id, status: { $in: ['Draft', 'Active'] } },
      { $set: { status: 'Processed' } }
    );

    const logEntry = await recordScheduleActivity({
      student,
      action: 'Processed',
      user: staffUser,
    });

    student.workflowStatus = 'Processed';
    queueStudentNotification(student, 'schedule.processed', {
      entityId: logEntry._id,
      occurrence: 'processed',
    });
    await recalculate(student);

    return res.status(200).json({
      message: `${student.fullName}'s schedule has been processed (v${logEntry.scheduleVersion}).`,
      log: formatPersistedLog(logEntry, new Map([[String(student._id), student]])),
      workflowStatus: student.workflowStatus,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not process schedule.',
      error: error.message,
    });
  }
};

/**
 * Req 82 & Req 123: Reopen a processed advising schedule with a required reason
 * and automatically record the Reopened entry in the schedule activity history.
 */
exports.reopenAdvisingSchedule = async (req, res) => {
  try {
    const { studentId } = req.params;
    const reason = String(req.body?.reason ?? '').trim();

    if (!mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Invalid student ID.' });
    }
    if (!reason) {
      return res.status(400).json({
        message: 'A reopening reason is required when reopening a processed schedule.',
      });
    }

    const [student, staffUser] = await Promise.all([
      Student.findById(studentId).populate('assignedAdvisor', 'fullName email'),
      User.findById(req.user.userId).select('fullName email role').lean(),
    ]);

    if (!student) return res.status(404).json({ message: 'Student not found.' });
    if (!staffUser) return res.status(404).json({ message: 'Staff user not found.' });
    if (student.studentType !== 'Advising Student') {
      return res.status(400).json({ message: 'Only advising student schedules can be reopened.' });
    }
    if (student.workflowStatus !== 'Processed') {
      return res.status(409).json({
        message: 'Only a Processed schedule can be reopened.',
      });
    }

    await StudentSchedule.updateMany(
      { studentId: student._id, status: 'Processed' },
      { $set: { status: 'Draft' } }
    );

    const logEntry = await recordScheduleActivity({
      student,
      action: 'Reopened',
      user: staffUser,
      reason,
    });

    student.workflowStatus = 'Reopened';
    queueStudentNotification(student, 'schedule.reopened', {
      entityId: logEntry._id,
      occurrence: 'reopened',
    });
    await recalculate(student);

    return res.status(200).json({
      message: `${student.fullName}'s schedule has been reopened (v${logEntry.scheduleVersion}).`,
      log: formatPersistedLog(logEntry, new Map([[String(student._id), student]])),
      workflowStatus: student.workflowStatus,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not reopen schedule.',
      error: error.message,
    });
  }
};

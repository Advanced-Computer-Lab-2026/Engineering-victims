const mongoose = require('mongoose');
const Student = require('../models/Student');
const User = require('../models/User');
const StudentSchedule = require('../models/StudentSchedule');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const { buildStudentQuery } = require('../services/studentQueryService');
const { recalculate, getStatusesFor } = require('../services/workflowService');
const { notifyByEmail } = require('../services/notificationService');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Shapes a student document for the API, with the advisor flattened in. */
const serialize = (student) => ({
  id: student._id,
  fullName: student.fullName,
  email: student.email,
  studentId: student.studentId,
  studentType: student.studentType,
  major: student.major,
  currentSemester: student.currentSemester,
  studyGroup: student.studyGroup,
  academicStanding: student.academicStanding,
  assignedAdvisor: student.assignedAdvisor
    ? {
        id: student.assignedAdvisor._id,
        fullName: student.assignedAdvisor.fullName,
        email: student.assignedAdvisor.email,
      }
    : null,
  workflowStatus: student.workflowStatus,
  blockingStep: student.blockingStep,
  isActive: student.isActive,
  lastUpdateAt: student.lastUpdateAt,
});

/**
 * Req 6, 7, 8: list students with search and filters, plus the distinct values
 * the filter dropdowns need. Returned together so the UI makes one request.
 */
exports.listAdvisors = async (req, res) => {
  try {
    const advisors = await User.find({ role: 'Advisor', isActive: true })
      .select('fullName email')
      .sort({ fullName: 1 })
      .lean();

    res.status(200).json({
      advisors: advisors.map((advisor) => ({
        id: advisor._id,
        fullName: advisor.fullName,
        email: advisor.email,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load advisors', error: error.message });
  }
};

exports.listStudents = async (req, res) => {
  try {
    const filter = buildStudentQuery(req.query);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

    const [students, total, advisorIds, studentTypes] = await Promise.all([
      Student.find(filter)
        .populate('assignedAdvisor', 'fullName email')
        .sort({ lastUpdateAt: -1, fullName: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Student.countDocuments(filter),
      Student.distinct('assignedAdvisor'),
      Student.distinct('studentType'),
    ]);

    const advisors = await User.find({ _id: { $in: advisorIds.filter(Boolean) } }).select('fullName email');
    const majors = await Student.distinct('major');
    const blockingSteps = await Student.distinct('blockingStep');

    res.status(200).json({
      students: students.map(serialize),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      // Req 8: the option set for each filter, so the UI never invents a value.
      filterOptions: {
        studentTypes,
        majors: majors.filter(Boolean).sort(),
        advisors: advisors.map((advisor) => ({
          value: String(advisor._id),
          label: advisor.fullName,
          email: advisor.email,
        })),
        currentSemesters: [1, 2, 3, 4, 5, 6, 7, 8],
        academicStandings: ['Good Standing', 'Probation', 'Dismissed'],
        workflowStatuses: {
          'Normal Student': getStatusesFor('Normal Student'),
          'Advising Student': getStatusesFor('Advising Student'),
        },
        blockingSteps: blockingSteps.filter(Boolean).sort(),
        accountStatuses: [
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Inactive' },
        ],
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load students', error: error.message });
  }
};

/**
 * Headline counts for the dashboard. Counted across every student rather than
 * the current page, so the tiles do not change as the user paginates.
 */
exports.getStats = async (req, res) => {
  try {
    const [total, active, advising, waitingOnStudent] = await Promise.all([
      Student.countDocuments({}),
      Student.countDocuments({ isActive: true }),
      Student.countDocuments({ studentType: 'Advising Student' }),
      // These are the statuses where the ball is in the student's court.
      Student.countDocuments({
        workflowStatus: { $in: ['Ready for Student Review', 'Change Request Pending'] },
      }),
    ]);

    res.status(200).json({
      stats: {
        total,
        active,
        inactive: total - active,
        advising,
        normal: total - advising,
        waitingOnStudent,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load statistics', error: error.message });
  }
};

/** Req 9: open one student's details from the displayed results. */
exports.getStudent = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const student = await Student.findById(req.params.id).populate('assignedAdvisor', 'fullName email');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      student: serialize(student),
      availableStatuses: getStatusesFor(student.studentType),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the student', error: error.message });
  }
};

/**
 * Req 10: activate or deactivate an account. Deactivation blocks login without
 * touching academic, scheduling or audit history, so nothing else is modified.
 */
exports.assignAdvisor = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const { advisorId } = req.body;
    if (!mongoose.isValidObjectId(advisorId)) {
      return res.status(400).json({ message: 'A valid advisorId is required.' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.studentType !== 'Advising Student') {
      return res.status(400).json({ message: 'Only advising students can be assigned an advisor.' });
    }

    const advisor = await User.findById(advisorId);
    if (!advisor || advisor.role !== 'Advisor') {
      return res.status(404).json({ message: 'Advisor not found or not eligible for assignment.' });
    }

    const previous = student.assignedAdvisor ? String(student.assignedAdvisor) : null;
    student.assignedAdvisor = advisor._id;
    student.lastUpdateAt = new Date();
    await student.save();
    await student.populate('assignedAdvisor', 'fullName email');

    // Requirement 14 explicitly preserves the student's schedule, requests,
    // plans and advisor history; this action only swaps the assigned advisor.
    const responseMessage = previous && previous !== String(advisor._id)
      ? `${student.fullName}'s advisor was reassigned successfully.`
      : `${student.fullName}'s advisor was assigned successfully.`;

    res.status(200).json({
      message: responseMessage,
      student: serialize(student),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not assign the advisor', error: error.message });
  }
};

exports.setAccountStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be true or false.' });
    }

    const student = await Student.findById(req.params.id).populate('assignedAdvisor', 'fullName email');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.isActive = isActive;
    await recalculate(student);

    // Req 10 is the one account-state event that already exists, so it is a
    // real notification source rather than seed data. A deactivated student
    // cannot sign in to read it, but the record is there when they are
    // reactivated, and activation is read immediately.
    await notifyByEmail(student.email, {
      type: isActive ? 'success' : 'warning',
      title: isActive ? 'Your account was activated' : 'Your account was deactivated',
      message: isActive
        ? 'Your account is active again and you can sign in with your GUC email.'
        : 'Your account was deactivated, so you cannot sign in. Your academic, scheduling and audit history is unchanged.',
      link: '/notifications',
    });

    res.status(200).json({
      message: `${student.fullName}'s account is now ${isActive ? 'active' : 'inactive'}.`,
      student: serialize(student),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update the account', error: error.message });
  }
};

exports.assignToGroup = async (req, res) => {
  try {
    const studentId = req.params.id;
    const { studyGroup, termId } = req.body;

    if (!studyGroup || !termId) {
      return res.status(400).json({ message: 'studyGroup and termId are required.' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.studentType !== 'Normal Student') {
      return res.status(400).json({ message: 'Only normal students can be assigned to standard schedule groups.' });
    }

    // 1. Find the template that matches student's major, semester, and the requested group/term
    const template = await ScheduleTemplate.findOne({
      major: student.major,
      semester: student.currentSemester,
      studyGroup,
      termId,
      publicationStatus: { $ne: 'Draft' },
    });

    if (!template) {
      return res.status(404).json({
        message: `No standard schedule template found for ${student.major}, semester ${student.currentSemester}, group ${studyGroup} in the specified term.`
      });
    }

    // 2. Clear existing schedules for this student in this term to avoid overlaps
    await StudentSchedule.deleteMany({ studentId: student._id, termId });

    // 3. Create the processed schedule from the template slots
    const scheduleEntries = template.slots.map((slotId) => ({
      studentId: student._id,
      slotId,
      termId,
      status: 'Processed',
    }));

    await StudentSchedule.insertMany(scheduleEntries);

    // 4. Update the student's record
    student.studyGroup = studyGroup;
    student.workflowStatus = 'Schedule Assigned';
    student.blockingStep = null;
    student.lastUpdateAt = new Date();
    await student.save();

    res.status(200).json({
      message: `${student.fullName} has been assigned to group ${studyGroup} and their processed schedule has been created.`,
      student: serialize(student),
      slotsCount: scheduleEntries.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error assigning student to group', error: error.message });
  }
};

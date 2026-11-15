const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const { buildWeeklySchedule } = require('../services/weeklyScheduleService');

const serializeStudent = (student) => ({
  id: student._id,
  fullName: student.fullName,
  studentId: student.studentId,
  studentType: student.studentType,
  major: student.major,
  currentSemester: student.currentSemester,
  studyGroup: student.studyGroup ?? null,
});

/**
 * Req 31, Normal or Advising Student: their own schedule only.
 *
 * The student comes from the token rather than the URL, so this route has no
 * parameter that could point at someone else's schedule.
 */
exports.getMySchedule = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('email').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const student = await Student.findOne({ email: user.email });
    if (!student) {
      return res.status(404).json({ message: 'No student record is linked to this account.' });
    }

    const schedule = await buildWeeklySchedule(student, { asStudent: true });
    res.status(200).json({ student: serializeStudent(student), ...schedule });
  } catch (error) {
    res.status(500).json({ message: 'Could not load your schedule', error: error.message });
  }
};

/**
 * Req 31, staff: Advisors and Coordinators view any Advising Student's draft,
 * review-ready or processed schedule; Administrators have read-only access to
 * any student's schedule. Every route here is read-only.
 */
exports.getStudentSchedule = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.studentId)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (req.user.role !== 'Administrator' && student.studentType !== 'Advising Student') {
      return res.status(403).json({ message: 'Advisors and Coordinators view the schedules of Advising Students.' });
    }

    const schedule = await buildWeeklySchedule(student, { asStudent: false });
    res.status(200).json({ student: serializeStudent(student), ...schedule });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the schedule', error: error.message });
  }
};

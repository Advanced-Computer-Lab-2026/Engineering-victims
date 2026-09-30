const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const { buildAcademicHistory } = require('../services/academicHistoryService');

const serializeStudent = (student) => ({
  id: student._id,
  fullName: student.fullName,
  email: student.email,
  studentId: student.studentId,
  major: student.major,
  currentSemester: student.currentSemester,
  academicStanding: student.academicStanding,
  assignedAdvisor: student.assignedAdvisor
    ? {
        id: student.assignedAdvisor._id,
        fullName: student.assignedAdvisor.fullName,
        email: student.assignedAdvisor.email,
      }
    : null,
});

const respondWithHistory = async (res, student) => {
  const history = await buildAcademicHistory(student);
  res.status(200).json({ student: serializeStudent(student), ...history });
};

/**
 * Req 54, Advising Student: their own history only.
 *
 * The student is resolved from the token, not the URL, so this route has no
 * parameter an Advising Student could change to read someone else's record.
 */
exports.getMyHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('email').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const student = await Student.findOne({ email: user.email }).populate('assignedAdvisor', 'fullName email');
    if (!student) {
      return res.status(404).json({ message: 'No student record is linked to this account.' });
    }
    if (student.studentType !== 'Advising Student') {
      return res.status(403).json({ message: 'Academic history is only available to Advising Students.' });
    }

    await respondWithHistory(res, student);
  } catch (error) {
    res.status(500).json({ message: 'Could not load your academic history', error: error.message });
  }
};

/**
 * Req 54, Advisor and Coordinator: any Advising Student.
 *
 * Unlike the req 9 student drawer, an Advisor is not limited to their own
 * students here; the workbook allows Advisors to view any advising student.
 */
exports.getStudentHistory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.studentId)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const student = await Student.findById(req.params.studentId).populate('assignedAdvisor', 'fullName email');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (student.studentType !== 'Advising Student') {
      return res.status(400).json({ message: 'Academic history is only kept for Advising Students.' });
    }

    await respondWithHistory(res, student);
  } catch (error) {
    res.status(500).json({ message: 'Could not load the academic history', error: error.message });
  }
};

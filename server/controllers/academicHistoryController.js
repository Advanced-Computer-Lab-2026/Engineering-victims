const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const { renderAcademicHistoryPdf } = require('../services/academicHistoryPdfService');

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

const loadHistory = async (student) => ({
  student: serializeStudent(student),
  ...(await buildAcademicHistory(student)),
});

const respondWithHistory = async (res, student) => {
  res.status(200).json(await loadHistory(student));
};

/** Req 56: the same payload as the page, rendered as a downloadable PDF. */
const respondWithHistoryPdf = async (res, student) => {
  const pdf = await renderAcademicHistoryPdf(await loadHistory(student));
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="academic-history-${student.studentId}.pdf"`,
      'Content-Length': pdf.length,
    })
    .send(pdf);
};

/**
 * Req 54, Advising Student: their own history only.
 *
 * The student is resolved from the token, not the URL, so this route has no
 * parameter an Advising Student could change to read someone else's record.
 * Returns the student, or the error to answer with instead.
 */
const findOwnStudent = async (req) => {
  const user = await User.findById(req.user.userId).select('email').lean();
  if (!user) return { status: 404, message: 'User not found' };

  const student = await Student.findOne({ email: user.email }).populate('assignedAdvisor', 'fullName email');
  if (!student) return { status: 404, message: 'No student record is linked to this account.' };
  if (student.studentType !== 'Advising Student') {
    return { status: 403, message: 'Academic history is only available to Advising Students.' };
  }
  return { student };
};

/**
 * Req 54, Advisor and Coordinator: any Advising Student.
 *
 * Unlike the req 9 student drawer, an Advisor is not limited to their own
 * students here; the workbook allows Advisors to view any advising student.
 */
const findStudentById = async (req) => {
  if (!mongoose.isValidObjectId(req.params.studentId)) {
    return { status: 400, message: 'That student link is not valid.' };
  }

  const student = await Student.findById(req.params.studentId).populate('assignedAdvisor', 'fullName email');
  if (!student) return { status: 404, message: 'Student not found' };
  if (student.studentType !== 'Advising Student') {
    return { status: 400, message: 'Academic history is only kept for Advising Students.' };
  }
  return { student };
};

/**
 * Viewing (req 54) and downloading (req 56) share one lookup, so the PDF is
 * never open to anyone who could not already see the page.
 */
const handle = (findStudent, respond, failureMessage) => async (req, res) => {
  try {
    const { student, status, message } = await findStudent(req);
    if (!student) return res.status(status).json({ message });
    await respond(res, student);
  } catch (error) {
    res.status(500).json({ message: failureMessage, error: error.message });
  }
};

exports.getMyHistory = handle(findOwnStudent, respondWithHistory, 'Could not load your academic history');
exports.getStudentHistory = handle(findStudentById, respondWithHistory, 'Could not load the academic history');
exports.downloadMyHistoryPdf = handle(findOwnStudent, respondWithHistoryPdf, 'Could not create your academic history PDF');
exports.downloadStudentHistoryPdf = handle(
  findStudentById,
  respondWithHistoryPdf,
  'Could not create the academic history PDF'
);

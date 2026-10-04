const Student = require('../models/Student');
const { serialize } = require('./studentController');
const { buildStudentQuery } = require('../services/studentQueryService');

const ADVISING_SCOPE = { studentType: 'Advising Student' };

/**
 * Req 50: an Advisor views every Advising Student.
 * Req 51: an Advisor searches them by student ID, full name or GUC email.
 *
 * This is deliberately wider than the "My Students" roster from req 6-9, which
 * only ever shows an Advisor the students assigned to them. The workbook says
 * Advisors can view all advising students, including those assigned to other
 * Advisors, so no assignedAdvisor filter is applied here. Each row is flagged
 * with isMine so the page can still point out the Advisor's own students.
 */
exports.listAdvisingStudents = async (req, res) => {
  try {
    // Only the search term is read from the query. The advising scope is
    // applied last, so no parameter can widen the list to Normal Students.
    const filter = { ...buildStudentQuery({ search: req.query.search }), ...ADVISING_SCOPE };

    const [students, everyone] = await Promise.all([
      Student.find(filter)
        .populate('assignedAdvisor', 'fullName email')
        .sort({ lastUpdateAt: -1, fullName: 1 }),
      // The summary tiles describe every advising student, not the current
      // search results, so they stay put while the Advisor types.
      Student.find(ADVISING_SCOPE).select('assignedAdvisor').lean(),
    ]);

    const userId = String(req.user.userId);
    const rows = students.map((student) => {
      const row = serialize(student);
      return {
        ...row,
        isMine: Boolean(row.assignedAdvisor) && String(row.assignedAdvisor.id) === userId,
      };
    });

    res.status(200).json({
      students: rows,
      summary: {
        total: everyone.length,
        mine: everyone.filter((student) => String(student.assignedAdvisor) === userId).length,
        unassigned: everyone.filter((student) => !student.assignedAdvisor).length,
        matched: rows.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load advising students', error: error.message });
  }
};

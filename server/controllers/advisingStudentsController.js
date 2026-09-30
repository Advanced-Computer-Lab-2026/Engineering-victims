const Student = require('../models/Student');
const { serialize } = require('./studentController');

/**
 * Req 50: an Advisor views every Advising Student.
 *
 * This is deliberately wider than the "My Students" roster from req 6-9, which
 * only ever shows an Advisor the students assigned to them. The workbook says
 * Advisors can view all advising students, including those assigned to other
 * Advisors, so no assignedAdvisor filter is applied here. Each row is flagged
 * with isMine so the page can still point out the Advisor's own students.
 */
exports.listAdvisingStudents = async (req, res) => {
  try {
    const students = await Student.find({ studentType: 'Advising Student' })
      .populate('assignedAdvisor', 'fullName email')
      .sort({ lastUpdateAt: -1, fullName: 1 });

    const rows = students.map((student) => {
      const row = serialize(student);
      return {
        ...row,
        isMine: Boolean(row.assignedAdvisor) && String(row.assignedAdvisor.id) === String(req.user.userId),
      };
    });

    res.status(200).json({
      students: rows,
      summary: {
        total: rows.length,
        mine: rows.filter((row) => row.isMine).length,
        unassigned: rows.filter((row) => !row.assignedAdvisor).length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load advising students', error: error.message });
  }
};

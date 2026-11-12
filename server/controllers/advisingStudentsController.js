const mongoose = require('mongoose');
const Student = require('../models/Student');
const User = require('../models/User');
const { ADVISING_REASONS } = Student;
const { serialize } = require('./studentController');
const { getStatusesFor } = require('../services/workflowService');
const { buildStudentQuery } = require('../services/studentQueryService');
const { pendingRequestOptions, pendingRequestFor } = require('../services/pendingRequestService');
const { buildAdvisingOverview } = require('../services/advisingOverviewService');

const ADVISING_SCOPE = { studentType: 'Advising Student' };

/**
 * Req 50: an Advisor views every Advising Student.
 * Req 51: an Advisor searches them by student ID, full name or GUC email.
 * Req 52: an Advisor filters them by Advisor, major, advising reason, schedule
 *         status and pending-request type, in any combination.
 *
 * This is deliberately wider than the "My Students" roster from req 6-9, which
 * only ever shows an Advisor the students assigned to them. The workbook says
 * Advisors can view all advising students, including those assigned to other
 * Advisors, so no assignedAdvisor filter is applied by default. Each row is
 * flagged with isMine so the page can still point out the Advisor's own
 * students, and the Advisor filter can narrow back down to them.
 */
exports.listAdvisingStudents = async (req, res) => {
  try {
    const userId = String(req.user.userId);

    // "mine" is the UI's shorthand for the Advisor filter. It is resolved here,
    // next to the session, so the query builder never has to know who is signed
    // in and no parameter can widen the list beyond the advising scope.
    const requestedAdvisor = req.query.assignedAdvisor;
    const assignedAdvisor = requestedAdvisor === 'mine' ? userId : requestedAdvisor || undefined;

    // Only the search term and the req-52 filters are read from the query. The
    // advising scope is spread last, so no parameter can widen the list to
    // Normal Students.
    const filter = {
      ...buildStudentQuery({ ...req.query, assignedAdvisor }),
      ...ADVISING_SCOPE,
    };

    const [students, everyone, advisorDocs, majors] = await Promise.all([
      Student.find(filter)
        .populate('assignedAdvisor', 'fullName email')
        .sort({ lastUpdateAt: -1, fullName: 1 }),
      // The summary tiles describe every advising student, not the current
      // search results, so they stay put while the Advisor types.
      Student.find(ADVISING_SCOPE).select('assignedAdvisor').lean(),
      // Options come from the whole school rather than the filtered rows, so
      // narrowing a filter never removes the choice that would clear it.
      User.find({ role: 'Advisor' }).select('fullName email').sort({ fullName: 1 }).lean(),
      Student.distinct('major', ADVISING_SCOPE),
    ]);

    const rows = students.map((student) => {
      const row = serialize(student);
      return {
        ...row,
        isMine: Boolean(row.assignedAdvisor) && String(row.assignedAdvisor.id) === userId,
        // Echoed back so the column the req-52 filter narrows by is the column
        // the row displays — the two can never disagree.
        pendingRequest: pendingRequestFor(row.workflowStatus),
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
      // Req 52: the option set for each filter, so the UI never invents a value.
      filterOptions: buildFilterOptions(advisorDocs, majors, userId),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load advising students', error: error.message });
  }
};

/**
 * Req 52: the five filter option sets.
 *
 * The signed-in Advisor's own entry is labelled "My assigned students" instead
 * of showing their name back to them — that is the wording the workbook asks
 * for, and it reads as the choice it actually is next to everyone else's name.
 */
const buildFilterOptions = (advisorDocs, majors, userId) => ({
  advisors: [
    { value: 'none', label: 'Unassigned', email: null },
    ...advisorDocs
      .map((advisor) => ({
        value: String(advisor._id),
        label: String(advisor._id) === userId ? 'My assigned students' : advisor.fullName,
        email: advisor.email,
      }))
      .sort((a, b) => {
        // The Advisor's own entry stays first so it is not buried mid-list.
        if (a.value === userId) return -1;
        if (b.value === userId) return 1;
        return a.label.localeCompare(b.label);
      }),
  ],
  majors: majors.filter(Boolean).sort(),
  advisingReasons: ADVISING_REASONS,
  workflowStatuses: getStatusesFor('Advising Student'),
  pendingRequestTypes: pendingRequestOptions(),
});

/**
 * Req 53: an Advisor opens the advising details of any student shown in the
 * displayed search or filter results.
 *
 * This is its own endpoint rather than /api/students/:id because that one is
 * scoped to an Advisor's own roster (req 6-9) and answers 403 for everybody
 * else. Req 53 is explicit that ANY Advisor may open a student from the
 * displayed results, so the wider read is allowed here and nowhere else — and a
 * student outside the advising scope is refused outright.
 */
exports.getAdvisingStudent = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const student = await Student.findById(req.params.id).populate('assignedAdvisor', 'fullName email');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.studentType !== 'Advising Student') {
      return res.status(404).json({ message: 'That student is not an advising student.' });
    }

    res.status(200).json({
      student: {
        ...serialize(student),
        isMine:
          Boolean(student.assignedAdvisor) &&
          String(student.assignedAdvisor._id ?? student.assignedAdvisor) === String(req.user.userId),
        pendingRequest: pendingRequestFor(student.workflowStatus),
      },
      availableStatuses: getStatusesFor(student.studentType),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the student', error: error.message });
  }
};

/**
 * Req 59: an Advisor, Coordinator or Administrator views an advising student's
 * advising reason, system-calculated credit-hour allowance, schedule status and
 * bachelor-project eligibility.
 *
 * Read-only, and open for any advising student like req 53: nothing here can
 * be set by the caller, so there is no assignment check to make.
 */
exports.getAdvisingOverview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.studentType !== 'Advising Student') {
      return res.status(404).json({ message: 'That student is not an advising student.' });
    }

    res.status(200).json({
      student: {
        id: student._id,
        fullName: student.fullName,
        studentId: student.studentId,
        major: student.major,
        currentSemester: student.currentSemester,
        academicStanding: student.academicStanding,
      },
      overview: await buildAdvisingOverview(student),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the advising overview', error: error.message });
  }
};

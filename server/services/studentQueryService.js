const Student = require('../models/Student');

/**
 * Builds the Mongo filter for the students list, search and filter requirements.
 *
 * Search (req 7) matches student ID, full name or GUC email.
 * Filters (req 8) cover student type, assigned advisor, major, current
 * semester, academic standing, workflow status, blocking step and account
 * status, and combine with AND.
 */
const buildStudentQuery = (query = {}) => {
  const {
    search,
    studentType,
    assignedAdvisor,
    major,
    currentSemester,
    academicStanding,
    workflowStatus,
    blockingStep,
    isActive,
  } = query;

  const filter = {};

  if (search && String(search).trim()) {
    const term = String(search).trim();
    // Student IDs are stored with a hyphen, but users often type them without.
    const digitsOnly = term.replace(/\D/g, '');
    const idVariants = [term];
    if (/^\d{7}$/.test(digitsOnly)) {
      idVariants.push(`${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`);
    }

    const safeTerm = escapeRegex(term);
    filter.$or = [
      { fullName: { $regex: safeTerm, $options: 'i' } },
      { email: { $regex: safeTerm, $options: 'i' } },
      { studentId: { $in: idVariants } },
    ];
  }

  if (studentType) filter.studentType = studentType;
  if (assignedAdvisor) {
    // An empty string means "unassigned", which a plain truthy check would miss.
    filter.assignedAdvisor =
      assignedAdvisor === 'none' ? null : new Student.base.Types.ObjectId(String(assignedAdvisor));
  }
  if (major) filter.major = major;
  if (currentSemester) filter.currentSemester = Number(currentSemester);
  if (academicStanding) filter.academicStanding = academicStanding;
  if (workflowStatus) filter.workflowStatus = workflowStatus;
  if (blockingStep) filter.blockingStep = blockingStep;
  if (isActive === 'true' || isActive === true) filter.isActive = true;
  if (isActive === 'false' || isActive === false) filter.isActive = false;

  return filter;
};

/** Escapes user input before it reaches a RegExp, so a stray "(" cannot throw. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { buildStudentQuery, escapeRegex };

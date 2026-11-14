const mongoose = require('mongoose');
const Student = require('../models/Student');
const { statusesForPendingRequest } = require('./pendingRequestService');

/**
 * Builds the Mongo filter for the students list, search and filter requirements.
 *
 * Search (req 7) matches student ID, full name or GUC email.
 * Filters (req 8) cover student type, assigned advisor, major, current
 * semester, academic standing, workflow status, blocking step and account
 * status, and combine with AND.
 * Req 52 adds advising reason and pending-request type to the same builder, so
 * every list in the app resolves filters the same way.
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
    advisingReason,
    pendingRequestType,
  } = query;

  const filter = {};

  if (search && String(search).trim()) {
    const term = String(search).trim();
    const safeTerm = escapeRegex(term);
    filter.$or = [
      { fullName: { $regex: safeTerm, $options: 'i' } },
      { email: { $regex: safeTerm, $options: 'i' } },
      { studentId: { $in: studentIdVariants(term) } },
    ];
  }

  if (studentType) filter.studentType = studentType;
  if (assignedAdvisor) {
    // An empty string means "unassigned", which a plain truthy check would miss.
    // "mine" is resolved to an id by the caller, which is the only place the
    // signed-in user is known.
    if (assignedAdvisor === 'none') {
      filter.assignedAdvisor = null;
    } else if (mongoose.isValidObjectId(String(assignedAdvisor))) {
      filter.assignedAdvisor = new Student.base.Types.ObjectId(String(assignedAdvisor));
    } else {
      // A hand-edited id must not throw a 500 out of the ObjectId cast; it
      // simply matches no student, which is the honest answer.
      filter.assignedAdvisor = { $in: [] };
    }
  }
  if (major) filter.major = major;
  if (currentSemester) filter.currentSemester = Number(currentSemester);
  if (academicStanding) filter.academicStanding = academicStanding;
  if (blockingStep) filter.blockingStep = blockingStep;
  if (isActive === 'true' || isActive === true) filter.isActive = true;
  if (isActive === 'false' || isActive === false) filter.isActive = false;

  // Req 52: "no advising reason" is a real choice, so it becomes null rather
  // than being dropped by a truthy check.
  if (advisingReason) filter.advisingReason = advisingReason === 'none' ? null : advisingReason;

  // Workflow status and pending-request type both constrain the same field,
  // because the request type is derived from the status. They are intersected
  // rather than overwriting each other, so combining them stays an AND: pick
  // "Draft" plus "Slot-change request" and nothing matches, which is what
  // "both of these must hold" means.
  if (workflowStatus || pendingRequestType) {
    let statuses = workflowStatus ? [workflowStatus] : null;
    if (pendingRequestType) {
      const derived = statusesForPendingRequest(pendingRequestType);
      statuses = statuses === null ? derived : statuses.filter((status) => derived.includes(status));
    }
    // An empty list matches no documents, which is the correct AND result.
    filter.workflowStatus = { $in: statuses };
  }

  return filter;
};

/** Escapes user input before it reaches a RegExp, so a stray "(" cannot throw. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The exact student IDs a search term can mean. Student IDs are stored with a
 * hyphen (64-12345), but users often type them without, so seven digits also
 * yield the hyphenated form. Shared by every student-ID search.
 */
const studentIdVariants = (term) => {
  const value = String(term).trim();
  const digitsOnly = value.replace(/\D/g, '');
  const variants = [value];
  if (/^\d{7}$/.test(digitsOnly)) {
    const hyphenated = `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`;
    if (hyphenated !== value) variants.push(hyphenated);
  }
  return variants;
};

module.exports = { buildStudentQuery, escapeRegex, studentIdVariants };

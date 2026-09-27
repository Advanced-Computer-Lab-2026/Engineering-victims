const Student = require('../models/Student');

/**
 * Derives a student's workflow status and blocking step from completed actions.
 *
 * The workbook is explicit that an Advisor must never overwrite the status
 * manually (req 6), so every transition goes through recalculate().
 *
 * The action -> status mapping below encodes the documented workflow. Each
 * action is the name of something an actor completed, and the result is the
 * status the student then sits at.
 */
const WORKFLOW = {
  'Normal Student': [
    { status: 'Schedule Assigned', blockingStep: null },
    { status: 'Swap Request Open', blockingStep: 'Awaiting a swap partner' },
    { status: 'Swap Completed', blockingStep: null },
    { status: 'Swap Withdrawn', blockingStep: null },
    { status: 'Swap Expired', blockingStep: 'New term registration' },
  ],
  'Advising Student': [
    { status: 'Not Started', blockingStep: 'Schedule assignment' },
    { status: 'Draft', blockingStep: 'Advisor to complete the draft' },
    { status: 'Ready for Student Review', blockingStep: 'Student review or slot-change request' },
    { status: 'Change Request Pending', blockingStep: 'Advisor to resolve the request' },
    { status: 'Pending Approval', blockingStep: 'Coordinator approval' },
    { status: 'Awaiting Payment Choice', blockingStep: 'Student payment choice' },
    { status: 'Deferred to Next Installment', blockingStep: 'Next installment' },
    { status: 'Ready to Process', blockingStep: 'Processing' },
    { status: 'Processed', blockingStep: null },
    { status: 'Reopened', blockingStep: 'Advisor to complete the draft' },
  ],
};

/** Statuses that mean the student is waiting on someone, not on themselves. */
const BLOCKED_ON_STUDENT = new Set(['Ready for Student Review', 'Change Request Pending']);

/**
 * Recomputes and persists status for a student. Called after any workflow
 * action rather than accepting a status from the client.
 */
const recalculate = async (student, { lastUpdateAt } = {}) => {
  const table = WORKFLOW[student.studentType] || WORKFLOW['Normal Student'];
  const current = table.find((entry) => entry.status === student.workflowStatus);

  if (current) {
    student.blockingStep = current.blockingStep;
  } else {
    // A student whose stored status is not valid for their type falls back to
    // the first state rather than being left in an unknown one.
    student.workflowStatus = table[0].status;
    student.blockingStep = table[0].blockingStep;
  }

  student.lastUpdateAt = lastUpdateAt || new Date();
  await student.save();
  return student;
};

/**
 * Progress hint for the UI: whether the ball is in the student's court, which
 * is what a Coordinator scans the list for.
 */
const isWaitingOnStudent = (student) => BLOCKED_ON_STUDENT.has(student.workflowStatus);

const getStatusesFor = (studentType) => Student.statusesForType(studentType);

module.exports = { recalculate, isWaitingOnStudent, getStatusesFor, WORKFLOW };

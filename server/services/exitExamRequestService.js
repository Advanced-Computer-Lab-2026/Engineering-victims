const NOTE_LIMIT = 1000;

const validateRequest = ({ student, remaining, courseId, reason }) => {
  if (student.studentType !== 'Advising Student') {
    return 'Exit-exam requests are only for Advising Students.';
  }

  const failedCourses = remaining.filter((course) => course.isRetake);
  if (failedCourses.length !== 1) {
    return 'An exit exam can be requested only when exactly one failed course remains.';
  }

  const course = failedCourses[0];
  if (String(course.id) !== String(courseId)) {
    return 'Choose the single failed course that remains for this student.';
  }

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason) return 'Explain why the failed course cannot be repeated before graduation.';
  if (cleanReason.length > NOTE_LIMIT) {
    return `Keep the explanation under ${NOTE_LIMIT} characters.`;
  }

  return null;
};

const applyDecision = ({ request, decision, note, coordinatorId, now = new Date() }) => {
  if (decision !== 'approve' && decision !== 'reject') {
    return 'Choose whether to approve or reject the exit-exam request.';
  }
  if (request.status !== 'Pending') {
    return 'Only a pending exit-exam request can be reviewed.';
  }

  const responseNote = typeof note === 'string' ? note.trim() : '';
  if (!responseNote) return 'Add a response note for the Advisor and student.';
  if (responseNote.length > NOTE_LIMIT) {
    return `Keep the response note under ${NOTE_LIMIT} characters.`;
  }

  request.status = decision === 'approve' ? 'Approved' : 'Rejected';
  request.responseNote = responseNote;
  request.decidedBy = coordinatorId;
  request.decidedAt = now;
  return null;
};

module.exports = { NOTE_LIMIT, validateRequest, applyDecision };

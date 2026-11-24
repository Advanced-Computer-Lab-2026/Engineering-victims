const ExtraHoursRequest = require('../models/ExtraHoursRequest');

/**
 * The extra hours already approved for a student in a term, counting only
 * requests that still stand (awaiting payment, paid or deferred).
 *
 * This is the same query advisingScheduleWorkflowService uses when it validates
 * a draft for review, so a rule applied while adding a course and the check at
 * review time agree on how many extra hours the student has.
 */
const approvedExtraHoursFor = async (student, term) => {
  const requests = await ExtraHoursRequest.find({
    student: student._id,
    term: term._id,
    decision: 'Approved',
    settlementStatus: { $in: ['Awaiting Payment Choice', 'Paid', 'Deferred to Next Installment'] },
  })
    .select('requestedHours activatedHours')
    .lean();

  return requests.reduce(
    (total, request) => total + (Number(request.activatedHours) || Number(request.requestedHours) || 0),
    0
  );
};

module.exports = { approvedExtraHoursFor };

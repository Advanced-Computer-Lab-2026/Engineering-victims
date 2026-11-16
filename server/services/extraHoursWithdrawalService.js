const Request = require('../models/ExtraHoursRequest');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });

async function withdrawRequest(requestId, advisorId) {
  // The decision predicate competes atomically with Coordinator review. Only
  // one action can win; withdrawal never touches schedules or financial data.
  const updated = await Request.findOneAndUpdate({
    _id: requestId, requestingAdvisor: advisorId, decision: 'Pending',
    settlementStatus: 'Not Applicable', settlementOption: null,
    settlementPreference: null, gatewayAttempt: null, paymentReference: null,
    deferredCharge: null, activatedAt: null, activatedHours: 0,
  }, {
    $set: { decision: 'Withdrawn' }, $inc: { __v: 1 },
    $push: { history: { action: 'Withdrawn', actor: advisorId, at: new Date() } },
  }, { new: true, runValidators: true }).lean();
  if (updated) return updated;
  const current = await Request.findOne({ _id: requestId, requestingAdvisor: advisorId }).lean();
  if (!current) throw fail('Extra-hours request not found.', 404);
  if (current.decision === 'Withdrawn') return current;
  throw fail('Only pending requests can be withdrawn. Refresh to see the current decision. Approved requests require the cancellation or refund flow.');
}

module.exports = { withdrawRequest };

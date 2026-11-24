const Request = require('../models/ExtraHoursRequest');
const { loadContext, evaluateSelection } = require('./extraHoursSubmissionService');
const { publishStudentNotification } = require('./studentNotificationService');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });

async function decideRequest(requestId, coordinatorId, { decision, responseNote }) {
  const request = await Request.findById(requestId).lean();
  if (!request) throw fail('Extra-hours request not found.', 404);
  if (request.decision !== 'Pending') throw fail('This request has already been decided. Refresh to see its current decision.');
  if (request.settlementStatus !== 'Not Applicable' || request.settlementOption != null) throw fail('This request has an inconsistent settlement state.');
  if (decision === 'Approved') {
    if (request.history?.some((entry) => entry.action === 'DemoCreated') || request.eligibility.checks.some((entry) => !entry.passed)) {
      throw fail('This request has failed submission checks or is demo data and cannot be approved.', 422);
    }
    const context = await loadContext(String(request.student), String(request.term));
    const { quote } = evaluateSelection(context, request.items.map((item) => ({ courseId: String(item.course), requestedHours: item.requestedHours })));
    if (!quote.eligible) throw fail(`Current eligibility checks failed: ${quote.issues.map((issue) => issue.message).join(' ')}`, 422);
    const priceItems = (items) => items.map((item) => ({ course: String(item.course), code: item.code, name: item.name,
      creditHours: item.creditHours, requestedHours: item.requestedHours, classification: item.classification,
      ratePerHour: item.ratePerHour, subtotal: item.subtotal })).sort((a, b) => a.course.localeCompare(b.course));
    if (request.currency !== quote.currency || request.totalCost !== quote.totalCost || request.requestedHours !== quote.requestedHours ||
      JSON.stringify(priceItems(request.items)) !== JSON.stringify(priceItems(quote.items))) {
      throw fail('Course details or itemized cost have changed. Reject this request and ask the Advisor to submit an updated request.');
    }
  }
  const now = new Date();
  // Conditional single-document update prevents two reviewers from overwriting
  // each other. Decisions never modify schedules, student allowances or money.
  const updated = await Request.findOneAndUpdate({ _id: requestId, decision: 'Pending', __v: request.__v,
    settlementStatus: 'Not Applicable', settlementOption: null }, {
    $set: { decision, responseNote, decidedBy: coordinatorId, decidedAt: now,
      settlementStatus: decision === 'Approved' ? 'Awaiting Payment Choice' : 'Not Applicable' },
    $inc: { __v: 1 }, $push: { history: { action: decision, actor: coordinatorId, note: responseNote, at: now } },
  }, { new: true, runValidators: true }).lean();
  if (!updated) throw fail('The request changed while you were reviewing it. Refresh and try again.');

  // FR 117: notify the student that their extra-hours request was decided
  try {
    await publishStudentNotification('extra_hours.decided', {
      entityId: updated._id,
      occurrence: `decided-${now.getTime()}`,
      decision: updated.decision,
      studentId: updated.student,
      reference: updated.reference,
    });
  } catch (notificationError) {
    // Log but don't fail the decision — it's already committed
    console.error('[extra-hours] Failed to send decision notification:', notificationError);
  }

  return updated;
}
module.exports = { decideRequest };


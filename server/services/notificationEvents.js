// Audience is policy, never supplied by an HTTP client. Producers must load and
// authorize the source request before publishing an event for its owner.
const EVENTS = Object.freeze({
  'swap.opened': { audience: 'student', studentTypes: ['Normal Student'], type: 'schedule' },
  'swap.completed': { audience: 'student', studentTypes: ['Normal Student'], type: 'schedule' },
  'schedule.review_ready': { audience: 'student', studentTypes: ['Advising Student'], type: 'schedule' },
  'slot_change.decided': { audience: 'student', studentTypes: ['Advising Student'], type: 'approval' },
  'schedule.processed': { audience: 'student', type: 'schedule' },
  'schedule.reopened': { audience: 'student', studentTypes: ['Advising Student'], type: 'schedule' },
  'extra_hours.decided': { audience: 'student', studentTypes: ['Advising Student'], type: 'approval' },
  'payment.completed': { audience: 'student', studentTypes: ['Advising Student'], type: 'payment' },
  'charge.deferred': { audience: 'student', studentTypes: ['Advising Student'], type: 'payment' },
  'refund.completed': { audience: 'student', studentTypes: ['Advising Student'], type: 'payment' },
  'graduation_plan.decided': { audience: 'student', studentTypes: ['Advising Student'], type: 'approval' },
  'exit_exam.decided': { audience: 'student', studentTypes: ['Advising Student'], type: 'approval' },
  'advisor.assigned': { audience: 'advisor', type: 'info' },
  'slot_change.submitted': { audience: 'advisor', type: 'schedule' },
  'slot_change.withdrawn': { audience: 'advisor', type: 'schedule' },
  'graduation_plan.submitted': { audience: 'coordinator', type: 'approval' },
  'exit_exam.action_required': { audience: 'coordinator', type: 'approval' },
  'mandatory_removal.action_required': { audience: 'coordinator', type: 'approval' },
  'extra_hours.action_required': { audience: 'coordinator', type: 'approval' },
  'financial_reversal.action_required': { audience: 'coordinator', type: 'payment' },
  'advising.reminder.advisor': { audience: 'advisor', type: 'warning' },
  'advising.reminder.coordinator': { audience: 'coordinator', type: 'warning' },
});

module.exports = { EVENTS };

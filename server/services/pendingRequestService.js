const { getStatusesFor } = require('./workflowService');

/**
 * Req 52: the "pending-request type" filter on the Advisor's advising list.
 *
 * This filter derives request types from workflow status rather than querying
 * request collections. Exit-exam requests are tracked separately and do not
 * change the student's scheduling workflow status, so they are not represented
 * by this status-derived filter.
 *
 * Deriving keeps the filter honest rather than inventing rows, and it is a pure
 * function of a field already on every student document. When the real request
 * models land, only the table below has to change — the API shape, the query
 * builder and the UI stay as they are.
 */
const PENDING_REQUEST_TYPES = [
  { value: 'Slot-change request', statuses: ['Change Request Pending'] },
  { value: 'Extra-hours approval', statuses: ['Pending Approval'] },
  { value: 'Extra-hours payment', statuses: ['Awaiting Payment Choice'] },
  { value: 'Deferred installment charge', statuses: ['Deferred to Next Installment'] },
];

/** Request types with no statuses of their own, offered as their own option. */
const NO_PENDING_REQUEST = 'None';

/** Every request type the filter offers, in the order the UI shows them. */
const pendingRequestOptions = () => [
  ...PENDING_REQUEST_TYPES.map((entry) => entry.value),
  NO_PENDING_REQUEST,
];

/** The request a student is waiting on right now, or "None". */
const pendingRequestFor = (workflowStatus) =>
  PENDING_REQUEST_TYPES.find((entry) => entry.statuses.includes(workflowStatus))?.value ?? NO_PENDING_REQUEST;

/**
 * The workflow statuses that mean "this request type is pending".
 * Asked for "None", that is every advising status no request claims.
 */
const statusesForPendingRequest = (type) => {
  if (type === NO_PENDING_REQUEST) {
    const claimed = PENDING_REQUEST_TYPES.flatMap((entry) => entry.statuses);
    return getStatusesFor('Advising Student').filter((status) => !claimed.includes(status));
  }

  return PENDING_REQUEST_TYPES.find((entry) => entry.value === type)?.statuses ?? [];
};

module.exports = {
  PENDING_REQUEST_TYPES,
  NO_PENDING_REQUEST,
  pendingRequestOptions,
  pendingRequestFor,
  statusesForPendingRequest,
};

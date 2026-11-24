jest.mock('../models/ExtraHoursRequest', () => ({ findById: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../services/extraHoursSubmissionService', () => ({ loadContext: jest.fn(), evaluateSelection: jest.fn() }));
const Request = require('../models/ExtraHoursRequest');
const { loadContext, evaluateSelection } = require('../services/extraHoursSubmissionService');
const { decideRequest } = require('../services/extraHoursDecisionService');
let row, quote;
const q = (value) => ({ lean: async () => value });
beforeEach(() => {
  jest.resetAllMocks();
  const item = { course: 'course', code: 'CSEN701', name: 'Course', creditHours: 3, requestedHours: 3, classification: 'New', ratePerHour: 800, subtotal: 2400 };
  row = { _id: 'request', __v: 0, student: 'student', term: 'term', decision: 'Pending', settlementStatus: 'Not Applicable', settlementOption: null,
    items: [item], requestedHours: 3, totalCost: 2400, currency: 'EGP', eligibility: { checks: [{ passed: true }] }, history: [] };
  quote = { eligible: true, issues: [], items: [{ ...item }], requestedHours: 3, totalCost: 2400, currency: 'EGP' };
  Request.findById.mockImplementation(() => q(row)); Request.findOneAndUpdate.mockReturnValue(q({ ...row, decision: 'Approved' }));
  loadContext.mockResolvedValue({ current: true }); evaluateSelection.mockReturnValue({ quote });
});
test('approval revalidates official context and cost and only updates the request decision', async () => {
  await decideRequest('request', 'coordinator', { decision: 'Approved', responseNote: 'Eligible and cost confirmed.' });
  expect(loadContext).toHaveBeenCalledWith('student', 'term');
  expect(evaluateSelection).toHaveBeenCalledWith({ current: true }, [{ courseId: 'course', requestedHours: 3 }]);
  const [filter, update, options] = Request.findOneAndUpdate.mock.calls[0];
  expect(filter).toEqual({ _id: 'request', decision: 'Pending', __v: 0, settlementStatus: 'Not Applicable', settlementOption: null });
  expect(update.$set).toMatchObject({ decision: 'Approved', responseNote: 'Eligible and cost confirmed.', decidedBy: 'coordinator', settlementStatus: 'Awaiting Payment Choice' });
  expect(update.$set.decidedAt).toBeInstanceOf(Date);
  expect(update.$push.history).toMatchObject({ action: 'Approved', actor: 'coordinator', note: 'Eligible and cost confirmed.' });
  expect(update.$push.pendingStudentNotificationEvents).toMatchObject({
    name: 'extra_hours.decided',
    entityId: 'request',
    message: 'Your extra-hours request has been approved.',
  });
  expect(update.$inc).toEqual({ __v: 1 }); expect(options.runValidators).toBe(true);
});
test('rejection works even if current eligibility cannot be loaded', async () => {
  await decideRequest('request', 'coordinator', { decision: 'Rejected', responseNote: 'Please correct the draft.' });
  expect(loadContext).not.toHaveBeenCalled();
  expect(Request.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ decision: 'Rejected', settlementStatus: 'Not Applicable' });
});
test.each(['Approved', 'Rejected', 'Withdrawn'])('cannot overwrite %s', async (decision) => {
  row.decision = decision;
  await expect(decideRequest('request', 'coordinator', { decision: 'Rejected', responseNote: 'No' })).rejects.toMatchObject({ status: 409 });
  expect(Request.findOneAndUpdate).not.toHaveBeenCalled();
});
test('missing request is 404', async () => {
  row = null;
  await expect(decideRequest('missing', 'coordinator', { decision: 'Approved' })).rejects.toMatchObject({ status: 404 });
});
test.each(['Paid', 'Awaiting Payment Choice'])('inconsistent settlement %s cannot be decided', async (status) => {
  row.settlementStatus = status;
  await expect(decideRequest('request', 'coordinator', { decision: 'Approved' })).rejects.toMatchObject({ status: 409 });
});
test.each(['demo', 'failed'])('cannot approve %s submission', async (kind) => {
  if (kind === 'demo') row.history.push({ action: 'DemoCreated' }); else row.eligibility.checks[0].passed = false;
  await expect(decideRequest('request', 'coordinator', { decision: 'Approved' })).rejects.toMatchObject({ status: 422 });
  expect(Request.findOneAndUpdate).not.toHaveBeenCalled();
});
test('new probation or other failed current checks block approval', async () => {
  quote.eligible = false; quote.issues = [{ message: 'Probation' }];
  await expect(decideRequest('request', 'coordinator', { decision: 'Approved' })).rejects.toMatchObject({ status: 422 });
  expect(Request.findOneAndUpdate).not.toHaveBeenCalled();
});
test('expired or unavailable draft blocks approval', async () => {
  loadContext.mockRejectedValue(Object.assign(new Error('No editable draft'), { status: 409 }));
  await expect(decideRequest('request', 'coordinator', { decision: 'Approved' })).rejects.toMatchObject({ status: 409 });
  expect(Request.findOneAndUpdate).not.toHaveBeenCalled();
});
test.each(['totalCost', 'requestedHours', 'currency', 'classification', 'ratePerHour', 'creditHours', 'subtotal', 'name'])('changed %s blocks approval without repricing', async (field) => {
  if (['totalCost', 'requestedHours', 'currency'].includes(field)) quote[field] = 'changed'; else quote.items[0][field] = 'changed';
  await expect(decideRequest('request', 'coordinator', { decision: 'Approved' })).rejects.toMatchObject({ status: 409 });
  expect(Request.findOneAndUpdate).not.toHaveBeenCalled();
});
test('concurrent decision loses safely', async () => {
  Request.findOneAndUpdate.mockReturnValue(q(null));
  await expect(decideRequest('request', 'coordinator', { decision: 'Approved', responseNote: 'Confirmed' })).rejects.toMatchObject({ status: 409 });
});

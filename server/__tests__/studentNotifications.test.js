jest.mock('../models/Student', () => ({ find: jest.fn(), updateOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/WalletTransaction', () => ({ find: jest.fn(), updateOne: jest.fn(), create: jest.fn(), TYPES: ['Refund', 'Payment'], DIRECTION: { Refund: 'Credit', Payment: 'Debit' } }));
jest.mock('../models/Wallet', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../services/notificationEventService', () => ({ publishNotificationEvent: jest.fn() }));
const Student = require('../models/Student');
const Transaction = require('../models/WalletTransaction');
const Wallet = require('../models/Wallet');
const { publishNotificationEvent } = require('../services/notificationEventService');
const { TEMPLATES, buildStudentNotification, publishStudentNotification, queueStudentNotification, flushStudentNotifications } = require('../services/studentNotificationService');
const { recordTransaction } = require('../services/walletService');
const Template = require('../models/ScheduleTemplate');
const Slot = require('../models/CourseSlot');
const Schedule = require('../models/StudentSchedule');
const { assignToGroup } = require('../controllers/studentController');
const query = (rows) => ({ select: () => ({ limit: async () => rows }), limit: async () => rows });
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  publishNotificationEvent.mockResolvedValue({});
  Student.find.mockReturnValue(query([]));
  Transaction.find.mockReturnValue(query([]));
});
test.each(Object.keys(TEMPLATES))('%s produces a controlled student notification', (name) => {
  const event = buildStudentNotification(name, { entityId: 'request-1', occurrence: 'version-1', amount: 120.5, decision: 'Approved' });
  expect(event.name).toBe(name);
  expect(event.title).toBeTruthy();
  expect(event.message).not.toMatch(/\{.*\}/);
  expect(event.link).toMatch(/^\//);
});
test.each(['slot_change.decided', 'extra_hours.decided', 'graduation_plan.decided', 'exit_exam.decided'])('%s requires a final decision', (name) => {
  expect(() => buildStudentNotification(name, { entityId: 'request', occurrence: 'v1', decision: 'Pending' })).toThrow('final');
  expect(buildStudentNotification(name, { entityId: 'request', occurrence: 'v1', decision: 'Rejected' }).message).toContain('rejected');
});
test.each([0, -1, NaN, Infinity, '20'])('invalid financial amount %s cannot generate a misleading notification', (amount) => {
  expect(() => buildStudentNotification('payment.completed', { entityId: 'request', occurrence: 'v1', amount })).toThrow('finite');
});
test('advisor events and client-provided links are not student templates', async () => {
  expect(() => buildStudentNotification('advisor.assigned', {})).toThrow('Unknown');
  await publishStudentNotification('schedule.processed', { entityId: 'term', occurrence: 'action', studentId: 'owner', link: '//attacker', recipients: ['other'] });
  expect(publishNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'owner', link: '/schedule' }), { session: undefined });
  expect(publishNotificationEvent.mock.calls[0][0].recipients).toBeUndefined();
});
test('student outbox is appended without sending before the business save', () => {
  const student = { _id: 'owner' };
  queueStudentNotification(student, 'schedule.processed', { entityId: 'term', occurrence: 'action' });
  expect(student.pendingNotificationEvents).toHaveLength(1);
  expect(publishNotificationEvent).not.toHaveBeenCalled();
});
test('successful student relay derives owner from its saved document and acknowledges only that entry', async () => {
  const pending = { _id: 'pending-1', ...buildStudentNotification('schedule.processed', { entityId: 'term', occurrence: 'action' }) };
  Student.find.mockReturnValue(query([{ _id: 'owner', pendingNotificationEvents: [pending] }]));
  await flushStudentNotifications();
  expect(publishNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'owner', occurrence: 'action' }));
  expect(Student.updateOne).toHaveBeenCalledWith({ _id: 'owner' }, { $pull: { pendingNotificationEvents: { _id: 'pending-1' } } });
});
test('enqueue failure retains the pending entry for retry without repeating the action', async () => {
  const pending = { _id: 'pending-1', ...buildStudentNotification('schedule.processed', { entityId: 'term', occurrence: 'action' }) };
  Student.find.mockReturnValue(query([{ _id: 'owner', pendingNotificationEvents: [pending] }]));
  publishNotificationEvent.mockRejectedValueOnce(new Error('offline'));
  const onError = jest.fn();
  await flushStudentNotifications({ onError });
  expect(Student.updateOne).not.toHaveBeenCalled();
  await flushStudentNotifications({ onError });
  expect(publishNotificationEvent.mock.calls[0][0]).toEqual(publishNotificationEvent.mock.calls[1][0]);
  expect(Student.updateOne).toHaveBeenCalledTimes(1);
});
test('a failed acknowledgement can safely replay the exact event', async () => {
  const pending = { _id: 'pending-1', ...buildStudentNotification('schedule.processed', { entityId: 'term', occurrence: 'action' }) };
  Student.find.mockReturnValue(query([{ _id: 'owner', pendingNotificationEvents: [pending] }]));
  Student.updateOne.mockRejectedValueOnce(new Error('lost acknowledgement'));
  await flushStudentNotifications({ onError: jest.fn() });
  await flushStudentNotifications();
  expect(publishNotificationEvent.mock.calls[0][0]).toEqual(publishNotificationEvent.mock.calls[1][0]);
});
test.each([['Payment', 'payment.completed'], ['Refund', 'refund.completed']])('saved %s ledger row emits %s for its own student', async (type, name) => {
  Transaction.find.mockReturnValue(query([{ _id: 'txn', type, student: 'owner', amount: 100, requestReference: 'EHR-1' }]));
  await flushStudentNotifications();
  expect(publishNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({ name, studentId: 'owner', entityId: 'txn', occurrence: 'recorded', message: expect.stringContaining('100.00 EGP') }), { session: undefined });
  expect(Transaction.updateOne).toHaveBeenCalledWith({ _id: 'txn' }, { $set: { notificationPending: false } });
  expect(Wallet.findOneAndUpdate).not.toHaveBeenCalled();
});
test('wallet notification failure remains pending without applying a second payment', async () => {
  Transaction.find.mockReturnValue(query([{ _id: 'txn', type: 'Payment', student: 'owner', amount: 100 }]));
  publishNotificationEvent.mockRejectedValueOnce(new Error('offline'));
  await flushStudentNotifications({ onError: jest.fn() });
  expect(Transaction.updateOne).not.toHaveBeenCalled();
  expect(Wallet.findOneAndUpdate).not.toHaveBeenCalled();
});
test('wallet transactions persist notification intent alongside their ledger row', async () => {
  Wallet.findOneAndUpdate.mockResolvedValue({ _id: 'wallet', balance: 20 });
  Transaction.create.mockResolvedValue({ _id: 'txn' });
  await recordTransaction('owner', { type: 'Payment', amount: 100 });
  expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({ student: 'owner', notificationPending: true }));
  expect(publishNotificationEvent).not.toHaveBeenCalled();
});
test('demo seeding opts out of live financial notifications', async () => {
  Wallet.findOneAndUpdate.mockResolvedValue({ _id: 'wallet', balance: 100 });
  await recordTransaction('owner', { type: 'Refund', amount: 100 }, { notifications: false });
  expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({ notificationPending: false }));
});
test('real group assignment saves processing notification intent with the student', async () => {
  const student = { _id: 'owner', studentType: 'Normal Student', major: 'CS', currentSemester: 7, fullName: 'Student',
    save: jest.fn(async function () {
      expect(this.pendingNotificationEvents).toEqual([expect.objectContaining({ name: 'schedule.processed', entityId: 'term' })]);
    }) };
  Student.findById.mockResolvedValue(student);
  jest.spyOn(Template, 'findOne').mockResolvedValue({ slots: ['slot'] });
  jest.spyOn(Slot, 'find').mockReturnValue({ populate: () => ({ select: async () => [{ offeringId: { termId: 'term', publicationStatus: 'Published' } }] }) });
  jest.spyOn(Schedule, 'deleteMany').mockResolvedValue({});
  jest.spyOn(Schedule, 'insertMany').mockResolvedValue([]);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await assignToGroup({ params: { id: 'owner' }, body: { studyGroup: 'G1', termId: 'term' } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(student.save).toHaveBeenCalledTimes(1);
  expect(publishNotificationEvent).not.toHaveBeenCalled();
});
test('rejected group assignment cannot queue a processing notification', async () => {
  const student = { _id: 'owner', studentType: 'Normal Student', save: jest.fn() };
  Student.findById.mockResolvedValue(student);
  jest.spyOn(Template, 'findOne').mockResolvedValue(null);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await assignToGroup({ params: { id: 'owner' }, body: { studyGroup: 'G1', termId: 'term' } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(student.pendingNotificationEvents).toBeUndefined();
  expect(student.save).not.toHaveBeenCalled();
});

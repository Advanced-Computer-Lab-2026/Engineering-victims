jest.mock('../models/NotificationEvent', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/Notification', () => ({ updateOne: jest.fn() }));
jest.mock('../models/Student', () => ({ findById: jest.fn() }));
jest.mock('../models/User', () => ({ find: jest.fn(), exists: jest.fn() }));
const Event = require('../models/NotificationEvent');
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const User = require('../models/User');
const { EVENTS } = require('../services/notificationEvents');
const { publishNotificationEvent: publish, deliverNextNotificationEvent: deliver, resolveRecipients, eventKey, startNotificationWorker } = require('../services/notificationEventService');
const studentId = '507f1f77bcf86cd799439011';
const input = { name: 'advisor.assigned', entityId: studentId, occurrence: 'assignment-1', studentId, title: 'Assigned student', message: 'A student was assigned.' };
const query = (value) => ({ session: jest.fn().mockResolvedValue(value) });
const student = { _id: studentId, email: 'test@student.guc.edu.eg', isActive: true, studentType: 'Advising Student', assignedAdvisor: 'advisor-1' };
beforeEach(() => {
  jest.resetAllMocks();
  Event.findOne.mockReturnValue(query(null));
  Student.findById.mockReturnValue(query(student));
  User.find.mockReturnValue({ select: () => query([{ _id: 'advisor-1' }]) });
  User.exists.mockResolvedValue(true);
  Event.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Notification.updateOne.mockResolvedValue({});
});

test('assignment resolves only the active assigned advisor, ignoring caller recipient overrides', async () => {
  await publish({ ...input, recipients: ['attacker'] });
  expect(User.find).toHaveBeenCalledWith({ role: 'Advisor', _id: 'advisor-1', isActive: true });
  expect(Event.findOneAndUpdate.mock.calls[0][1].$setOnInsert.recipients).toEqual(['advisor-1']);
});
test('student events resolve the owner email and role, never all students', async () => {
  await resolveRecipients(EVENTS['schedule.processed'], student);
  expect(User.find).toHaveBeenCalledWith({ role: 'Student', email: student.email, isActive: true });
});
test('coordinator events resolve active coordinators only', async () => {
  await resolveRecipients(EVENTS['exit_exam.action_required'], student);
  expect(User.find).toHaveBeenCalledWith({ role: 'Coordinator', isActive: true });
});
test('type-inappropriate, inactive and unassigned recipients are excluded', async () => {
  await expect(resolveRecipients(EVENTS['swap.opened'], student)).resolves.toEqual([]);
  await expect(resolveRecipients(EVENTS['advisor.assigned'], { ...student, assignedAdvisor: null })).resolves.toEqual([]);
  await expect(resolveRecipients(EVENTS['schedule.processed'], { ...student, isActive: false })).resolves.toEqual([]);
  expect(User.find).not.toHaveBeenCalled();
});
test('stable occurrence deduplicates; a new occurrence remains distinct', async () => {
  Event.findOne.mockReturnValue(query({ key: 'existing' }));
  await expect(publish(input)).resolves.toEqual({ key: 'existing' });
  expect(Student.findById).not.toHaveBeenCalled();
  expect(eventKey(input.name, studentId, '1')).not.toBe(eventKey(input.name, studentId, '2'));
});
test('enqueue failures are observable rather than silently losing events', async () => {
  Event.findOneAndUpdate.mockRejectedValue(new Error('offline'));
  await expect(publish(input)).rejects.toThrow('offline');
});
test('transaction session follows event, student, recipient and event-write queries', async () => {
  const session = {};
  await publish(input, { session });
  expect(Event.findOne.mock.results[0].value.session).toHaveBeenCalledWith(session);
  expect(Student.findById.mock.results[0].value.session).toHaveBeenCalledWith(session);
  expect(Event.findOneAndUpdate.mock.calls[0][2].session).toBe(session);
});
test.each([
  { name: 'unknown' }, { name: 'toString' }, { occurrence: '' }, { studentId: 'bad' }, { link: '//evil.example' }, { link: '/\\evil' },
])('rejects invalid event input %j', async (override) => {
  await expect(publish({ ...input, ...override })).rejects.toThrow();
  expect(Event.findOneAndUpdate).not.toHaveBeenCalled();
});
const pending = (attempts = 1) => ({ _id: 'event-id', key: 'stable-key', recipients: ['user-1', 'user-2'], attempts, payload: { type: 'info', title: 'Title', message: 'Message', link: '/notifications' } });
test('a shared group action has a distinct event for each affected student', () => {
  expect(eventKey('swap.completed', 'swap-1', '1', 'student-a'))
    .not.toBe(eventKey('swap.completed', 'swap-1', '1', 'student-b'));
});
test('partial delivery is retryable without inserting duplicate visible rows', async () => {
  Event.findOneAndUpdate.mockResolvedValue(pending());
  Notification.updateOne.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('temporary'));
  await deliver(new Date(0));
  expect(Event.updateOne.mock.calls[0][1].$set).toMatchObject({ status: 'pending', lastError: 'temporary', nextAttemptAt: new Date(2000) });
  await deliver(new Date(2000));
  expect(Notification.updateOne.mock.calls[0][0]).toEqual(Notification.updateOne.mock.calls[2][0]);
  expect(Notification.updateOne.mock.calls[2][2]).toMatchObject({ upsert: true });
  expect(Event.updateOne.mock.calls[1][1].$set.status).toBe('delivered');
  expect(Event.updateOne.mock.calls[1][0].leaseToken).toEqual(expect.any(String));
});
test('delivery excludes accounts deactivated since enqueue', async () => {
  Event.findOneAndUpdate.mockResolvedValue(pending());
  User.exists.mockResolvedValue(false);
  await deliver();
  expect(Notification.updateOne).not.toHaveBeenCalled();
});
test('exhausted delivery failures remain inspectable', async () => {
  Event.findOneAndUpdate.mockResolvedValue(pending(8));
  Notification.updateOne.mockRejectedValue(new Error('failure'));
  await deliver();
  expect(Event.updateOne.mock.calls[0][1].$set.status).toBe('failed');
});
test('idle worker returns without writing', async () => {
  Event.findOneAndUpdate.mockResolvedValue(null);
  await expect(deliver()).resolves.toBe(false);
  expect(Event.updateOne).not.toHaveBeenCalled();
});
test('worker logs database errors and can be stopped', async () => {
  jest.useFakeTimers();
  const onError = jest.fn();
  Event.findOneAndUpdate.mockRejectedValue(new Error('offline'));
  const stop = startNotificationWorker({ onError });
  await jest.advanceTimersByTimeAsync(10);
  expect(onError).toHaveBeenCalledWith('[notifications] Worker failed:', 'offline');
  stop();
  const calls = Event.findOneAndUpdate.mock.calls.length;
  await jest.advanceTimersByTimeAsync(10000);
  expect(Event.findOneAndUpdate).toHaveBeenCalledTimes(calls);
  jest.useRealTimers();
});

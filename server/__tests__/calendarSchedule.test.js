jest.mock('../models/StudentSchedule', () => ({ find: jest.fn() }));
jest.mock('../models/AcademicTerm', () => ({ find: jest.fn() }));
jest.mock('../models/CalendarConnection', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/CalendarEvent', () => ({ findOneAndUpdate: jest.fn(), find: jest.fn() }));
const Schedule = require('../models/StudentSchedule');
const Term = require('../models/AcademicTerm');
const Connection = require('../models/CalendarConnection');
const Mapping = require('../models/CalendarEvent');
const google = require('../services/googleCalendarClient');
const { localInstant, buildRecurringEvent, loadProcessedSchedule, remoteId, synchronize } = require('../services/calendarScheduleService');
const term = { _id: 'term-1', academicYear: '2026/2027', season: 'Winter',
  termStartDate: '2026-10-01', termEndDate: '2027-02-01', teachingStartDate: '2026-10-01', teachingEndDate: '2027-01-15' };
const slot = { _id: 'slot-1', offeringId: { termId: 'term-1', courseId: { code: 'CSEN 701', name: 'Computer Architecture' } },
  dayOfWeek: 'Monday', startTime: '08:15', endTime: '09:45', slotType: 'Lecture', roomId: 'C7.01', instructorId: { fullName: 'Dr Mona' } };
const student = { _id: 'student-1', studentType: 'Normal Student' };
const q = (value) => ({ populate: () => ({ lean: async () => value }), lean: async () => value });
let mapping;
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2026-11-08T12:00:00Z'));
  process.env.UNIVERSITY_TIMEZONE = 'Africa/Cairo';
  mapping = { _id: 'mapping-1', user: 'user-1', googleSubject: 'google-1', term: 'term-1', slot: 'slot-1', generation: 0, save: jest.fn() };
  Schedule.find.mockReturnValue(q([{ termId: 'term-1', slotId: slot }]));
  Term.find.mockReturnValue(q([term]));
  Connection.findOneAndUpdate.mockReturnValue({ select: async () => ({ _id: 'connection-1', googleSubject: 'google-1', refreshToken: 'cipher' }) });
  Connection.updateOne.mockResolvedValue({ matchedCount: 1 });
  Mapping.findOneAndUpdate.mockResolvedValue(mapping);
  Mapping.find.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());
test('weekly recurrence includes only teaching dates and required class details', () => {
  const event = buildRecurringEvent(slot, term);
  expect(event.start).toEqual({ dateTime: '2026-10-05T05:15:00.000Z', timeZone: 'Africa/Cairo' });
  expect(event.end.dateTime).toBe('2026-10-05T06:45:00.000Z');
  expect(event.recurrence).toEqual(['RRULE:FREQ=WEEKLY;COUNT=15']);
  expect(event.summary).toContain('CSEN 701');
  expect(event.summary).toContain('Computer Architecture');
  expect(event.description).toContain('Lecture');
  expect(event.description).toContain('Dr Mona');
  expect(event.location).toBe('C7.01');
});
test('winter and summer wall-clock times use different Cairo offsets', () => {
  expect(localInstant('2026-11-09', '08:15', 'Africa/Cairo')).toBe('2026-11-09T06:15:00.000Z');
  expect(localInstant('2026-10-05', '08:15', 'Africa/Cairo')).toBe('2026-10-05T05:15:00.000Z');
});
test('nonexistent wall-clock time is rejected instead of shifting a class', () => {
  expect(() => localInstant('2026-03-08', '02:30', 'America/New_York')).toThrow('daylight-saving');
});
test('first and last teaching dates are inclusive', () => {
  const event = buildRecurringEvent(slot, { ...term, teachingStartDate: '2026-10-05', teachingEndDate: '2026-10-12' });
  expect(event.recurrence).toEqual(['RRULE:FREQ=WEEKLY;COUNT=2']);
  expect(buildRecurringEvent(slot, { ...term, teachingStartDate: '2026-10-06', teachingEndDate: '2026-10-07' })).toBeNull();
});
test('optional room and instructor can be omitted', () => {
  expect(buildRecurringEvent({ ...slot, roomId: null, instructorId: null }, term).description).not.toMatch(/Instructor:|Room:/);
});
test('malformed and overnight slot times fail before export', () => {
  expect(() => buildRecurringEvent({ ...slot, endTime: '07:00' }, term)).toThrow('invalid');
  expect(() => buildRecurringEvent({ ...slot, startTime: '28:00' }, term)).toThrow('invalid');
});
test('queries only the owner’s processed rows', async () => {
  const result = await loadProcessedSchedule(student, new Date('2026-11-08'));
  expect(Schedule.find).toHaveBeenCalledWith({ studentId: 'student-1', status: 'Processed' });
  expect(result.events).toHaveLength(1);
});
test.each(['Draft', 'Ready for Student Review', 'Reopened'])('advising stage %s cannot export', async (workflowStatus) => {
  await expect(loadProcessedSchedule({ ...student, studentType: 'Advising Student', workflowStatus })).rejects.toThrow('must be processed');
  expect(Schedule.find).not.toHaveBeenCalled();
});
test('processed advising schedules can export', async () => {
  const result = await loadProcessedSchedule({ ...student, studentType: 'Advising Student', workflowStatus: 'Processed' }, new Date('2026-11-08'));
  expect(result.events).toHaveLength(1);
});
test('expired teaching periods are not exported', async () => {
  await expect(loadProcessedSchedule(student, new Date('2027-03-01'))).rejects.toThrow('no current or upcoming');
});
test('broken slot references stop synchronization', async () => {
  Schedule.find.mockReturnValue(q([{ termId: 'term-1', slotId: null }]));
  await expect(loadProcessedSchedule(student, new Date('2026-11-08'))).rejects.toThrow('inconsistent');
});
test('remote IDs are stable and account-specific', () => {
  expect(remoteId(mapping)).toMatch(/^[0-9a-v]{5,1024}$/);
  expect(remoteId(mapping)).toBe(remoteId({ ...mapping }));
  expect(remoteId(mapping)).not.toBe(remoteId({ ...mapping, googleSubject: 'another-account' }));
});
function mockProvider() {
  jest.spyOn(google, 'config').mockReturnValue({});
  jest.spyOn(google, 'decrypt').mockReturnValue('refresh');
  jest.spyOn(google, 'accessToken').mockResolvedValue('access');
  return jest.spyOn(google, 'eventRequest');
}
test('repeat synchronization updates the same event rather than creating duplicates', async () => {
  const provider = mockProvider().mockResolvedValue({ extendedProperties: { private: { gucMapping: 'mapping-1' } } });
  await synchronize('user-1', student);
  await synchronize('user-1', student);
  const updates = provider.mock.calls.filter((call) => call[1] === 'PATCH');
  expect(updates).toHaveLength(2);
  expect(updates[0][2]).toBe(updates[1][2]);
  expect(provider.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
});
test('a missing event is created with its durably reserved ID', async () => {
  const provider = mockProvider().mockRejectedValueOnce({ providerStatus: 404 }).mockResolvedValueOnce({});
  await synchronize('user-1', student);
  expect(provider.mock.calls[1][1]).toBe('POST');
  expect(provider.mock.calls[1][3].id).toBe(remoteId(mapping));
});
test('a cancelled event gets a persisted replacement generation', async () => {
  const provider = mockProvider()
    .mockResolvedValueOnce({ status: 'cancelled' }).mockRejectedValueOnce({ providerStatus: 409 })
    .mockRejectedValueOnce({ providerStatus: 404 }).mockResolvedValueOnce({});
  const original = remoteId(mapping);
  await synchronize('user-1', student);
  expect(mapping.save).toHaveBeenCalledTimes(1);
  expect(mapping.generation).toBe(1);
  expect(provider.mock.calls[3][3].id).not.toBe(original);
});
test('unrelated personal events cannot be overwritten', async () => {
  const provider = mockProvider().mockResolvedValue({ extendedProperties: {} });
  await expect(synchronize('user-1', student)).rejects.toThrow('ownership');
  expect(provider.mock.calls.some((call) => call[1] === 'PATCH')).toBe(false);
  expect(Connection.updateOne.mock.calls.at(-1)[1].$set).toEqual({ lockToken: null, lockUntil: null });
});
test('removed slots delete only tracked, owned events from the current term', async () => {
  const stale = { ...mapping, _id: 'stale-1', slot: 'old-slot', save: jest.fn() };
  Mapping.find.mockResolvedValue([stale]);
  const provider = mockProvider().mockImplementation(async (_token, method, id) => method === 'GET'
    ? { extendedProperties: { private: { gucMapping: id === remoteId(stale) ? 'stale-1' : 'mapping-1' } } } : {});
  await synchronize('user-1', student);
  expect(provider).toHaveBeenCalledWith('access', 'DELETE', remoteId(stale));
  expect(stale.active).toBe(false);
  expect(stale.save).toHaveBeenCalled();
});
test('revoked consent marks the connection for reconnection and releases its lease', async () => {
  mockProvider();
  google.accessToken.mockRejectedValue(Object.assign(new Error('revoked'), { needsReconnect: true }));
  await expect(synchronize('user-1', student)).rejects.toThrow('revoked');
  expect(Connection.updateOne).toHaveBeenCalledWith(expect.any(Object), { $set: { needsReconnect: true } });
  expect(Connection.updateOne.mock.calls.at(-1)[1].$set.lockToken).toBeNull();
});
test('a concurrent synchronization cannot acquire an occupied lease', async () => {
  mockProvider();
  Connection.findOneAndUpdate.mockReturnValue({ select: async () => null });
  await expect(synchronize('user-1', student)).rejects.toThrow('wait');
  expect(google.accessToken).not.toHaveBeenCalled();
});

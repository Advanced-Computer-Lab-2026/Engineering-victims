jest.mock('../models/Student', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/AcademicTerm', () => ({ findById: jest.fn() }));
jest.mock('../models/SemesterStanding', () => ({ find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/ProbationWarning', () => ({ updateMany: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../services/mailService', () => ({ sendMail: jest.fn() }));
const Student = require('../models/Student');
const Term = require('../models/AcademicTerm');
const Standing = require('../models/SemesterStanding');
const Warning = require('../models/ProbationWarning');
const { sendMail } = require('../services/mailService');
const { semesterOrdinal, evaluateStandings, finalizeStanding, reconcileStudent, deliverNextWarning, startProbationWorker } = require('../services/probationService');
const row = (ordinal, standing = 'Probation') => ({ _id: `row-${ordinal}`, term: `term-${ordinal}`, ordinal, standing, academicYear: '2025/2026', season: ordinal % 2 ? 'Spring' : 'Winter', revision: 1 });
const query = (records) => ({ sort: () => ({ lean: async () => records }), select: () => ({ limit: () => ({ lean: async () => records }) }) });
const input = { studentId: 'student', termId: 'term', cumulativeGpa: 3.7, expectedRevision: 0, actorId: 'coordinator' };
beforeEach(() => {
  jest.resetAllMocks();
  Student.findById.mockResolvedValue({ studentType: 'Advising Student', isActive: true, email: 'student@student.guc.edu.eg' });
  Term.findById.mockResolvedValue({ academicYear: '2025/2026', season: 'Spring', termEndDate: new Date('2026-06-01') });
  Standing.findOne.mockResolvedValue(null);
  Standing.findOneAndUpdate.mockResolvedValue({ revision: 1 });
  Standing.find.mockReturnValue(query([row(10), row(11)]));
  Warning.findOneAndUpdate.mockResolvedValue({ _id: 'warning', student: 'student', term: 'term-11', termLabel: '2025/2026 Spring', attempts: 1 });
  sendMail.mockResolvedValue({ ok: true });
});
test('Winter and Spring are adjacent, including Spring to next Winter', () => {
  expect(semesterOrdinal('2025/2026', 'Spring')).toBe(semesterOrdinal('2025/2026', 'Winter') + 1);
  expect(semesterOrdinal('2026/2027', 'Winter')).toBe(semesterOrdinal('2025/2026', 'Spring') + 1);
});
test.each(['Summer', 'First Makeup', 'Second Makeup'])('%s cannot add a probation semester', (season) => {
  expect(() => semesterOrdinal('2025/2026', season)).toThrow('Winter and Spring');
});
test.each([
  [[], 0, false], [[row(10)], 1, false], [[row(10), row(11)], 2, true],
  [[row(10), row(11, 'Good Standing')], 0, false],
  [[row(10), row(11, 'Good Standing'), row(12)], 1, false],
  [[row(10), row(12)], 1, false], [[row(10), row(11), row(12)], 3, true],
])('sequence evaluation %#', (records, count, qualifying) => {
  const result = evaluateStandings(records);
  expect(result.count).toBe(count);
  expect(Boolean(result.second)).toBe(qualifying);
});
test('out-of-order imports are evaluated in academic order', () => {
  expect(evaluateStandings([row(11), row(10)]).second.term).toBe('term-11');
});
test('second sequence starts fresh after good standing', () => {
  const result = evaluateStandings([row(10), row(11), row(12, 'Good Standing'), row(13), row(14)]);
  expect(result.count).toBe(2);
  expect(result.second.term).toBe('term-14');
});
test.each([[3.69, 'Good Standing'], [3.7, 'Probation'], [5, 'Probation']])('GPA %s finalizes as %s and queues a check', async (cumulativeGpa, standing) => {
  await finalizeStanding({ ...input, cumulativeGpa });
  expect(Standing.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ standing, cumulativeGpa, checkPending: true });
  expect(sendMail).not.toHaveBeenCalled();
});
test.each([null, '3.7', NaN, Infinity, 0, 5.01])('rejects invalid authoritative GPA %s', async (cumulativeGpa) => {
  await expect(finalizeStanding({ ...input, cumulativeGpa })).rejects.toThrow('GPA');
  expect(Standing.findOneAndUpdate).not.toHaveBeenCalled();
});
test('cannot finalize an unfinished semester', async () => {
  Term.findById.mockResolvedValue({ academicYear: '2026/2027', season: 'Winter', termEndDate: new Date('2099-01-01') });
  await expect(finalizeStanding(input)).rejects.toThrow('must end');
});
test('same finalization retry is idempotent', async () => {
  const existing = { cumulativeGpa: 3.7, revision: 1 };
  Standing.findOne.mockResolvedValue(existing);
  await expect(finalizeStanding(input)).resolves.toBe(existing);
  expect(Standing.findOneAndUpdate).not.toHaveBeenCalled();
});
test('correction preserves the previous authoritative values', async () => {
  const existing = { cumulativeGpa: 4, standing: 'Probation', revision: 1, finalizedBy: 'previous' };
  Standing.findOne.mockResolvedValue(existing);
  await finalizeStanding({ ...input, expectedRevision: 1, cumulativeGpa: 2.5 });
  expect(Standing.findOneAndUpdate.mock.calls[0][1].$push.previousVersions).toMatchObject({ cumulativeGpa: 4, standing: 'Probation', revision: 1 });
});
test('stale corrections are rejected rather than overwriting a newer finalization', async () => {
  Standing.findOne.mockResolvedValue({ revision: 3, cumulativeGpa: 4 });
  await expect(finalizeStanding({ ...input, expectedRevision: 1 })).rejects.toThrow('Reload');
});
test('reconciliation queues a unique warning for the second term and acknowledges exact revisions', async () => {
  await reconcileStudent('student');
  expect(Warning.findOneAndUpdate).toHaveBeenCalledWith({ student: 'student', term: 'term-11' }, expect.objectContaining({ $setOnInsert: expect.any(Object) }), { upsert: true, new: true });
  expect(Standing.updateOne).toHaveBeenCalledWith({ _id: 'row-11', revision: 1 }, { $set: { checkPending: false } });
  expect(Student.updateOne.mock.calls[0][1].$set.consecutiveProbationSemesters).toBe(2);
});
test('return to good standing resets current state and cancels pending warnings', async () => {
  Standing.find.mockReturnValue(query([row(10), row(11, 'Good Standing')]));
  await reconcileStudent('student');
  expect(Student.updateOne.mock.calls[0][1].$set).toEqual({ academicStanding: 'Good Standing', consecutiveProbationSemesters: 0 });
  expect(Warning.findOneAndUpdate).not.toHaveBeenCalled();
  expect(Warning.updateMany.mock.calls[0][0].status.$in).not.toContain('sent');
});
test('a failed reconciliation does not acknowledge the pending academic check', async () => {
  Warning.findOneAndUpdate.mockRejectedValue(new Error('offline'));
  await expect(reconcileStudent('student')).rejects.toThrow('offline');
  expect(Standing.updateOne).not.toHaveBeenCalled();
});
test('delivery sends the warning to GUC email with the following-semester warning', async () => {
  await deliverNextWarning();
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'student@student.guc.edu.eg', text: expect.stringMatching(/following semester.*termination/) }));
  expect(Warning.updateOne.mock.calls.at(-1)[1].$set.status).toBe('sent');
});
test('historical correction cancels a warning immediately before SMTP delivery', async () => {
  Standing.find.mockReturnValue(query([row(10, 'Good Standing'), row(11)]));
  await deliverNextWarning();
  expect(sendMail).not.toHaveBeenCalled();
  expect(Warning.updateOne.mock.calls.at(-1)[1].$set.status).toBe('cancelled');
});
test('failure schedules retry without changing academic data', async () => {
  sendMail.mockResolvedValue({ ok: false });
  await deliverNextWarning(new Date(0));
  expect(Warning.updateOne.mock.calls.at(-1)[1].$set).toMatchObject({ status: 'pending', nextAttemptAt: new Date(120000), leaseToken: null });
  expect(Student.updateOne).not.toHaveBeenCalled();
});
test('exhausted mail failures remain inspectable', async () => {
  Warning.findOneAndUpdate.mockResolvedValue({ _id: 'warning', student: 'student', term: 'term-11', attempts: 8 });
  sendMail.mockResolvedValue({ ok: false });
  await deliverNextWarning();
  expect(Warning.updateOne.mock.calls.at(-1)[1].$set.status).toBe('failed');
});
test('idle delivery does not send email', async () => {
  Warning.findOneAndUpdate.mockResolvedValue(null);
  await expect(deliverNextWarning()).resolves.toBe(false);
  expect(sendMail).not.toHaveBeenCalled();
});
test('worker is restartable, reports failed passes and stops polling', async () => {
  jest.useFakeTimers();
  Standing.find.mockImplementation(() => { throw new Error('offline'); });
  const onError = jest.fn();
  const stop = startProbationWorker({ onError });
  await jest.advanceTimersByTimeAsync(10);
  expect(onError).toHaveBeenCalled();
  stop();
  const calls = Standing.find.mock.calls.length;
  await jest.advanceTimersByTimeAsync(60000);
  expect(Standing.find).toHaveBeenCalledTimes(calls);
  jest.useRealTimers();
});

const { chooseSlots } = require('../services/extraHoursActivationService');
const slot = (id, startTime, endTime, dayOfWeek = 'Monday') => ({ _id: id, startTime, endTime, dayOfWeek });
test('slot selection backtracks to find a complete lecture/tutorial combination', () => {
  const first = slot('first', '08:00', '10:00'), alternative = slot('alternative', '10:00', '12:00'), tutorial = slot('tutorial', '08:00', '10:00');
  expect(chooseSlots([[first, alternative], [tutorial]], []).map((item) => item._id)).toEqual(['alternative', 'tutorial']);
});
test('assigned slots constrain new slots and adjacent times do not clash', () => {
  expect(chooseSlots([[slot('clash', '09:00', '11:00'), slot('adjacent', '10:00', '12:00')]], [slot('existing', '08:00', '10:00')])[0]._id).toBe('adjacent');
});
test('no feasible combination blocks activation', () => {
  expect(() => chooseSlots([[slot('a', '08:00', '10:00')]], [slot('b', '08:00', '10:00')])).toThrow('No complete');
});
test('one slot cannot satisfy two required sessions', () => {
  const a = slot('a', '08:00', '10:00'); expect(() => chooseSlots([[a], [a]], [])).toThrow('No complete');
});

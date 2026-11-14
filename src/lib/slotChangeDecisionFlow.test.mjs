// Req 48: the decision panel's confirm step (M1: an approval confirmation
// must never become a rejection). Plain Node test runner, no extra tooling:
//   npm test        (or: node --test src/lib/slotChangeDecisionFlow.test.mjs)
// Node 22.18+/24 loads the .ts module directly by stripping its types.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { confirmationStillValid, decisionCall, openConfirmation } from './slotChangeDecisionFlow.ts';

const group = (id, overrides = {}) => ({
  id,
  groupNumber: Number(id.slice(-1)),
  dayOfWeek: 'Sunday',
  startTime: '08:00',
  endTime: '09:30',
  room: 'C3.201',
  maxCapacity: 60,
  assignedCount: 10,
  remainingSeats: 50,
  isFull: false,
  clashes: [],
  isEligible: true,
  reasons: [],
  ...overrides,
});

describe('opening a confirmation', () => {
  it('cannot open an approval without a chosen group', () => {
    assert.equal(openConfirmation('approve', null), null);
  });

  it('cannot open an approval for a group that is not available', () => {
    assert.equal(openConfirmation('approve', group('g4', { isEligible: false, isFull: true, reasons: ['full'] })), null);
  });

  it('opens an approval bound to the chosen group', () => {
    const g2 = group('g2');
    assert.deepEqual(openConfirmation('approve', g2), { action: 'approve', replacement: g2 });
  });

  it('always opens a rejection, with or without a chosen group', () => {
    assert.deepEqual(openConfirmation('reject', null), { action: 'reject' });
    assert.deepEqual(openConfirmation('reject', group('g2')), { action: 'reject' });
  });
});

describe('an open approval confirmation', () => {
  const confirmation = openConfirmation('approve', group('g2'));

  it('stands while the same group is still chosen and available', () => {
    assert.equal(confirmationStillValid(confirmation, group('g2')), true);
  });

  it('is invalid once the group is unchosen (e.g. a re-read found it full)', () => {
    assert.equal(confirmationStillValid(confirmation, null), false);
  });

  it('is invalid once another group is chosen', () => {
    assert.equal(confirmationStillValid(confirmation, group('g5')), false);
  });

  it('is invalid once the same group is no longer available', () => {
    assert.equal(confirmationStillValid(confirmation, group('g2', { isEligible: false, reasons: ['clash'] })), false);
  });

  it('a rejection confirmation never depends on the chosen group', () => {
    assert.equal(confirmationStillValid({ action: 'reject' }, null), true);
    assert.equal(confirmationStillValid({ action: 'reject' }, group('g5')), true);
  });
});

describe('sending a confirmed decision', () => {
  it('an approval always calls approve with its own group, never reject', () => {
    const call = decisionCall(openConfirmation('approve', group('g2')), '  Moved you.  ');
    assert.deepEqual(call, { endpoint: 'approve', body: { replacementSlotId: 'g2', responseNote: 'Moved you.' } });
  });

  it('what is sent depends only on the confirmation, not on the live selection', () => {
    // decisionCall takes no live selection at all: a cleared selection cannot
    // change an approval's endpoint or group (the panel closes it instead).
    assert.equal(decisionCall.length, 2);
    const call = decisionCall(openConfirmation('approve', group('g2')), '');
    assert.equal(call.endpoint, 'approve');
    assert.equal(call.body.replacementSlotId, 'g2');
  });

  it('a rejection calls reject and sends no replacement', () => {
    const call = decisionCall({ action: 'reject' }, ' No free group. ');
    assert.deepEqual(call, { endpoint: 'reject', body: { responseNote: 'No free group.' } });
    assert.equal('replacementSlotId' in call.body, false);
  });
});

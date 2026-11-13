import type { SlotAlternative } from './types';

/**
 * Req 48: the decision panel's confirm step, kept free of React so it can be
 * tested on its own (slotChangeDecisionFlow.test.mjs).
 *
 * An approval confirmation carries the exact group it was opened for. What is
 * confirmed is what is sent: an approval always calls the approve endpoint
 * with that group, and is never turned into a rejection.
 */
export type DecisionConfirmation =
  | { action: 'approve'; replacement: SlotAlternative }
  | { action: 'reject' };

export type DecisionCall =
  | { endpoint: 'approve'; body: { replacementSlotId: string; responseNote: string } }
  | { endpoint: 'reject'; body: { responseNote: string } };

/**
 * Opens a confirmation. A rejection always can; an approval only with a
 * chosen group that is still available, otherwise null (nothing to confirm).
 */
export const openConfirmation = (
  action: DecisionConfirmation['action'],
  replacement: SlotAlternative | null
): DecisionConfirmation | null => {
  if (action === 'reject') return { action: 'reject' };
  return replacement && replacement.isEligible ? { action: 'approve', replacement } : null;
};

/**
 * Whether an open confirmation still stands, given the group chosen now. An
 * approval stands only while the same group is still chosen and available;
 * if it was unchosen, replaced or became unavailable, it must be closed.
 */
export const confirmationStillValid = (
  confirmation: DecisionConfirmation,
  replacement: SlotAlternative | null
): boolean =>
  confirmation.action === 'reject' ||
  (replacement !== null && replacement.id === confirmation.replacement.id && replacement.isEligible);

/** The request a confirmed decision sends. */
export const decisionCall = (confirmation: DecisionConfirmation, note: string): DecisionCall =>
  confirmation.action === 'approve'
    ? { endpoint: 'approve', body: { replacementSlotId: confirmation.replacement.id, responseNote: note.trim() } }
    : { endpoint: 'reject', body: { responseNote: note.trim() } };

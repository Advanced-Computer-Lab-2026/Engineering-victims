import type { MandatoryRemovalStatus } from './types';

/** Req 65-69: the request statuses, in the order the status filter lists them. */
export const REMOVAL_STATUSES: MandatoryRemovalStatus[] = ['Pending', 'Approved', 'Rejected'];

/**
 * One badge colour per status, shared by the list and the details so a request
 * looks the same in both. Matches how the Advisor's history shows them: Pending
 * is amber, a rejection is neutral.
 */
export const REMOVAL_STATUS_TONE: Record<MandatoryRemovalStatus, 'amber' | 'emerald' | 'neutral'> = {
  Pending: 'amber',
  Approved: 'emerald',
  Rejected: 'neutral',
};

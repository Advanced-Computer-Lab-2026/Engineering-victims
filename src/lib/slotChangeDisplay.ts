import type { BadgeTone } from '../components/ui/Badge';
import type { SlotChangeRequestStatus, StaffSlotChangeRequestItem } from './types';

/**
 * Req 43/46: how a staff-side slot-change request is labelled, shared by the
 * review list and the details drawer so both always read the same.
 */
export const STATUS_TONE: Record<SlotChangeRequestStatus, BadgeTone> = {
  Pending: 'amber',
  Approved: 'emerald',
  Rejected: 'rose',
  Withdrawn: 'neutral',
};

export const SLOT_TONE: Record<StaffSlotChangeRequestItem['slotType'], BadgeTone> = {
  Lecture: 'indigo',
  Tutorial: 'sky',
  Lab: 'emerald',
};

type Slot = Pick<StaffSlotChangeRequestItem['currentSlot'], 'groupNumber' | 'dayOfWeek' | 'startTime' | 'endTime'>;

export const slotLabel = (slot: Slot) =>
  `Group ${slot.groupNumber} · ${slot.dayOfWeek} ${slot.startTime}–${slot.endTime}`;

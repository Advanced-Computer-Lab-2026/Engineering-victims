import { apiFetch } from './api';

export interface SwapSlotSnapshot {
  slotId: string;
  courseCode: string;
  courseName: string;
  creditHours?: number;
  slotType: 'Lecture' | 'Tutorial' | 'Lab';
  groupNumber: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  roomId: string;
  instructorName?: string | null;
}

export type SwapRequestStatus = 'Open' | 'Completed' | 'Withdrawn' | 'Expired';

export interface EligibleOpenSwapRequest {
  id: string;
  requesterGroup: string;
  desiredGroups: string[];
  courseCodes: string[];
  schedule: SwapSlotSnapshot[];
  status: 'Open';
  createdAt: string;
}

export interface EligibleOpenSwapsResponse {
  myGroup: string | null;
  myCourses: string[];
  mySchedule: SwapSlotSnapshot[];
  term: {
    id: string;
    academicYear: string;
    season: string;
    swapDeadline: string;
  } | null;
  deadlinePassed: boolean;
  requests: EligibleOpenSwapRequest[];
}

export interface MySwapRequest {
  id: string;
  roleInSwap: 'Requester' | 'Completer';
  term: {
    id: string;
    academicYear: string;
    season: string;
    swapDeadline: string;
  } | null;
  currentGroup: string;
  desiredGroups: string[];
  completedFromGroup: string | null;
  courseCodes: string[];
  schedule: SwapSlotSnapshot[];
  status: SwapRequestStatus;
  completedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
}

export async function submitSwapRequest(desiredGroups: string[]) {
  return apiFetch<{ message: string; swapRequest: MySwapRequest }>('/api/swaps', {
    method: 'POST',
    body: JSON.stringify({ desiredGroups }),
  });
}

export async function getEligibleOpenSwaps() {
  return apiFetch<EligibleOpenSwapsResponse>('/api/swaps/eligible-open');
}

export async function getMySwapRequests() {
  return apiFetch<{ requests: MySwapRequest[] }>('/api/swaps/mine');
}

export async function completeSwapRequest(requestId: string) {
  return apiFetch<{
    message: string;
    swapRequest: {
      id: string;
      status: SwapRequestStatus;
      previousGroup: string;
      newGroup: string;
      completedAt: string;
    };
  }>(`/api/swaps/${encodeURIComponent(requestId)}/complete`, {
    method: 'POST',
  });
}

export async function withdrawSwapRequest(requestId: string) {
  return apiFetch<{
    message: string;
    swapRequest: { id: string; status: SwapRequestStatus; withdrawnAt: string };
  }>(`/api/swaps/${encodeURIComponent(requestId)}/withdraw`, {
    method: 'PATCH',
  });
}

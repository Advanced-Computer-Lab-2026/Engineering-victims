import { apiFetch } from './api';
import type { StudentType } from './types';

export interface PendingWorkStudent {
  id: string;
  studentId: string;
  fullName: string;
  email: string;
  studentType: StudentType;
  major: string;
  currentSemester: number;
  studyGroup: string | null;
  academicStanding: string;
  workflowStatus: string;
  blockingStep: string | null;
  stateCategory: string;
  awaitingRequest: string;
  assignedAdvisor: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  isActive: boolean;
  lastUpdateAt: string;
}

export interface PendingWorkRequestItem {
  id: string;
  studentObjectId: string;
  studentId: string;
  studentName: string;
  detail: string;
  status: string;
  createdAt: string;
}

export interface PendingWorkRequestGroup {
  requestType: string;
  count: number;
  items: PendingWorkRequestItem[];
}

export interface PendingWorkAdvisorGroup {
  advisorId: string | null;
  advisorName: string;
  advisorEmail: string | null;
  students: PendingWorkStudent[];
}

export interface PendingWorkDashboardResponse {
  summary: {
    totalStudents: number;
    normalStudents: number;
    advisingStudents: number;
    openSwaps: number;
    completedSwaps: number;
    awaitingActionCount: number;
  };
  byStudentType: {
    'Advising Student': PendingWorkStudent[];
    'Normal Student': PendingWorkStudent[];
  };
  advisingStateBreakdown: Record<
    'Draft' | 'Review' | 'Change-Request' | 'Approval' | 'Settlement' | 'Processing',
    PendingWorkStudent[]
  >;
  byRequestType: PendingWorkRequestGroup[];
  byAdvisor: PendingWorkAdvisorGroup[];
}

export async function getPendingWorkDashboard() {
  return apiFetch<PendingWorkDashboardResponse>('/api/coordinator/pending-work');
}

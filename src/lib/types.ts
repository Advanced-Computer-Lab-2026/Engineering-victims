export type Role = 'Student' | 'Advisor' | 'Coordinator' | 'Administrator';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

export type StudentType = 'Normal Student' | 'Advising Student';

export interface AdvisorSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface StudentSummary {
  id: string;
  fullName: string;
  email: string;
  studentId: string;
  studentType: StudentType;
  major: string;
  currentSemester: number;
  academicStanding: string;
  assignedAdvisor: AdvisorSummary | null;
  workflowStatus: string;
  blockingStep: string | null;
  isActive: boolean;
  lastUpdateAt: string;
}

export interface FilterOptions {
  studentTypes: string[];
  majors: string[];
  advisors: Array<{ value: string; label: string; email: string }>;
  currentSemesters: number[];
  academicStandings: string[];
  workflowStatuses: Record<StudentType, string[]>;
  blockingSteps: string[];
  accountStatuses: Array<{ value: string; label: string }>;
}

export interface StudentsResponse {
  students: StudentSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  filterOptions: FilterOptions;
}

export interface StudentDetailResponse {
  student: StudentSummary;
  availableStatuses: string[];
}

export type AcademicTermSeason = 'Winter' | 'Spring' | 'Summer';

export interface AcademicTerm {
  id: string;
  academicYear: string;
  season: AcademicTermSeason;
  termStartDate: string;
  termEndDate: string;
  teachingStartDate: string;
  teachingEndDate: string;
  advisingDeadline: string;
  swapDeadline: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AcademicTermDraft {
  academicYear: string;
  season: AcademicTermSeason;
  termStartDate: string;
  termEndDate: string;
  teachingStartDate: string;
  teachingEndDate: string;
  advisingDeadline: string;
  swapDeadline: string;
}

export interface AcademicTermsResponse {
  terms: AcademicTerm[];
}

/** Every filter in req 8, as URL params. Empty string means "not filtering". */
export interface StudentFilters {
  search: string;
  studentType: string;
  assignedAdvisor: string;
  major: string;
  currentSemester: string;
  academicStanding: string;
  workflowStatus: string;
  blockingStep: string;
  isActive: string;
}

export const EMPTY_FILTERS: StudentFilters = {
  search: '',
  studentType: '',
  assignedAdvisor: '',
  major: '',
  currentSemester: '',
  academicStanding: '',
  workflowStatus: '',
  blockingStep: '',
  isActive: '',
};

/** FR 5.0 — in-app notifications. */
export type NotificationType = 'info' | 'success' | 'warning' | 'schedule' | 'approval' | 'payment';

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationSummary[];
  unreadCount: number;
}

export const hasActiveFilters = (filters: StudentFilters): boolean =>
  Object.entries(filters).some(([key, value]) => key !== 'search' && value !== '');

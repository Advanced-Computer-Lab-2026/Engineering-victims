export interface CourseOffering {
  id: string;
  courseId: Course | string;
  termId: any;
  publicationStatus: 'Draft' | 'Published';
  eligibleMajors: string[];
  eligibleSemesters: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CourseSlot {
  id: string;
  offeringId: string;
  instructorId: any;
  slotType: 'Lecture' | 'Tutorial' | 'Lab';
  groupNumber: number;
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  startTime: string;
  endTime: string;
  roomId: string;
  maxCapacity: number;
  assignedCount: number;
}

export type Role = 'Student' | 'Advisor' | 'Coordinator' | 'Administrator';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  /** Only set for students; tells Normal and Advising Students apart. */
  studentType?: StudentType | null;
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

/** Req 50 — a row in the Advisor's all-advising-students list. */
export interface AdvisingStudentRow extends StudentSummary {
  /** True when the signed-in Advisor is this student's assigned Advisor. */
  isMine: boolean;
}

export interface AdvisingStudentsResponse {
  students: AdvisingStudentRow[];
  summary: { total: number; mine: number; unassigned: number };
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

/** Req 18-20 — course catalogue. */
export type CourseType = 'Core' | 'Elective' | 'Huma';
export type CourseMajor = 'Computer Science' | 'DMET';

export const COURSE_TYPES: CourseType[] = ['Core', 'Elective', 'Huma'];
export const COURSE_MAJORS: CourseMajor[] = ['Computer Science', 'DMET'];
export const COURSE_SEASONS: AcademicTermSeason[] = ['Winter', 'Spring', 'Summer'];

export interface CourseSummary {
  id: string;
  code: string;
  name: string;
}

export interface Course extends CourseSummary {
  creditHours: number;
  lectureHours: number;
  tutorialHours: number;
  labHours: number;
  courseType: CourseType;
  faculty: string;
  majors: CourseMajor[];
  recommendedSemester: number;
  offeringSeasons: AcademicTermSeason[];
  prerequisites: CourseSummary[];
  createdAt?: string;
  updatedAt?: string;
}

/** Form state. Numbers stay strings while typing; prerequisites are course ids. */
export interface CourseDraft {
  code: string;
  name: string;
  creditHours: string;
  lectureHours: string;
  tutorialHours: string;
  labHours: string;
  courseType: CourseType;
  faculty: string;
  majors: CourseMajor[];
  recommendedSemester: string;
  offeringSeasons: AcademicTermSeason[];
  prerequisites: string[];
}

export interface CoursesResponse {
  courses: Course[];
}

/** Req 54 — a student's academic history. */
export interface HistoryCourse {
  id: string;
  code: string;
  name: string;
  creditHours: number;
}

export interface CompletedCourse {
  id: string;
  course: HistoryCourse;
  grade: string;
  gradePoints: number;
  passed: boolean;
  term: string;
  semester: number;
}

export interface CurrentCourse {
  id: string;
  course: HistoryCourse;
  term: string;
  semester: number;
}

export interface RemainingCourse extends HistoryCourse {
  courseType: CourseType;
  recommendedSemester: number;
  offeringSeasons: AcademicTermSeason[];
  prerequisites: Array<{ id: string; code: string; name: string; passed: boolean }>;
  /** Failed before, so it is owed again. */
  isRetake: boolean;
}

export interface AcademicHistoryResponse {
  student: {
    id: string;
    fullName: string;
    email: string;
    studentId: string;
    major: string;
    currentSemester: number;
    academicStanding: string;
    assignedAdvisor: AdvisorSummary | null;
  };
  summary: { gpa: number | null; completedHours: number; currentHours: number; remainingHours: number };
  completed: CompletedCourse[];
  current: CurrentCourse[];
  remaining: RemainingCourse[];
}

/** Req 89 — Advising Student wallet. */
export type WalletTransactionType = 'Refund' | 'Payment';

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  direction: 'Credit' | 'Debit';
  amount: number;
  balanceAfter: number;
  requestReference: string | null;
  paymentReference: string | null;
  description: string;
  occurredAt: string;
}

export interface WalletResponse {
  wallet: { balance: number; currency: string; updatedAt: string | null };
  summary: { totalCredits: number; totalDebits: number; count: number };
  transactions: WalletTransaction[];
}

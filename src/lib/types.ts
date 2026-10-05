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

export type TemplatePublicationStatus = 'Draft' | 'Published';

export interface ScheduleTemplate {
  id: string;
  major: string;
  semester: number;
  studyGroup: string;
  termId: string;
  publicationStatus: TemplatePublicationStatus;
  slots: CourseSlot[];
}

export interface ScheduleSlotOption extends CourseSlot {
  courseCode: string;
  courseName: string;
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
  studyGroup: string | null;
  academicStanding: string;
  /** Req 52, 59 — why this student is on advising; null for Normal Students. */
  advisingReason: string | null;
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
  /** Req 52 — derived from the workflow status; "None" when nothing is pending. */
  pendingRequest: string;
}

/** Req 52 — the option set for each of the five advising-student filters. */
export interface AdvisingFilterOptions {
  /** Self is labelled "My assigned students"; "none" means unassigned. */
  advisors: Array<{ value: string; label: string; email: string | null }>;
  majors: string[];
  advisingReasons: string[];
  workflowStatuses: string[];
  pendingRequestTypes: string[];
}

/** Req 52 — filters combine with AND and can all be cleared at once. */
export interface AdvisingStudentFilters {
  search: string;
  assignedAdvisor: string;
  major: string;
  advisingReason: string;
  workflowStatus: string;
  pendingRequestType: string;
}

export const EMPTY_ADVISING_FILTERS: AdvisingStudentFilters = {
  search: '',
  assignedAdvisor: '',
  major: '',
  advisingReason: '',
  workflowStatus: '',
  pendingRequestType: '',
};

/** True when any filter other than the debounced search term is set. */
export const hasActiveAdvisingFilters = (filters: AdvisingStudentFilters): boolean =>
  Object.entries(filters).some(([key, value]) => key !== 'search' && value !== '');

export interface AdvisingStudentsResponse {
  students: AdvisingStudentRow[];
  /** total, mine and unassigned cover every advising student; matched counts the search results. */
  summary: { total: number; mine: number; unassigned: number; matched: number };
  filterOptions: AdvisingFilterOptions;
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

/** Req 128 — CSV import. `row` is the spreadsheet row (header = 1); null for file-level problems. */
export interface CourseImportRowError {
  row: number | null;
  code: string | null;
  messages: string[];
}

export interface CourseImportResult {
  created: number;
  updated: number;
  message: string;
}

export interface CourseImportErrorResponse {
  message: string;
  errors: CourseImportRowError[];
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

/** Req 55 — one attended academic year of a student's transcript. */
export type TranscriptSessionName = 'Winter' | 'Spring' | 'Summer' | 'First Makeup' | 'Second Makeup';

export interface TranscriptCourse {
  id: string;
  course: HistoryCourse;
  status: 'Completed' | 'In Progress';
  /** null while the course is still in progress. */
  grade: string | null;
  gradePoints: number | null;
  passed: boolean | null;
  semester: number;
}

export interface TranscriptSession {
  session: TranscriptSessionName;
  /** e.g. "2025/2026 First Makeup". */
  term: string;
  courses: TranscriptCourse[];
}

export interface TranscriptResponse {
  student: AcademicHistoryResponse['student'];
  /** Attended academic years, newest first. Empty when nothing is recorded. */
  years: string[];
  academicYear: string | null;
  /** Only sessions that hold records, in Winter → Second Makeup order. */
  sessions: TranscriptSession[];
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

/** Req 31 — a student's weekly schedule. */
export type WeekDay = 'Saturday' | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

/** Draft = still being built, Review-ready = completed draft in play, Processed = final. */
export type ScheduleStage = 'Draft' | 'Review-ready' | 'Processed';

export interface ScheduleSession {
  id: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  slotType: 'Lecture' | 'Tutorial' | 'Lab';
  groupNumber: number;
  dayOfWeek: WeekDay;
  startTime: string;
  endTime: string;
  room: string;
  instructor: string | null;
}

export interface WeeklyScheduleResponse {
  student: {
    id: string;
    fullName: string;
    studentId: string;
    studentType: StudentType;
    major: string;
    currentSemester: number;
    studyGroup: string | null;
  };
  stage: ScheduleStage | null;
  workflowStatus: string;
  visible: boolean;
  hiddenReason: string | null;
  term: { id: string; label: string; termStartDate: string; termEndDate: string } | null;
  days: WeekDay[];
  daysOff: WeekDay[];
  sessions: ScheduleSession[];
}

/** Req 57 — an Advising Student's ranked scheduling preferences. */
export type PreferenceKind =
  | 'Preferred day'
  | 'Avoided day'
  | 'Preferred time range'
  | 'Avoided time range'
  | 'Preferred group'
  | 'Day off';

export interface PreferenceEntry {
  priority?: number;
  kind: PreferenceKind;
  day: WeekDay | null;
  startTime: string | null;
  endTime: string | null;
  groupNumber: number | null;
  courseCode: string | null;
}

export interface SchedulingPreferencesResponse {
  term: {
    id: string;
    label: string;
    advisingDeadline: string;
    closesAt: string;
    isOpen: boolean;
  } | null;
  preference: {
    preferences: PreferenceEntry[];
    note: string;
    submittedAt: string;
    updatedAt: string;
  } | null;
  options?: { kinds: PreferenceKind[]; days: WeekDay[]; maxPreferences: number };
}

/** Req 58 — an Advising Student's latest preferences, as staff see them. */
export interface StudentPreferencesResponse {
  student: { id: string; fullName: string; studentId: string };
  term: SchedulingPreferencesResponse['term'];
  preference: SchedulingPreferencesResponse['preference'];
}

/** Req 33 — detailed view of a registered course's assigned slots. */
export interface CourseSlotDetail {
  id: string;
  slotType: 'Lecture' | 'Tutorial' | 'Lab';
  groupNumber: number;
  dayOfWeek: WeekDay;
  startTime: string;
  endTime: string;
  room: string;
  instructor: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface CourseDetailsResponse {
  course: {
    id: string;
    code: string;
    name: string;
    creditHours: number;
    courseType: CourseType;
  };
  slots: {
    lectures: CourseSlotDetail[];
    tutorials: CourseSlotDetail[];
    labs: CourseSlotDetail[];
  };
  totalSlots: number;
}

/** Req 34 — eligible groups for whole-schedule swap. */
export interface EligibleSwapGroup {
  studyGroup: string;
  major: string;
  semester: number;
  courseCodes: string[];
  slotCount: number;
}

export interface EligibleSwapGroupsResponse {
  myGroup: string;
  myCourses: string[];
  eligibleGroups: EligibleSwapGroup[];
  term: { id: string; academicYear: string; season: string } | null;
  message: string;
}

/**
 * Req 34 — one eligible group's complete weekly schedule, ready to render with
 * the same day and session shape Req 31 uses.
 */
export interface SwapGroupScheduleResponse {
  studyGroup: string;
  major: string;
  semester: number;
  myGroup: string;
  courseCodes: string[];
  slotCount: number;
  term: { id: string; academicYear: string; season: string } | null;
  visible: boolean;
  days: WeekDay[];
  daysOff: WeekDay[];
  sessions: ScheduleSession[];
}


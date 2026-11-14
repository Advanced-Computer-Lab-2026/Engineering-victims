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

/** Req 59 — a course still standing between a student and the bachelor project. */
export interface OutstandingCourse {
  course: { id: string; code: string; name: string; creditHours: number };
  semester: number;
  state: 'Failed' | 'In progress' | 'Not attended';
}

/** Req 59 — everything here is calculated by the server; none of it is editable. */
export interface AdvisingOverview {
  advisingReason: string | null;
  allowance: {
    semester: number | null;
    /** Which standard allowance applied, e.g. "Semesters 5-6". */
    band: string;
    standardHours: number;
    allowedHours: number;
    /** GUC scale, lower is better; null until something is graded. */
    gpa: number | null;
    isProbation: boolean;
    reductionPercent: number;
    canReceiveIncrease: boolean;
  };
  schedule: { status: string; blockingStep: string | null; lastUpdateAt: string };
  completedHours: number;
  bachelorProject: {
    eligible: boolean;
    explanation: string;
    englishComplete: boolean;
    outstandingEnglish: OutstandingCourse[];
    outstandingCourses: OutstandingCourse[];
  };
}

export interface AdvisingOverviewResponse {
  student: {
    id: string;
    fullName: string;
    studentId: string;
    major: string;
    currentSemester: number;
    academicStanding: string;
  };
  overview: AdvisingOverview;
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

/** Req 61: why a course is owed. */
export type MandatoryCandidateReason = 'Failed' | 'Unattended';

/** Req 61: a failed or unattended course, mandatory unless an approved removal applies. */
export interface MandatoryCandidate {
  course: HistoryCourse;
  reason: MandatoryCandidateReason;
  /** The semester of the latest failed attempt, or the curriculum semester of an unattended course. */
  semester: number;
  /** The term of the latest failed attempt; null for a course never taken. */
  term: string | null;
  /** A failed course being retaken this term. */
  inProgress: boolean;
  /** Always true: a course with an approved removal is left out of the list. */
  mandatory: true;
}

export interface MandatoryCandidatesResponse {
  student: AcademicHistoryResponse['student'];
  candidates: MandatoryCandidate[];
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

/** Req 40 — an Advising Student's slot-change requests. */
export type SlotChangeRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';

/** Whether the signed-in Advising Student may request a slot change right now. */
export interface SlotChangeEligibility {
  canRequest: boolean;
  /** Why requests are closed; null while they are open. */
  reason: string | null;
  workflowStatus: string;
  term: { id: string; label: string; advisingDeadline: string; closesAt: string } | null;
  /** Slots that already have a pending request, so they are not requested twice. */
  pendingSlotIds: string[];
}

export interface SlotChangeRequestInput {
  courseId: string;
  slotType: CourseSlotDetail['slotType'];
  slotId: string;
  preferenceNote?: string;
}

export interface SlotChangeRequestSummary {
  id: string;
  status: SlotChangeRequestStatus;
  course: { id: string; code: string; name: string };
  slotType: CourseSlotDetail['slotType'];
  currentSlot: {
    id: string;
    groupNumber: number;
    dayOfWeek: WeekDay;
    startTime: string;
    endTime: string;
    room: string;
  };
  preferenceNote: string;
  submittedAt: string;
}

/** Req 41 — the Advisor or Coordinator decision on a request. */
export interface SlotChangeResponse {
  note: string;
  /** Null when the responder's account no longer exists. */
  respondedBy: { name: string; role: Role } | null;
  respondedAt: string | null;
  /** The approved replacement slot; null for a rejection. */
  replacementSlot: SlotChangeRequestSummary['currentSlot'] | null;
}

/** Req 41 — one of the student's own slot-change requests. */
export interface SlotChangeRequestItem extends Omit<SlotChangeRequestSummary, 'course'> {
  /** Null when the course has since been deleted. */
  course: SlotChangeRequestSummary['course'] | null;
  term: { id: string; label: string } | null;
  withdrawnAt: string | null;
  /** Present only once the request is Approved or Rejected. */
  response: SlotChangeResponse | null;
}

/** Req 43 — a request as an Advisor or Coordinator sees it in the list. */
export interface StaffSlotChangeRequestItem extends SlotChangeRequestItem {
  /** Null when the student record was deleted. */
  student: { id: string; studentId: string; fullName: string } | null;
  /** The student's current Advisor; null when unassigned. */
  advisor: { id: string; fullName: string } | null;
}

/** Req 43 — 'assigned' for an Advisor's own students, 'all' for a Coordinator. */
export interface StaffSlotChangeRequestList {
  scope: 'assigned' | 'all';
  requests: StaffSlotChangeRequestItem[];
}

/** Req 47 — one slot as compared in the details drawer. */
export interface SlotComparisonTimes {
  groupNumber: number;
  dayOfWeek: WeekDay;
  startTime: string;
  endTime: string;
  room: string;
}

/** Req 47 — why an alternative cannot be offered. */
export type SlotAlternativeReason = 'full' | 'clash' | 'already-assigned' | 'timetable-unavailable';

/** Req 47 — another group of the same course offering and component. */
export interface SlotAlternative extends SlotComparisonTimes {
  id: string;
  maxCapacity: number;
  assignedCount: number;
  /** maxCapacity - assignedCount, never negative. */
  remainingSeats: number;
  isFull: boolean;
  /** The student's other assigned slots this group overlaps. */
  clashes: (SlotComparisonTimes & {
    slotId: string;
    course: { code: string; name: string } | null;
    slotType: 'Lecture' | 'Tutorial' | 'Lab';
  })[];
  isEligible: boolean;
  reasons: SlotAlternativeReason[];
}

/** Req 47 — the current slot beside its alternatives, read-only. */
export interface SlotChangeComparison {
  requestId: string;
  status: SlotChangeRequestStatus;
  slotType: 'Lecture' | 'Tutorial' | 'Lab';
  /** False when the student record is gone, so clashes could not be checked. */
  timetableChecked: boolean;
  current: SlotComparisonTimes & {
    id: string;
    /** True when the slot was deleted; times then come from the request. */
    missing: boolean;
    maxCapacity: number | null;
    assignedCount: number | null;
    remainingSeats: number | null;
  };
  alternatives: SlotAlternative[];
  summary: { total: number; eligible: number; full: number; clashing: number };
}

/** Req 48 — the outcome of approving or rejecting; `request` is null only if re-reading it failed. */
export interface SlotChangeDecisionResult {
  message: string;
  request: StaffSlotChangeRequestItem | null;
}

/** Req 46 — one request opened from the staff list; `request` has the list row's shape. */
export interface StaffSlotChangeRequestDetails {
  scope: 'assigned' | 'all';
  request: StaffSlotChangeRequestItem;
}

/**
 * Req 45 — choices for the staff list filters, limited to the caller's scope:
 * a Coordinator gets every Advisor plus "Unassigned", an Advisor only
 * themselves; courses are those that appear in visible requests.
 */
export interface StaffSlotChangeFilterOptions {
  statuses: SlotChangeRequestStatus[];
  advisors: { id: string; fullName: string; email: string }[];
  includesUnassigned: boolean;
  courses: { id: string; code: string; name: string }[];
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


/** Req 103-107 — an Advisor's graduation plan for one Advising Student. */
export type GraduationPlanStatus = 'Draft' | 'Submitted' | 'Accepted';

/** One of the next Winter, Spring or Summer terms the plan covers, in order. */
export interface GraduationPlanTerm {
  season: AcademicTermSeason;
  academicYear: string;
  label: string;
}

/** One remaining course and the term index it is assigned to. */
export interface GraduationPlanPlacement {
  courseId: string;
  termIndex: number;
}

/** A course the plan still has to place, with the data the rules need. */
export interface GraduationPlanCourse {
  id: string;
  code: string;
  name: string;
  creditHours: number;
  courseType: string;
  recommendedSemester: number;
  offeringSeasons: AcademicTermSeason[];
  prerequisites: Array<{ id: string; code: string; name: string; passed: boolean }>;
  /** A failed course that has to be retaken. */
  isRetake: boolean;
}

export interface GraduationPlanStudent {
  id: string;
  fullName: string;
  email: string;
  studentId: string;
  studentType: StudentType;
  major: string;
  currentSemester: number;
}

/** Req 103/107 — what the server thinks of the plan as it stands. */
export interface GraduationPlanValidation {
  errors: string[];
  assignedCount: number;
  totalCourses: number;
  termHours: Array<{ season: AcademicTermSeason; academicYear: string; hours: number }>;
  /** Req 59 — one credit-hour allowance per entry of `terms`, in term order. */
  creditLimits: number[];
}

export interface GraduationPlanDetail {
  id: string;
  status: GraduationPlanStatus;
  terms: GraduationPlanTerm[];
  placements: GraduationPlanPlacement[];
  student: GraduationPlanStudent;
  /** Req 110: the Advisor who created the plan. */
  advisor: GraduationPlanAdvisor | null;
  remaining: GraduationPlanCourse[];
  validation: GraduationPlanValidation;
  submittedAt: string | null;
  /** Req 113: the Coordinator's response to the latest submission. */
  responseNote: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GraduationPlanAdvisor {
  id: string;
  fullName: string;
  email: string;
}

export interface GraduationPlanSummary {
  id: string;
  status: GraduationPlanStatus;
  student: GraduationPlanStudent | null;
  advisor: GraduationPlanAdvisor | null;
  terms: GraduationPlanTerm[];
  assignedCount: number;
  submittedAt: string | null;
  responseNote: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExitExamRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface ExitExamRequestSummary {
  id: string;
  status: ExitExamRequestStatus;
  student: {
    id: string;
    fullName: string;
    studentId: string;
    major: string;
  } | null;
  advisor: GraduationPlanAdvisor | null;
  course: { id: string; code: string; name: string } | null;
  reason: string;
  responseNote: string;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: { id: string; fullName: string } | null;
}

/** Req 64-69 — an Advisor's request to remove a mandatory course, and its decision. */
export type MandatoryRemovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface MandatoryRemovalRequestSummary {
  id: string;
  status: MandatoryRemovalStatus;
  student: { id: string; fullName: string; studentId: string; major: string } | null;
  advisor: { id: string; fullName: string; email: string } | null;
  course: HistoryCourse | null;
  /** Which of the valid cases the Advisor invoked. */
  category: string;
  /** Only for a restricted pair: the other course of the pair. */
  pairedCourse: HistoryCourse | null;
  reason: string;
  responseNote: string;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: { id: string; fullName: string } | null;
}

export interface StudentRemovalRequestsResponse {
  requests: MandatoryRemovalRequestSummary[];
  /** The valid cases, each with the sentence that explains it. */
  categories: Array<{ value: string; description: string }>;
  /** True only for the student's assigned Advisor. */
  canRequest: boolean;
}

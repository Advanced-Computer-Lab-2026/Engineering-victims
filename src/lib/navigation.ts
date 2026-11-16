import type { ComponentType } from 'react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Contact,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers,
  ScrollText,
  SlidersHorizontal,
  Scale,
  UserCog,
  Users,
  Wallet,
  ArrowRightLeft,
} from 'lucide-react';
import type { Role, StudentType } from './types';

/**
 * The single source of truth for navigation.
 *
 * The sidebar and the dashboard "Getting started" grid both read this list, so
 * a page added here appears in both for exactly the same roles — the dashboard
 * cannot fall behind the sidebar the way it did when it carried its own copy.
 *
 * Rendering stays in the components: this module only describes destinations
 * and who may see them.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** One-line explanation shown on the dashboard tile. The sidebar ignores it. */
  description?: string;
  /** Roles allowed to see the item. Omit to show it to everyone. */
  roles?: Role[];
  /** Further limits a student item to these student types, e.g. the wallet. */
  studentTypes?: StudentType[];
  /** Per-role overrides for `label`, e.g. "Students" is "My Students" for an Advisor. */
  labels?: Partial<Record<Role, string>>;
  /**
   * Marks a destination that is not built yet. It stays visible but inert, so
   * the nav does not grow dead links that bounce the user to the login page.
   */
  unavailable?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Overview and shortcuts for everything your role can reach.',
  },
  { to: '/billing', label: 'Installment Billing', labels: { Student: 'My Installments' }, icon: Wallet,
    roles: ['Student', 'Coordinator', 'Administrator'], description: 'University installments, charges and recorded payments.' },
  {
    to: '/my-extra-hours-requests', label: 'My Extra-hours Requests', icon: ClipboardList,
    roles: ['Student'], studentTypes: ['Advising Student'], description: 'View approved extra-hours requests and itemized costs.',
  },
  {
    to: '/extra-hours-requests', label: 'Extra-hours Requests', icon: ClipboardList,
    roles: ['Coordinator'], description: 'Review extra-hours requests, eligibility checks and itemized costs.',
  },
  // Req 122: Coordinator pending-work dashboard
  {
    to: '/coordinator/pending-work',
    label: 'Pending-Work Dashboard',
    icon: Layers,
    roles: ['Coordinator', 'Administrator'],
    description: "Every student's workflow status, blocking step and awaiting requests grouped by student type, request type and Advisor.",
  },
  {
    to: '/coordinator/queue',
    label: 'Approval Queue',
    icon: Bell,
    roles: ['Coordinator', 'Administrator'],
    description: 'Work waiting on your decision — reviews, swaps and slot changes.',
  },
  // Req 123–125: Global schedule activity history for Coordinator / Administrator
  {
    to: '/schedule-history',
    label: 'Schedule History',
    icon: ScrollText,
    roles: ['Coordinator', 'Administrator'],
    description: 'Automatically recorded history of advising schedule processing and reopening actions.',
  },
  {
    to: '/students',
    label: 'Students',
    icon: Users,
    // An Advisor is shown their own assigned students, not the whole school.
    labels: { Advisor: 'My Students' },
    roles: ['Coordinator', 'Administrator', 'Advisor'],
    description: 'Search, filter and review the scheduling workflow for every student.',
  },
  {
    to: '/schedule-templates',
    label: 'Schedule Groups',
    icon: CalendarRange,
    roles: ['Coordinator', 'Administrator'],
    description: 'Standard schedule templates per major, semester and group.',
  },
  // Req 50: the school-wide list, next to the Advisor's own roster above.
  {
    to: '/advising-students',
    label: 'All Advising Students',
    icon: GraduationCap,
    roles: ['Advisor'],
    description: 'Every advising student in the school, not only the ones assigned to you.',
  },
  {
    to: '/course-availability',
    label: 'Course Slot Availability',
    icon: BookOpen,
    roles: ['Advisor', 'Coordinator'],
    description: 'Select a course to review its lecture, tutorial and lab slots and remaining capacity.',
  },
  // Req 103-113: Advisors build plans; Coordinators review submitted plans.
  {
    to: '/graduation-plans',
    label: 'Graduation Plans',
    icon: GraduationCap,
    roles: ['Advisor', 'Coordinator'],
    description: 'Advisors build plans; Coordinators review submissions and track decisions.',
  },
  // Req 43: Advisors see their assigned students' requests; Coordinators see all.
  {
    to: '/slot-change-review',
    label: 'Slot-Change Requests',
    icon: ClipboardList,
    roles: ['Advisor', 'Coordinator'],
    description: 'Advising-student slot-change requests, their statuses and outcomes.',
  },
  {
    to: '/exit-exam-requests',
    label: 'Exit-exam Requests',
    icon: GraduationCap,
    roles: ['Coordinator'],
    description: 'Review exit-exam requests for a single remaining failed course.',
  },
  {
    to: '/semester-standings',
    label: 'Semester Standings',
    icon: Scale,
    roles: ['Coordinator', 'Administrator'],
    description: "Finalize advising students' semester GPA and review probation history.",
  },
  // Matches the /advisors route guard, so the item is not hidden from a role
  // that is allowed to open the page.
  {
    to: '/advisors',
    label: 'Advisors',
    icon: UserCog,
    roles: ['Coordinator', 'Administrator'],
    description: 'Add advisors to the advising system or remove them.',
  },
  {
    to: '/terms',
    label: 'Academic Terms',
    icon: CalendarDays,
    roles: ['Administrator'],
    description: 'Create terms and set registration and advising deadlines.',
  },
  {
    to: '/courses',
    label: 'Course Catalogue',
    icon: BookOpen,
    roles: ['Administrator'],
    description: 'Course codes, credit hours, types and prerequisites.',
  },
  // The route existed with no nav entry, so the offerings seeded for each term
  // were only reachable by typing the URL.
  {
    to: '/offerings',
    label: 'Course Offerings',
    icon: Layers,
    roles: ['Administrator'],
    description: 'Publish, duplicate and manage offerings and their lecture, tutorial and lab slots.',
  },
  // Req 89: Normal Students have no wallet, so the item is hidden from them.
  {
    to: '/wallet',
    label: 'My Wallet',
    icon: Wallet,
    roles: ['Student'],
    studentTypes: ['Advising Student'],
    description: 'Balance, transactions and extra-hours requests.',
  },
  {
    to: '/my-graduation-plan',
    label: 'My Graduation Plan',
    icon: GraduationCap,
    roles: ['Student'],
    studentTypes: ['Advising Student'],
    description: 'View the graduation plan accepted by the Coordinator.',
  },
  // Req 32: both student types see their own registered courses and credits.
  {
    to: '/my-courses',
    label: 'My Registered Courses',
    icon: BookOpen,
    roles: ['Student'],
    description: 'Your registered courses and the credit hours behind each one.',
  },
  // Req 34: Normal Students can view eligible groups for whole-schedule swap.
  {
    to: '/eligible-swap-groups',
    label: 'Eligible Swap Groups',
    icon: ArrowRightLeft,
    roles: ['Student'],
    studentTypes: ['Normal Student'],
    description: 'View other groups with the same courses for schedule swapping.',
  },
  // Req 35–39: Normal Students submit, view, complete, and withdraw whole-schedule swaps.
  {
    to: '/swaps',
    label: 'Schedule Swaps',
    icon: ArrowRightLeft,
    roles: ['Student'],
    studentTypes: ['Normal Student'],
    description: 'Submit a whole-schedule swap request, complete an open peer swap, or withdraw your request.',
  },
  // Req 41: Advising Students follow their slot-change requests and responses.
  {
    to: '/slot-change-requests',
    label: 'My Slot-Change Requests',
    icon: ClipboardList,
    roles: ['Student'],
    studentTypes: ['Advising Student'],
    description: 'Your slot-change requests, their statuses and the Advisor or Coordinator response.',
  },
  // Req 54: staff reach a student's history from the student lists instead.
  {
    to: '/academic-history',
    label: 'Academic History',
    icon: ScrollText,
    roles: ['Student'],
    studentTypes: ['Advising Student'],
    description: 'Grades, credit hours and standing, term by term.',
  },
  // Req 55: staff reach a student's transcript from their academic history.
  {
    to: '/transcript',
    label: 'Transcript',
    icon: FileText,
    roles: ['Student'],
    studentTypes: ['Advising Student'],
    description: 'Pick an academic year to see its Winter, Spring, Summer and makeup results.',
  },
  // Req 57: only Advising Students have their schedule built by an Advisor.
  {
    to: '/preferences',
    label: 'Scheduling Preferences',
    icon: SlidersHorizontal,
    roles: ['Student'],
    studentTypes: ['Advising Student'],
    description: 'Rank the slots your advisor should build your draft around.',
  },
  {
    to: '/notifications',
    label: 'Notifications',
    icon: Bell,
    description: 'Updates from every workflow, ready to mark as read.',
  },
  // Req 31: staff open a student's schedule from the student lists instead.
  {
    to: '/schedule',
    label: 'My Schedule',
    icon: CalendarDays,
    roles: ['Student'],
    description: 'Your weekly timetable for the current term.',
  },
  {
    to: '/profile',
    label: 'My Profile',
    icon: Contact,
    description: 'Your account details, role and directory record.',
  },
];

/**
 * The items one account may see, in list order.
 *
 * Shared by the sidebar and the dashboard so both stay in step. `role` may be
 * null while the session is still loading, which hides the role-gated items
 * rather than briefly flashing them.
 */
export const visibleNavItems = (role: Role | null, studentType: StudentType | null = null): NavItem[] =>
  NAV_ITEMS.filter(
    (item) =>
      (!item.roles || (role !== null && item.roles.includes(role))) &&
      (!item.studentTypes || (studentType !== null && item.studentTypes.includes(studentType)))
  );

/** The label a given role reads, honouring per-role overrides. */
export const navLabel = (item: NavItem, role: Role | null): string =>
  (role !== null && item.labels?.[role]) || item.label;
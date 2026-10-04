const User = require('../models/User');
const Student = require('../models/Student');
const AcademicTerm = require('../models/AcademicTerm');
const Notification = require('../models/Notification');
const Course = require('../models/Course');
const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const StudentSchedule = require('../models/StudentSchedule');
const { COURSES } = require('./courseCatalogue');
const { recalculate } = require('../services/workflowService');
const { seedWallets } = require('./walletSeed');
const { seedAcademicHistory } = require('./academicHistorySeed');
const { seedScheduleGroups } = require('./scheduleSeed');
const { seedAdvisingSchedules } = require('./advisingScheduleSeed');
const { seedSchedulingPreferences } = require('./schedulingPreferenceSeed');

/**
 * The demo dataset.
 *
 * The rule the whole file follows: nothing exists only for looks. Every account
 * can sign in and exercise its role, every row another screen joins on is
 * there, and the cross-record links (student -> login, advising student ->
 * advisor, offering -> course -> term, slot -> instructor, notification ->
 * the thing it talks about) are all real.
 *
 * Concretely that means the roster covers every enum value the app can filter
 * on, every action in the UI has a record it can succeed on, and notifications
 * are generated from the state that was actually seeded rather than from a
 * fixed script that could contradict it.
 */

/** Advisors double as the instructors attached to seeded course slots. */
const ADVISORS = [
  { fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg', role: 'Advisor' },
  { fullName: 'Dr. Karim Fahmy', email: 'karim.fahmy@guc.edu.eg', role: 'Advisor' },
  // Deliberately holds no students: "Remove advisor" refuses to run while an
  // advisor has an assigned student, so without one the action could never
  // succeed in the demo.
  { fullName: 'Dr. Hind Rashwan', email: 'hind.rashwan@guc.edu.eg', role: 'Advisor' },
  { fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg', role: 'Advisor' },
];

const STAFF = [
  { fullName: 'Nour Coordinator', email: 'coordinator@guc.edu.eg', password: 'password123', role: 'Coordinator' },
  /**
   * "Add advisor" promotes an existing @guc.edu.eg user by rewriting their
   * role. Running it on the primary Coordinator or the Administrator would
   * destroy a demo login, so this spare Coordinator exists to be the account
   * that gets promoted.
   */
  { fullName: 'Rania Hosny', email: 'rania.hosny@guc.edu.eg', password: 'password123', role: 'Coordinator' },
  { fullName: 'Admin User', email: 'admin@guc.edu.eg', password: 'password123', role: 'Administrator' },
];

/**
 * The student directory.
 *
 * Coverage is the point, so every row is here for a reason:
 * - all 5 Normal-Student workflow statuses and all 10 Advising-Student ones,
 *   so no status in the filter ever returns an empty list;
 * - all 3 academic standings, including Dismissed;
 * - both account states (the inactive student is inactive at login too);
 * - two Advising Students with no advisor, so first-time assignment and the
 *   "Unassigned" filter have a real target, plus students spread over three
 *   advisors so the advisor filter and reassignment both have options;
 * - only Computer Science and DMET, because those are the only two majors the
 *   course catalogue actually serves.
 *
 * Passwords follow FirstnameLastname2006.
 */
const STUDENTS = [
  // ---- Normal Student: one row per status in NORMAL_STATUSES ----
  { fullName: 'Samy Elgedaily', email: 'samy.elgedaily@student.guc.edu.eg', password: 'SamyElgedaily2006', studentId: '64-12345', studentType: 'Normal Student', major: 'Computer Science', currentSemester: 5, academicStanding: 'Good Standing', workflowStatus: 'Schedule Assigned', isActive: true, advisorEmail: null },
  { fullName: 'Mariam Fouad', email: 'mariam.fouad@student.guc.edu.eg', password: 'MariamFouad2006', studentId: '64-12346', studentType: 'Normal Student', major: 'Computer Science', currentSemester: 5, academicStanding: 'Good Standing', workflowStatus: 'Swap Request Open', isActive: true, advisorEmail: null },
  { fullName: 'Zeyad Tarek', email: 'zeyad.tarek@student.guc.edu.eg', password: 'ZeyadTarek2006', studentId: '65-60012', studentType: 'Normal Student', major: 'DMET', currentSemester: 2, academicStanding: 'Good Standing', workflowStatus: 'Swap Completed', isActive: true, advisorEmail: null },
  { fullName: 'Farida Wagdy', email: 'farida.wagdy@student.guc.edu.eg', password: 'FaridaWagdy2006', studentId: '65-60013', studentType: 'Normal Student', major: 'Computer Science', currentSemester: 3, academicStanding: 'Good Standing', workflowStatus: 'Swap Withdrawn', isActive: true, advisorEmail: null },
  // The deactivated account: blocked at login and shown as inactive in the
  // directory, because both collections carry the same flag.
  { fullName: 'Youssef Kamal', email: 'youssef.kamal@student.guc.edu.eg', password: 'YoussefKamal2006', studentId: '63-10021', studentType: 'Normal Student', major: 'DMET', currentSemester: 7, academicStanding: 'Good Standing', workflowStatus: 'Swap Expired', isActive: false, advisorEmail: null },

  // ---- Advising Student: one row per status in ADVISING_STATUSES ----
  // advisingReason (req 52, 59) is spread across the rows so every option in
  // that filter has a real result, including the "no advising reason" option.
  { fullName: 'Laila Hassan', email: 'laila.hassan@student.guc.edu.eg', password: 'LailaHassan2006', studentId: '64-20045', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 6, academicStanding: 'Probation', advisingReason: 'Probation', workflowStatus: 'Not Started', isActive: true, advisorEmail: null },
  { fullName: 'Omar Nabil', email: 'omar.nabil@student.guc.edu.eg', password: 'OmarNabil2006', studentId: '64-20046', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 6, academicStanding: 'Good Standing', advisingReason: 'Unattended courses', workflowStatus: 'Draft', isActive: true, advisorEmail: 'mona.adel@guc.edu.eg' },
  { fullName: 'Salma Ibrahim', email: 'salma.ibrahim@student.guc.edu.eg', password: 'SalmaIbrahim2006', studentId: '64-30010', studentType: 'Advising Student', major: 'DMET', currentSemester: 4, academicStanding: 'Good Standing', advisingReason: 'More than 2 failed courses in a season', workflowStatus: 'Ready for Student Review', isActive: true, advisorEmail: 'karim.fahmy@guc.edu.eg' },
  { fullName: 'Rana Adel', email: 'rana.adel@student.guc.edu.eg', password: 'RanaAdel2006', studentId: '64-30012', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 5, academicStanding: 'Good Standing', advisingReason: 'Unattended courses', workflowStatus: 'Change Request Pending', isActive: true, advisorEmail: 'mona.adel@guc.edu.eg' },
  { fullName: 'Ahmed Sherif', email: 'ahmed.sherif@student.guc.edu.eg', password: 'AhmedSherif2006', studentId: '64-30011', studentType: 'Advising Student', major: 'DMET', currentSemester: 4, academicStanding: 'Probation', advisingReason: 'Probation', workflowStatus: 'Pending Approval', isActive: true, advisorEmail: 'advisor@guc.edu.eg' },
  { fullName: 'Hana Mahmoud', email: 'hana.mahmoud@student.guc.edu.eg', password: 'HanaMahmoud2006', studentId: '64-40077', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 7, academicStanding: 'Good Standing', advisingReason: 'More than 2 failed courses in a season', workflowStatus: 'Awaiting Payment Choice', isActive: true, advisorEmail: 'karim.fahmy@guc.edu.eg' },
  { fullName: 'Mariam Said', email: 'mariam.said@student.guc.edu.eg', password: 'MariamSaid2006', studentId: '64-50034', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 8, academicStanding: 'Good Standing', advisingReason: 'Transfer from another major or university', workflowStatus: 'Deferred to Next Installment', isActive: true, advisorEmail: 'karim.fahmy@guc.edu.eg' },
  { fullName: 'Tamer Lotfy', email: 'tamer.lotfy@student.guc.edu.eg', password: 'TamerLotfy2006', studentId: '64-40079', studentType: 'Advising Student', major: 'DMET', currentSemester: 6, academicStanding: 'Good Standing', advisingReason: 'Unattended courses', workflowStatus: 'Ready to Process', isActive: true, advisorEmail: 'mona.adel@guc.edu.eg' },
  { fullName: 'Karim Emad', email: 'karim.emad@student.guc.edu.eg', password: 'KarimEmad2006', studentId: '64-40078', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 7, academicStanding: 'Good Standing', advisingReason: 'More than 2 failed courses in a season', workflowStatus: 'Processed', isActive: true, advisorEmail: 'advisor@guc.edu.eg' },
  { fullName: 'Nour El-Sayed', email: 'nour.elsayed@student.guc.edu.eg', password: 'NourElsayed2006', studentId: '64-50033', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 3, academicStanding: 'Good Standing', advisingReason: 'Unattended courses', workflowStatus: 'Reopened', isActive: true, advisorEmail: 'advisor@guc.edu.eg' },
  // ---- extra rows so the remaining filter values are not dead options ----
  // Dismissed: the third standing, which no other row uses.
  { fullName: 'Dina Mostafa', email: 'dina.mostafa@student.guc.edu.eg', password: 'DinaMostafa2006', studentId: '65-60014', studentType: 'Advising Student', major: 'DMET', currentSemester: 1, academicStanding: 'Dismissed', advisingReason: 'Undeclared CS or DMET major', workflowStatus: 'Not Started', isActive: true, advisorEmail: null },
  // A second unassigned advising student, so assigning one does not empty the
  // "Unassigned" filter. Left with no advising reason so that option in the
  // req-52 filter is not a dead choice either.
  { fullName: 'Hassan Rifaat', email: 'hassan.rifaat@student.guc.edu.eg', password: 'HassanRifaat2006', studentId: '65-60015', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 2, academicStanding: 'Good Standing', advisingReason: null, workflowStatus: 'Draft', isActive: true, advisorEmail: 'mona.adel@guc.edu.eg' },
  { fullName: 'Yasmin Adly', email: 'yasmin.adly@student.guc.edu.eg', password: 'YasminAdly2006', studentId: '65-60016', studentType: 'Advising Student', major: 'DMET', currentSemester: 8, academicStanding: 'Good Standing', advisingReason: 'More than 2 failed courses in a season', workflowStatus: 'Processed', isActive: true, advisorEmail: 'karim.fahmy@guc.edu.eg' },
];

/**
 * Three terms: the one the demo currently sits in, one closed term behind it so
 * the selector has history, and one ahead of it so "the next term" already has
 * somewhere to sit.
 *
 * There is deliberately no Summer term. `courseCatalogue.js` offers odd
 * semesters in Winter and even ones in Spring, so no course carries a Summer
 * season — a Summer term would be a selector entry that can never hold a single
 * offering.
 *
 * Every date pair respects the AcademicTerm validators:
 * termStart < termEnd, teachingStart < teachingEnd,
 * swapDeadline <= advisingDeadline, and advisingDeadline >= termStartDate.
 */
const TERMS = [
  {
    academicYear: '2025/2026',
    season: 'Spring',
    termStartDate: '2026-01-12',
    termEndDate: '2026-05-22',
    teachingStartDate: '2026-01-19',
    teachingEndDate: '2026-05-19',
    advisingDeadline: '2026-02-01',
    swapDeadline: '2026-01-25',
  },
  {
    academicYear: '2026/2027',
    season: 'Winter',
    termStartDate: '2026-09-15',
    termEndDate: '2026-12-20',
    teachingStartDate: '2026-09-22',
    teachingEndDate: '2026-12-18',
    advisingDeadline: '2026-10-15',
    swapDeadline: '2026-10-10',
  },
  {
    academicYear: '2026/2027',
    season: 'Spring',
    termStartDate: '2027-01-10',
    termEndDate: '2027-05-20',
    teachingStartDate: '2027-01-17',
    teachingEndDate: '2027-05-15',
    advisingDeadline: '2027-01-20',
    swapDeadline: '2027-01-15',
  },
];

const PAST_SPRING = '2025/2026 Spring';
const WINTER = '2026/2027 Winter';
const SPRING = '2026/2027 Spring';

/**
 * Offerings, one entry per (term, course).
 *
 * The course's own `offeringSeasons` decides which term it may appear in, so
 * odd-semester courses land in Winter and even-semester ones in Spring exactly
 * as the catalogue says. A published set for the current term, a partly drafted
 * one for the next, and a closed set for last year.
 */
const OFFERINGS = [
  // Current term (2026/2027 Winter) — mostly published.
  //
  // Winter carries the odd semesters, so it holds semester 1 and 3 courses as
  // well as the 5/7 ones: a Coordinator opening Schedule Groups on any cohort
  // then finds courses that actually belong to that cohort's semester.
  { term: WINTER, code: 'CSEN 102', publicationStatus: 'Published' },
  { term: WINTER, code: 'MATH 103', publicationStatus: 'Published' },
  { term: WINTER, code: 'PHYS 101', publicationStatus: 'Published' },
  { term: WINTER, code: 'CSEN 301', publicationStatus: 'Published' },
  { term: WINTER, code: 'MATH 301', publicationStatus: 'Published' },
  { term: WINTER, code: 'ELCT 301', publicationStatus: 'Published' },
  { term: WINTER, code: 'CSEN 501', publicationStatus: 'Published' },
  { term: WINTER, code: 'CSEN 503', publicationStatus: 'Published' },
  { term: WINTER, code: 'MATH 501', publicationStatus: 'Published' },
  { term: WINTER, code: 'DMET 502', publicationStatus: 'Published' },
  { term: WINTER, code: 'CSEN 502', publicationStatus: 'Published' },
  { term: WINTER, code: 'CSEN 605', publicationStatus: 'Published' },
  { term: WINTER, code: 'CSEN 701', publicationStatus: 'Published' },
  { term: WINTER, code: 'CSEN 703', publicationStatus: 'Published' },
  { term: WINTER, code: 'DMET 702', publicationStatus: 'Published' },
  { term: WINTER, code: 'DMET 704', publicationStatus: 'Published' },
  { term: WINTER, code: 'PHYSp 301', publicationStatus: 'Draft' },
  { term: WINTER, code: 'CSEN 905', publicationStatus: 'Draft' },

  // Next term (2026/2027 Spring) — a mix, so publish/unpublish both have rows.
  // Even semesters run in Spring, so semester 4 and 6 courses are published
  // next to the semester 2 ones.
  { term: SPRING, code: 'MATH 203', publicationStatus: 'Published' },
  { term: SPRING, code: 'CSEN 202', publicationStatus: 'Published' },
  { term: SPRING, code: 'ELCT 201', publicationStatus: 'Published' },
  { term: SPRING, code: 'MATH 401', publicationStatus: 'Published' },
  { term: SPRING, code: 'CSEN 604', publicationStatus: 'Published' },
  { term: SPRING, code: 'CSEN 403', publicationStatus: 'Draft' },
  { term: SPRING, code: 'CSIS 402', publicationStatus: 'Draft' },
  { term: SPRING, code: 'ELCT 401', publicationStatus: 'Draft' },
  { term: SPRING, code: 'CSEN 602', publicationStatus: 'Draft' },
  { term: SPRING, code: 'DMET 603', publicationStatus: 'Draft' },
  { term: SPRING, code: 'DMET 601', publicationStatus: 'Draft' },
  { term: SPRING, code: 'CSEN 907', publicationStatus: 'Draft' },

  // Closed term, so the term selector is not a choice between "now" and "empty".
  { term: PAST_SPRING, code: 'MATH 203', publicationStatus: 'Published' },
  { term: PAST_SPRING, code: 'ELCT 201', publicationStatus: 'Published' },
  { term: PAST_SPRING, code: 'CSEN 403', publicationStatus: 'Published' },
];

/**
 * The slot grid.
 *
 * conflictService rejects an instructor or a room booked twice in overlapping
 * times, and it checks globally rather than per term. So slots are laid out on
 * a fixed grid instead of being picked at random: five days of six time blocks,
 * four rooms wide. A slot's index walks the grid cell by cell — day and time
 * first, so a course's lecture, tutorial and lab land on different days and
 * times instead of on top of each other — and only wraps back to the first cell
 * once the whole week is full, taking the next room and instructor with it. Two
 * slots can share a cell, then, only when their rooms and instructors differ,
 * which is precisely what the conflict rules allow.
 */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const BLOCKS = [
  ['08:00', '09:30'],
  ['09:45', '11:15'],
  ['11:30', '13:00'],
  ['13:15', '14:45'],
  ['15:00', '16:30'],
  ['16:45', '18:15'],
];
const ROOMS = ['H1-01', 'H1-02', 'H1-03', 'H1-04'];
const SLOT_CAPACITY = {
  Lecture: { maxCapacity: 60, assignedCount: 48 },
  Tutorial: { maxCapacity: 30, assignedCount: 24 },
  Lab: { maxCapacity: 20, assignedCount: 16 },
};
const SLOT_TYPES = [
  { slotType: 'Lecture', hoursField: 'lectureHours' },
  { slotType: 'Tutorial', hoursField: 'tutorialHours' },
  { slotType: 'Lab', hoursField: 'labHours' },
];

/**
 * Which cohorts may take a seeded offering's slots.
 *
 * Every seeded offering is open to every semester on purpose. The Schedule
 * Groups screen lets a Coordinator pick any term, major and semester in any
 * combination, and a term can only hold the courses its season allows (odd
 * semesters in Winter, even ones in Spring), so tying eligibility to the
 * course's `recommendedSemester` would hand that screen an empty slot list for
 * every combination the term cannot answer — semester 1 in the Spring term, for
 * one. The course still decides *which* slots a group gets: seedScheduleGroups
 * offers the cohorts the courses closest to their own semester first.
 *
 * eligibleMajors stays the course's own majors; the seeded roster only contains
 * the two majors the catalogue serves, so there is no gap to paper over there.
 */
const ALL_SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * Per-status notifications. One unread row so the badge and "mark as read" have
 * something to work on, one read row so the read rendering shows, plus a shared
 * deadline row. The wording is written to match the status the student is
 * actually in, so a student who has never started a schedule is not told their
 * schedule was processed.
 */
const STUDENT_NOTIFICATIONS = {
  'Schedule Assigned': [
    { type: 'schedule', title: 'Your schedule has been assigned', message: 'Your standard schedule is assigned and ready to review in My Profile.', isRead: false },
    { type: 'success', title: 'Registration confirmed', message: 'Nothing else is needed from you for this term.', isRead: true },
  ],
  'Swap Request Open': [
    { type: 'schedule', title: 'Your swap request is open', message: 'Your whole-schedule swap request is looking for a partner.', isRead: false },
    { type: 'info', title: 'Swaps close at the swap deadline', message: 'If no partner is found by the deadline the request expires and your current schedule stands.', isRead: true },
  ],
  'Swap Completed': [
    { type: 'success', title: 'Swap completed', message: 'Your swap went through and the new schedule is now the one in effect.', isRead: false },
    { type: 'info', title: 'Previous schedule archived', message: 'Your earlier schedule stays in your history.', isRead: true },
  ],
  'Swap Withdrawn': [
    { type: 'info', title: 'Swap request withdrawn', message: 'You withdrew the request, so your original schedule is back in effect.', isRead: false },
    { type: 'info', title: 'You can open a new request', message: 'Another swap request can be opened until the swap deadline passes.', isRead: true },
  ],
  'Swap Expired': [
    { type: 'warning', title: 'Swap request expired', message: 'No partner was found before the deadline, so the request expired.', isRead: false },
    { type: 'warning', title: 'Register for the next term', message: 'Open a new registration to pick your courses again.', isRead: true },
  ],
  'Not Started': [
    { type: 'info', title: 'Schedule not started', message: 'Your schedule has not been started yet. Your advisor assigns it first.', isRead: false },
    { type: 'info', title: 'Welcome to the scheduling portal', message: 'Use the sidebar to reach your dashboard, notifications and profile.', isRead: true },
  ],
  Draft: [
    { type: 'info', title: 'Draft in progress', message: 'Your advisor is building your draft schedule. You will be notified when it is ready.', isRead: false },
    { type: 'info', title: 'Nothing to do yet', message: 'Check your profile details while the draft is being prepared.', isRead: true },
  ],
  'Ready for Student Review': [
    { type: 'approval', title: 'Your schedule is ready for review', message: 'Your advisor finished the draft. Review it and ask for any slot changes.', isRead: false },
    { type: 'info', title: 'How to request a change', message: 'Tell your advisor which slot to move before the advising deadline.', isRead: true },
  ],
  'Change Request Pending': [
    { type: 'approval', title: 'Change request submitted', message: 'Your slot-change request is with your advisor for a decision.', isRead: false },
    { type: 'info', title: 'Your advisor is resolving it', message: 'You will be notified as soon as the request is answered.', isRead: true },
  ],
  'Pending Approval': [
    { type: 'approval', title: 'Schedule sent for approval', message: 'The Coordinator has your schedule and must approve it before you can continue.', isRead: false },
    { type: 'info', title: 'What is blocking you', message: 'Your profile shows "Coordinator approval" as the current blocking step.', isRead: true },
  ],
  'Awaiting Payment Choice': [
    { type: 'payment', title: 'Choose your payment option', message: 'Pick between paying in full or splitting the extra hours into installments.', isRead: false },
    { type: 'info', title: 'Registration is not final yet', message: 'Registration completes once you choose a payment option.', isRead: true },
  ],
  'Deferred to Next Installment': [
    { type: 'payment', title: 'Payment deferred', message: 'Your remaining balance moved to the next installment.', isRead: false },
    { type: 'info', title: 'Next installment', message: 'The next installment is due at the start of the following term.', isRead: true },
  ],
  'Ready to Process': [
    { type: 'info', title: 'Schedule ready to process', message: 'Everything validated, so your schedule is queued for processing.', isRead: false },
    { type: 'info', title: 'This is the last step', message: 'No action is needed from you; you will be notified once it is processed.', isRead: true },
  ],
  Processed: [
    { type: 'success', title: 'Schedule processed', message: 'Your schedule was processed and your registration is complete.', isRead: false },
    { type: 'success', title: 'You are registered', message: 'You are fully registered and ready for the term to start.', isRead: true },
  ],
  Reopened: [
    { type: 'warning', title: 'Schedule reopened', message: 'Your schedule was reopened, so your advisor has to complete the draft again.', isRead: false },
    { type: 'info', title: 'Ask your advisor why', message: 'Contact your advisor if you need the reason the schedule was reopened.', isRead: true },
  ],
  // Used instead of the status templates for a deactivated account, so the
  // copy never claims the student can sign in when they cannot.
  __inactive: [
    { type: 'warning', title: 'Your account was deactivated', message: 'You cannot sign in while your account is inactive. Your academic history is unchanged.', isRead: false },
    { type: 'info', title: 'Ask for reactivation', message: 'An Administrator can reactivate your account; sign in works again as soon as they do.', isRead: true },
  ],
};

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "2026/2027 Winter" — the label every screen uses for a term. */
const termLabel = (term) => (term ? `${term.academicYear} ${term.season}` : 'the current term');

const formatDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 'an unset date' : date.toISOString().slice(0, 10);
};

/**
 * Builds every notification from state that has already been written, so the
 * counts, names and dates in the copy cannot drift from the records behind
 * them. Each account gets unread and read rows so both "mark as read" and
 * "mark all as read" work everywhere.
 */
const buildNotifications = ({ user, student, assignedStudents, stats, currentTerm, courses, offerings }) => {
  const label = termLabel(currentTerm);

  const deadlineRow = {
    type: 'warning',
    title: 'Registration deadlines',
    message: `Swap requests for ${label} close on ${formatDate(currentTerm?.swapDeadline)} and advising ends on ${formatDate(currentTerm?.advisingDeadline)}.`,
    isRead: true,
    link: '/profile',
  };

  if (!user.isActive) {
    return [...STUDENT_NOTIFICATIONS.__inactive, deadlineRow].map((row) => ({ ...row, link: '/profile' }));
  }

  if (user.role === 'Student') {
    const rows = STUDENT_NOTIFICATIONS[student?.workflowStatus] ?? STUDENT_NOTIFICATIONS['Not Started'];
    return [...rows, deadlineRow].map((row) => ({ ...row, link: '/profile' }));
  }

  if (user.role === 'Advisor') {
    const waiting = assignedStudents.filter((s) =>
      ['Ready for Student Review', 'Change Request Pending'].includes(s.workflowStatus)
    );
    const unfinished = assignedStudents.filter((s) =>
      ['Not Started', 'Draft', 'Reopened'].includes(s.workflowStatus)
    );

    return [
      {
        type: 'approval',
        title: waiting.length ? `${waiting[0].fullName} is waiting for you` : 'No one is waiting for you',
        message: waiting.length
          ? `${plural(waiting.length, 'student')} in your roster needs a review or a decision on a change request.`
          : 'Your roster has no student waiting on a review or a change request right now.',
        isRead: false,
        link: '/students',
      },
      {
        type: 'warning',
        title: 'Advising deadline reminder',
        message: assignedStudents.length
          ? `${plural(unfinished.length, 'student')} of your ${assignedStudents.length} still ${unfinished.length === 1 ? 'has' : 'have'} an unfinished schedule. Advising for ${label} ends on ${formatDate(currentTerm?.advisingDeadline)}.`
          : `You have no assigned students yet. Advising for ${label} ends on ${formatDate(currentTerm?.advisingDeadline)}.`,
        isRead: false,
        link: '/students',
      },
      {
        type: 'info',
        title: assignedStudents.length ? `${plural(assignedStudents.length, 'student')} assigned to you` : 'Your roster is empty',
        message: assignedStudents.length
          ? assignedStudents.map((s) => `${s.fullName} (${s.workflowStatus})`).join('; ')
          : 'A Coordinator can assign an advising student to you from the Students page.',
        isRead: true,
        link: '/students',
      },
      {
        type: 'success',
        title: 'Roster synced',
        message: `Your advisor assignments are up to date for ${label}.`,
        isRead: true,
        link: '/students',
      },
    ];
  }

  if (user.role === 'Coordinator') {
    const awaitingApproval = stats.students.filter((s) => s.workflowStatus === 'Pending Approval');
    const waitingOnStudent = stats.students.filter((s) =>
      ['Ready for Student Review', 'Change Request Pending'].includes(s.workflowStatus)
    );
    const unassigned = stats.students.filter(
      (s) => s.studentType === 'Advising Student' && !s.assignedAdvisor
    );

    return [
      {
        type: 'approval',
        title: awaitingApproval.length
          ? `${plural(awaitingApproval.length, 'schedule')} awaiting your approval`
          : 'Nothing awaiting approval',
        message: awaitingApproval.length
          ? `${awaitingApproval.map((s) => s.fullName).join(', ')} ${awaitingApproval.length === 1 ? 'is' : 'are'} blocked on "Coordinator approval".`
          : 'No schedule is blocked on a Coordinator decision right now.',
        isRead: false,
        link: '/students',
      },
      {
        type: 'info',
        title: `${plural(stats.advisors.length, 'advisor')} in the advising system`,
        message: `${plural(stats.assignedAdvisingCount, 'advising student')} assigned, ${plural(unassigned.length, 'advising student')} still unassigned.`,
        isRead: false,
        link: '/advisors',
      },
      {
        type: 'warning',
        title: 'Advising deadline approaching',
        message: `${plural(waitingOnStudent.length, 'student')} ${waitingOnStudent.length === 1 ? 'is' : 'are'} waiting on themselves. Advising for ${label} ends on ${formatDate(currentTerm?.advisingDeadline)}.`,
        isRead: true,
        link: '/students',
      },
      {
        type: 'success',
        title: `${plural(stats.inactiveCount, 'account')} deactivated`,
        message: stats.inactiveCount
          ? 'Deactivated students cannot sign in; their academic history is preserved.'
          : 'Every student account in the directory can sign in.',
        isRead: true,
        link: '/students',
      },
    ];
  }

  // Administrator
  const published = offerings.filter((o) => o.publicationStatus === 'Published').length;

  return [
    {
      type: 'info',
      title: `${label} dates saved`,
      message: `The term runs ${formatDate(currentTerm?.termStartDate)} to ${formatDate(currentTerm?.termEndDate)}; teaching starts ${formatDate(currentTerm?.teachingStartDate)}.`,
      isRead: false,
      link: '/terms',
    },
    {
      type: 'warning',
      title: stats.inactiveCount
        ? `${plural(stats.inactiveCount, 'account')} inactive`
        : 'All accounts are active',
      message: stats.inactiveCount
        ? 'Review the inactive accounts on the Students page and reactivate them when they are allowed back in.'
        : 'Every seeded account can sign in with its GUC email.',
      isRead: false,
      link: '/students',
    },
    {
      type: 'success',
      title: `Course catalogue imported: ${courses.length} courses`,
      // Counted off the catalogue rather than the inserted documents: their
      // prerequisites are linked in a second pass and are not on these docs.
      message: `${COURSES.filter((course) => course.prerequisites.length).length} of them carry prerequisites.`,
      isRead: true,
      link: '/courses',
    },
    {
      type: 'info',
      title: `${published} of ${offerings.length} offerings published`,
      message: `Offerings exist for ${stats.offeringTerms} term${stats.offeringTerms === 1 ? '' : 's'}, including ${label}.`,
      isRead: true,
      link: '/offerings',
    },
  ];
};

/**
 * Req 18-20: the catalogue lists prerequisites by code, so courses are created
 * first and their prerequisites linked by id once every code exists.
 */
const seedCourses = async (createdBy) => {
  const courses = await Course.insertMany(
    COURSES.map(({ prerequisites, ...course }) => ({ ...course, createdBy }))
  );
  const idByCode = new Map(courses.map((course) => [course.code, course._id]));

  await Course.bulkWrite(
    COURSES.filter((course) => course.prerequisites.length > 0).map((course) => ({
      updateOne: {
        filter: { _id: idByCode.get(course.code) },
        update: { prerequisites: course.prerequisites.map((code) => idByCode.get(code)) },
      },
    }))
  );

  return courses;
};

/**
 * Offerings plus their slots. Every course in OFFERINGS must exist in the
 * catalogue and be offered in that term's season, and the slot grid must have
 * room left, or the conflict rules would reject the data we are about to write.
 */
const seedOfferings = async ({ terms, courses, instructors }) => {
  // A cell's position picks the instructor and the room together, so there must
  // be at least as many instructors as rooms or two slots in one cell would
  // land on the same instructor and conflictService would reject them.
  if (instructors.length < ROOMS.length) {
    throw new Error(`The slot grid needs at least ${ROOMS.length} instructors, found ${instructors.length}.`);
  }

  const termIdByKey = new Map(terms.map((term) => [`${term.academicYear} ${term.season}`, term._id]));
  const courseByCode = new Map(courses.map((course) => [course.code, course]));

  const offeringDocs = OFFERINGS.map(({ term, code, publicationStatus }) => {
    const termId = termIdByKey.get(term);
    const course = courseByCode.get(code);

    if (!termId) throw new Error(`Seed offering references an unknown term: ${term}`);
    if (!course) throw new Error(`Seed offering references an unknown course: ${code}`);
    if (!course.offeringSeasons.includes(term.split(' ')[1])) {
      throw new Error(`Seed offering ${code} is not offered in ${term.split(' ')[1]}.`);
    }

    return {
      courseId: course._id,
      termId,
      publicationStatus,
      eligibleMajors: course.majors,
      eligibleSemesters: ALL_SEMESTERS,
    };
  });

  const createdOfferings = await CourseOffering.insertMany(offeringDocs);

  const slotDocs = [];
  const gridCells = DAYS.length * BLOCKS.length;
  const gridCapacity = gridCells * ROOMS.length;

  OFFERINGS.forEach(({ code }, offeringIndex) => {
    const course = courseByCode.get(code);
    const offeringId = createdOfferings[offeringIndex]._id;

    SLOT_TYPES.forEach(({ slotType, hoursField }) => {
      if (!course[hoursField]) return;

      const index = slotDocs.length;
      const cell = index % gridCells;
      const position = Math.floor(index / gridCells) % ROOMS.length;
      const [startTime, endTime] = BLOCKS[Math.floor(cell / DAYS.length) % BLOCKS.length];
      const capacity = SLOT_CAPACITY[slotType];

      slotDocs.push({
        offeringId,
        instructorId: instructors[position % instructors.length]._id,
        slotType,
        groupNumber: 1,
        dayOfWeek: DAYS[cell % DAYS.length],
        startTime,
        endTime,
        roomId: ROOMS[position],
        maxCapacity: capacity.maxCapacity,
        assignedCount: capacity.assignedCount,
      });
    });
  });

  if (slotDocs.length > gridCapacity) {
    throw new Error(
      `Seed schedule has ${slotDocs.length} slots but the conflict-free grid only holds ${gridCapacity}.`
    );
  }

  await CourseSlot.insertMany(slotDocs);
  return { offerings: createdOfferings, slots: slotDocs.length };
};

/**
 * Rebuilds the demo data from scratch. Called on every boot so the database is
 * always in a known state.
 *
 * CourseOffering and CourseSlot are wiped too: their ids are regenerated on
 * every run, so leaving them behind would strand offerings on courses and terms
 * that no longer exist, and the unique (courseId, termId) index would reject
 * the second run outright.
 */
const seed = async () => {
  await User.deleteMany({});
  await Student.deleteMany({});
  await AcademicTerm.deleteMany({});
  await Notification.deleteMany({});
  await Course.deleteMany({});
  await CourseOffering.deleteMany({});
  await CourseSlot.deleteMany({});
  // Groups and the schedules inside them point at every id above (term, course,
  // offering, slot and student are all regenerated below), so they go too.
  // scheduleSeed.js rebuilds them once the offerings it draws from exist.
  await ScheduleTemplate.deleteMany({});
  await StudentSchedule.deleteMany({});

  const created = await User.create([
    ...ADVISORS.map((advisor) => ({ ...advisor, password: 'password123', isActive: true })),
    ...STAFF,
    // Every student in the directory also gets a login account, so nobody in
    // the database exists only half-way. isActive mirrors the directory record
    // (a deactivated student is deactivated at the login too).
    ...STUDENTS.map((student) => ({
      fullName: student.fullName,
      email: student.email,
      password: student.password,
      role: 'Student',
      isActive: student.isActive,
    })),
  ]);

  const idByEmail = new Map(created.map((user) => [user.email, user._id]));
  const administrator = created.find((user) => user.role === 'Administrator');
  const advisors = created.filter((user) => user.role === 'Advisor');

  const students = await Student.create(
    STUDENTS.map(({ advisorEmail, ...student }) => ({
      ...student,
      assignedAdvisor: advisorEmail ? idByEmail.get(advisorEmail) : null,
    }))
  );

  // Derive blocking step rather than storing it, and stagger lastUpdateAt so
  // the directory's "Updated" column and its sort order mean something.
  await Promise.all(
    students.map((student, index) =>
      recalculate(student, {
        lastUpdateAt: new Date(Date.now() - (index + 1) * 18 * 60 * 60 * 1000),
      })
    )
  );

  const terms = await AcademicTerm.create(
    TERMS.map((term) => ({
      ...term,
      termStartDate: new Date(term.termStartDate),
      termEndDate: new Date(term.termEndDate),
      teachingStartDate: new Date(term.teachingStartDate),
      teachingEndDate: new Date(term.teachingEndDate),
      advisingDeadline: new Date(term.advisingDeadline),
      swapDeadline: new Date(term.swapDeadline),
      // Terms are Administrator-only to create, so the record says so.
      createdBy: administrator?._id ?? null,
    }))
  );

  const courses = await seedCourses(administrator?._id ?? null);
  const { offerings, slots } = await seedOfferings({ terms, courses, instructors: advisors });
  // Standard schedule groups built on those slots, and the processed schedules
  // of the Normal Students that sit in them.
  const { groups, schedules, grouped } = await seedScheduleGroups({
    terms,
    offerings,
    courses,
    students,
  });
  // Req 31: each Advising Student's draft, review-ready or processed schedule.
  const advisingSchedules = await seedAdvisingSchedules({ terms, offerings, courses, students });
  // Req 57: preferences submitted for the term being advised now.
  const schedulingPreferences = await seedSchedulingPreferences(students);
  // Req 89: wallet history for the Advising Students.
  const walletTransactions = await seedWallets(students);
  // Req 54: completed (graded) and current courses for the Advising Students.
  const courseRecords = await seedAcademicHistory({ students, courses });

  const currentTerm =
    terms.find((term) => term.season === 'Winter') ?? terms[terms.length - 1] ?? null;

  // What the notifications are written against: real counts off the data above.
  const assignedByAdvisor = new Map(advisors.map((advisor) => [advisor._id, []]));
  students.forEach((student) => {
    if (student.assignedAdvisor && assignedByAdvisor.has(student.assignedAdvisor)) {
      assignedByAdvisor.get(student.assignedAdvisor).push(student);
    }
  });

  const stats = {
    students,
    advisors,
    inactiveCount: students.filter((student) => !student.isActive).length,
    assignedAdvisingCount: students.filter(
      (student) => student.studentType === 'Advising Student' && student.assignedAdvisor
    ).length,
    offeringTerms: new Set(offerings.map((offering) => String(offering.termId))).size,
  };

  // FR 5.0: every seeded account gets its own demo notifications, derived from
  // the state that was just written.
  const notifications = await Notification.insertMany(
    created.flatMap((user) =>
      buildNotifications({
        user,
        student: students.find((row) => row.email === user.email) ?? null,
        assignedStudents: assignedByAdvisor.get(user._id) ?? [],
        stats,
        currentTerm,
        courses,
        offerings,
      }).map((row, index) => ({
        ...row,
        user: user._id,
        // Spread over the last day or so so the relative times read naturally.
        createdAt: new Date(Date.now() - (index + 1) * 5 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - (index + 1) * 5 * 60 * 60 * 1000),
        readAt: row.isRead ? new Date(Date.now() - (index + 1) * 4 * 60 * 60 * 1000) : null,
      }))
    )
  );

  return {
    users: created.length,
    students: students.length,
    advisors: advisors.length,
    terms: terms.length,
    courses: courses.length,
    offerings: offerings.length,
    slots,
    groups,
    schedules,
    grouped,
    advisingSchedules,
    schedulingPreferences,
    walletTransactions,
    courseRecords,
    notifications: notifications.length,
  };
};

module.exports = { seed, ADVISORS, STAFF, STUDENTS };

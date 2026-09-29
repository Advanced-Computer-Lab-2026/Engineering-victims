const User = require('../models/User');
const Student = require('../models/Student');
const AcademicTerm = require('../models/AcademicTerm');
const Notification = require('../models/Notification');
const { recalculate } = require('../services/workflowService');

const ADVISORS = [
  { fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg', role: 'Advisor' },
  { fullName: 'Dr. Karim Fahmy', email: 'karim.fahmy@guc.edu.eg', role: 'Advisor' },
];

const STAFF = [
  { fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg', password: 'password123', role: 'Advisor' },
  { fullName: 'Nour Coordinator', email: 'coordinator@guc.edu.eg', password: 'password123', role: 'Coordinator' },
  { fullName: 'Admin User', email: 'admin@guc.edu.eg', password: 'password123', role: 'Administrator' },
];

/**
 * A spread of students covering both types, every workflow status, both account
 * states and both academic standings, so the list, search, filters and the
 * activate/deactivate action can all be exercised without seeding by hand.
 */
const STUDENTS = [
  { fullName: 'Samy Elgedaily', email: 'samy.elgedaily@student.guc.edu.eg', studentId: '64-12345', studentType: 'Normal Student', major: 'Computer Science', currentSemester: 5, academicStanding: 'Good Standing', workflowStatus: 'Schedule Assigned', isActive: true },
  { fullName: 'Mariam Fouad', email: 'mariam.fouad@student.guc.edu.eg', studentId: '64-12346', studentType: 'Normal Student', major: 'Computer Science', currentSemester: 5, academicStanding: 'Good Standing', workflowStatus: 'Swap Request Open', isActive: true },
  { fullName: 'Youssef Kamal', email: 'youssef.kamal@student.guc.edu.eg', studentId: '63-10021', studentType: 'Normal Student', major: 'Electrical Engineering', currentSemester: 7, academicStanding: 'Good Standing', workflowStatus: 'Swap Expired', isActive: false },
  { fullName: 'Laila Hassan', email: 'laila.hassan@student.guc.edu.eg', studentId: '64-20045', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 6, academicStanding: 'Probation', workflowStatus: 'Not Started', isActive: true },
  { fullName: 'Omar Nabil', email: 'omar.nabil@student.guc.edu.eg', studentId: '64-20046', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 6, academicStanding: 'Good Standing', workflowStatus: 'Draft', isActive: true },
  { fullName: 'Salma Ibrahim', email: 'salma.ibrahim@student.guc.edu.eg', studentId: '64-30010', studentType: 'Advising Student', major: 'DMET', currentSemester: 4, academicStanding: 'Good Standing', workflowStatus: 'Ready for Student Review', isActive: true },
  { fullName: 'Ahmed Sherif', email: 'ahmed.sherif@student.guc.edu.eg', studentId: '64-30011', studentType: 'Advising Student', major: 'DMET', currentSemester: 4, academicStanding: 'Probation', workflowStatus: 'Pending Approval', isActive: true },
  { fullName: 'Hana Mahmoud', email: 'hana.mahmoud@student.guc.edu.eg', studentId: '64-40077', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 7, academicStanding: 'Good Standing', workflowStatus: 'Awaiting Payment Choice', isActive: true },
  { fullName: 'Karim Emad', email: 'karim.emad@student.guc.edu.eg', studentId: '64-40078', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 7, academicStanding: 'Good Standing', workflowStatus: 'Processed', isActive: true },
  { fullName: 'Nour El-Sayed', email: 'nour.elsayed@student.guc.edu.eg', studentId: '64-50033', studentType: 'Advising Student', major: 'Undeclared', currentSemester: 3, academicStanding: 'Good Standing', workflowStatus: 'Reopened', isActive: true },
  { fullName: 'Mariam Said', email: 'mariam.said@student.guc.edu.eg', studentId: '64-50034', studentType: 'Advising Student', major: 'Computer Science', currentSemester: 8, academicStanding: 'Good Standing', workflowStatus: 'Deferred to Next Installment', isActive: true },
  { fullName: 'Zeyad Tarek', email: 'zeyad.tarek@student.guc.edu.eg', studentId: '65-60012', studentType: 'Normal Student', major: 'Mechanical Engineering', currentSemester: 2, academicStanding: 'Good Standing', workflowStatus: 'Swap Completed', isActive: true },
];

/**
 * FR 5.0 demo data: each role gets notifications that would realistically land
 * on that account, a mix of read and unread so the individual "mark as read"
 * and "mark all as read" can both be exercised without creating records by hand.
 */
const NOTIFICATION_TEMPLATES = {
  Student: [
    { type: 'schedule', title: 'Your schedule has been assigned', message: 'Your standard schedule for this term has been processed. Open My Profile to review your registered courses.', isRead: false },
    { type: 'approval', title: 'Slot-change request approved', message: 'Your request to move CSEN 501 to another tutorial group was approved by your advisor.', isRead: false },
    { type: 'payment', title: 'Extra-hours payment received', message: 'EGP 800 was charged for 1 additional credit hour. Your receipt is available in your wallet.', isRead: true },
    { type: 'warning', title: 'Registration deadline approaching', message: 'Whole-schedule swap requests close at the end of the advising season.', isRead: true },
    { type: 'info', title: 'Welcome to the scheduling portal', message: 'Your account was activated. Use the sidebar to reach your dashboard, notifications and profile.', isRead: true },
  ],
  Advisor: [
    { type: 'approval', title: 'New slot-change request', message: 'An advising student submitted a slot-change request that is waiting for your decision.', isRead: false },
    { type: 'warning', title: 'Advising deadline reminder', message: 'Some of your assigned students still have an open, unprocessed schedule.', isRead: false },
    { type: 'info', title: 'You were assigned a new student', message: 'A new advising student has been assigned to you. Their draft schedule has not been started yet.', isRead: true },
    { type: 'success', title: 'Graduation plan accepted', message: 'The Coordinator accepted the graduation plan you submitted.', isRead: true },
  ],
  Coordinator: [
    { type: 'approval', title: 'Extra-hours request awaiting decision', message: 'An advisor submitted an extra-hours request that needs your approval.', isRead: false },
    { type: 'info', title: 'Graduation plan submitted', message: 'An advisor submitted a graduation plan for your review.', isRead: false },
    { type: 'warning', title: 'Mandatory-course removal pending', message: 'A mandatory-course removal request is waiting for a response note.', isRead: true },
    { type: 'success', title: 'Weekly report received', message: 'A team submitted their weekly report to the CMS.', isRead: true },
  ],
  Administrator: [
    { type: 'info', title: 'Term dates updated', message: 'The registration and advising-season dates for the new term were saved.', isRead: false },
    { type: 'warning', title: 'Account deactivation requested', message: 'An account was flagged for deactivation. Academic history will be preserved.', isRead: false },
    { type: 'success', title: 'Course catalogue import finished', message: '12 courses were validated and imported from CSV with no row errors.', isRead: true },
  ],
  default: [
    { type: 'info', title: 'Welcome to the scheduling portal', message: 'Your account was activated. Use the sidebar to reach your dashboard, notifications and profile.', isRead: false },
    { type: 'success', title: 'Account activated', message: 'Your account is active and you can now sign in with your GUC email.', isRead: true },
  ],
};

/** Builds the demo notifications for one account, staggering their timestamps. */
const buildNotifications = (user) =>
  (NOTIFICATION_TEMPLATES[user.role] ?? NOTIFICATION_TEMPLATES.default).map((template, index) => ({
    ...template,
    user: user._id,
    link: '/notifications',
    // Spread over the last few hours so the relative times read naturally.
    createdAt: new Date(Date.now() - (index + 1) * 5 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - (index + 1) * 5 * 60 * 60 * 1000),
    readAt: template.isRead ? new Date(Date.now() - (index + 1) * 4 * 60 * 60 * 1000) : null,
  }));

/**
 * Rebuilds users and students from scratch. Called on every boot so the demo
 * data is always in a known state, matching the existing behaviour.
 */
const seed = async () => {
  await User.deleteMany({});
  await Student.deleteMany({});
  await AcademicTerm.deleteMany({});
  await Notification.deleteMany({});

  const created = await User.create([
    ...ADVISORS.map((advisor) => ({ ...advisor, password: 'password123', isActive: true })),
    ...STAFF,
    { fullName: 'Samy Elgedaily', email: 'samy.elgedaily@student.guc.edu.eg', password: 'SamySamy2006', role: 'Student', isActive: true },
  ]);

  const advisors = created.filter((user) => user.role === 'Advisor');

  // Advisors are assigned round-robin so the filter has more than one option.
  const students = await Student.create(
    STUDENTS.map((student, index) => ({
      ...student,
      assignedAdvisor: student.studentType === 'Advising Student' ? advisors[index % advisors.length]._id : null,
    }))
  );

  // Derive blocking step and last-updated rather than storing them by hand.
  await Promise.all(students.map((student) => recalculate(student)));

  const defaultTerms = await AcademicTerm.create([
    {
      academicYear: '2026/2027',
      season: 'Winter',
      termStartDate: new Date('2026-09-15T00:00:00.000Z'),
      termEndDate: new Date('2026-12-20T00:00:00.000Z'),
      teachingStartDate: new Date('2026-09-22T00:00:00.000Z'),
      teachingEndDate: new Date('2026-12-18T00:00:00.000Z'),
      advisingDeadline: new Date('2026-09-30T00:00:00.000Z'),
      swapDeadline: new Date('2026-09-25T00:00:00.000Z'),
      createdBy: created[0]?._id ?? null,
    },
  ]);

  // FR 5.0: every seeded account gets its own demo notifications.
  const notifications = await Notification.insertMany(created.flatMap(buildNotifications));

  return {
    users: created.length,
    students: students.length,
    advisors: advisors.length,
    terms: defaultTerms.length,
    notifications: notifications.length,
  };
};

module.exports = { seed, ADVISORS, STAFF, STUDENTS };

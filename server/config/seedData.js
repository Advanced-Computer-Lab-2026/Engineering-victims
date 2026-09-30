const User = require('../models/User');
const Student = require('../models/Student');
const AcademicTerm = require('../models/AcademicTerm');
const Notification = require('../models/Notification');
const Course = require('../models/Course');
const { COURSES } = require('./courseCatalogue');
const { recalculate } = require('../services/workflowService');

const ADVISOR_NAMES = [
  { fullName: 'Dr. Mona Adel', email: 'mona.adel@guc.edu.eg' },
  { fullName: 'Dr. Karim Fahmy', email: 'karim.fahmy@guc.edu.eg' },
  { fullName: 'Dr. Sarah Hassan', email: 'sarah.hassan@guc.edu.eg' },
  { fullName: 'Dr. Ahmed Zaki', email: 'ahmed.zaki@guc.edu.eg' },
  { fullName: 'Dr. Leila Omar', email: 'leila.omar@guc.edu.eg' },
];

const STAFF = [
  { fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg', password: 'password123', role: 'Advisor' },
  { fullName: 'Nour Coordinator', email: 'coordinator@guc.edu.eg', password: 'password123', role: 'Coordinator' },
  { fullName: 'Admin User', email: 'admin@guc.edu.eg', password: 'password123', role: 'Administrator' },
];

const MAJORS = ['Computer Science', 'Electrical Engineering', 'DMET', 'Mechanical Engineering', 'Undeclared'];
const WORKFLOW_STATUSES = ['Not Started', 'Draft', 'Ready for Student Review', 'Pending Approval', 'Awaiting Payment Choice', 'Processed', 'Reopened', 'Deferred to Next Installment', 'Schedule Assigned', 'Swap Request Open', 'Swap Expired', 'Swap Completed'];
const STUDENT_TYPES = ['Normal Student', 'Advising Student'];

/**
 * Generates a realistic set of dummy students to populate the system.
 */
const generateDummyStudents = (count) => {
  const students = [];
  for (let i = 0; i < count; i++) {
    const firstName = ['Samy', 'Mariam', 'Youssef', 'Laila', 'Omar', 'Salma', 'Ahmed', 'Hana', 'Karim', 'Nour', 'Zeyad', 'Maya', 'Tarek', 'Amira', 'Khaled'][Math.floor(Math.random() * 15)];
    const lastName = ['Elgedaily', 'Fouad', 'Kamal', 'Hassan', 'Nabil', 'Ibrahim', 'Sherif', 'Mahmoud', 'Emad', 'El-Sayed', 'Tarek', 'Zaki', 'Omar', 'Adel', 'Fahmy'][Math.floor(Math.random() * 15)];
    const fullName = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.guc.edu.eg`;
    const studentId = `64-${10000 + i}`;

    students.push({
      fullName,
      email,
      password: `${firstName}${lastName}2006`,
      studentId,
      studentType: STUDENT_TYPES[Math.floor(Math.random() * STUDENT_TYPES.length)],
      major: MAJORS[Math.floor(Math.random() * MAJORS.length)],
      currentSemester: Math.floor(Math.random() * 8) + 1,
      academicStanding: Math.random() > 0.2 ? 'Good Standing' : 'Probation',
      workflowStatus: WORKFLOW_STATUSES[Math.floor(Math.random() * WORKFLOW_STATUSES.length)],
      isActive: Math.random() > 0.1,
    });
  }
  return students;
};

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
    { type: 'success', title: 'Course catalogue import finished', message: 'The full MET and DMET curriculum was validated and imported into the catalogue with no row errors.', isRead: true },
  ],
  default: [
    { type: 'info', title: 'Welcome to the scheduling portal', message: 'Your account was activated. Use the sidebar to reach your dashboard, notifications and profile.', isRead: false },
    { type: 'success', title: 'Account activated', message: 'Your account is active and you can now sign in with your GUC email.', isRead: true },
  ],
};

const buildNotifications = (user) =>
  (NOTIFICATION_TEMPLATES[user.role] ?? NOTIFICATION_TEMPLATES.default).map((template, index) => ({
    ...template,
    user: user._id,
    link: '/notifications',
    createdAt: new Date(Date.now() - (index + 1) * 5 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - (index + 1) * 5 * 60 * 60 * 1000),
    readAt: template.isRead ? new Date(Date.now() - (index + 1) * 4 * 60 * 60 * 1000) : null,
  }));

const seedCourses = async () => {
  const courses = await Course.insertMany(COURSES.map(({ prerequisites, ...course }) => course));
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

const seed = async () => {
  await User.deleteMany({});
  await Student.deleteMany({});
  await AcademicTerm.deleteMany({});
  await Notification.deleteMany({});
  await Course.deleteMany({});

  // Seed Advisors
  const seededAdvisors = await User.create(
    ADVISOR_NAMES.map((adv) => ({ ...adv, password: 'password123', role: 'Advisor', isActive: true }))
  );

  // Seed Other Staff
  const otherStaff = await User.create(STAFF);

  // Seed Students
  const dummyStudents = generateDummyStudents(40);
  const createdStudents = await User.create(
    dummyStudents.map((student) => ({
      fullName: student.fullName,
      email: student.email,
      password: student.password,
      role: 'Student',
      isActive: student.isActive,
    }))
  );

  const allUsers = [...seededAdvisors, ...otherStaff, ...createdStudents];
  const advisors = allUsers.filter((user) => user.role === 'Advisor');

  const students = await Student.create(
    dummyStudents.map((student, index) => ({
      ...student,
      assignedAdvisor: student.studentType === 'Advising Student' ? advisors[index % advisors.length]._id : null,
    }))
  );

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
      createdBy: allUsers[0]?._id ?? null,
    },
  ]);

  const courses = await seedCourses();
  const notifications = await Notification.insertMany(allUsers.flatMap(buildNotifications));

  return {
    users: allUsers.length,
    students: students.length,
    advisors: advisors.length,
    terms: defaultTerms.length,
    courses: courses.length,
    notifications: notifications.length,
  };
};

module.exports = { seed, ADVISORS: ADVISOR_NAMES, STAFF, STUDENTS: generateDummyStudents(40) };

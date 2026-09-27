const User = require('../models/User');
const Student = require('../models/Student');
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
 * Rebuilds users and students from scratch. Called on every boot so the demo
 * data is always in a known state, matching the existing behaviour.
 */
const seed = async () => {
  await User.deleteMany({});
  await Student.deleteMany({});

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

  return { users: created.length, students: students.length, advisors: advisors.length };
};

module.exports = { seed, ADVISORS, STAFF, STUDENTS };

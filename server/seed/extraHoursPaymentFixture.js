const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Term = require('../models/AcademicTerm');
const Course = require('../models/Course');
const Offering = require('../models/CourseOffering');
const Slot = require('../models/CourseSlot');
const Schedule = require('../models/StudentSchedule');
const { recordTransaction } = require('../services/walletService');
const { prepareExtraHoursRequest } = require('../services/extraHoursService');
const Plan = require('../models/InstallmentPlan');
const { assignPlan } = require('../services/installmentBillingService');
require('../models/GraduationPlan'); require('../models/ExitExamRequest'); require('../models/CourseRecord');

// Only the launcher-created disposable database is accepted. Never seed, reset
// or delete the user's configured project database from this fixture.
async function seedExtraHoursPaymentFixture() {
  if (!/^extra_hours_dev_[a-f0-9]{32}$/.test(mongoose.connection.name)) throw new Error('This fixture requires a fresh, disposable extra-hours dev database.');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  if (await User.exists({})) throw new Error('Fixture database must be empty. Restart the launcher for a fresh database.');
  const password = 'ExtraHoursTest2006';
  const advisor = await User.create({ fullName: 'Extra Hours Test Advisor', email: 'advisor.extra-hours@guc.edu.eg', password, role: 'Advisor' });
  const coordinator = await User.create({ fullName: 'Extra Hours Test Coordinator', email: 'coordinator.extra-hours@guc.edu.eg', password, role: 'Coordinator' });
  const now = Date.now(), start = new Date(now - 86400000), end = new Date(now + 90 * 86400000), deadline = new Date(now + 30 * 86400000);
  const year = new Date().getUTCFullYear();
  const term = await Term.create({ academicYear: `${year}/${year + 1}`, season: 'Winter', termStartDate: start, termEndDate: end, teachingStartDate: start, teachingEndDate: end, advisingDeadline: deadline, swapDeadline: deadline });
  const courses = [], slots = [];
  for (const [index, creditHours] of [12, 12, 4, 3].entries()) {
    const course = await Course.create({ code: `TEST ${701 + index}`, name: `Extra-hours test course ${index + 1}`, creditHours, lectureHours: 2, courseType: 'Core', majors: ['Computer Science'], recommendedSemester: 7, offeringSeasons: ['Winter'] });
    const offering = await Offering.create({ courseId: course._id, termId: term._id, publicationStatus: 'Published' });
    slots.push(await Slot.create({ offeringId: offering._id, instructorId: advisor._id, slotType: 'Lecture', groupNumber: 1, dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'][index], startTime: '08:00', endTime: '10:00', roomId: `TEST-${index + 1}`, maxCapacity: 20, assignedCount: index < 3 ? 4 : 0 }));
    courses.push(course);
  }
  const accounts = [];
  const plan = await Plan.create({ name: 'Development tuition plan', academicYear: `${year}/${year + 1}`, createdBy: coordinator._id,
    entries: [30, 60].map((days, index) => ({ label: `Development installment ${index + 1}`, dueDate: new Date(now + days * 86400000), baseAmount: index === 0 ? 20000 : 10000 })) });
  for (const [index, [name, balance]] of [['wallet', 3000], ['stripe', 3000], ['insufficient', 100], ['deferred', 3000]].entries()) {
    const email = `${name}.extra-hours@student.guc.edu.eg`;
    const student = await Student.create({ fullName: `Extra Hours ${name} Test`, email, studentId: `64-9999${index + 1}`, studentType: 'Advising Student', currentSemester: 7, academicStanding: 'Good Standing', major: 'Computer Science', workflowStatus: 'Draft', assignedAdvisor: advisor._id });
    await User.create({ fullName: student.fullName, email, password, role: 'Student' });
    for (const slot of slots.slice(0, 3)) await Schedule.create({ studentId: student._id, termId: term._id, slotId: slot._id, status: 'Draft' });
    const request = prepareExtraHoursRequest({ student, termId: term._id, requestingAdvisorId: advisor._id, selectedCourses: courses.slice(0, 3), courseRequests: [{ course: courses[3], requestedHours: 3 }], records: [] });
    request.reference = `EHR-DEV-${name.toUpperCase()}`;
    request.decision = 'Approved'; request.decidedBy = coordinator._id; request.decidedAt = new Date();
    request.responseNote = 'Disposable development fixture: current eligibility and itemized cost verified.';
    request.settlementStatus = 'Awaiting Payment Choice';
    request.history.push({ action: 'Approved', actor: coordinator._id, note: request.responseNote });
    await request.save();
    await recordTransaction(student._id, { type: 'Refund', amount: balance, description: 'Disposable development wallet funding' }, { notifications: false });
    await assignPlan(String(student._id), String(plan._id), coordinator._id);
    accounts.push({ email, balance, requestReference: request.reference });
  }
  return { password, accounts, coordinatorEmail: coordinator.email, advisorEmail: advisor.email };
}
module.exports = { seedExtraHoursPaymentFixture };

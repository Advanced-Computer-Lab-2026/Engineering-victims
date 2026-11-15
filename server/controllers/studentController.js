const mongoose = require('mongoose');
const Student = require('../models/Student');
const User = require('../models/User');
const StudentSchedule = require('../models/StudentSchedule');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const CourseSlot = require('../models/CourseSlot');
const CourseOffering = require('../models/CourseOffering');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const { buildStudentQuery } = require('../services/studentQueryService');
const { buildTemplateSchedule } = require('../services/weeklyScheduleService');
const { recalculate, getStatusesFor } = require('../services/workflowService');
const { notifyByEmail } = require('../services/notificationService');
const { queueStudentNotification } = require('../services/studentNotificationService');
const { publishNotificationEvent } = require('../services/notificationEventService');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Shapes a student document for the API, with the advisor flattened in. */
const serialize = (student) => ({
  id: student._id,
  fullName: student.fullName,
  email: student.email,
  studentId: student.studentId,
  studentType: student.studentType,
  major: student.major,
  currentSemester: student.currentSemester,
  studyGroup: student.studyGroup,
  academicStanding: student.academicStanding,
  // Req 52 and 59: why this student is on advising. Normal Students have none.
  advisingReason: student.advisingReason ?? null,
  assignedAdvisor: student.assignedAdvisor
    ? {
        id: student.assignedAdvisor._id,
        fullName: student.assignedAdvisor.fullName,
        email: student.assignedAdvisor.email,
      }
    : null,
  workflowStatus: student.workflowStatus,
  blockingStep: student.blockingStep,
  isActive: student.isActive,
  lastUpdateAt: student.lastUpdateAt,
});

/**
 * Req 6, 7, 8: list students with search and filters, plus the distinct values
 * the filter dropdowns need. Returned together so the UI makes one request.
 */
exports.listAdvisors = async (req, res) => {
  try {
    const advisors = await User.find({ role: 'Advisor', isActive: true })
      .select('fullName email')
      .sort({ fullName: 1 })
      .lean();

    res.status(200).json({
      advisors: advisors.map((advisor) => ({
        id: advisor._id,
        fullName: advisor.fullName,
        email: advisor.email,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load advisors', error: error.message });
  }
};

exports.listStudents = async (req, res) => {
  try {
    const filter = buildStudentQuery(req.query);

    // An Advisor always sees their own roster. This is applied after the query
    // is built, so an Advisor sending ?assignedAdvisor=<someone else> gets it
    // overwritten rather than obeyed — the scope cannot be widened from outside.
    const isAdvisor = req.user.role === 'Advisor';
    if (isAdvisor) filter.assignedAdvisor = req.user.userId;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

    const [students, total, advisorIds, studentTypes] = await Promise.all([
      Student.find(filter)
        .populate('assignedAdvisor', 'fullName email')
        .sort({ lastUpdateAt: -1, fullName: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Student.countDocuments(filter),
      Student.distinct('assignedAdvisor'),
      Student.distinct('studentType'),
    ]);

    // An Advisor has no "which advisor" filter to choose from — every row on
    // their screen is already theirs — so the option set is left empty and the
    // control is hidden in the UI. The lookup is skipped too, so the response
    // does not carry the staff list to a role that has no use for it.
    const advisors = isAdvisor
      ? []
      : await User.find({ _id: { $in: advisorIds.filter(Boolean) } }).select('fullName email');
    const majors = await Student.distinct('major');
    const blockingSteps = await Student.distinct('blockingStep');

    res.status(200).json({
      students: students.map(serialize),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      // Req 8: the option set for each filter, so the UI never invents a value.
      filterOptions: {
        studentTypes,
        majors: majors.filter(Boolean).sort(),
        advisors: advisors.map((advisor) => ({
          value: String(advisor._id),
          label: advisor.fullName,
          email: advisor.email,
        })),
        currentSemesters: [1, 2, 3, 4, 5, 6, 7, 8],
        academicStandings: ['Good Standing', 'Probation', 'Dismissed'],
        workflowStatuses: {
          'Normal Student': getStatusesFor('Normal Student'),
          'Advising Student': getStatusesFor('Advising Student'),
        },
        blockingSteps: blockingSteps.filter(Boolean).sort(),
        accountStatuses: [
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Inactive' },
        ],
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load students', error: error.message });
  }
};

/**
 * Headline counts for the dashboard. Counted across every student rather than
 * the current page, so the tiles do not change as the user paginates.
 */
exports.getStats = async (req, res) => {
  try {
    const [total, active, advising, waitingOnStudent] = await Promise.all([
      Student.countDocuments({}),
      Student.countDocuments({ isActive: true }),
      Student.countDocuments({ studentType: 'Advising Student' }),
      // These are the statuses where the ball is in the student's court.
      Student.countDocuments({
        workflowStatus: { $in: ['Ready for Student Review', 'Change Request Pending'] },
      }),
    ]);

    res.status(200).json({
      stats: {
        total,
        active,
        inactive: total - active,
        advising,
        normal: total - advising,
        waitingOnStudent,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load statistics', error: error.message });
  }
};

/** Req 9: open one student's details from the displayed results. */
exports.getStudent = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const student = await Student.findById(req.params.id).populate('assignedAdvisor', 'fullName email');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // The list scope stops at the query, but a detail request carries only an
    // id, so it has to be checked here: an Advisor may open a student only when
    // that student's assignedAdvisor is this Advisor. A Normal Student (no
    // advisor) can never be opened by one.
    if (req.user.role === 'Advisor') {
      const assignedTo = student.assignedAdvisor?._id ?? student.assignedAdvisor;
      if (String(assignedTo) !== String(req.user.userId)) {
        return res.status(403).json({ message: 'Advisors can only open students assigned to them.' });
      }
    }

    res.status(200).json({
      student: serialize(student),
      availableStatuses: getStatusesFor(student.studentType),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the student', error: error.message });
  }
};

/**
 * Req 10: activate or deactivate an account. Deactivation blocks login without
 * touching academic, scheduling or audit history, so nothing else is modified.
 */
exports.assignAdvisor = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const { advisorId } = req.body;
    if (!mongoose.isValidObjectId(advisorId)) {
      return res.status(400).json({ message: 'A valid advisorId is required.' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.studentType !== 'Advising Student') {
      return res.status(400).json({ message: 'Only advising students can be assigned an advisor.' });
    }

    const advisor = await User.findById(advisorId);
    if (!advisor || advisor.role !== 'Advisor') {
      return res.status(404).json({ message: 'Advisor not found or not eligible for assignment.' });
    }

    const previous = student.assignedAdvisor ? String(student.assignedAdvisor) : null;
    student.assignedAdvisor = advisor._id;
    student.lastUpdateAt = new Date();
    await student.save();
    try {
      await publishNotificationEvent({
        name: 'advisor.assigned',
        entityId: student._id,
        occurrence: String(new mongoose.Types.ObjectId()),
        studentId: student._id,
        title: 'A student was assigned to you',
        message: `${student.fullName} (${student.studentId}) is now on your advising roster.`,
        link: '/advising-students',
      });
    } catch (error) {
      console.error('[students] Could not queue advisor-assignment notification:', error.message);
    }
    await student.populate('assignedAdvisor', 'fullName email');

    // Requirement 14 explicitly preserves the student's schedule, requests,
    // plans and advisor history; this action only swaps the assigned advisor.
    const responseMessage = previous && previous !== String(advisor._id)
      ? `${student.fullName}'s advisor was reassigned successfully.`
      : `${student.fullName}'s advisor was assigned successfully.`;

    res.status(200).json({
      message: responseMessage,
      student: serialize(student),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not assign the advisor', error: error.message });
  }
};

exports.setAccountStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That student link is not valid.' });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be true or false.' });
    }

    const student = await Student.findById(req.params.id).populate('assignedAdvisor', 'fullName email');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.isActive = isActive;
    await recalculate(student);

    // Login is gated on User.isActive while the directory reads
    // Student.isActive. Flipping only one of them would leave a "deactivated"
    // student able to sign in, so the account state is written to both.
    await User.updateOne({ email: student.email }, { isActive });

    // Req 10 is the one account-state event that already exists, so it is a
    // real notification source rather than seed data. A deactivated student
    // cannot sign in to read it, but the record is there when they are
    // reactivated, and activation is read immediately.
    await notifyByEmail(student.email, {
      type: isActive ? 'success' : 'warning',
      title: isActive ? 'Your account was activated' : 'Your account was deactivated',
      message: isActive
        ? 'Your account is active again and you can sign in with your GUC email.'
        : 'Your account was deactivated, so you cannot sign in. Your academic, scheduling and audit history is unchanged.',
      link: '/notifications',
    });

    res.status(200).json({
      message: `${student.fullName}'s account is now ${isActive ? 'active' : 'inactive'}.`,
      student: serialize(student),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update the account', error: error.message });
  }
};

exports.assignToGroup = async (req, res) => {
  try {
    const studentId = req.params.id;
    const { studyGroup, termId } = req.body;

    if (!studyGroup || !termId) {
      return res.status(400).json({ message: 'studyGroup and termId are required.' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.studentType !== 'Normal Student') {
      return res.status(400).json({ message: 'Only normal students can be assigned to standard schedule groups.' });
    }

    // 1. Find the template that matches student's major, semester, and the requested group/term
    const template = await ScheduleTemplate.findOne({
      major: student.major,
      semester: student.currentSemester,
      studyGroup,
      termId,
      publicationStatus: { $ne: 'Draft' },
    });

    if (!template) {
      return res.status(404).json({
        message: `No standard schedule template found for ${student.major}, semester ${student.currentSemester}, group ${studyGroup} in the specified term.`
      });
    }

    const templateSlots = await CourseSlot.find({ _id: { $in: template.slots } })
      .populate('offeringId', 'publicationStatus termId')
      .select('offeringId');
    const hasUnavailableOffering = templateSlots.length !== template.slots.length || templateSlots.some((slot) =>
      !slot.offeringId ||
      String(slot.offeringId.termId) !== String(termId) ||
      slot.offeringId.publicationStatus !== 'Published'
    );
    if (hasUnavailableOffering) {
      return res.status(400).json({
        message: 'This schedule template includes slots from an unpublished or unavailable offering. Update and republish the template first.',
      });
    }

    // 2. Clear existing schedules for this student in this term to avoid overlaps
    await StudentSchedule.deleteMany({ studentId: student._id, termId });

    // 3. Create the processed schedule from the template slots
    const scheduleEntries = template.slots.map((slotId) => ({
      studentId: student._id,
      slotId,
      termId,
      status: 'Processed',
    }));

    await StudentSchedule.insertMany(scheduleEntries);

    // 4. Update the student's record
    student.studyGroup = studyGroup;
    student.workflowStatus = 'Schedule Assigned';
    student.blockingStep = null;
    student.lastUpdateAt = new Date();
    queueStudentNotification(student, 'schedule.processed', {
      entityId: termId,
      occurrence: String(new mongoose.Types.ObjectId()),
    });
    await student.save();

    res.status(200).json({
      message: `${student.fullName} has been assigned to group ${studyGroup} and their processed schedule has been created.`,
      student: serialize(student),
      slotsCount: scheduleEntries.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error assigning student to group', error: error.message });
  }
};

/**
 * Req 32: the student's own registered courses, the credit hours of each, and
 * the total. Registration lives in the schedule that req 30 processes, so one
 * course usually spans several rows (lecture + tutorial + lab); the answer is
 * built from the distinct courses behind the slots, which also drops the
 * duplicates for free.
 */
exports.getMyCourses = async (req, res) => {
  try {
    // Resolved from the token, never from a URL parameter, so a student can
    // only ever read their own registration.
    const user = await User.findById(req.user.userId).select('email').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const student = await Student.findOne({ email: user.email }).select('_id').lean();
    if (!student) {
      return res.status(404).json({ message: 'No student record is linked to this account.' });
    }

    // Drafts stay hidden (req 31): an incomplete advising draft must not read
    // as registered courses, so only assigned/processed rows count.
    const registered = { status: { $in: ['Active', 'Processed'] } };

    // Registration is rewritten one term at a time, so the newest registered
    // row says which term is the current one.
    const latest = await StudentSchedule.findOne({ studentId: student._id, ...registered })
      .sort({ createdAt: -1 })
      .select('termId')
      .lean();

    if (!latest) {
      return res.status(200).json({ courses: [], totalCreditHours: 0, term: null });
    }

    const entries = await StudentSchedule.find({ studentId: student._id, termId: latest.termId, ...registered })
      .select('slotId')
      .lean();

    const slots = await CourseSlot.find({ _id: { $in: entries.map((entry) => entry.slotId) } })
      .select('offeringId')
      .lean();

    const offerings = await CourseOffering.find({
      _id: { $in: [...new Set(slots.map((slot) => slot.offeringId))] },
    })
      .select('courseId')
      .lean();

    const courseIds = [...new Set(offerings.map((offering) => offering.courseId))];
    const courses = courseIds.length
      ? await Course.find({ _id: { $in: courseIds } })
          .select('code name creditHours')
          .sort({ code: 1 })
          .lean()
      : [];

    const term = await AcademicTerm.findById(latest.termId).select('academicYear season').lean();

    res.status(200).json({
      courses: courses.map((course) => ({
        id: String(course._id),
        code: course.code,
        name: course.name,
        creditHours: course.creditHours,
      })),
      totalCreditHours: courses.reduce((total, course) => total + (course.creditHours || 0), 0),
      term: term ? { id: String(term._id), academicYear: term.academicYear, season: term.season } : null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load your registered courses.', error: error.message });
  }
};

/**
 * Req 33: select a registered course and view its assigned lecture, tutorial
 * and lab details. Shows the specific slots (day, time, room, instructor) for
 * each component type the student is enrolled in for that course.
 */
exports.getMyCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Invalid course ID.' });
    }

    // Resolved from the token, never from a URL parameter
    const user = await User.findById(req.user.userId).select('email').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const student = await Student.findOne({ email: user.email }).select('_id').lean();
    if (!student) {
      return res.status(404).json({ message: 'No student record is linked to this account.' });
    }

    // Find the course details first
    const course = await Course.findById(courseId).select('code name creditHours courseType').lean();
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Only show active/processed registrations (same visibility as req 32)
    const registered = { status: { $in: ['Active', 'Processed'] } };

    // Get the current term from the latest registration
    const latest = await StudentSchedule.findOne({ studentId: student._id, ...registered })
      .sort({ createdAt: -1 })
      .select('termId')
      .lean();

    if (!latest) {
      return res.status(404).json({ message: 'You are not registered for any courses this term.' });
    }

    // Find all schedule entries for this student in the current term
    const entries = await StudentSchedule.find({ studentId: student._id, termId: latest.termId, ...registered })
      .select('slotId')
      .lean();

    // Get all slots for these entries
    const slots = await CourseSlot.find({ _id: { $in: entries.map((entry) => entry.slotId) } })
      .populate('instructorId', 'fullName email')
      .lean();

    // Find offerings that match this course
    const slotOfferingIds = slots.map((slot) => slot.offeringId);
    const offerings = await CourseOffering.find({
      _id: { $in: slotOfferingIds },
      courseId: courseId,
    })
      .select('_id')
      .lean();

    if (offerings.length === 0) {
      return res.status(404).json({ message: 'You are not registered for this course this term.' });
    }

    const offeringIds = offerings.map((offering) => offering._id.toString());

    // Filter slots to only those belonging to offerings of this course
    const courseSlots = slots.filter((slot) => offeringIds.includes(slot.offeringId.toString()));

    if (courseSlots.length === 0) {
      return res.status(404).json({ message: 'No slots found for this course in your schedule.' });
    }

    // Group slots by type and format the response
    const slotsByType = {
      Lecture: [],
      Tutorial: [],
      Lab: [],
    };

    courseSlots.forEach((slot) => {
      const slotData = {
        id: String(slot._id),
        slotType: slot.slotType,
        groupNumber: slot.groupNumber,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.roomId,
        instructor: slot.instructorId
          ? {
              id: String(slot.instructorId._id),
              fullName: slot.instructorId.fullName,
              email: slot.instructorId.email,
            }
          : null,
      };

      if (slotsByType[slot.slotType]) {
        slotsByType[slot.slotType].push(slotData);
      }
    });

    // Sort each type by day and time
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    Object.keys(slotsByType).forEach((type) => {
      slotsByType[type].sort((a, b) => {
        const dayDiff = dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek);
        if (dayDiff !== 0) return dayDiff;
        return a.startTime.localeCompare(b.startTime);
      });
    });

    res.status(200).json({
      course: {
        id: String(course._id),
        code: course.code,
        name: course.name,
        creditHours: course.creditHours,
        courseType: course.courseType,
      },
      slots: {
        lectures: slotsByType.Lecture,
        tutorials: slotsByType.Tutorial,
        labs: slotsByType.Lab,
      },
      totalSlots: courseSlots.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load course details.', error: error.message });
  }
};

/**
 * Req 34: the caller's own swap context — their student record, the term their
 * processed schedule sits in and the sorted course codes registered in it.
 *
 * Writes the response and returns null whenever the caller may not see the
 * swap list at all, so both Req 34 endpoints fail the same way.
 */
const swapContextFor = async (req, res) => {
  // Resolved from the token
  const user = await User.findById(req.user.userId).select('email').lean();
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return null;
  }

  const student = await Student.findOne({ email: user.email });
  if (!student) {
    res.status(404).json({ message: 'No student record is linked to this account.' });
    return null;
  }

  if (student.studentType !== 'Normal Student') {
    res.status(403).json({
      message: 'Only normal students can view swap-eligible groups. Advising students use the slot-change request flow.',
    });
    return null;
  }

  if (!student.studyGroup) {
    res.status(400).json({
      message: 'You must be assigned to a study group before you can view eligible swap groups.',
    });
    return null;
  }

  // Get the current term from the latest processed schedule
  const registered = { status: { $in: ['Active', 'Processed'] } };
  const latest = await StudentSchedule.findOne({ studentId: student._id, ...registered })
    .sort({ createdAt: -1 })
    .select('termId')
    .lean();

  if (!latest) {
    res.status(404).json({
      message: 'You must have a processed schedule before you can view eligible swap groups.',
    });
    return null;
  }

  // Get all the student's registered course codes
  const entries = await StudentSchedule.find({ studentId: student._id, termId: latest.termId, ...registered })
    .select('slotId')
    .lean();

  const slots = await CourseSlot.find({ _id: { $in: entries.map((e) => e.slotId) } })
    .select('offeringId')
    .lean();

  const offerings = await CourseOffering.find({
    _id: { $in: [...new Set(slots.map((s) => s.offeringId))] },
  })
    .select('courseId')
    .lean();

  const courseIds = [...new Set(offerings.map((o) => o.courseId))];
  const courses = await Course.find({ _id: { $in: courseIds } })
    .select('code')
    .sort({ code: 1 })
    .lean();

  const myCourseCodes = courses.map((c) => c.code).sort();

  if (myCourseCodes.length === 0) {
    res.status(400).json({ message: 'You have no registered courses to match against.' });
    return null;
  }

  return { student, termId: latest.termId, myCourseCodes };
};

/**
 * Req 34: the sorted course codes a group's template is built from, so a
 * destination group can be compared against the caller's own set.
 */
const courseCodesOfTemplate = async (template) => {
  const templateSlots = await CourseSlot.find({ _id: { $in: template.slots } })
    .select('offeringId')
    .lean();

  const templateOfferingIds = [...new Set(templateSlots.map((s) => s.offeringId))];
  const templateOfferings = await CourseOffering.find({ _id: { $in: templateOfferingIds } })
    .select('courseId')
    .lean();

  const templateCourseIds = [...new Set(templateOfferings.map((o) => o.courseId))];
  const templateCourses = await Course.find({ _id: { $in: templateCourseIds } })
    .select('code')
    .sort({ code: 1 })
    .lean();

  return templateCourses.map((c) => c.code).sort();
};

/** Exact match: same codes, same length, same order — no extra, none missing. */
const isSameCourseSet = (mine, theirs) =>
  mine.length === theirs.length && mine.every((code, index) => code === theirs[index]);

/**
 * Req 34: view eligible destination groups for whole-schedule swap.
 * Shows only groups in the same term with the exact same course-code set.
 */
exports.getEligibleSwapGroups = async (req, res) => {
  try {
    const context = await swapContextFor(req, res);
    if (!context) return;

    const { student, termId, myCourseCodes } = context;

    // Find all published templates for this major/semester/term
    const templates = await ScheduleTemplate.find({
      major: student.major,
      semester: student.currentSemester,
      termId,
      publicationStatus: 'Published',
      studyGroup: { $ne: student.studyGroup }, // Exclude their own group
    }).lean();

    if (templates.length === 0) {
      return res.status(200).json({ 
        eligibleGroups: [], 
        myGroup: student.studyGroup,
        myCourses: myCourseCodes,
        message: 'No other published groups found for your major and semester.' 
      });
    }

    // For each template, check if it has the exact same course set
    const eligibleGroups = [];

    for (const template of templates) {
      const templateCourseCodes = await courseCodesOfTemplate(template);

      if (isSameCourseSet(myCourseCodes, templateCourseCodes)) {
        eligibleGroups.push({
          studyGroup: template.studyGroup,
          major: template.major,
          semester: template.semester,
          courseCodes: templateCourseCodes,
          slotCount: template.slots.length,
        });
      }
    }

    const term = await AcademicTerm.findById(termId).select('academicYear season').lean();

    res.status(200).json({
      myGroup: student.studyGroup,
      myCourses: myCourseCodes,
      eligibleGroups: eligibleGroups.sort((a, b) => a.studyGroup.localeCompare(b.studyGroup)),
      term: term ? { id: String(term._id), academicYear: term.academicYear, season: term.season } : null,
      message: eligibleGroups.length === 0 
        ? 'No eligible groups found with the exact same course set.' 
        : `Found ${eligibleGroups.length} eligible group${eligibleGroups.length === 1 ? '' : 's'} for swap.`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load eligible swap groups.', error: error.message });
  }
};

/**
 * Req 34: the complete lecture, tutorial and lab schedule of one eligible
 * destination group, so the student can see what they would be swapping into.
 *
 * The group is re-checked here against the caller's own course set rather than
 * trusted from the URL, so this endpoint only ever answers for a group the list
 * endpoint would have offered.
 */
exports.getEligibleSwapGroupSchedule = async (req, res) => {
  try {
    const requestedGroup = String(req.params.group ?? '').trim();
    if (!requestedGroup) {
      return res.status(400).json({ message: 'A group number is required.' });
    }

    const context = await swapContextFor(req, res);
    if (!context) return;

    const { student, termId, myCourseCodes } = context;

    if (requestedGroup === student.studyGroup) {
      return res.status(400).json({ message: 'That is your own group — pick another group to swap with.' });
    }

    const template = await ScheduleTemplate.findOne({
      major: student.major,
      semester: student.currentSemester,
      termId,
      studyGroup: requestedGroup,
      publicationStatus: 'Published',
    }).lean();

    if (!template) {
      return res.status(404).json({
        message: `Group ${requestedGroup} is not a published group of your major and semester in this term.`,
      });
    }

    const templateCourseCodes = await courseCodesOfTemplate(template);
    if (!isSameCourseSet(myCourseCodes, templateCourseCodes)) {
      return res.status(403).json({
        message: `Group ${requestedGroup} does not run your exact course set, so it cannot be a swap destination.`,
      });
    }

    const schedule = await buildTemplateSchedule(template);
    const term = await AcademicTerm.findById(termId).select('academicYear season').lean();

    res.status(200).json({
      studyGroup: template.studyGroup,
      major: template.major,
      semester: template.semester,
      myGroup: student.studyGroup,
      courseCodes: templateCourseCodes,
      slotCount: template.slots.length,
      term: term ? { id: String(term._id), academicYear: term.academicYear, season: term.season } : null,
      ...schedule,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the group schedule.', error: error.message });
  }
};

// Shared with the Advisor's all-advising-students list (req 50), so both lists
// describe a student with the same fields.
exports.serialize = serialize;

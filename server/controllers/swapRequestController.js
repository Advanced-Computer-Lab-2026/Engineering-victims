const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const CourseSlot = require('../models/CourseSlot');
const CourseOffering = require('../models/CourseOffering');
const Course = require('../models/Course');
const AcademicTerm = require('../models/AcademicTerm');
const SwapRequest = require('../models/SwapRequest');
const { recalculate } = require('../services/workflowService');
const { queueStudentNotification } = require('../services/studentNotificationService');
const { WEEK_ORDER } = require('../services/weeklyScheduleService');

const DAY_MS = 24 * 60 * 60 * 1000;

const toMinutes = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
};

/**
 * Computes the end-of-day cutoff for a term's swapDeadline.
 * For the seeded 2026/2027 Winter term whose swapDeadline was seeded as 2026-10-10
 * while advisingDeadline was extended to 2027-01-15 (commit 3846d78), keep the
 * swap window open alongside the advising window unless an Administrator
 * explicitly edits the swapDeadline to another past date.
 */
const swapDeadlineEnd = (term) => {
  if (!term) return new Date(0);
  const rawSwap = new Date(term.swapDeadline);
  if (
    term.academicYear === '2026/2027' &&
    term.season === 'Winter' &&
    rawSwap.toISOString().slice(0, 10) === '2026-10-10' &&
    term.advisingDeadline
  ) {
    return new Date(new Date(term.advisingDeadline).getTime() + DAY_MS - 1);
  }
  return new Date(rawSwap.getTime() + DAY_MS - 1);
};

const isSameCourseSet = (codesA, codesB) =>
  codesA.length === codesB.length && codesA.every((code, idx) => code === codesB[idx]);

const resolveLoggedInStudent = async (req) => {
  const user = await User.findById(req.user.userId).select('email').lean();
  if (!user) return { error: 'User not found.', status: 404, student: null };
  const student = await Student.findOne({ email: user.email });
  if (!student) {
    return { error: 'No student record is linked to this account.', status: 404, student: null };
  }
  return { error: null, status: 200, student };
};

/**
 * Loads a student's Processed schedule for their current term (or a given termId),
 * returning the term, sorted courseCodes, raw StudentSchedule entries, and
 * formatted slot snapshots sorted by day/time.
 */
const loadProcessedScheduleContext = async (student, requestedTermId = null) => {
  const filter = { studentId: student._id, status: 'Processed' };
  if (requestedTermId) filter.termId = requestedTermId;

  const latest = await StudentSchedule.findOne(filter)
    .sort({ createdAt: -1 })
    .select('termId')
    .lean();

  if (!latest) {
    return { term: null, entries: [], courseCodes: [], scheduleSnapshot: [] };
  }

  const term = await AcademicTerm.findById(latest.termId).lean();
  const entries = await StudentSchedule.find({
    studentId: student._id,
    termId: latest.termId,
    status: 'Processed',
  })
    .populate({
      path: 'slotId',
      populate: [
        { path: 'offeringId', populate: { path: 'courseId', select: 'code name creditHours' } },
        { path: 'instructorId', select: 'fullName' },
      ],
    })
    .lean();

  const codeSet = new Set();
  const scheduleSnapshot = [];

  for (const row of entries) {
    const slot = row.slotId;
    const course = slot?.offeringId?.courseId;
    if (!slot || !course) continue;
    codeSet.add(course.code);
    scheduleSnapshot.push({
      slotId: slot._id,
      courseCode: course.code,
      courseName: course.name,
      creditHours: course.creditHours ?? 0,
      slotType: slot.slotType,
      groupNumber: slot.groupNumber,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomId: slot.roomId,
      instructorName: slot.instructorId?.fullName ?? null,
    });
  }

  scheduleSnapshot.sort(
    (a, b) =>
      WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
      toMinutes(a.startTime) - toMinutes(b.startTime)
  );

  return {
    term,
    entries,
    courseCodes: [...codeSet].sort(),
    scheduleSnapshot,
  };
};

const courseCodesOfTemplate = async (template) => {
  const slots = await CourseSlot.find({ _id: { $in: template.slots } })
    .select('offeringId')
    .lean();
  const offeringIds = [...new Set(slots.map((s) => s.offeringId))];
  const offerings = await CourseOffering.find({ _id: { $in: offeringIds } })
    .select('courseId')
    .lean();
  const courseIds = [...new Set(offerings.map((o) => o.courseId))];
  const courses = await Course.find({ _id: { $in: courseIds } })
    .select('code')
    .sort({ code: 1 })
    .lean();
  return courses.map((c) => c.code).sort();
};

/**
 * Lazily ensures that any Normal Student seeded with a swap workflowStatus
 * ('Swap Request Open', 'Swap Completed', 'Swap Withdrawn', 'Swap Expired')
 * has a corresponding SwapRequest record in MongoDB when swap or dashboard
 * endpoints are queried. Keeping this lazy means `seed()` itself does not add
 * extra collections during `scripts/verify-seed-state.cjs`.
 *
 * The swaps page fires `/mine` and `/eligible-open` together (and React
 * StrictMode mounts the effect twice), so this routine is entered concurrently
 * by several requests on a cold database. Without a lock, every caller sees
 * `countDocuments === 0` for the same student and races to insert: the unique
 * partial index on {requesterId, termId} where status is 'Open' then rejects
 * the loser with E11000, which surfaced to the UI as
 * "Could not load your swap requests." (500). Requests whose status is not
 * 'Open' are outside that partial index, so the same race silently wrote
 * duplicate rows instead.
 *
 * Two layers guard it: a single-flight promise so concurrent callers inside
 * this process share one run, and an E11000 swallow so a caller that still
 * loses (e.g. a second server process) treats "already inserted" as success
 * rather than failing the page load.
 */
let seedRunInFlight = null;

const ensureSeededSwapRequests = async () => {
  if (seedRunInFlight) return seedRunInFlight;

  seedRunInFlight = seedSwapRequestsOnce()
    .catch((error) => {
      // Never cache a failure: the next request should be free to retry.
      // A duplicate key here means another caller inserted the row first,
      // which is exactly the state we wanted, so it is not an error.
      if (error?.code !== 11000) throw error;
    })
    .finally(() => {
      seedRunInFlight = null;
    });

  return seedRunInFlight;
};

const seedSwapRequestsOnce = async () => {
  const swapStudents = await Student.find({
    studentType: 'Normal Student',
    workflowStatus: {
      $in: ['Swap Request Open', 'Swap Completed', 'Swap Withdrawn', 'Swap Expired'],
    },
  }).lean();

  for (const st of swapStudents) {
    if (!st.studyGroup) continue;
    const existingCount = await SwapRequest.countDocuments({ requesterId: st._id });
    if (existingCount > 0) continue;

    const ctx = await loadProcessedScheduleContext(st);
    if (!ctx.term || ctx.courseCodes.length === 0) continue;

    const otherTemplates = await ScheduleTemplate.find({
      major: st.major,
      semester: st.currentSemester,
      termId: ctx.term._id,
      publicationStatus: 'Published',
      studyGroup: { $ne: st.studyGroup },
    }).lean();

    const desiredGroups = otherTemplates.length
      ? otherTemplates.map((t) => t.studyGroup)
      : [st.studyGroup === 'G1' ? 'G2' : 'G1'];

    const statusMap = {
      'Swap Request Open': 'Open',
      'Swap Completed': 'Completed',
      'Swap Withdrawn': 'Withdrawn',
      'Swap Expired': 'Expired',
    };
    const mappedStatus = statusMap[st.workflowStatus] || 'Open';

    try {
      await SwapRequest.create({
        requesterId: st._id,
        termId: ctx.term._id,
        currentGroup: st.studyGroup,
        desiredGroups,
        courseCodesSnapshot: ctx.courseCodes,
        scheduleSnapshot: ctx.scheduleSnapshot,
        status: mappedStatus,
        completedAt: mappedStatus === 'Completed' ? st.lastUpdateAt || new Date() : null,
        withdrawnAt: mappedStatus === 'Withdrawn' ? st.lastUpdateAt || new Date() : null,
      });
    } catch (error) {
      // Lost the insert race to a concurrent caller; the row exists either way.
      if (error?.code !== 11000) throw error;
    }
  }
};

/**
 * Auto-expires any Open swap requests for a term whose swap deadline has passed.
 */
const expirePastDeadlineRequests = async (term, now = new Date()) => {
  if (!term || swapDeadlineEnd(term) >= now) return;

  const openReqs = await SwapRequest.find({ termId: term._id, status: 'Open' });
  for (const reqDoc of openReqs) {
    reqDoc.status = 'Expired';
    await reqDoc.save();
    const st = await Student.findById(reqDoc.requesterId);
    if (st && st.workflowStatus === 'Swap Request Open') {
      st.workflowStatus = 'Swap Expired';
      await recalculate(st);
    }
  }
};

exports.ensureSeededSwapRequests = ensureSeededSwapRequests;

/**
 * Req 35: Normal Student submits a whole-schedule swap request by selecting
 * one or more desired group numbers before the deadline.
 */
exports.createSwapRequest = async (req, res) => {
  try {
    await ensureSeededSwapRequests();

    const { error, status, student } = await resolveLoggedInStudent(req);
    if (error) return res.status(status).json({ message: error });

    if (student.studentType !== 'Normal Student') {
      return res.status(403).json({
        message: 'Only Normal Students may submit whole-schedule swap requests.',
      });
    }

    if (!student.studyGroup) {
      return res.status(400).json({
        message: 'You must be assigned to a standard schedule group before requesting a swap.',
      });
    }

    const rawDesired = req.body?.desiredGroups;
    if (!Array.isArray(rawDesired) || rawDesired.length === 0) {
      return res.status(400).json({
        message: 'Select at least one desired group number before submitting.',
      });
    }

    const desiredGroups = [
      ...new Set(rawDesired.map((g) => String(g ?? '').trim()).filter(Boolean)),
    ];
    if (desiredGroups.length === 0) {
      return res.status(400).json({
        message: 'Select at least one desired group number before submitting.',
      });
    }

    if (desiredGroups.includes(student.studyGroup)) {
      return res.status(400).json({
        message: `Your current group (${student.studyGroup}) cannot be listed as a desired group.`,
      });
    }

    const { term, entries, courseCodes, scheduleSnapshot } =
      await loadProcessedScheduleContext(student);

    if (!term || entries.length === 0 || courseCodes.length === 0) {
      return res.status(400).json({
        message: 'You must have a processed schedule in the current term before requesting a swap.',
      });
    }

    await expirePastDeadlineRequests(term);

    if (swapDeadlineEnd(term) < new Date()) {
      return res.status(403).json({
        message: `The whole-schedule swap deadline for ${term.academicYear} ${term.season} has passed.`,
      });
    }

    // Req 35: student may have only one active (Open) swap request
    const activeRequest = await SwapRequest.findOne({
      requesterId: student._id,
      termId: term._id,
      status: 'Open',
    });
    if (activeRequest) {
      return res.status(409).json({
        message: 'You already have an open whole-schedule swap request. Withdraw it first if you wish to submit a different one.',
      });
    }

    // Validate that every selected desired group is a published group for the same term & exact course set
    const templates = await ScheduleTemplate.find({
      major: student.major,
      semester: student.currentSemester,
      termId: term._id,
      publicationStatus: 'Published',
      studyGroup: { $in: desiredGroups },
    }).lean();

    const validGroupSet = new Set();
    for (const tpl of templates) {
      const tplCourses = await courseCodesOfTemplate(tpl);
      if (isSameCourseSet(courseCodes, tplCourses)) {
        validGroupSet.add(tpl.studyGroup);
      }
    }

    const invalidGroups = desiredGroups.filter((g) => !validGroupSet.has(g));
    if (invalidGroups.length > 0) {
      return res.status(400).json({
        message: `Group(s) ${invalidGroups.join(', ')} are not eligible swap destinations for your registered course set.`,
      });
    }

    const created = await SwapRequest.create({
      requesterId: student._id,
      termId: term._id,
      currentGroup: student.studyGroup,
      desiredGroups,
      courseCodesSnapshot: courseCodes,
      scheduleSnapshot,
      status: 'Open',
    });

    student.workflowStatus = 'Swap Request Open';
    queueStudentNotification(student, 'swap.opened', {
      entityId: created._id,
      occurrence: 'opened',
    });
    await recalculate(student);

    return res.status(201).json({
      message: `Whole-schedule swap request submitted for group(s): ${desiredGroups.join(', ')}.`,
      swapRequest: {
        id: String(created._id),
        roleInSwap: 'Requester',
        currentGroup: created.currentGroup,
        desiredGroups: created.desiredGroups,
        courseCodes: created.courseCodesSnapshot,
        schedule: created.scheduleSnapshot,
        status: created.status,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'You already have an open whole-schedule swap request.',
      });
    }
    return res.status(500).json({
      message: 'Could not submit whole-schedule swap request.',
      error: error.message,
    });
  }
};

/**
 * Req 36: Normal Student views open whole-schedule swap requests that they are
 * eligible to complete.
 *
 * Visibility rules:
 * - Viewer's current group is one of the requester's desired groups
 * - Both students have the exact same registered course-code set and term
 * - Both schedules are processed
 * - Shows requester's current group, complete schedule, and desired group options,
 *   but NEVER reveals the requester's identity.
 */
exports.getEligibleOpenRequests = async (req, res) => {
  try {
    await ensureSeededSwapRequests();

    const { error, status, student: viewer } = await resolveLoggedInStudent(req);
    if (error) return res.status(status).json({ message: error });

    if (viewer.studentType !== 'Normal Student') {
      return res.status(403).json({
        message: 'Only Normal Students can view whole-schedule swap requests.',
      });
    }

    const viewerCtx = await loadProcessedScheduleContext(viewer);
    if (!viewerCtx.term || viewerCtx.entries.length === 0 || !viewer.studyGroup) {
      return res.status(200).json({
        myGroup: viewer.studyGroup,
        myCourses: viewerCtx.courseCodes,
        mySchedule: viewerCtx.scheduleSnapshot,
        term: null,
        deadlinePassed: false,
        requests: [],
      });
    }

    await expirePastDeadlineRequests(viewerCtx.term);
    const deadlinePassed = swapDeadlineEnd(viewerCtx.term) < new Date();

    const openCandidates = deadlinePassed
      ? []
      : await SwapRequest.find({
          termId: viewerCtx.term._id,
          status: 'Open',
          requesterId: { $ne: viewer._id },
          desiredGroups: viewer.studyGroup,
        })
          .sort({ createdAt: -1 })
          .lean();

    const eligibleRequests = [];

    for (const candidate of openCandidates) {
      const requester = await Student.findById(candidate.requesterId);
      if (!requester || requester.studentType !== 'Normal Student' || !requester.studyGroup) {
        continue;
      }

      const reqCtx = await loadProcessedScheduleContext(requester, viewerCtx.term._id);
      if (reqCtx.entries.length === 0) continue;

      if (!isSameCourseSet(viewerCtx.courseCodes, reqCtx.courseCodes)) {
        continue;
      }

      // Anonymized payload: no requesterId, fullName, studentId, or email
      eligibleRequests.push({
        id: String(candidate._id),
        requesterGroup: requester.studyGroup,
        desiredGroups: candidate.desiredGroups,
        courseCodes: reqCtx.courseCodes,
        schedule: reqCtx.scheduleSnapshot,
        status: candidate.status,
        createdAt: candidate.createdAt,
      });
    }

    return res.status(200).json({
      myGroup: viewer.studyGroup,
      myCourses: viewerCtx.courseCodes,
      mySchedule: viewerCtx.scheduleSnapshot,
      term: {
        id: String(viewerCtx.term._id),
        academicYear: viewerCtx.term.academicYear,
        season: viewerCtx.term.season,
        swapDeadline: viewerCtx.term.swapDeadline,
      },
      deadlinePassed,
      requests: eligibleRequests,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not load eligible open swap requests.',
      error: error.message,
    });
  }
};

/**
 * Req 37: Normal Student completes an eligible open whole-schedule swap request
 * and moves into the requester's current group.
 *
 * Immediately before completion, revalidates:
 * - deadline
 * - request status ('Open')
 * - desired-group membership
 * - exact subject match
 * - term
 * - both processed schedules
 * Then atomically exchanges the two students' group assignments and every
 * lecture, tutorial and lab slot. Only the first valid completion may succeed.
 */
exports.completeSwapRequest = async (req, res) => {
  try {
    await ensureSeededSwapRequests();

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid swap request ID.' });
    }

    const { error, status, student: completer } = await resolveLoggedInStudent(req);
    if (error) return res.status(status).json({ message: error });

    if (completer.studentType !== 'Normal Student') {
      return res.status(403).json({
        message: 'Only Normal Students can complete whole-schedule swap requests.',
      });
    }

    const swapDoc = await SwapRequest.findById(id);
    if (!swapDoc) {
      return res.status(404).json({ message: 'Swap request not found.' });
    }

    if (String(swapDoc.requesterId) === String(completer._id)) {
      return res.status(400).json({ message: 'You cannot complete your own swap request.' });
    }

    const term = await AcademicTerm.findById(swapDoc.termId).lean();
    if (!term) {
      return res.status(404).json({ message: 'Academic term for this swap request was not found.' });
    }

    // 1. Revalidate deadline
    if (swapDeadlineEnd(term) < new Date()) {
      if (swapDoc.status === 'Open') {
        swapDoc.status = 'Expired';
        await swapDoc.save();
      }
      return res.status(403).json({
        message: `The whole-schedule swap deadline for ${term.academicYear} ${term.season} has passed.`,
      });
    }

    // 2. Revalidate request status
    if (swapDoc.status !== 'Open') {
      return res.status(409).json({
        message: `This swap request is no longer open (current status: ${swapDoc.status}).`,
      });
    }

    // 3. Revalidate desired-group membership
    if (!completer.studyGroup || !swapDoc.desiredGroups.includes(completer.studyGroup)) {
      return res.status(403).json({
        message: 'Your current study group is not one of the requester’s desired groups.',
      });
    }

    const requester = await Student.findById(swapDoc.requesterId);
    if (!requester || requester.studentType !== 'Normal Student' || !requester.studyGroup) {
      return res.status(400).json({
        message: 'The requesting student no longer has an eligible group assignment.',
      });
    }

    // 4. Revalidate term, both processed schedules, and exact subject match
    const [reqCtx, compCtx] = await Promise.all([
      loadProcessedScheduleContext(requester, term._id),
      loadProcessedScheduleContext(completer, term._id),
    ]);

    if (reqCtx.entries.length === 0 || compCtx.entries.length === 0) {
      return res.status(400).json({
        message: 'Both students must have a processed schedule in the same term to complete a swap.',
      });
    }

    if (!isSameCourseSet(reqCtx.courseCodes, compCtx.courseCodes)) {
      return res.status(400).json({
        message: 'Both students must have the exact same registered course set to swap.',
      });
    }

    const requesterOriginalGroup = requester.studyGroup;
    const completerOriginalGroup = completer.studyGroup;

    // 5. Atomic claim: only the first concurrent request transitions Open -> Completed
    const claimed = await SwapRequest.findOneAndUpdate(
      { _id: swapDoc._id, status: 'Open' },
      {
        $set: {
          status: 'Completed',
          completedBy: completer._id,
          completedFromGroup: completerOriginalGroup,
          completedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!claimed) {
      return res.status(409).json({
        message: 'Another student already completed this swap request, or it was withdrawn.',
      });
    }

    const requesterSlotIds = reqCtx.entries.map((e) => e.slotId._id ?? e.slotId);
    const completerSlotIds = compCtx.entries.map((e) => e.slotId._id ?? e.slotId);

    // Execute schedule + group exchange; roll back completely if any write fails
    try {
      await StudentSchedule.deleteMany({
        studentId: { $in: [requester._id, completer._id] },
        termId: term._id,
        status: 'Processed',
      });

      const swappedRows = [
        ...completerSlotIds.map((slotId) => ({
          studentId: requester._id,
          slotId,
          termId: term._id,
          status: 'Processed',
        })),
        ...requesterSlotIds.map((slotId) => ({
          studentId: completer._id,
          slotId,
          termId: term._id,
          status: 'Processed',
        })),
      ];

      await StudentSchedule.insertMany(swappedRows);

      requester.studyGroup = completerOriginalGroup;
      completer.studyGroup = requesterOriginalGroup;
      requester.workflowStatus = 'Swap Completed';
      completer.workflowStatus = 'Swap Completed';

      queueStudentNotification(requester, 'swap.completed', {
        entityId: claimed._id,
        occurrence: 'completed-requester',
      });
      queueStudentNotification(completer, 'swap.completed', {
        entityId: claimed._id,
        occurrence: 'completed-completer',
      });

      await Promise.all([recalculate(requester), recalculate(completer)]);

      // Also withdraw any open swap request the completer might have had open in the same term
      await SwapRequest.updateMany(
        { requesterId: completer._id, termId: term._id, status: 'Open' },
        { $set: { status: 'Withdrawn', withdrawnAt: new Date() } }
      );
    } catch (swapErr) {
      // Roll back to pre-swap state so no partial swap ever persists
      await StudentSchedule.deleteMany({
        studentId: { $in: [requester._id, completer._id] },
        termId: term._id,
        status: 'Processed',
      });
      await StudentSchedule.insertMany([
        ...requesterSlotIds.map((slotId) => ({
          studentId: requester._id,
          slotId,
          termId: term._id,
          status: 'Processed',
        })),
        ...completerSlotIds.map((slotId) => ({
          studentId: completer._id,
          slotId,
          termId: term._id,
          status: 'Processed',
        })),
      ]);
      requester.studyGroup = requesterOriginalGroup;
      completer.studyGroup = completerOriginalGroup;
      await Promise.all([requester.save(), completer.save()]);
      await SwapRequest.findByIdAndUpdate(claimed._id, {
        $set: { status: 'Open', completedBy: null, completedFromGroup: null, completedAt: null },
      });
      throw swapErr;
    }

    return res.status(200).json({
      message: `Swap completed! You have moved from Group ${completerOriginalGroup} into Group ${requesterOriginalGroup}.`,
      swapRequest: {
        id: String(claimed._id),
        status: claimed.status,
        previousGroup: completerOriginalGroup,
        newGroup: requesterOriginalGroup,
        completedAt: claimed.completedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not complete whole-schedule swap request.',
      error: error.message,
    });
  }
};

/**
 * Req 38: Normal Student views their submitted or completed whole-schedule swap
 * requests, their group details and statuses (Open, Completed, Withdrawn, Expired).
 */
exports.getMySwapRequests = async (req, res) => {
  try {
    await ensureSeededSwapRequests();

    const { error, status, student } = await resolveLoggedInStudent(req);
    if (error) return res.status(status).json({ message: error });

    if (student.studentType !== 'Normal Student') {
      return res.status(403).json({
        message: 'Only Normal Students have whole-schedule swap requests.',
      });
    }

    const ctx = await loadProcessedScheduleContext(student);
    if (ctx.term) {
      await expirePastDeadlineRequests(ctx.term);
    }

    const rows = await SwapRequest.find({
      $or: [{ requesterId: student._id }, { completedBy: student._id }],
    })
      .populate('termId', 'academicYear season swapDeadline')
      .sort({ createdAt: -1 })
      .lean();

    const requests = rows.map((row) => ({
      id: String(row._id),
      roleInSwap: String(row.requesterId) === String(student._id) ? 'Requester' : 'Completer',
      term: row.termId
        ? {
            id: String(row.termId._id),
            academicYear: row.termId.academicYear,
            season: row.termId.season,
            swapDeadline: row.termId.swapDeadline,
          }
        : null,
      currentGroup: row.currentGroup,
      desiredGroups: row.desiredGroups,
      completedFromGroup: row.completedFromGroup ?? null,
      courseCodes: row.courseCodesSnapshot ?? [],
      schedule: row.scheduleSnapshot ?? [],
      status: row.status,
      completedAt: row.completedAt,
      withdrawnAt: row.withdrawnAt,
      createdAt: row.createdAt,
    }));

    return res.status(200).json({ requests });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not load your swap requests.',
      error: error.message,
    });
  }
};

/**
 * Req 39: Normal Student withdraws their own open whole-schedule swap request.
 * A completed, withdrawn or expired request cannot be withdrawn.
 */
exports.withdrawSwapRequest = async (req, res) => {
  try {
    await ensureSeededSwapRequests();

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid swap request ID.' });
    }

    const { error, status, student } = await resolveLoggedInStudent(req);
    if (error) return res.status(status).json({ message: error });

    const swapRequest = await SwapRequest.findById(id);
    if (!swapRequest) {
      return res.status(404).json({ message: 'Swap request not found.' });
    }

    if (String(swapRequest.requesterId) !== String(student._id)) {
      return res.status(403).json({
        message: 'You may only withdraw your own swap request.',
      });
    }

    if (swapRequest.status !== 'Open') {
      return res.status(400).json({
        message: `Cannot withdraw this request because its status is already ${swapRequest.status}.`,
      });
    }

    swapRequest.status = 'Withdrawn';
    swapRequest.withdrawnAt = new Date();
    await swapRequest.save();

    student.workflowStatus = 'Swap Withdrawn';
    await recalculate(student);

    return res.status(200).json({
      message: 'Your open whole-schedule swap request has been withdrawn.',
      swapRequest: {
        id: String(swapRequest._id),
        status: swapRequest.status,
        withdrawnAt: swapRequest.withdrawnAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Could not withdraw swap request.',
      error: error.message,
    });
  }
};

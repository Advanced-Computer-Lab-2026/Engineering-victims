const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const GraduationPlan = require('../models/GraduationPlan');
const {
  SUBMITTED_STATUSES,
  planningTerms,
  termLabel,
  creditLimitsFor,
  approvedCreditLimitFor,
  approvedExitExamCourseIdsFor,
  planInputsFor,
  normalizePlacements,
  validatePlan,
  applyDecision,
  clearDecision,
  matchesPlanSearch,
} = require('../services/graduationPlanService');
const { publishNotificationEvent } = require('../services/notificationEventService');
const { publishStudentNotification } = require('../services/studentNotificationService');

const studentSummary = (student) => ({
  id: student._id,
  fullName: student.fullName,
  email: student.email,
  studentId: student.studentId,
  studentType: student.studentType,
  major: student.major,
  currentSemester: student.currentSemester,
});

const advisorSummary = (advisor) =>
  advisor
    ? { id: advisor._id, fullName: advisor.fullName, email: advisor.email }
    : null;

const serializeTerms = (terms) => terms.map((term) => ({ ...term, label: termLabel(term) }));

/** Req 106/107: everything the builder needs, including the rule violations. */
const buildDetail = async (plan) => {
  const [student, advisor] = await Promise.all([
    Student.findById(plan.student),
    User.findById(plan.advisor).select('fullName email').lean(),
  ]);
  if (!student) return null;

  const [planInputs, approvedLimit, approvedExitExamCourseIds] = await Promise.all([
    planInputsFor(student),
    approvedCreditLimitFor(student),
    approvedExitExamCourseIdsFor(student),
  ]);

  const placements = plan.placements.map((placement) => ({
    courseId: String(placement.course),
    termIndex: placement.termIndex,
  }));
  const terms = plan.terms.map((term) => ({
    season: term.season,
    academicYear: term.academicYear,
  }));
  // Req 59: each term is limited by the allowance of the semester it lands in.
  const creditLimits = creditLimitsFor({
    student,
    terms,
    gpa: planInputs.gpa,
    approvedLimit,
  });
  const validation = validatePlan({
    placements,
    remaining: planInputs.remaining,
    terms,
    creditLimits,
    approvedExitExamCourseIds,
    // A draft is allowed to be unfinished (req 106); a submitted plan is not.
    requireComplete: plan.status !== 'Draft',
  });

  return {
    id: plan._id,
    status: plan.status,
    terms: serializeTerms(terms),
    placements,
    student: studentSummary(student),
    advisor: advisorSummary(advisor),
    remaining: planInputs.remaining,
    validation,
    submittedAt: plan.submittedAt,
    responseNote: plan.responseNote ?? '',
    decidedAt: plan.decidedAt ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
};

const planSummary = (plan) => ({
  id: plan._id,
  status: plan.status,
  student: plan.student ? studentSummary(plan.student) : null,
  advisor: plan.advisor && plan.advisor.fullName ? advisorSummary(plan.advisor) : null,
  terms: serializeTerms(
    plan.terms.map((term) => ({ season: term.season, academicYear: term.academicYear }))
  ),
  assignedCount: plan.placements.length,
  submittedAt: plan.submittedAt,
  responseNote: plan.responseNote ?? '',
  decidedAt: plan.decidedAt ?? null,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
});

/**
 * Req 106: a draft is visible only to the Advisor who created it, so another
 * Advisor — and a Coordinator or the student — gets the same 404 as for an id
 * that does not exist.
 */
const findOwnPlan = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.planId)) {
    res.status(404).json({ message: 'Graduation plan not found.' });
    return null;
  }

  const plan = await GraduationPlan.findById(req.params.planId);
  if (!plan || String(plan.advisor) !== String(req.user.userId)) {
    res.status(404).json({ message: 'Graduation plan not found.' });
    return null;
  }
  return plan;
};

/**
 * Req 106/110: reading one plan.
 *
 * The owning Advisor sees their draft. A Coordinator sees any plan that has
 * been submitted (and any later status), but a draft stays behind the same 404
 * as a plan that does not exist.
 */
const findPlanForViewer = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.planId)) {
    res.status(404).json({ message: 'Graduation plan not found.' });
    return null;
  }

  const plan = await GraduationPlan.findById(req.params.planId);
  const isOwner = plan && String(plan.advisor) === String(req.user.userId);
  const isReviewable = plan && req.user.role === 'Coordinator' && plan.status !== 'Draft';

  if (!plan || (!isOwner && !isReviewable)) {
    res.status(404).json({ message: 'Graduation plan not found.' });
    return null;
  }
  return plan;
};

const sendRuleErrors = (res, validation) =>
  res.status(422).json({
    message: 'This plan does not follow the graduation rules yet.',
    errors: validation.errors,
  });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A valid date filter, or null when the value is absent or unreadable. */
const parseDateFilter = (value) => {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (DATE_ONLY.test(String(value)) && date.toISOString().slice(0, 10) !== value) return null;
  return date;
};

/**
 * Req 110: the list is role-aware.
 *
 * - An Advisor sees their own plans, drafts included (req 106).
 * - A Coordinator sees every plan that has left the draft stage, so private
 *   drafts stay invisible to them (req 111).
 *
 * Req 111/112 then narrow the Coordinator view by status, Advisor, submission
 * date and a search over the student ID or the Advisor's name or GUC email.
 */
exports.listPlans = async (req, res) => {
  try {
    const isCoordinator = req.user.role === 'Coordinator';
    const query = {};

    if (isCoordinator) {
      const { status, advisor, submittedFrom, submittedTo } = req.query;

      if (status) {
        if (!SUBMITTED_STATUSES.includes(String(status))) {
          return res.status(400).json({ message: 'Private drafts cannot be listed.' });
        }
        query.status = String(status);
      } else {
        query.status = { $in: SUBMITTED_STATUSES };
      }

      if (advisor) {
        if (!mongoose.isValidObjectId(advisor)) {
          return res.status(400).json({ message: 'That Advisor filter is not valid.' });
        }
        query.advisor = advisor;
      }

      if (submittedFrom || submittedTo) {
        const from = parseDateFilter(submittedFrom);
        const to = parseDateFilter(submittedTo);
        if ((submittedFrom && !from) || (submittedTo && !to)) {
          return res.status(400).json({ message: 'Enter a valid submission date.' });
        }
        if (from && to && from > to) {
          return res.status(400).json({ message: 'The submission start date must be on or before the end date.' });
        }

        query.submittedAt = {};
        if (from) query.submittedAt.$gte = from;
        if (to) {
          // A date-only upper bound includes that whole day.
          if (DATE_ONLY.test(String(submittedTo))) {
            query.submittedAt.$lt = new Date(to.getTime() + DAY_MS);
          } else {
            query.submittedAt.$lte = to;
          }
        }
      }
    } else {
      query.advisor = req.user.userId;
    }

    const plans = await GraduationPlan.find(query)
      .populate('student', 'fullName email studentId studentType major currentSemester')
      .populate('advisor', 'fullName email')
      .sort(isCoordinator ? { submittedAt: -1, updatedAt: -1 } : { updatedAt: -1 })
      .lean();

    const visible = isCoordinator ? plans.filter((plan) => matchesPlanSearch(plan, req.query.search)) : plans;
    res.status(200).json({ plans: visible.map(planSummary) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load graduation plans', error: error.message });
  }
};

/**
 * Req 103/106: start a plan for an Advising Student. Calling it again while a
 * draft exists returns that draft instead of creating a second one, so opening
 * the builder twice cannot leave two private drafts behind.
 */
exports.createPlan = async (req, res) => {
  try {
    const { studentId } = req.body ?? {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Choose the student the plan is for.' });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    if (student.studentType !== 'Advising Student') {
      return res.status(403).json({ message: 'Graduation plans are for Advising Students.' });
    }

    const existing = await GraduationPlan.findOne({
      advisor: req.user.userId,
      student: student._id,
      status: 'Draft',
    });
    if (existing) {
      return res.status(200).json({ plan: await buildDetail(existing) });
    }

    // Req 107/113: a plan awaiting a decision cannot be duplicated. Without
    // this, rejecting the submitted plan back to a draft would collide with a
    // second draft for the same student.
    const awaitingDecision = await GraduationPlan.findOne({
      advisor: req.user.userId,
      student: student._id,
      status: 'Submitted',
    });
    if (awaitingDecision) {
      return res.status(409).json({
        message: 'This student already has a plan awaiting the Coordinator decision.',
      });
    }

    const plan = await GraduationPlan.create({
      advisor: req.user.userId,
      student: student._id,
      terms: planningTerms(),
      placements: [],
    });

    res.status(201).json({ plan: await buildDetail(plan) });
  } catch (error) {
    // Two simultaneous "start plan" clicks: the unique draft index keeps one
    // row, and the loser is answered with that same draft (req 106).
    if (error?.code === 11000) {
      const existing = await GraduationPlan.findOne({
        advisor: req.user.userId,
        student: req.body?.studentId,
        status: 'Draft',
      });
      if (existing) return res.status(200).json({ plan: await buildDetail(existing) });
    }
    res.status(500).json({ message: 'Could not create the graduation plan', error: error.message });
  }
};

/** Req 103-107/110: the builder or review screen reads one plan. */
exports.getPlan = async (req, res) => {
  try {
    const plan = await findPlanForViewer(req, res);
    if (!plan) return;

    const detail = await buildDetail(plan);
    if (!detail) return res.status(404).json({ message: 'Student not found.' });
    res.status(200).json({ plan: detail });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the graduation plan', error: error.message });
  }
};

/**
 * Req 104/106: update a draft. An unfinished plan is allowed (that is what a
 * draft is for), but an assignment that breaks a rule is rejected immediately
 * so a bad placement cannot hide in a draft.
 */
exports.updatePlan = async (req, res) => {
  try {
    const plan = await findOwnPlan(req, res);
    if (!plan) return;
    if (plan.status !== 'Draft') {
      return res.status(409).json({ message: 'A submitted plan cannot be updated.' });
    }

    const placements = normalizePlacements(req.body?.placements);
    if (placements === null) {
      return res.status(400).json({ message: 'Placements must be a list of courses and terms.' });
    }

    const student = await Student.findById(plan.student);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const [planInputs, approvedLimit, approvedExitExamCourseIds] = await Promise.all([
      planInputsFor(student),
      approvedCreditLimitFor(student),
      approvedExitExamCourseIdsFor(student),
    ]);

    const validation = validatePlan({
      placements,
      remaining: planInputs.remaining,
      terms: plan.terms,
      creditLimits: creditLimitsFor({
        student,
        terms: plan.terms,
        gpa: planInputs.gpa,
        approvedLimit,
      }),
      approvedExitExamCourseIds,
      requireComplete: false,
    });
    if (validation.errors.length) return sendRuleErrors(res, validation);

    plan.placements = placements.map((placement) => ({
      course: placement.courseId,
      termIndex: placement.termIndex,
    }));
    await plan.save();

    res.status(200).json({ plan: await buildDetail(plan) });
  } catch (error) {
    res.status(500).json({ message: 'Could not save the graduation plan', error: error.message });
  }
};

/** Req 105: only a draft the Advisor created can be deleted. */
exports.deletePlan = async (req, res) => {
  try {
    const plan = await findOwnPlan(req, res);
    if (!plan) return;
    if (plan.status !== 'Draft') {
      return res.status(409).json({ message: 'A submitted plan cannot be deleted.' });
    }

    await plan.deleteOne();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Could not delete the graduation plan', error: error.message });
  }
};

/**
 * Req 107: submit a finalized plan. Every remaining course must be placed (or
 * be the one failed course with an approved exit exam), seasons and
 * prerequisite order must hold, and no term may exceed the credit limit.
 */
exports.submitPlan = async (req, res) => {
  try {
    const plan = await findOwnPlan(req, res);
    if (!plan) return;
    if (plan.status !== 'Draft') {
      return res.status(409).json({ message: 'This plan has already been submitted.' });
    }

    const student = await Student.findById(plan.student);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const [planInputs, approvedLimit, approvedExitExamCourseIds] = await Promise.all([
      planInputsFor(student),
      approvedCreditLimitFor(student),
      approvedExitExamCourseIdsFor(student),
    ]);

    const placements = plan.placements.map((placement) => ({
      courseId: String(placement.course),
      termIndex: placement.termIndex,
    }));
    const validation = validatePlan({
      placements,
      remaining: planInputs.remaining,
      terms: plan.terms,
      creditLimits: creditLimitsFor({
        student,
        terms: plan.terms,
        gpa: planInputs.gpa,
        approvedLimit,
      }),
      approvedExitExamCourseIds,
      requireComplete: true,
    });
    if (validation.errors.length) return sendRuleErrors(res, validation);

    // A returned draft is being resubmitted: the old response belongs to the
    // previous review, not this one (req 113).
    clearDecision(plan);
    plan.status = 'Submitted';
    plan.submittedAt = new Date();
    await plan.save();
    try {
      await publishNotificationEvent({
        name: 'graduation_plan.submitted',
        entityId: plan._id,
        occurrence: plan.submittedAt.toISOString(),
        studentId: plan.student,
        title: 'Graduation plan submitted for review',
        message: 'A graduation plan is waiting for Coordinator review.',
        link: '/graduation-plans',
      });
    } catch (error) {
      console.error('[graduation-plan] Could not queue Coordinator notification:', error.message);
    }

    res.status(200).json({
      message: 'Your graduation plan was submitted and is now read-only while the Coordinator reviews it.',
      plan: await buildDetail(plan),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not submit the graduation plan', error: error.message });
  }
};

/**
 * Req 113: the Coordinator accepts or rejects a submitted plan with a response
 * note. Acceptance keeps the plan Accepted and read-only; rejection turns it
 * back into the Advisor's private draft so it can be corrected and resubmitted.
 */
exports.decidePlan = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.planId)) {
      return res.status(404).json({ message: 'Graduation plan not found.' });
    }

    const plan = await GraduationPlan.findById(req.params.planId);
    if (!plan) return res.status(404).json({ message: 'Graduation plan not found.' });

    const error = applyDecision(plan, {
      decision: req.body?.decision,
      note: req.body?.note,
      coordinatorId: req.user.userId,
    });
    if (error) {
      return res.status(plan.status === 'Submitted' ? 400 : 409).json({ message: error });
    }

    await plan.save();
    try {
      await publishStudentNotification('graduation_plan.decided', {
        entityId: plan._id,
        occurrence: plan.decidedAt.toISOString(),
        studentId: plan.student,
        decision: plan.status === 'Accepted' ? 'Approved' : 'Rejected',
      });
    } catch (error) {
      console.error('[graduation-plan] Could not queue student decision notification:', error.message);
    }
    const message =
      plan.status === 'Accepted'
        ? 'The graduation plan was accepted and is now visible to the student.'
        : 'The graduation plan was rejected and returned to the Advisor as a private draft.';

    res.status(200).json({ message, plan: await buildDetail(plan) });
  } catch (error) {
    res.status(500).json({ message: 'Could not record the decision', error: error.message });
  }
};

/**
 * Req 114: an Advising Student sees their accepted plan, and only an accepted
 * plan. Submitted or draft plans stay internal to the Advisor and Coordinator.
 */
exports.getMyAcceptedPlan = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('email').lean();
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const student = await Student.findOne({ email: user.email });
    if (!student) return res.status(404).json({ message: 'No student record is linked to this account.' });
    if (student.studentType !== 'Advising Student') {
      return res.status(403).json({ message: 'Graduation plans are only available to Advising Students.' });
    }

    const plan = await GraduationPlan.findOne({ student: student._id, status: 'Accepted' }).sort({
      decidedAt: -1,
      updatedAt: -1,
    });

    if (!plan) return res.status(200).json({ plan: null });
    res.status(200).json({ plan: await buildDetail(plan) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load your graduation plan', error: error.message });
  }
};

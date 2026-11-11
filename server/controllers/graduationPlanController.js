const mongoose = require('mongoose');
const Student = require('../models/Student');
const GraduationPlan = require('../models/GraduationPlan');
const {
  STANDARD_CREDIT_LIMIT,
  planningTerms,
  termLabel,
  approvedCreditLimitFor,
  approvedExitExamCourseIdsFor,
  remainingCoursesFor,
  normalizePlacements,
  validatePlan,
} = require('../services/graduationPlanService');

const studentSummary = (student) => ({
  id: student._id,
  fullName: student.fullName,
  email: student.email,
  studentId: student.studentId,
  studentType: student.studentType,
  major: student.major,
  currentSemester: student.currentSemester,
});

const serializeTerms = (terms) => terms.map((term) => ({ ...term, label: termLabel(term) }));

/** Req 106/107: everything the builder needs, including the rule violations. */
const buildDetail = async (plan) => {
  const student = await Student.findById(plan.student);
  if (!student) return null;

  const [remaining, approvedLimit, approvedExitExamCourseIds] = await Promise.all([
    remainingCoursesFor(student),
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
  const creditLimit = approvedLimit ?? STANDARD_CREDIT_LIMIT;
  const validation = validatePlan({
    placements,
    remaining,
    terms,
    creditLimit,
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
    remaining,
    validation,
    submittedAt: plan.submittedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
};

const planSummary = (plan) => ({
  id: plan._id,
  status: plan.status,
  student: plan.student ? studentSummary(plan.student) : null,
  terms: serializeTerms(
    plan.terms.map((term) => ({ season: term.season, academicYear: term.academicYear }))
  ),
  assignedCount: plan.placements.length,
  submittedAt: plan.submittedAt,
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

const sendRuleErrors = (res, validation) =>
  res.status(422).json({
    message: 'This plan does not follow the graduation rules yet.',
    errors: validation.errors,
  });

/** Req 110: the Advisor's own plans — private drafts included, nobody else's. */
exports.listMyPlans = async (req, res) => {
  try {
    const plans = await GraduationPlan.find({ advisor: req.user.userId })
      .populate('student', 'fullName email studentId studentType major currentSemester')
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json({ plans: plans.map(planSummary) });
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

/** Req 103-106: the builder reads one plan, its remaining courses and its terms. */
exports.getPlan = async (req, res) => {
  try {
    const plan = await findOwnPlan(req, res);
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

    const [remaining, approvedLimit, approvedExitExamCourseIds] = await Promise.all([
      remainingCoursesFor(student),
      approvedCreditLimitFor(student),
      approvedExitExamCourseIdsFor(student),
    ]);

    const validation = validatePlan({
      placements,
      remaining,
      terms: plan.terms,
      creditLimit: approvedLimit ?? STANDARD_CREDIT_LIMIT,
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

    const [remaining, approvedLimit, approvedExitExamCourseIds] = await Promise.all([
      remainingCoursesFor(student),
      approvedCreditLimitFor(student),
      approvedExitExamCourseIdsFor(student),
    ]);

    const placements = plan.placements.map((placement) => ({
      courseId: String(placement.course),
      termIndex: placement.termIndex,
    }));
    const validation = validatePlan({
      placements,
      remaining,
      terms: plan.terms,
      creditLimit: approvedLimit ?? STANDARD_CREDIT_LIMIT,
      approvedExitExamCourseIds,
      requireComplete: true,
    });
    if (validation.errors.length) return sendRuleErrors(res, validation);

    plan.status = 'Submitted';
    plan.submittedAt = new Date();
    await plan.save();

    res.status(200).json({
      message: 'Your graduation plan was submitted and is now read-only while the Coordinator reviews it.',
      plan: await buildDetail(plan),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not submit the graduation plan', error: error.message });
  }
};

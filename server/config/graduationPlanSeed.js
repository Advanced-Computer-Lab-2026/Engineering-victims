const GraduationPlan = require('../models/GraduationPlan');
const {
  planningTerms,
  planInputsFor,
  creditLimitsFor,
  normalizeCreditLimits,
  validatePlan,
} = require('../services/graduationPlanService');

const DEMO_PLANS = [
  { studentId: '64-50034', status: 'Accepted' },
  { studentId: '64-40077', status: 'Submitted' },
  {
    studentId: '64-40078',
    status: 'Draft',
    responseNote: 'Please revise the term sequence before resubmitting this plan.',
    wasRejected: true,
  },
  { studentId: '64-20046', status: 'Draft' },
  { studentId: '64-30011', status: 'Draft' },
];

/**
 * Greedily packs the remaining courses into the three terms: a course must be
 * offered in that season, come after its prerequisites and fit the term's req
 * 59 allowance (`creditLimits`, one per term), backtracking when a choice dead
 * ends. Returns `null` when the remaining courses cannot be packed at all.
 */
const planPlacements = (remaining, terms, creditLimits) => {
  const limits = normalizeCreditLimits(terms, creditLimits);
  const courseById = new Map(remaining.map((course) => [String(course.id), course]));
  const placements = new Map();
  const hoursByTerm = terms.map(() => 0);

  const assignRemaining = (pending) => {
    if (pending.length === 0) return true;

    const ready = pending.filter((course) =>
      (course.prerequisites ?? []).every((prerequisite) => {
        const prerequisiteId = String(prerequisite.id);
        return (
          prerequisite.passed ||
          !courseById.has(prerequisiteId) ||
          placements.has(prerequisiteId)
        );
      })
    );

    for (const course of ready) {
      const courseId = String(course.id);
      const prerequisiteIndexes = (course.prerequisites ?? [])
        .filter((prerequisite) => courseById.has(String(prerequisite.id)))
        .map((prerequisite) => placements.get(String(prerequisite.id)));
      const options = terms
        .map((term, termIndex) => ({ term, termIndex }))
        .filter(
          ({ term, termIndex }) =>
            (course.offeringSeasons ?? []).includes(term.season) &&
            prerequisiteIndexes.every((prerequisiteIndex) => prerequisiteIndex < termIndex) &&
            hoursByTerm[termIndex] + course.creditHours <= limits[termIndex]
        );

      for (const { termIndex } of options) {
        placements.set(courseId, termIndex);
        hoursByTerm[termIndex] += course.creditHours;

        if (assignRemaining(pending.filter((entry) => String(entry.id) !== courseId))) {
          return true;
        }

        placements.delete(courseId);
        hoursByTerm[termIndex] -= course.creditHours;
      }
    }

    return false;
  };

  if (!assignRemaining([...remaining])) {
    return null;
  }

  return [...placements].map(([courseId, termIndex]) => ({ courseId, termIndex }));
};

const seedGraduationPlans = async ({ students, users, now = new Date() }) => {
  const studentsById = new Map(students.map((student) => [student.studentId, student]));
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const coordinator = usersByEmail.get('coordinator@guc.edu.eg');
  if (!coordinator) throw new Error('The graduation-plan demo data requires the seeded Coordinator.');

  const terms = planningTerms(now);
  const plans = [];

  for (const demoPlan of DEMO_PLANS) {
    const student = studentsById.get(demoPlan.studentId);
    if (!student || student.studentType !== 'Advising Student' || !student.assignedAdvisor) {
      throw new Error(`The graduation-plan demo data requires assigned Advising Student ${demoPlan.studentId}.`);
    }

    const advisor = users.find((user) => String(user._id) === String(student.assignedAdvisor));
    if (!advisor) {
      throw new Error(`The graduation-plan demo data could not find ${demoPlan.studentId}'s Advisor.`);
    }

    const { remaining, gpa } = await planInputsFor(student);
    // Req 59: every term of the demo plan is packed against its own allowance.
    const creditLimits = creditLimitsFor({ student, terms, gpa });
    const placements =
      demoPlan.status === 'Draft' && !demoPlan.wasRejected
        ? []
        : planPlacements(remaining, terms, creditLimits);
    if (!placements) {
      throw new Error(`Could not create a valid demo graduation plan for ${demoPlan.studentId}.`);
    }

    if (demoPlan.status !== 'Draft') {
      const validation = validatePlan({
        placements,
        remaining,
        terms,
        creditLimits,
        requireComplete: true,
      });
      if (validation.errors.length) {
        throw new Error(
          `Invalid demo graduation plan for ${demoPlan.studentId}: ${validation.errors.join(' ')}`
        );
      }
    }

    const submittedAt =
      demoPlan.status === 'Draft' ? null : new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const decidedAt = demoPlan.wasRejected
      ? new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      : demoPlan.status === 'Accepted'
        ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
        : null;

    plans.push({
      advisor: advisor._id,
      student: student._id,
      status: demoPlan.status,
      terms,
      placements: placements.map(({ courseId, termIndex }) => ({
        course: courseId,
        termIndex,
      })),
      submittedAt,
      responseNote: demoPlan.responseNote ?? '',
      decidedAt,
      decidedBy: decidedAt ? coordinator._id : null,
    });
  }

  return GraduationPlan.insertMany(plans);
};

module.exports = { seedGraduationPlans, planPlacements, DEMO_PLANS };

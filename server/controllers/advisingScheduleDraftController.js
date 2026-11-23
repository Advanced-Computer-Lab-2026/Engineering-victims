const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentSchedule = require('../models/StudentSchedule');
const AdvisingScheduleDraft = require('../models/AdvisingScheduleDraft');
const AcademicTerm = require('../models/AcademicTerm');
const { advisingTerm } = require('../services/schedulingPreferenceService');
const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');
const {
  eligibleNonMandatoryCourses,
  progressionSemesterFor,
} = require('../services/advisingScheduleDraftService');
const { buildAcademicHistory } = require('../services/academicHistoryService');
const { deriveAllowance } = require('../services/advisingOverviewService');
const workflow = require('../services/advisingScheduleWorkflowService');
const { loadBachelorEligibility } = require('../services/bachelorProjectService');
const Course = require('../models/Course');
const { approvedExtraHoursFor } = require('../services/draftHoursService');
const { sumHours, mandatoryHoursBlock, mandatoryCoursesOf } = require('../services/mandatoryScheduleRules');
const {
  MAX_COURSES,
  MAX_CORE,
  MAX_HUMANITIES,
  isValidSeason,
  projectCourseIssues,
  projectHours,
} = require('../services/bachelorProjectRules');

const EDITABLE_STATUSES = new Set(['Not Started', 'Draft', 'Reopened']);

const findAdvisingStudent = async (studentId, user) => {
  if (!mongoose.isValidObjectId(studentId)) return { status: 400, message: 'That student link is not valid.' };
  const student = await Student.findById(studentId);
  if (!student) return { status: 404, message: 'Student not found' };
  if (student.studentType !== 'Advising Student') {
    return { status: 404, message: 'That student is not an advising student.' };
  }
  if (!workflow.canManageStudent(user, student)) {
    return { status: 403, message: 'You can only manage students assigned to you.' };
  }
  return { student };
};

const serializeDraft = (draft) => ({
  id: String(draft._id),
  termId: String(draft.term),
  bachelorProject: draft.bachelorProject ? { season: draft.bachelorProject.season } : null,
  courses: (draft.courses ?? []).map((entry) => ({
    id: String(entry.course?._id ?? entry.course),
    code: entry.course?.code,
    name: entry.course?.name,
    creditHours: entry.course?.creditHours,
    mandatory: entry.mandatory,
  })),
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
});

const loadDraft = (student, term) =>
  AdvisingScheduleDraft.findOne({ student: student._id, term: term._id }).populate(
    'courses.course',
    'code name courseType creditHours'
  );

const resolveTerm = async (termId) => {
  if (termId) {
    if (!mongoose.isValidObjectId(termId)) {
      return { status: 400, message: 'Choose a valid academic term.' };
    }
    const term = await AcademicTerm.findById(termId).lean();
    return term ? { term } : { status: 404, message: 'Academic term not found.' };
  }
  return advisingTerm();
};

const termSummary = (term) => ({
  id: String(term._id),
  label: `${term.academicYear} ${term.season}`,
  academicYear: term.academicYear,
  season: term.season,
});

const findOrMigrateDraft = async (student, term, userId, createIfMissing = false) => {
  let draft = await loadDraft(student, term);
  if (draft) return draft;

  const legacyRows =
    student.workflowStatus === 'Draft' || student.workflowStatus === 'Reopened'
      ? await StudentSchedule.find({ studentId: student._id, termId: term._id, status: 'Draft' })
          .populate({
            path: 'slotId',
            populate: { path: 'offeringId', populate: { path: 'courseId', select: 'code name creditHours' } },
          })
          .lean()
      : [];
  if (!legacyRows.length && !createIfMissing) return null;

  const courses = new Map();
  legacyRows.forEach((row) => {
    const course = row.slotId?.offeringId?.courseId;
    if (course) courses.set(String(course._id), course);
  });
  const mandatoryIds = new Set(
    legacyRows.length
      ? (await buildMandatoryCandidates(student)).map((candidate) => String(candidate.course.id))
      : []
  );

  try {
    draft = await AdvisingScheduleDraft.create({
      student: student._id,
      term: term._id,
      courses: [...courses.values()].map((course) => ({
        course: course._id,
        mandatory: mandatoryIds.has(String(course._id)),
      })),
      createdBy: userId,
      updatedBy: userId,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    draft = await loadDraft(student, term);
  }

  return draft ? loadDraft(student, term) : null;
};

/**
 * The credit-hour allowance for the term being drafted. It follows the student's
 * progression to that term, so it is shared by the draft response and by the
 * rules that run while courses are added: both must use the same figure.
 */
const allowanceFor = ({ student, term, currentTerm, history }) => {
  const progressionSemester = progressionSemesterFor({ student, term, currentTerm });
  const allowanceStudent =
    Number.isInteger(progressionSemester) && progressionSemester >= 1 && progressionSemester <= 10
      ? { ...student, currentSemester: progressionSemester }
      : student;
  return deriveAllowance({ student: allowanceStudent, gpa: history.summary.gpa });
};

/** Req 63: the student's mandatory courses, each marked as already in the draft or not. */
const describeMandatoryCandidates = (candidates, draft) => {
  const selectedIds = new Set((draft?.courses ?? []).map((entry) => String(entry.course?._id ?? entry.course)));
  return (candidates ?? []).map((candidate) => ({
    course: {
      id: String(candidate.course.id),
      code: candidate.course.code,
      name: candidate.course.name,
      creditHours: candidate.course.creditHours,
    },
    reason: candidate.reason,
    semester: candidate.semester,
    term: candidate.term,
    inProgress: candidate.inProgress,
    selected: selectedIds.has(String(candidate.course.id)),
  }));
};

const respondWithDraft = async (res, student, term, terms, draft, statusCode = 200) => {
  const currentTerm = (await advisingTerm())?.term ?? term;
  const [eligibleCourses, history, bachelorEligibility, mandatoryCandidates] = await Promise.all([
    eligibleNonMandatoryCourses({ student, term, currentTerm, draft }),
    buildAcademicHistory(student),
    loadBachelorEligibility(student),
    buildMandatoryCandidates(student),
  ]);
  const allowance = allowanceFor({ student, term, currentTerm, history });
  const selectedHours = (draft?.courses ?? []).reduce(
    (total, entry) => total + (entry.course?.creditHours ?? 0),
    0
  );
  // Req 60: with the bachelor project, humanities hours are extra hours and
  // only the other courses use the allowance.
  const project = draft?.bachelorProject ?? null;
  const projectTotals = project
    ? projectHours({
        courses: (draft?.courses ?? []).map((entry) => entry.course).filter(Boolean),
        allowedHours: allowance.allowedHours,
      })
    : null;
  const extraHours = projectTotals
    ? projectTotals.extraHours
    : Math.max(0, selectedHours - allowance.allowedHours);
  const remainingHours = projectTotals
    ? Math.max(0, allowance.allowedHours - projectTotals.otherHours)
    : Math.max(0, allowance.allowedHours - selectedHours);

  res.status(statusCode).json({
    student: {
      id: String(student._id),
      fullName: student.fullName,
      studentId: student.studentId,
      major: student.major,
      currentSemester: student.currentSemester,
      workflowStatus: student.workflowStatus,
    },
    term: termSummary(term),
    terms: terms.map(termSummary),
    draft: draft ? serializeDraft(draft) : null,
    canEdit: EDITABLE_STATUSES.has(student.workflowStatus),
    eligibleCourses,
    mandatoryCandidates: describeMandatoryCandidates(mandatoryCandidates, draft),
    creditHours: {
      selected: selectedHours,
      allowed: allowance.allowedHours,
      extra: extraHours,
      remaining: remainingHours,
      standardAllowance: allowance.standardHours,
      isProbation: allowance.isProbation,
    },
    // Req 60: eligibility comes from req 59's rule; `selection` is what is saved.
    bachelorProject: {
      eligible: bachelorEligibility.eligible,
      explanation: bachelorEligibility.explanation,
      selection: project ? { season: project.season } : null,
      limits: { maxCourses: MAX_COURSES, maxCore: MAX_CORE, maxHumanities: MAX_HUMANITIES },
    },
  });
};

exports.getDraft = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });

    const [selected, terms] = await Promise.all([
      resolveTerm(req.query.termId),
      AcademicTerm.find().sort({ termStartDate: 1 }).lean(),
    ]);
    if (!selected.term) {
      return res.status(selected.status ?? 404).json({
        message: selected.message ?? 'There is no academic term available for advising schedules.',
      });
    }
    const { term } = selected;

    const draft = await findOrMigrateDraft(student, term, req.user.userId);
    await respondWithDraft(res, student, term, terms, draft);
  } catch (error) {
    res.status(500).json({ message: 'Could not load the advising schedule draft', error: error.message });
  }
};

exports.createDraft = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });
    if (!EDITABLE_STATUSES.has(student.workflowStatus)) {
      return res.status(409).json({ message: 'This advising schedule is no longer an editable draft.' });
    }

    const [selected, terms] = await Promise.all([
      resolveTerm(req.body?.termId),
      AcademicTerm.find().sort({ termStartDate: 1 }).lean(),
    ]);
    if (!selected.term) {
      return res.status(selected.status ?? 400).json({
        message: selected.message ?? 'There is no academic term available for advising schedules.',
      });
    }
    const { term } = selected;

    let draft = await loadDraft(student, term);
    let created = false;
    if (!draft) {
      draft = await findOrMigrateDraft(student, term, req.user.userId, true);
      created = Boolean(draft);
    }

    if (student.workflowStatus === 'Not Started') {
      student.workflowStatus = 'Draft';
      student.blockingStep = 'Advisor to complete the draft';
      student.lastUpdateAt = new Date();
      await student.save();
    }

    draft = await loadDraft(student, term);
    await respondWithDraft(res, student, term, terms, draft, created ? 201 : 200);
  } catch (error) {
    res.status(500).json({ message: 'Could not create the advising schedule draft', error: error.message });
  }
};

exports.addCourse = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });
    if (!EDITABLE_STATUSES.has(student.workflowStatus)) {
      return res.status(409).json({ message: 'This advising schedule is no longer an editable draft.' });
    }
    const { courseId } = req.body ?? {};
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Choose a valid course.' });
    }

    const selected = await resolveTerm(req.query.termId);
    if (!selected.term) {
      return res.status(selected.status ?? 400).json({
        message: selected.message ?? 'There is no academic term available for advising schedules.',
      });
    }
    const { term } = selected;
    const draft = await AdvisingScheduleDraft.findOne({ student: student._id, term: term._id });
    if (!draft) return res.status(404).json({ message: 'Create a draft before adding courses.' });

    const currentTerm = (await advisingTerm())?.term ?? term;
    const eligible = await eligibleNonMandatoryCourses({ student, term, currentTerm, draft });
    if (!eligible.some((course) => course.id === String(courseId))) {
      return res.status(400).json({ message: 'That course is not eligible to add to this draft schedule.' });
    }

    // Req 60: with the bachelor project the draft is capped at four courses.
    if (draft.bachelorProject) {
      const populatedDraft = await loadDraft(student, term);
      const existing = (populatedDraft?.courses ?? []).map((entry) => entry.course).filter(Boolean);
      const adding = eligible.find((course) => course.id === String(courseId));
      const issues = projectCourseIssues([...existing, adding]);
      if (issues.length) return res.status(409).json({ message: issues[0], issues });
    }

    // Req 63: "Mandatory courses are selected before other courses", so no other
    // course is added while a mandatory course of this student is still unselected.
    const inDraftIds = new Set((draft.courses ?? []).map((entry) => String(entry.course?._id ?? entry.course)));
    const unselected = ((await buildMandatoryCandidates(student)) ?? []).filter(
      (candidate) => !inDraftIds.has(String(candidate.course.id))
    );
    if (unselected.length) {
      return res.status(409).json({
        message: `Select the mandatory courses before other courses: ${unselected
          .map((candidate) => candidate.course.code)
          .join(', ')}.`,
      });
    }

    // Req 63: "If mandatory courses consume all allowed hours, no other course
    // may be added without approved extra hours."
    if ((draft.courses ?? []).some((entry) => entry.mandatory)) {
      const populatedDraft = await loadDraft(student, term);
      const entries = populatedDraft?.courses ?? [];
      const adding = eligible.find((course) => course.id === String(courseId));
      const [history, approvedExtraHours] = await Promise.all([
        buildAcademicHistory(student),
        approvedExtraHoursFor(student, term),
      ]);
      const allowance = allowanceFor({ student, term, currentTerm, history });
      const blocked = mandatoryHoursBlock({
        mandatoryHours: sumHours(mandatoryCoursesOf(entries)),
        selectedHours: sumHours(entries.map((entry) => entry.course).filter(Boolean)),
        newHours: Number(adding?.creditHours) || 0,
        allowedHours: allowance.allowedHours,
        approvedExtraHours,
      });
      if (blocked) return res.status(409).json({ message: blocked });
    }

    const result = await AdvisingScheduleDraft.updateOne(
      { _id: draft._id, 'courses.course': { $ne: courseId } },
      { $push: { courses: { course: courseId, mandatory: false } }, $set: { updatedBy: req.user.userId } }
    );
    if (!result.modifiedCount) {
      return res.status(409).json({ message: 'That course is already in this draft schedule.' });
    }

    student.lastUpdateAt = new Date();
    await student.save();
    const updated = await loadDraft(student, term);
    return res.status(200).json({ draft: serializeDraft(updated) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not add the course to the draft schedule', error: error.message });
  }
};

exports.removeCourse = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });
    if (!EDITABLE_STATUSES.has(student.workflowStatus)) {
      return res.status(409).json({ message: 'This advising schedule is no longer an editable draft.' });
    }
    if (!mongoose.isValidObjectId(req.params.courseId)) {
      return res.status(400).json({ message: 'Choose a valid course.' });
    }

    const selected = await resolveTerm(req.query.termId);
    if (!selected.term) {
      return res.status(selected.status ?? 400).json({
        message: selected.message ?? 'There is no academic term available for advising schedules.',
      });
    }
    const { term } = selected;
    await workflow.removeCourseFromDraft({
      user: req.user,
      studentId: student._id,
      termId: term._id,
      courseId: req.params.courseId,
    });
    const updated = await loadDraft(student, term);
    return res.status(200).json({ draft: serializeDraft(updated) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not remove the course from the draft schedule', error: error.message });
  }
};

exports.getValidation = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });
    const selected = await resolveTerm(req.query.termId);
    if (!selected.term) {
      return res.status(selected.status ?? 404).json({ message: selected.message ?? 'Choose an academic term.' });
    }
    const result = await workflow.loadDraftValidation({ student, term: selected.term });
    return res.status(200).json({
      validation: result.validation,
      slotAssignments: workflow.buildSlotAssignments({
        courses: result.draft?.courses ?? [],
        offerings: result.offerings ?? [],
        rows: result.rows ?? [],
        slots: result.slots ?? [],
        slotOccupancy: result.slotOccupancy ?? new Map(),
      }),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Could not validate this draft schedule.' });
  }
};

exports.assignSlot = async (req, res) => {
  try {
    const { termId, slotType, slotId } = req.body ?? {};
    if (![termId, req.params.courseId, slotId].every(mongoose.isValidObjectId)) {
      return res.status(400).json({ message: 'Choose a valid term, course and slot.' });
    }
    const result = await workflow.assignCourseSlot({
      user: req.user,
      studentId: req.params.studentId,
      termId,
      courseId: req.params.courseId,
      slotType,
      slotId,
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Could not assign the slot.' });
  }
};

exports.changeSlot = async (req, res) => {
  try {
    const { termId, slotId } = req.body ?? {};
    if (![termId, req.params.scheduleId, slotId].every(mongoose.isValidObjectId)) {
      return res.status(400).json({ message: 'Choose a valid term, assignment and replacement slot.' });
    }
    const result = await workflow.changeCourseSlot({
      user: req.user,
      studentId: req.params.studentId,
      termId,
      scheduleId: req.params.scheduleId,
      slotId,
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Could not change the assigned slot.' });
  }
};

exports.removeSlot = async (req, res) => {
  try {
    const { termId } = req.query;
    if (![termId, req.params.scheduleId].every(mongoose.isValidObjectId)) {
      return res.status(400).json({ message: 'Choose a valid term and slot assignment.' });
    }
    const result = await workflow.removeCourseSlot({
      user: req.user,
      studentId: req.params.studentId,
      termId,
      scheduleId: req.params.scheduleId,
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Could not remove the assigned slot.' });
  }
};

exports.markReadyForReview = async (req, res) => {
  try {
    const { termId } = req.body ?? {};
    if (!mongoose.isValidObjectId(termId)) return res.status(400).json({ message: 'Choose a valid academic term.' });
    const result = await workflow.markReadyForReview({ user: req.user, studentId: req.params.studentId, termId });
    return res.status(200).json({
      message: 'The completed schedule is ready for student review.',
      workflowStatus: result.workflowStatus,
      validation: result.validation,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || 'Could not mark the schedule ready for review.',
      validation: error.details,
    });
  }
};

/**
 * Req 60: add the bachelor project to an eligible student's draft, or change
 * the season it will be taken in. Idempotent, so choosing Winter then Spring
 * simply updates the one selection.
 */
exports.setBachelorProject = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });
    if (!EDITABLE_STATUSES.has(student.workflowStatus)) {
      return res.status(409).json({ message: 'This advising schedule is no longer an editable draft.' });
    }
    const { season, termId } = req.body ?? {};
    if (!isValidSeason(season)) {
      return res.status(400).json({ message: 'Choose Winter or Spring for the bachelor project.' });
    }

    const [selected, terms] = await Promise.all([
      resolveTerm(termId),
      AcademicTerm.find().sort({ termStartDate: 1 }).lean(),
    ]);
    if (!selected.term) {
      return res.status(selected.status ?? 400).json({
        message: selected.message ?? 'There is no academic term available for advising schedules.',
      });
    }
    const { term } = selected;

    const draft = await loadDraft(student, term);
    if (!draft) return res.status(404).json({ message: 'Create a draft before adding the bachelor project.' });

    const eligibility = await loadBachelorEligibility(student);
    if (!eligibility.eligible) return res.status(409).json({ message: eligibility.explanation });

    const issues = projectCourseIssues((draft.courses ?? []).map((entry) => entry.course).filter(Boolean));
    if (issues.length) {
      return res.status(409).json({
        message: `${issues[0]} Remove the extra courses from the draft first.`,
        issues,
      });
    }

    await AdvisingScheduleDraft.updateOne(
      { _id: draft._id },
      {
        $set: {
          bachelorProject: { season, setBy: req.user.userId, setAt: new Date() },
          updatedBy: req.user.userId,
        },
      }
    );
    student.lastUpdateAt = new Date();
    await student.save();

    const updated = await loadDraft(student, term);
    return respondWithDraft(res, student, term, terms, updated);
  } catch (error) {
    return res.status(500).json({ message: 'Could not save the bachelor project', error: error.message });
  }
};

/** Req 60: take the bachelor project back off a draft. */
exports.removeBachelorProject = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });
    if (!EDITABLE_STATUSES.has(student.workflowStatus)) {
      return res.status(409).json({ message: 'This advising schedule is no longer an editable draft.' });
    }

    const [selected, terms] = await Promise.all([
      resolveTerm(req.query.termId),
      AcademicTerm.find().sort({ termStartDate: 1 }).lean(),
    ]);
    if (!selected.term) {
      return res.status(selected.status ?? 400).json({
        message: selected.message ?? 'There is no academic term available for advising schedules.',
      });
    }
    const { term } = selected;

    const draft = await loadDraft(student, term);
    if (!draft) return res.status(404).json({ message: 'There is no draft schedule for this term.' });

    await AdvisingScheduleDraft.updateOne(
      { _id: draft._id },
      { $set: { bachelorProject: null, updatedBy: req.user.userId } }
    );
    student.lastUpdateAt = new Date();
    await student.save();

    const updated = await loadDraft(student, term);
    return respondWithDraft(res, student, term, terms, updated);
  } catch (error) {
    return res.status(500).json({ message: 'Could not remove the bachelor project', error: error.message });
  }
};

/**
 * Req 63: add one of the student's mandatory courses to the draft.
 *
 * Only a course on the student's mandatory list (req 61) is accepted, and it is
 * stored with mandatory: true, which is what stops it being removed as an
 * ordinary course. Mandatory courses are never refused for hours: they are
 * owed whatever the allowance, and the review check reports any overflow.
 */
exports.addMandatoryCourse = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId, req.user);
    if (!student) return res.status(status).json({ message });
    if (!EDITABLE_STATUSES.has(student.workflowStatus)) {
      return res.status(409).json({ message: 'This advising schedule is no longer an editable draft.' });
    }
    const { courseId } = req.body ?? {};
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Choose a valid course.' });
    }

    const selected = await resolveTerm(req.query.termId);
    if (!selected.term) {
      return res.status(selected.status ?? 400).json({
        message: selected.message ?? 'There is no academic term available for advising schedules.',
      });
    }
    const { term } = selected;
    const draft = await AdvisingScheduleDraft.findOne({ student: student._id, term: term._id });
    if (!draft) return res.status(404).json({ message: 'Create a draft before adding courses.' });

    const candidates = await buildMandatoryCandidates(student);
    if (!candidates.some((candidate) => String(candidate.course.id) === String(courseId))) {
      return res.status(400).json({ message: "That course is not one of the student's mandatory courses." });
    }
    if ((draft.courses ?? []).some((entry) => String(entry.course?._id ?? entry.course) === String(courseId))) {
      return res.status(409).json({ message: 'That course is already in this draft schedule.' });
    }

    // Req 60: a mandatory course still counts toward the project's four-course cap.
    if (draft.bachelorProject) {
      const [populatedDraft, adding] = await Promise.all([
        loadDraft(student, term),
        Course.findById(courseId).select('code name courseType creditHours').lean(),
      ]);
      const existing = (populatedDraft?.courses ?? []).map((entry) => entry.course).filter(Boolean);
      const issues = projectCourseIssues([...existing, adding].filter(Boolean));
      if (issues.length) return res.status(409).json({ message: issues[0], issues });
    }

    const result = await AdvisingScheduleDraft.updateOne(
      { _id: draft._id, 'courses.course': { $ne: courseId } },
      { $push: { courses: { course: courseId, mandatory: true } }, $set: { updatedBy: req.user.userId } }
    );
    if (!result.modifiedCount) {
      return res.status(409).json({ message: 'That course is already in this draft schedule.' });
    }

    student.lastUpdateAt = new Date();
    await student.save();
    const updated = await loadDraft(student, term);
    return res.status(200).json({ draft: serializeDraft(updated) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not add the mandatory course to the draft schedule', error: error.message });
  }
};

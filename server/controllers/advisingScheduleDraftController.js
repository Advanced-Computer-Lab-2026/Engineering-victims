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

const EDITABLE_STATUSES = new Set(['Not Started', 'Draft', 'Reopened']);

const findAdvisingStudent = async (studentId) => {
  if (!mongoose.isValidObjectId(studentId)) return { status: 400, message: 'That student link is not valid.' };
  const student = await Student.findById(studentId);
  if (!student) return { status: 404, message: 'Student not found' };
  if (student.studentType !== 'Advising Student') {
    return { status: 404, message: 'That student is not an advising student.' };
  }
  return { student };
};

const serializeDraft = (draft) => ({
  id: String(draft._id),
  termId: String(draft.term),
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
    'code name creditHours'
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

const respondWithDraft = async (res, student, term, terms, draft, statusCode = 200) => {
  const currentTerm = (await advisingTerm())?.term ?? term;
  const progressionSemester = progressionSemesterFor({ student, term, currentTerm });
  const allowanceStudent =
    Number.isInteger(progressionSemester) && progressionSemester >= 1 && progressionSemester <= 10
      ? { ...student, currentSemester: progressionSemester }
      : student;
  const [eligibleCourses, history] = await Promise.all([
    eligibleNonMandatoryCourses({ student, term, currentTerm, draft }),
    buildAcademicHistory(student),
  ]);
  const allowance = deriveAllowance({ student: allowanceStudent, gpa: history.summary.gpa });
  const selectedHours = (draft?.courses ?? []).reduce(
    (total, entry) => total + (entry.course?.creditHours ?? 0),
    0
  );
  const extraHours = Math.max(0, selectedHours - allowance.allowedHours);
  const remainingHours = Math.max(0, allowance.allowedHours - selectedHours);

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
    creditHours: {
      selected: selectedHours,
      allowed: allowance.allowedHours,
      extra: extraHours,
      remaining: remainingHours,
      standardAllowance: allowance.standardHours,
      isProbation: allowance.isProbation,
    },
  });
};

exports.getDraft = async (req, res) => {
  try {
    const { student, status, message } = await findAdvisingStudent(req.params.studentId);
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
    const { student, status, message } = await findAdvisingStudent(req.params.studentId);
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
    const { student, status, message } = await findAdvisingStudent(req.params.studentId);
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
    const { student, status, message } = await findAdvisingStudent(req.params.studentId);
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
    const draft = await AdvisingScheduleDraft.findOne({ student: student._id, term: term._id });
    if (!draft) return res.status(404).json({ message: 'Draft schedule not found.' });

    const result = await AdvisingScheduleDraft.updateOne(
      { _id: draft._id, courses: { $elemMatch: { course: req.params.courseId, mandatory: false } } },
      { $pull: { courses: { course: req.params.courseId, mandatory: false } }, $set: { updatedBy: req.user.userId } }
    );
    if (!result.modifiedCount) {
      return res.status(404).json({ message: 'That non-mandatory course is not in this draft schedule.' });
    }

    student.lastUpdateAt = new Date();
    await student.save();
    const updated = await loadDraft(student, term);
    return res.status(200).json({ draft: serializeDraft(updated) });
  } catch (error) {
    return res.status(500).json({ message: 'Could not remove the course from the draft schedule', error: error.message });
  }
};

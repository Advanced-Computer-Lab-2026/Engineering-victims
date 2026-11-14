const { createHash } = require('crypto');
const Student = require('../models/Student');
const Term = require('../models/AcademicTerm');
const Schedule = require('../models/StudentSchedule');
const Offering = require('../models/CourseOffering');
const Record = require('../models/CourseRecord');
const Plan = require('../models/GraduationPlan');
const Request = require('../models/ExtraHoursRequest');
const { evaluateExtraHoursRequest, prepareExtraHoursRequest } = require('./extraHoursService');
const { planInputsFor, approvedExitExamCourseIdsFor, creditLimitsFor, validatePlan } = require('./graduationPlanService');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });

async function graduationAssessmentFor(student, now) {
  const plan = await Plan.findOne({ student: student._id, status: 'Accepted' }).sort({ decidedAt: -1 }).lean();
  if (!plan || plan.terms.length !== 3) return null;
  const end = new Date(now); end.setUTCFullYear(end.getUTCFullYear() + 1);
  const terms = await Term.find({ $or: plan.terms.map((term) => ({ season: term.season,
    academicYear: { $in: [term.academicYear.replace('-', '/'), term.academicYear.replace('/', '-')] },
  })) }).lean();
  if (terms.length !== 3 || terms.some((term) => term.termEndDate < now || term.termEndDate > end)) return null;
  const [inputs, exits] = await Promise.all([planInputsFor(student), approvedExitExamCourseIdsFor(student)]);
  const validation = validatePlan({ terms: plan.terms, remaining: inputs.remaining,
    placements: plan.placements.map((item) => ({ courseId: String(item.course), termIndex: item.termIndex })),
    creditLimits: creditLimitsFor({ student, terms: plan.terms, gpa: inputs.gpa }), approvedExitExamCourseIds: exits, requireComplete: true });
  return validation.errors.length ? null : { withinOneYear: true, sourceReference: `GraduationPlan:${plan._id}` };
}
async function loadContext(studentId, termId, now = new Date()) {
  const student = await Student.findById(studentId).lean();
  if (!student?.isActive || student.studentType !== 'Advising Student') throw fail('An active advising student is required.', 404);
  const rows = await Schedule.find({ studentId, ...(termId ? { termId } : {}) })
    .populate({ path: 'slotId', populate: { path: 'offeringId', populate: { path: 'courseId' } } }).lean();
  const drafts = rows.filter((row) => ['Draft', 'Active'].includes(row.status));
  const terms = await Term.find({ _id: { $in: [...new Set(drafts.map((row) => String(row.termId)))] } }).sort({ termStartDate: 1 }).lean();
  const term = termId ? terms.find((item) => String(item._id) === String(termId)) : terms.find((item) => item.advisingDeadline >= now) || terms[0];
  if (!term) throw fail('No editable advising draft exists. The draft-building workflow must provide one first.');
  const selected = new Map();
  for (const row of rows.filter((item) => String(item.termId) === String(term._id))) {
    if (row.status === 'Processed') throw fail('A processed schedule must be reopened before requesting extra hours.');
    const offering = row.slotId?.offeringId, course = offering?.courseId;
    if (!course?.isActive || String(offering.termId) !== String(term._id) || offering.publicationStatus !== 'Published') throw fail('The draft contains an unavailable course or offering. Repair it first.');
    selected.set(String(course._id), course);
  }
  const [records, offerings, graduationAssessment] = await Promise.all([
    Record.find({ student: studentId }).populate('course').lean(),
    Offering.find({ termId: term._id, publicationStatus: 'Published' }).populate('courseId').lean(),
    graduationAssessmentFor(student, now),
  ]);
  const passed = new Set(records.filter((row) => row.status === 'Completed' && row.grade && row.grade !== 'F' && row.course).map((row) => String(row.course._id)));
  const courses = new Map();
  for (const offering of offerings) {
    const course = offering.courseId;
    if (!course?.isActive || passed.has(String(course._id))) continue;
    if (course.majors?.length && !course.majors.includes(student.major)) continue;
    if (offering.eligibleMajors?.length && !offering.eligibleMajors.includes(student.major)) continue;
    if (offering.eligibleSemesters?.length && !offering.eligibleSemesters.includes(String(student.currentSemester))) continue;
    if (course.offeringSeasons?.length && !course.offeringSeasons.includes(term.season)) continue;
    if ((course.prerequisites || []).some((id) => !passed.has(String(id)))) continue;
    courses.set(String(course._id), course);
  }
  return { student, term, terms, selectedCourses: [...selected.values()], courses, records, graduationAssessment, deadlinePassed: term.advisingDeadline < now };
}
function evaluateSelection(context, items) {
  if (context.deadlinePassed) throw fail('The advising deadline has passed for this term.');
  const courseRequests = items.map((item) => {
    const course = context.courses.get(item.courseId);
    if (!course) throw fail('A requested course is not eligible or published for this student and term.', 422);
    return { course, requestedHours: item.requestedHours };
  });
  const input = { ...context, courseRequests };
  return { input, quote: evaluateExtraHoursRequest(input) };
}
const fingerprint = ({ studentId, termId, items }) => createHash('sha256').update(JSON.stringify({ studentId, termId,
  items: [...items].sort((a, b) => a.courseId.localeCompare(b.courseId)),
})).digest('hex');
async function submitRequest(advisorId, body) {
  const hash = fingerprint(body), key = { requestingAdvisor: advisorId, submissionKey: body.submissionKey };
  const previous = await Request.findOne(key);
  if (previous) {
    if (previous.submissionFingerprint !== hash) throw fail('This submission key was used for different details.');
    return { request: previous, replay: true };
  }
  const context = await loadContext(body.studentId, body.termId);
  const { input } = evaluateSelection(context, body.items);
  const request = prepareExtraHoursRequest({ ...input, termId: context.term._id, requestingAdvisorId: advisorId });
  request.submissionKey = body.submissionKey;
  request.submissionFingerprint = hash;
  request.history.push({ action: 'Submitted', actor: advisorId });
  try { await request.save(); }
  catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await Request.findOne(key);
    if (!existing || existing.submissionFingerprint !== hash) throw fail('Conflicting submission key.');
    return { request: existing, replay: true };
  }
  return { request, replay: false };
}
module.exports = { loadContext, evaluateSelection, graduationAssessmentFor, submitRequest, fingerprint };

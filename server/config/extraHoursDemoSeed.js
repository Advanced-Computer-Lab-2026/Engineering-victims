const CourseRecord = require('../models/CourseRecord');
const ExtraHoursRequest = require('../models/ExtraHoursRequest');
const { evaluateExtraHoursRequest, prepareExtraHoursRequest } = require('../services/extraHoursService');
const { recommendedSemesterFor } = require('../services/courseSemester');

const DEMO_REQUESTS = [
  { reference: 'EHR-DEMO-001', studentEmail: 'rana.adel@student.guc.edu.eg', decision: 'Rejected' },
  { reference: 'EHR-DEMO-002', studentEmail: 'hana.mahmoud@student.guc.edu.eg', decision: 'Withdrawn' },
  { reference: 'EHR-DEMO-003', studentEmail: 'tamer.lotfy@student.guc.edu.eg', decision: 'Rejected' },
];

const submittedAt = new Date('2026-10-30T10:00:00.000Z');
const decidedAt = new Date('2026-11-02T10:00:00.000Z');

const subsetForHours = (courses, target, requiredCourseHours) => {
  for (const requiredCourse of courses.filter((course) => course.creditHours >= requiredCourseHours)) {
    const remaining = target - requiredCourse.creditHours;
    if (remaining < 0) continue;

    const subsets = Array(target + 1).fill(null);
    subsets[0] = [];
    for (const course of courses) {
      if (String(course._id) === String(requiredCourse._id)) continue;
      for (let hours = target; hours >= course.creditHours; hours -= 1) {
        if (subsets[hours] === null && subsets[hours - course.creditHours] !== null) {
          subsets[hours] = [...subsets[hours - course.creditHours], course];
        }
      }
    }
    if (subsets[remaining] !== null) return [requiredCourse, ...subsets[remaining]];
  }
  return null;
};

/**
 * Builds the request one spec describes: saved-ready, but undecided and with no
 * history beyond "Submitted".
 *
 * Only the display-only requests use this. The payment demo builds its own
 * requests from the students' real drafts (extraHoursPaymentDemoSeed.js), so
 * nothing here has to satisfy the loadContext() re-check that a settlement
 * runs before any money moves.
 */
const buildSpecRequest = ({ spec, student, term, courses, records }) => {
  const baseline = evaluateExtraHoursRequest({ student, records });
  if (!baseline.canReceiveIncrease || baseline.standardHours === null) {
    throw new Error(`The extra-hours demo request requires an eligible student: ${student.email}.`);
  }

  const passedCourses = new Set(
    records
      .filter((record) => record.status === 'Completed' && record.grade && record.grade !== 'F' && record.course)
      .map((record) => String(record.course._id))
  );
  const candidates = courses
    .filter((course) =>
      course.isActive === true &&
      recommendedSemesterFor(course, student.major) >= student.currentSemester &&
      course.majors.includes(student.major) &&
      !passedCourses.has(String(course._id))
    )
    .sort((a, b) => recommendedSemesterFor(a, student.major) - recommendedSemesterFor(b, student.major) || a.code.localeCompare(b.code));

  for (let selectedHours = baseline.maximumTotalHours; selectedHours > baseline.standardHours; selectedHours -= 1) {
    const requestedHours = selectedHours - baseline.standardHours;
    const selectedCourses = subsetForHours(candidates, selectedHours, requestedHours);
    if (!selectedCourses) continue;

    const course = selectedCourses.find((candidate) => candidate.creditHours >= requestedHours);
    const input = {
      student,
      termId: term._id,
      requestingAdvisorId: student.assignedAdvisor,
      selectedCourses,
      courseRequests: [{ course, requestedHours }],
      records,
    };
    const quote = evaluateExtraHoursRequest(input);
    if (!quote.eligible) continue;

    const request = prepareExtraHoursRequest(input);
    request.reference = spec.reference;
    request.history.push({ action: 'Submitted', actor: student.assignedAdvisor, at: submittedAt });
    return request;
  }

  throw new Error(`No valid extra-hours demo course selection exists for ${student.email}.`);
};

const buildDemoRequest = ({ spec, student, term, coordinator, courses, records }) => {
  const request = buildSpecRequest({ spec, student, term, courses, records });
  request.history.push({
    action: 'DemoCreated',
    actor: student.assignedAdvisor,
    note: 'Display-only demo request; not eligible for approval or payment.',
    at: submittedAt,
  });

  if (spec.decision === 'Rejected') {
    const responseNote = 'Demo request declined for display purposes.';
    request.decision = 'Rejected';
    request.responseNote = responseNote;
    request.decidedBy = coordinator._id;
    request.decidedAt = decidedAt;
    request.history.push({ action: 'Rejected', actor: coordinator._id, note: responseNote, at: decidedAt });
  } else {
    request.decision = 'Withdrawn';
    request.history.push({
      action: 'Withdrawn',
      actor: student.assignedAdvisor,
      note: 'Demo request withdrawn for display purposes.',
      at: decidedAt,
    });
  }
  return request;
};

const buildDemoRequests = ({ students, users, terms, courses, records }) => {
  const studentByEmail = new Map(students.map((student) => [student.email, student]));
  const coordinator = users.find((user) => user.role === 'Coordinator');
  const term = [...terms]
    .filter((candidate) => candidate.season === 'Winter')
    .sort((a, b) => new Date(b.termStartDate) - new Date(a.termStartDate))[0];
  if (!coordinator || !term) {
    throw new Error('The extra-hours demo requests require a seeded Coordinator and Winter term.');
  }

  const recordsByStudent = new Map();
  for (const record of records) {
    const key = String(record.student);
    recordsByStudent.set(key, [...(recordsByStudent.get(key) ?? []), record]);
  }

  return DEMO_REQUESTS.map((spec) => {
    const student = studentByEmail.get(spec.studentEmail);
    if (!student?.isActive || student.studentType !== 'Advising Student' || !student.assignedAdvisor) {
      throw new Error(`The extra-hours demo request requires an assigned, active Advising Student: ${spec.studentEmail}.`);
    }
    return buildDemoRequest({
      spec,
      student,
      term,
      coordinator,
      courses,
      records: recordsByStudent.get(String(student._id)) ?? [],
    });
  });
};

const seedExtraHoursRequests = async ({ students, users, terms, courses }) => {
  const targetIds = students
    .filter((student) => DEMO_REQUESTS.some((spec) => spec.studentEmail === student.email))
    .map((student) => student._id);
  const records = await CourseRecord.find({ student: { $in: targetIds } }).populate('course').lean();
  const requests = buildDemoRequests({ students, users, terms, courses, records });
  for (const request of requests) await request.save();
  return requests.length;
};

module.exports = { seedExtraHoursRequests, buildDemoRequests, buildSpecRequest, DEMO_REQUESTS };

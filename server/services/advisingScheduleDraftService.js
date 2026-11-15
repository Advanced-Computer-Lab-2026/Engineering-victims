const CourseOffering = require('../models/CourseOffering');
const CourseRecord = require('../models/CourseRecord');
const { buildMandatoryCandidates } = require('./mandatoryCourseService');

const courseSummary = (course) => ({
  id: String(course._id),
  code: course.code,
  name: course.name,
  creditHours: course.creditHours,
  courseType: course.courseType,
});

const SEASON_INDEX = { Winter: 0, Spring: 1, Summer: 2 };

const termIndex = (term) => {
  const startYear = Number(String(term.academicYear).slice(0, 4));
  const season = SEASON_INDEX[term.season];
  return Number.isInteger(startYear) && season !== undefined ? startYear * 3 + season : null;
};

const progressionSemesterFor = ({ student, term, currentTerm = term }) => {
  if (!Number.isInteger(student.currentSemester) || student.currentSemester < 1) return null;

  const selectedIndex = termIndex(term);
  const currentIndex = termIndex(currentTerm);
  if (selectedIndex === null || currentIndex === null) return student.currentSemester;

  // Winter and Spring advance progression; Summer does not consume a semester.
  let semester = student.currentSemester;
  if (selectedIndex > currentIndex) {
    for (let index = currentIndex + 1; index <= selectedIndex; index += 1) {
      if (index % 3 !== SEASON_INDEX.Summer) semester += 1;
    }
  } else {
    for (let index = currentIndex; index > selectedIndex; index -= 1) {
      if (index % 3 !== SEASON_INDEX.Summer) semester -= 1;
    }
  }

  return semester;
};

/**
 * Other courses an Advising Student may add to this term's draft. Mandatory
 * candidates are selected through their own workflow and cannot be added via
 * the non-mandatory course action.
 */
const eligibleNonMandatoryCourses = async ({ student, term, currentTerm = term, draft }) => {
  const [records, mandatoryCandidates, offerings] = await Promise.all([
    CourseRecord.find({ student: student._id }).select('course status grade').lean(),
    buildMandatoryCandidates(student),
    CourseOffering.find({ termId: term._id, publicationStatus: 'Published' })
      .populate('courseId')
      .lean(),
  ]);

  const passedIds = new Set(
    records
      .filter((record) => record.status === 'Completed' && record.grade !== 'F')
      .map((record) => String(record.course))
  );
  const unavailableIds = new Set(
    records
      .filter((record) => record.status === 'In Progress')
      .map((record) => String(record.course))
  );
  const mandatoryIds = new Set(mandatoryCandidates.map((candidate) => String(candidate.course.id)));
  const selectedIds = new Set((draft?.courses ?? []).map((entry) => String(entry.course)));
  const progressionSemester = progressionSemesterFor({ student, term, currentTerm });

  const offeringByCourse = new Map(
    offerings.filter((offering) => offering.courseId).map((offering) => [String(offering.courseId._id), offering])
  );

  return [...offeringByCourse.values()]
    .map((offering) => offering.courseId)
    .filter((course) => {
      if (!course || course.isActive === false) return false;
      const courseId = String(course._id);
      if (
        passedIds.has(courseId) ||
        unavailableIds.has(courseId) ||
        mandatoryIds.has(courseId) ||
        selectedIds.has(courseId)
      ) {
        return false;
      }
      if (
        progressionSemester === null ||
        progressionSemester < 1 ||
        progressionSemester > 10 ||
        !course.majors?.includes(student.major) ||
        course.recommendedSemester > progressionSemester
      ) {
        return false;
      }
      if (!course.offeringSeasons?.includes(term.season)) return false;
      if (
        course.prerequisites?.some((prerequisite) => !passedIds.has(String(prerequisite)))
      ) {
        return false;
      }

      const offering = offeringByCourse.get(courseId);
      if (offering?.eligibleMajors?.length && !offering.eligibleMajors.includes(student.major)) return false;
      if (
        offering?.eligibleSemesters?.length &&
        !offering.eligibleSemesters.includes(String(progressionSemester))
      ) {
        return false;
      }
      return true;
    })
    .map(courseSummary)
    .sort((a, b) => a.code.localeCompare(b.code));
};

module.exports = { eligibleNonMandatoryCourses, courseSummary, progressionSemesterFor };

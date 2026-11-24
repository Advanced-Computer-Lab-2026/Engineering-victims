/**
 * Req 60: the rules for a draft schedule that includes the bachelor project.
 *
 * Pure functions only (no models), so the draft validator, the controller and
 * the tests all share one definition of "humanities" and of the four-course cap.
 *
 * The project is not a catalogue course: the curriculum sheet gives it no code,
 * credit hours or slots and says only that the 8th semester is by default for
 * it. So it is recorded on the draft as a season, and the rules below govern
 * the courses taken alongside it.
 */

const SEASONS = ['Winter', 'Spring'];

/** "up to four courses with the project: at most two core courses and two humanities". */
const MAX_COURSES = 4;
const MAX_CORE = 2;
const MAX_HUMANITIES = 2;

/** Introduction to Management and Project Management. German is matched by prefix. */
const HUMANITIES_CODES = new Set(['MNGT 601', 'HUMA 1001']);

/**
 * The humanities of req 60: German courses, Seminar, Introduction to
 * Management and Project Management. Seminar has no course code in the
 * curriculum sheet, so it is recognised by its name.
 *
 * The English courses are typed Huma in the catalogue but are not on that
 * list, so they are deliberately not humanities here.
 */
const isHumanities = (course) => {
  const code = String(course?.code ?? '').trim();
  const name = String(course?.name ?? '').trim();
  return /^DE \d+$/.test(code) || HUMANITIES_CODES.has(code) || /^seminar$/i.test(name);
};

const HUMANITIES = 'Humanities';
const CORE = 'Core';
const OTHER = 'Other';

const classifyCourse = (course) => {
  if (isHumanities(course)) return HUMANITIES;
  return course?.courseType === 'Core' ? CORE : OTHER;
};

const isValidSeason = (season) => SEASONS.includes(season);

const sumHours = (courses) => courses.reduce((total, course) => total + (Number(course?.creditHours) || 0), 0);

/**
 * Checks the courses a student takes with the project against the cap.
 * Returns plain-language issues; an empty list means the set is allowed.
 * `courses` are course documents (not draft entries).
 */
const projectCourseIssues = (courses) => {
  const counts = { [CORE]: 0, [HUMANITIES]: 0, [OTHER]: 0 };
  courses.forEach((course) => {
    counts[classifyCourse(course)] += 1;
  });

  const issues = [];
  if (counts[OTHER] > 0) {
    issues.push(
      'With the bachelor project a student may take only core courses and humanities (German, Seminar, Introduction to Management, Project Management).'
    );
  }
  if (counts[CORE] > MAX_CORE) {
    issues.push(`With the bachelor project a student may take at most ${MAX_CORE} core courses.`);
  }
  if (counts[HUMANITIES] > MAX_HUMANITIES) {
    issues.push(`With the bachelor project a student may take at most ${MAX_HUMANITIES} humanities courses.`);
  }
  if (courses.length > MAX_COURSES) {
    issues.push(`With the bachelor project a student may take at most ${MAX_COURSES} courses.`);
  }
  return issues;
};

/**
 * Credit hours for a draft with the project. Humanities are treated as extra
 * hours however much of the allowance is unused, so they are counted apart:
 * the other courses use the allowance, and humanities (plus any overflow of
 * the others) must be covered by approved extra hours.
 */
const projectHours = ({ courses, allowedHours }) => {
  const humanities = courses.filter(isHumanities);
  const others = courses.filter((course) => !isHumanities(course));
  const humanitiesHours = sumHours(humanities);
  const otherHours = sumHours(others);
  return {
    humanitiesHours,
    otherHours,
    extraHours: humanitiesHours + Math.max(0, otherHours - allowedHours),
  };
};

module.exports = {
  SEASONS,
  MAX_COURSES,
  MAX_CORE,
  MAX_HUMANITIES,
  isHumanities,
  classifyCourse,
  isValidSeason,
  projectCourseIssues,
  projectHours,
};

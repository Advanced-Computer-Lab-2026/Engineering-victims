const CourseRecord = require('../models/CourseRecord');

/**
 * Req 54 demo academic histories.
 *
 * The evaluation database list has no grades or completed courses, and the
 * database cannot be edited during evaluation, so every Advising Student gets
 * a history generated from their own directory record:
 *
 * - every non-elective course of their major from an earlier semester is
 *   Completed, in the term that semester fell in;
 * - every course of their current semester is In Progress this term;
 * - grades follow academic standing, so a Probation student's GPA is visibly
 *   weaker than a Good Standing one's, and each Probation student has one
 *   failed course that shows up again under remaining courses.
 *
 * Grades are picked by a fixed hash of student ID and course code, so the data
 * is identical on every seed run. Dina Mostafa (semester 1) has nothing graded
 * yet, and the semester-8 students (bachelor project) have no current courses,
 * so both of those empty states have real accounts.
 */
const CURRENT_TERM = { startYear: 2026, season: 'Winter' };

const GRADE_POOLS = {
  'Good Standing': ['A+', 'A', 'A-', 'B+', 'B', 'A', 'B+', 'A-', 'B-', 'B'],
  Probation: ['C', 'C-', 'D+', 'C+', 'D', 'C-', 'D+', 'C', 'B-', 'D'],
  Dismissed: ['D', 'D+', 'F', 'C-', 'D'],
};

const hash = (text) => [...text].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);

/** "2026/2027 Winter" is `back` = 0; each step back alternates Spring and Winter. */
const termLabel = (back) => {
  let { startYear, season } = CURRENT_TERM;
  for (let step = 0; step < back; step += 1) {
    if (season === 'Winter') {
      season = 'Spring';
      startYear -= 1;
    } else {
      season = 'Winter';
    }
  }
  return `${startYear}/${startYear + 1} ${season}`;
};

/**
 * How many terms back each finished semester was taken. The catalogue offers
 * odd semesters in Winter and even ones in Spring, so each semester is placed
 * in the nearest earlier term of its own season. A student whose current
 * semester does not match the current term's season therefore has one gap term,
 * rather than a Winter course recorded in a Spring term.
 */
const termsBackBySemester = (currentSemester) => {
  const result = new Map();
  let back = 0;
  for (let semester = currentSemester - 1; semester >= 1; semester -= 1) {
    const season = semester % 2 === 1 ? 'Winter' : 'Spring';
    back += 1;
    while (!termLabel(back).endsWith(season)) back += 1;
    result.set(semester, back);
  }
  return result;
};

const gradeFor = (student, course) => {
  const pool = GRADE_POOLS[student.academicStanding] ?? GRADE_POOLS['Good Standing'];
  return pool[hash(`${student.studentId}|${course.code}`) % pool.length];
};

/** Rebuilds every Advising Student's course records. Returns the number of rows. */
const seedAcademicHistory = async ({ students, courses }) => {
  await CourseRecord.deleteMany({});

  const rows = [];

  students
    .filter((student) => student.studentType === 'Advising Student')
    .forEach((student) => {
      const ownCourses = courses.filter(
        (course) =>
          course.courseType !== 'Elective' &&
          course.majors.includes(student.major) &&
          course.recommendedSemester <= student.currentSemester
      );

      const completed = ownCourses.filter((course) => course.recommendedSemester < student.currentSemester);
      const current = ownCourses.filter((course) => course.recommendedSemester === student.currentSemester);

      // The failed course: the first core course of the latest finished semester.
      const failed =
        student.academicStanding === 'Probation'
          ? completed
              .filter((course) => course.courseType === 'Core')
              .sort((a, b) => b.recommendedSemester - a.recommendedSemester || a.code.localeCompare(b.code))[0]
          : null;

      const termsBack = termsBackBySemester(student.currentSemester);

      completed.forEach((course) => {
        rows.push({
          student: student._id,
          course: course._id,
          status: 'Completed',
          grade: failed && String(failed._id) === String(course._id) ? 'F' : gradeFor(student, course),
          term: termLabel(termsBack.get(course.recommendedSemester)),
          semester: course.recommendedSemester,
        });
      });

      current.forEach((course) => {
        rows.push({
          student: student._id,
          course: course._id,
          status: 'In Progress',
          grade: null,
          term: termLabel(0),
          semester: student.currentSemester,
        });
      });
    });

  await CourseRecord.insertMany(rows);
  return rows.length;
};

module.exports = { seedAcademicHistory, termLabel };

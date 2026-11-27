/** Resolve a course's curriculum semester for the student's major. */
const recommendedSemesterFor = (course, major) => {
  const specific = (course?.recommendedSemesterByMajor ?? []).find((entry) => entry.major === major);
  return Number.isInteger(specific?.semester) ? specific.semester : course?.recommendedSemester;
};

module.exports = { recommendedSemesterFor };

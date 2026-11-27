const { COURSES } = require('../config/courseCatalogue');
const { STUDENTS } = require('../config/seedData');
const { recommendedSemesterFor } = require('../services/courseSemester');

describe('curriculum semester data', () => {
  it('keeps DMET 502 in semester 5 for DMET and semester 7 for Computer Science', () => {
    const course = COURSES.find((entry) => entry.code === 'DMET 502');
    expect(course).toBeDefined();
    expect(recommendedSemesterFor(course, 'DMET')).toBe(5);
    expect(recommendedSemesterFor(course, 'Computer Science')).toBe(7);
  });

  it('gives every advising student a semester-style study group matching their semester', () => {
    const advisingStudents = STUDENTS.filter((student) => student.studentType === 'Advising Student');
    expect(advisingStudents.length).toBeGreaterThanOrEqual(10);
    advisingStudents.forEach((student) => {
      expect(student.studyGroup).toMatch(new RegExp(`^${student.currentSemester}(st|nd|rd|th) Semester$`));
    });
  });
});

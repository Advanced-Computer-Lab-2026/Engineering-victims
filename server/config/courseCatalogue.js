/**
 * The MET and DMET curriculum from the requirements workbook, plus the ten
 * electives the evaluation database needs.
 *
 * Choices the sheet leaves open:
 * - Credit hours are the sheet's total weekly hours.
 * - Odd semesters are offered in Winter, even semesters in Spring.
 * - Courses listed outside a "For CSEN/DMET Major" block are shared by both
 *   majors. DMET 502 appears twice (DMET semester 5, CSEN semester 7); it is
 *   stored once, for both majors, at semester 5.
 * - The "Elective I/II" and "Seminar" rows have no course code, so they are not
 *   courses. The ten electives below are demo entries in their place.
 * - The sheet's "DMET603" prerequisite typo is written as DMET 603.
 */

const BOTH = ['Computer Science', 'DMET'];
const CS = ['Computer Science'];
const DMET = ['DMET'];

// [code, name, lecture, tutorial, lab, semester, majors, prerequisites, type?]
const CURRICULUM = [
  // 1st semester
  ['CSEN 102', 'Introduction to Computer Science', 2, 2, 2, 1, BOTH, []],
  ['MATH 103', 'Maths', 4, 4, 0, 1, BOTH, []],
  ['CHEMp 102', 'Chemistry (p)', 0, 0, 2, 1, BOTH, []],
  ['CHEMt 102', 'Chemistry (t)', 2, 2, 0, 1, BOTH, []],
  ['PHYS 101', 'Physics', 3, 2, 0, 1, BOTH, []],
  ['EDPT 201', 'Production Technology', 1, 2, 0, 1, BOTH, []],
  // 2nd semester
  ['MATH 203', 'Mathematics I', 4, 4, 0, 2, BOTH, ['MATH 103']],
  ['PHYS 202', 'Physics II', 3, 2, 0, 2, BOTH, ['PHYS 101']],
  ['CSEN 202', 'Introduction to Computer Programming', 2, 2, 2, 2, BOTH, ['CSEN 102']],
  ['ENGD 301', 'Engineering Drawing & Design', 1, 2, 0, 2, BOTH, []],
  ['ELCT 201', 'Digital Logic Design', 2, 2, 0, 2, BOTH, []],
  // 3rd semester
  ['MATH 301', 'Mathematics III', 4, 4, 0, 3, BOTH, ['MATH 103', 'MATH 203']],
  ['PHYSp 301', 'Physics III (p)', 0, 0, 2, 3, BOTH, []],
  ['PHYSt 301', 'Physics III (t)', 3, 2, 0, 3, BOTH, ['PHYS 101', 'PHYS 202']],
  ['ELCT 301', 'Electric Circuits I', 2, 2, 2, 3, BOTH, []],
  ['CSEN 301', 'Data Structures and Algorithms', 2, 2, 2, 3, BOTH, ['CSEN 102', 'CSEN 202']],
  // 4th semester
  ['MATH 401', 'Mathematics IV Probability and Statistics', 2, 2, 0, 4, BOTH, ['MATH 103', 'MATH 203', 'MATH 301']],
  ['CSEN 403', 'Concepts of Programming Languages', 2, 2, 0, 4, BOTH, ['CSEN 202']],
  ['CSIS 402', 'Computer Organization and System Programming', 2, 2, 0, 4, BOTH, ['ELCT 201']],
  ['CSEN 401', 'Computer Programming Lab', 2, 0, 2, 4, BOTH, ['CSEN 202', 'CSEN 301']],
  ['ELCT 401', 'Electric Circuits II', 2, 2, 2, 4, BOTH, ['ELCT 301']],
  ['COMM 401', 'Signal and System Theory', 2, 2, 2, 4, BOTH, ['MATH 103']],
  // 5th semester
  ['MATH 501', 'Mathematics V (Discrete Math)', 2, 2, 0, 5, BOTH, []],
  ['DMET 501', 'Introduction to Media Engineering', 2, 2, 0, 5, BOTH, ['CSEN 202']],
  ['CSEN 501', 'Data Base I', 2, 2, 2, 5, BOTH, []],
  ['CSEN 503', 'Introduction to Communication Networks', 2, 2, 0, 5, BOTH, ['CSEN 301']],
  ['CSEN 605', 'Digital System Design', 2, 2, 0, 5, BOTH, []],
  ['CSEN 502', 'Theory of Computation', 4, 2, 0, 5, CS, ['CSEN 202']],
  ['DMET 502', 'Computer Graphics', 2, 2, 2, 5, BOTH, ['CSEN 202', 'CSEN 301']],
  // 6th semester
  ['CSEN 601', 'Computer System Architecture', 2, 2, 2, 6, BOTH, ['ELCT 201', 'CSIS 402']],
  ['CSEN 602', 'Operating Systems', 2, 2, 0, 6, BOTH, ['CSEN 301']],
  ['MNGT 601', 'Introduction to Management', 2, 0, 0, 6, BOTH, []],
  ['DMET 602', 'Network and Media Lab', 2, 0, 2, 6, BOTH, ['CSEN 503']],
  ['CSEN 603', 'Software Engineering', 2, 0, 2, 6, CS, []],
  ['CSEN 604', 'Data Bases II', 2, 0, 2, 6, CS, ['CSEN 501']],
  ['DMET 601', 'Web Technologies and Usability', 2, 0, 2, 6, DMET, ['CSEN 202']],
  ['DMET 603', 'Digital Signal Processing', 2, 2, 0, 6, DMET, ['COMM 401']],
  // 7th semester
  ['CSEN 701', 'Embedded System Architecture', 3, 2, 0, 7, BOTH, []],
  ['CSEN 703', 'Analysis and Design of Algorithms', 2, 2, 0, 7, CS, []],
  ['CSEN 702', 'Microprocessors', 3, 2, 0, 7, CS, ['CSEN 601']],
  ['CSEN 704', 'Advanced Computer Lab', 0, 0, 4, 7, CS, []],
  ['DMET 702', 'Visualization and Animation', 3, 2, 2, 7, DMET, ['CSEN 202', 'CSEN 301', 'DMET 502']],
  ['DMET 703', 'Video and Audio Technology', 2, 2, 0, 7, DMET, ['DMET 603']],
  ['DMET 704', 'Multimedia & Networking', 2, 2, 0, 7, DMET, ['CSEN 503']],
  ['DMET 706', 'Advanced Media Lab', 0, 0, 4, 7, DMET, []],
  // 9th semester (the 8th is the bachelor project)
  ['DMET 901', 'Computer Vision', 2, 2, 0, 9, BOTH, ['DMET 502']],
  ['CSEN 901', 'Artificial Intelligence', 2, 2, 0, 9, CS, ['CSEN 301']],
  ['CSEN 903', 'Advanced Computer Lab', 0, 0, 4, 9, CS, []],
  ['DMET 902', 'Advanced Video Processing', 2, 2, 0, 9, DMET, ['DMET 603', 'DMET 703']],
  ['DMET 904', 'Advanced Media Lab', 0, 0, 4, 9, DMET, []],
  // 10th semester
  ['HUMA 1001', 'Project Management', 2, 2, 0, 10, BOTH, [], 'Huma'],
  ['CSEN 1001', 'Computer and Network Security', 2, 2, 0, 10, CS, []],
  ['CSEN 1002', 'Advanced Computer Lab', 0, 0, 4, 10, CS, []],
  ['CSEN 1003', 'Compiler', 2, 2, 0, 10, CS, ['CSEN 502']],
  ['DMET 1001', 'Image Processing', 2, 2, 0, 10, DMET, ['DMET 603']],
  ['DMET 1002', 'Advanced Media Lab', 0, 0, 4, 10, DMET, []],
  ['DMET 1003', 'Audio and Acoustics', 2, 2, 0, 10, DMET, ['DMET 603', 'COMM 401']],
  // English and German (usually taken in semesters 1-4)
  ['AS 102', 'English for Academic Purposes', 2, 0, 0, 1, BOTH, [], 'Huma'],
  ['SM 101', 'Scientific Methods', 2, 0, 0, 1, BOTH, [], 'Huma'],
  ['RPW 401', 'Research Paper Writing', 2, 0, 0, 3, BOTH, [], 'Huma'],
  ['CPS 402', 'Communication and Presentation Skills', 2, 0, 0, 4, BOTH, [], 'Huma'],
  ['DE 101', 'German 1', 4, 0, 0, 1, BOTH, [], 'Huma'],
  ['DE 202', 'German 2', 4, 0, 0, 2, BOTH, [], 'Huma'],
  ['DE 303', 'German 3', 4, 0, 0, 3, BOTH, [], 'Huma'],
  ['DE 404', 'German 4', 4, 0, 0, 4, BOTH, [], 'Huma'],
];

// Demo electives, offered to both majors in the 9th and 10th semesters.
const ELECTIVES = [
  ['CSEN 905', 'Machine Learning', ['MATH 401']],
  ['CSEN 907', 'Cloud Computing', ['CSEN 602']],
  ['CSEN 909', 'Distributed Systems', ['CSEN 503', 'CSEN 602']],
  ['CSEN 911', 'Natural Language Processing', ['CSEN 901']],
  ['CSEN 913', 'Blockchain Technologies', []],
  ['CSEN 915', 'Mobile Application Development', ['CSEN 202']],
  ['DMET 905', 'Augmented and Virtual Reality', ['DMET 502']],
  ['DMET 907', 'Game Development', ['DMET 502']],
  ['DMET 909', 'Human-Computer Interaction', []],
  ['DMET 911', 'Deep Learning for Media', ['DMET 901']],
];

const seasonFor = (semester) => (semester % 2 === 1 ? ['Winter'] : ['Spring']);

const COURSES = [
  ...CURRICULUM.map(([code, name, lectureHours, tutorialHours, labHours, semester, majors, prerequisites, type]) => ({
    code,
    name,
    lectureHours,
    tutorialHours,
    labHours,
    creditHours: lectureHours + tutorialHours + labHours,
    courseType: type ?? 'Core',
    faculty: 'MET',
    majors,
    recommendedSemester: semester,
    offeringSeasons: seasonFor(semester),
    prerequisites,
  })),
  ...ELECTIVES.map(([code, name, prerequisites]) => ({
    code,
    name,
    lectureHours: 2,
    tutorialHours: 2,
    labHours: 0,
    creditHours: 4,
    courseType: 'Elective',
    faculty: 'MET',
    majors: BOTH,
    recommendedSemester: 9,
    offeringSeasons: ['Winter', 'Spring'],
    prerequisites,
  })),
];

module.exports = { COURSES };

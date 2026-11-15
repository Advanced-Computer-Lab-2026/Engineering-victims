jest.mock('../models/CourseOffering', () => ({ find: jest.fn() }));
jest.mock('../models/CourseRecord', () => ({ find: jest.fn() }));
jest.mock('../services/mandatoryCourseService', () => ({ buildMandatoryCandidates: jest.fn() }));

const mongoose = require('mongoose');
const CourseOffering = require('../models/CourseOffering');
const CourseRecord = require('../models/CourseRecord');
const { buildMandatoryCandidates } = require('../services/mandatoryCourseService');
const {
  eligibleNonMandatoryCourses,
  progressionSemesterFor,
} = require('../services/advisingScheduleDraftService');

const oid = () => new mongoose.Types.ObjectId();

const makeCourse = (overrides = {}) => ({
  _id: oid(),
  code: 'CSEN 101',
  name: 'Intro to CS',
  creditHours: 6,
  courseType: 'Core',
  majors: ['Computer Science'],
  recommendedSemester: 1,
  offeringSeasons: ['Winter'],
  prerequisites: [],
  ...overrides,
});

const queryWith = (result) => ({
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(result),
});

describe('eligibleNonMandatoryCourses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only offers published, uncompleted, non-mandatory courses for the student and term', async () => {
    const mandatory = makeCourse({ code: 'CSEN 201' });
    const passed = makeCourse({ code: 'CSEN 202' });
    const inProgress = makeCourse({ code: 'CSEN 203' });
    const wrongMajor = makeCourse({ code: 'DMET 101', majors: ['DMET'] });
    const future = makeCourse({ code: 'CSEN 301', recommendedSemester: 4 });
    const wrongSeason = makeCourse({ code: 'CSEN 204', offeringSeasons: ['Spring'] });
    const unmetPrerequisite = makeCourse({ code: 'CSEN 205', prerequisites: [oid()] });
    const semesterRestricted = makeCourse({ code: 'CSEN 206' });
    const valid = makeCourse({ code: 'CSEN 102' });
    const student = { _id: oid(), major: 'Computer Science', currentSemester: 2 };
    const term = { _id: oid(), season: 'Winter' };

    CourseRecord.find.mockReturnValue(
      queryWith([
        { course: passed._id, status: 'Completed', grade: 'B' },
        { course: inProgress._id, status: 'In Progress', grade: null },
      ])
    );
    CourseOffering.find.mockReturnValue(
      queryWith([
        { courseId: mandatory },
        { courseId: passed },
        { courseId: inProgress },
        { courseId: wrongMajor },
        { courseId: future },
        { courseId: wrongSeason },
        { courseId: unmetPrerequisite },
        { courseId: semesterRestricted, eligibleSemesters: ['3'] },
        { courseId: valid, eligibleMajors: ['Computer Science'], eligibleSemesters: ['2'] },
      ])
    );
    buildMandatoryCandidates.mockResolvedValue([{ course: { id: mandatory._id } }]);

    const eligible = await eligibleNonMandatoryCourses({ student, term, draft: null });

    expect(eligible).toEqual([
      {
        id: String(valid._id),
        code: valid.code,
        name: valid.name,
        creditHours: valid.creditHours,
        courseType: valid.courseType,
      },
    ]);
    expect(CourseOffering.find).toHaveBeenCalledWith({ termId: term._id, publicationStatus: 'Published' });
  });

  it('omits courses already selected in the saved draft', async () => {
    const course = makeCourse();
    CourseRecord.find.mockReturnValue(queryWith([]));
    CourseOffering.find.mockReturnValue(queryWith([{ courseId: course }]));
    buildMandatoryCandidates.mockResolvedValue([]);

    const eligible = await eligibleNonMandatoryCourses({
      student: { _id: oid(), major: 'Computer Science', currentSemester: 1 },
      term: { _id: oid(), season: 'Winter' },
      draft: { courses: [{ course: course._id }] },
    });

    expect(eligible).toEqual([]);
  });

  it('requires every prerequisite to have been passed', async () => {
    const prerequisite = oid();
    const course = makeCourse({ prerequisites: [prerequisite] });
    CourseRecord.find.mockReturnValue(
      queryWith([{ course: prerequisite, status: 'Completed', grade: 'F' }])
    );
    CourseOffering.find.mockReturnValue(queryWith([{ courseId: course }]));
    buildMandatoryCandidates.mockResolvedValue([]);

    const eligible = await eligibleNonMandatoryCourses({
      student: { _id: oid(), major: 'Computer Science', currentSemester: 1 },
      term: { _id: oid(), season: 'Winter' },
      draft: null,
    });

    expect(eligible).toEqual([]);
  });

  it('uses the selected term semester progression while enforcing prerequisites and seasons', async () => {
    const prerequisite = makeCourse({ code: 'CSEN 102' });
    const nextSemesterCourse = makeCourse({
      code: 'ELCT 201',
      recommendedSemester: 2,
      offeringSeasons: ['Spring'],
    });
    const unmetPrerequisite = makeCourse({
      code: 'MATH 203',
      recommendedSemester: 2,
      offeringSeasons: ['Spring'],
      prerequisites: [prerequisite._id],
    });
    const futureCourse = makeCourse({
      code: 'CSEN 301',
      recommendedSemester: 3,
      offeringSeasons: ['Spring'],
    });
    const wrongSeason = makeCourse({
      code: 'CSEN 202',
      recommendedSemester: 2,
      offeringSeasons: ['Winter'],
    });
    const student = { _id: oid(), major: 'Computer Science', currentSemester: 1 };
    const currentTerm = { _id: oid(), academicYear: '2026/2027', season: 'Winter' };
    const term = { _id: oid(), academicYear: '2026/2027', season: 'Spring' };

    CourseRecord.find.mockReturnValue(
      queryWith([{ course: prerequisite._id, status: 'In Progress', grade: null }])
    );
    CourseOffering.find.mockReturnValue(
      queryWith([
        { courseId: nextSemesterCourse, eligibleSemesters: ['2'] },
        { courseId: unmetPrerequisite, eligibleSemesters: ['2'] },
        { courseId: futureCourse, eligibleSemesters: ['2', '3'] },
        { courseId: wrongSeason, eligibleSemesters: ['2'] },
      ])
    );
    buildMandatoryCandidates.mockResolvedValue([]);

    const eligible = await eligibleNonMandatoryCourses({ student, term, currentTerm, draft: null });

    expect(eligible.map((course) => course.code)).toEqual(['ELCT 201']);
    expect(progressionSemesterFor({ student, term, currentTerm })).toBe(2);
  });
});

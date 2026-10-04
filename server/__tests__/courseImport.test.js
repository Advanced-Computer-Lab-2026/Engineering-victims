/**
 * Req 128: course CSV import.
 *
 * The routes run in a small Express app with the real auth middleware and
 * controller. Course's database calls are stubbed, so the tests need no
 * MongoDB and can assert exactly what would have been written.
 */
process.env.JWT_SECRET = 'course-import-test-secret';

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const Course = require('../models/Course');
const courseRoutes = require('../routes/courseRoutes');
const { parseCsv } = require('../utils/csv');

const app = express();
app.use(express.json());
app.use('/api/courses', courseRoutes);

const tokenFor = (role) => jwt.sign({ userId: new mongoose.Types.ObjectId().toString(), role }, process.env.JWT_SECRET);
const ADMIN = `Bearer ${tokenFor('Administrator')}`;

const HEADER =
  'code,name,creditHours,lectureHours,tutorialHours,labHours,courseType,faculty,majors,recommendedSemester,offeringSeasons,prerequisites';
const csv = (...rows) => [HEADER, ...rows].join('\n');

const ids = {
  csen102: new mongoose.Types.ObjectId(),
  csen202: new mongoose.Types.ObjectId(),
  old101: new mongoose.Types.ObjectId(),
};

const catalogueCourse = (overrides) => ({
  name: 'Course',
  creditHours: 6,
  lectureHours: 2,
  tutorialHours: 2,
  labHours: 2,
  courseType: 'Core',
  faculty: 'MET',
  majors: ['Computer Science', 'DMET'],
  recommendedSemester: 1,
  offeringSeasons: ['Winter'],
  prerequisites: [],
  isActive: true,
  ...overrides,
});

const CATALOGUE = [
  catalogueCourse({ _id: ids.csen102, code: 'CSEN 102', name: 'Introduction to Computer Science' }),
  catalogueCourse({
    _id: ids.csen202,
    code: 'CSEN 202',
    name: 'Introduction to Computer Programming',
    recommendedSemester: 2,
    offeringSeasons: ['Spring'],
    prerequisites: [ids.csen102],
  }),
  // Soft-deleted (req 21): still holds its code in the unique index.
  catalogueCourse({ _id: ids.old101, code: 'OLD 101', name: 'Retired Course', isActive: false }),
];

let bulkWrite;
let deleteMany;
let replaceOne;

beforeEach(() => {
  jest.spyOn(Course, 'find').mockReturnValue({
    lean: () => Promise.resolve(CATALOGUE.map((course) => ({ ...course }))),
  });
  bulkWrite = jest.spyOn(Course, 'bulkWrite').mockResolvedValue({});
  deleteMany = jest.spyOn(Course, 'deleteMany').mockResolvedValue({});
  replaceOne = jest.spyOn(Course, 'replaceOne').mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

const importCsv = (text, auth = ADMIN) => {
  const req = request(app).post('/api/courses/import').send({ csv: text });
  return auth ? req.set('Authorization', auth) : req;
};

const errorFor = (body, row) => body.errors.find((error) => error.row === row);

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF and a byte-order mark', () => {
    const records = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(records).toEqual([
      { line: 1, fields: ['a', 'b'] },
      { line: 2, fields: ['x, y', 'say "hi"'] },
    ]);
  });

  it('reports the starting line of a record whose quoted field spans lines', () => {
    const records = parseCsv('a,b\n"multi\nline",1\nc,2');
    expect(records.map((record) => record.line)).toEqual([1, 2, 4]);
  });

  it('rejects a quote that is never closed', () => {
    expect(() => parseCsv('a,b\n"open,1')).toThrow(/never closed/);
  });
});

describe('POST /api/courses/import — access', () => {
  it('requires a session', async () => {
    const res = await importCsv(csv(), null);
    expect(res.status).toBe(401);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it.each(['Student', 'Advisor', 'Coordinator'])('refuses the %s role', async (role) => {
    const res = await importCsv(csv('CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,'), `Bearer ${tokenFor(role)}`);
    expect(res.status).toBe(403);
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});

describe('POST /api/courses/import — successful imports', () => {
  it('creates new codes and updates existing ones in a single write', async () => {
    const res = await importCsv(
      csv(
        // Lower-case code matches the existing CSEN 102 rather than duplicating it.
        'csen 102,Intro to CS (revised),6,2,2,2,core,MET,Computer Science,1,winter;spring,',
        // Prerequisite defined later in the same file.
        'CSEN 401,Algorithms,6,2,2,2,Core,MET,Both,4,Spring,CSEN 301',
        'CSEN 301,Data Structures and Algorithms,6,2,2,2,Core,MET,Computer Science; DMET,3,Winter,CSEN 102;csen202'
      )
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, updated: 1 });
    expect(res.body.message).toMatch(/2 created, 1 updated/);
    expect(bulkWrite).toHaveBeenCalledTimes(1);

    const [operations] = bulkWrite.mock.calls[0];
    expect(operations).toHaveLength(3);

    const update = operations[0].updateOne;
    expect(update.filter._id).toEqual(ids.csen102);
    expect(update.update.$set).toMatchObject({
      name: 'Intro to CS (revised)',
      courseType: 'Core',
      isActive: true,
    });
    expect([...update.update.$set.majors]).toEqual(['Computer Science']);
    expect([...update.update.$set.offeringSeasons]).toEqual(['Winter', 'Spring']);
    expect(update.update.$set).not.toHaveProperty('code');

    const algorithms = operations[1].insertOne.document;
    const dataStructures = operations[2].insertOne.document;
    expect(algorithms).toMatchObject({ code: 'CSEN 401', creditHours: 6, recommendedSemester: 4 });
    expect(algorithms.majors).toEqual(['Computer Science', 'DMET']);
    expect(algorithms.prerequisites.map(String)).toEqual([String(dataStructures._id)]);
    expect(dataStructures.prerequisites.map(String)).toEqual([String(ids.csen102), String(ids.csen202)]);
  });

  it('brings back a soft-deleted course instead of creating a duplicate', async () => {
    const res = await importCsv(csv('OLD 101,Retired Course,4,2,2,0,Elective,MET,DMET,5,Winter,'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 0, updated: 1 });
    const [operations] = bulkWrite.mock.calls[0];
    expect(operations[0].updateOne.filter._id).toEqual(ids.old101);
    expect(operations[0].updateOne.update.$set.isActive).toBe(true);
  });

  it('accepts files without the optional contact-hour columns and with spreadsheet-style headers', async () => {
    const res = await importCsv(
      [
        'Course Code,Course Name,Credit Hours,Course Type,Faculty,Major,Recommended Semester,Offering Season,Prerequisites',
        '"MATH 501","Linear Algebra, Advanced",4,Core,MET,Both,5,Winter,',
      ].join('\r\n')
    );

    expect(res.status).toBe(200);
    const [operations] = bulkWrite.mock.calls[0];
    expect(operations[0].insertOne.document).toMatchObject({ name: 'Linear Algebra, Advanced', lectureHours: 0 });
  });
});

describe('POST /api/courses/import — nothing is written when the file is invalid', () => {
  afterEach(() => {
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('reports missing required columns', async () => {
    const res = await importCsv('code,name,creditHours\nCSEN 301,Data Structures,6');
    expect(res.status).toBe(422);
    expect(res.body.errors[0].row).toBe(1);
    expect(res.body.errors[0].messages[0]).toMatch(
      /Missing required columns: Course type, Faculty, Majors, Recommended semester, Offering seasons, Prerequisites/
    );
  });

  it('reports unknown and repeated columns', async () => {
    const res = await importCsv(`${HEADER},prereqs,code\nCSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,,,`);
    expect(res.status).toBe(422);
    expect(res.body.errors[0].messages).toEqual(
      expect.arrayContaining(['"prereqs" is not a known column.', 'The Course code column appears more than once.'])
    );
  });

  it('refuses an empty file and a header with no rows', async () => {
    expect((await importCsv('')).status).toBe(422);
    const res = await importCsv(`${HEADER}\n\n`);
    expect(res.status).toBe(422);
    expect(res.body.errors[0].messages[0]).toMatch(/no course rows/);
  });

  it('rejects the whole file when a single row is invalid, with errors per row', async () => {
    const res = await importCsv(
      csv(
        'CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,',
        'CSEN 302,,abc,2,2,2,Mandatory,MET,Physics,11,Autumn,',
        'CSEN 303,Networks,6,2,2,2,Elective,,Both,3,Winter,'
      )
    );

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/2 rows have errors\. Nothing was imported/);
    expect(errorFor(res.body, 2)).toBeUndefined();

    const bad = errorFor(res.body, 3);
    expect(bad.code).toBe('CSEN 302');
    expect(bad.messages).toEqual(
      expect.arrayContaining([
        'Course name is required.',
        'Credit hours has an invalid value.',
        'Course type must be Core, Elective or Huma.',
        'Major must be Computer Science or DMET.',
        'Recommended semester must be between 1 and 10.',
        'Season must be Winter, Spring or Summer.',
      ])
    );
    expect(errorFor(res.body, 4).messages).toContain('Faculty is required.');
  });

  it('rejects malformed codes and non-integer hours using the course rules', async () => {
    const res = await importCsv(csv('CS-301,Data Structures,6.5,2,2,2,Core,MET,Both,3,Winter,'));
    expect(res.status).toBe(422);
    expect(errorFor(res.body, 2).messages).toEqual(
      expect.arrayContaining(['Course code should look like CSEN 501.', 'Credit hours must be a whole number.'])
    );
  });

  it('rejects the same code twice in one file', async () => {
    const res = await importCsv(
      csv('CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,', 'csen301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,')
    );
    expect(res.status).toBe(422);
    expect(errorFor(res.body, 3).messages).toContain('CSEN 301 is already listed on row 2.');
  });

  it('rejects prerequisites that are unknown or only exist as deleted courses', async () => {
    const res = await importCsv(csv('CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,CSEN 999;OLD 101'));
    expect(res.status).toBe(422);
    expect(errorFor(res.body, 2).messages).toEqual([
      'Prerequisite CSEN 999 is not in the catalogue or in this file.',
      'Prerequisite OLD 101 is not in the catalogue or in this file.',
    ]);
  });

  it('rejects a course listed as its own prerequisite', async () => {
    const res = await importCsv(csv('CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,CSEN 301'));
    expect(res.status).toBe(422);
    expect(errorFor(res.body, 2).messages).toContain('A course cannot be its own prerequisite.');
  });

  it('rejects a prerequisite loop between rows of the file', async () => {
    const res = await importCsv(
      csv(
        'CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,CSEN 401',
        'CSEN 401,Algorithms,6,2,2,2,Core,MET,Both,4,Spring,CSEN 301'
      )
    );
    expect(res.status).toBe(422);
    expect(errorFor(res.body, 2).messages[0]).toMatch(/CSEN 401 cannot be a prerequisite because it already requires CSEN 301/);
    expect(errorFor(res.body, 3).messages[0]).toMatch(/CSEN 301 cannot be a prerequisite because it already requires CSEN 401/);
  });

  it('rejects a loop with a course already in the catalogue', async () => {
    // CSEN 202 already requires CSEN 102.
    const res = await importCsv(csv('CSEN 102,Introduction to Computer Science,6,2,2,2,Core,MET,Both,1,Winter,CSEN 202'));
    expect(res.status).toBe(422);
    expect(errorFor(res.body, 2).messages[0]).toMatch(/CSEN 202 cannot be a prerequisite/);
  });

  it('rejects rows with more values than columns', async () => {
    const res = await importCsv(csv('CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,,surprise'));
    expect(res.status).toBe(422);
    expect(errorFor(res.body, 2).messages).toContain('This row has more values than the header has columns.');
  });
});

describe('POST /api/courses/import — write failure', () => {
  it('undoes a partially applied write and reports the failure', async () => {
    bulkWrite.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

    const res = await importCsv(
      csv(
        'CSEN 102,Introduction to Computer Science,6,2,2,2,Core,MET,Both,1,Winter,',
        'CSEN 301,Data Structures,6,2,2,2,Core,MET,Both,3,Winter,'
      )
    );

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Nothing was imported/);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][0]._id.$in).toHaveLength(1);
    expect(replaceOne).toHaveBeenCalledWith({ _id: ids.csen102 }, expect.objectContaining({ code: 'CSEN 102' }));
  });
});

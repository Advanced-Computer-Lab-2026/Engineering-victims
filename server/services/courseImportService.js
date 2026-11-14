const mongoose = require('mongoose');
const Course = require('../models/Course');
const { parseCsv } = require('../utils/csv');
const { formatCourseError, validationMessages } = require('../utils/courseErrors');

const { COURSE_TYPES, MAJORS, SEASONS, normalizeCode } = Course;

/**
 * Req 128: import course records into the catalogue from a CSV file.
 *
 * The whole file is checked before anything is written: if any row is invalid
 * the import is refused with an error per row and the catalogue is untouched.
 * A row whose code is already in the catalogue updates that course (a
 * soft-deleted one is brought back); any other row creates a new course.
 */

// Headers are matched ignoring case, spaces and punctuation, so "Credit Hours",
// "credit_hours" and "creditHours" are the same column.
const COLUMNS = [
  { field: 'code', label: 'Course code', required: true, aliases: ['code', 'coursecode'] },
  { field: 'name', label: 'Course name', required: true, aliases: ['name', 'coursename'] },
  { field: 'creditHours', label: 'Credit hours', required: true, aliases: ['credithours', 'credits'] },
  { field: 'lectureHours', label: 'Lecture hours', required: false, aliases: ['lecturehours'] },
  { field: 'tutorialHours', label: 'Tutorial hours', required: false, aliases: ['tutorialhours'] },
  { field: 'labHours', label: 'Lab hours', required: false, aliases: ['labhours'] },
  { field: 'courseType', label: 'Course type', required: true, aliases: ['coursetype', 'type'] },
  { field: 'faculty', label: 'Faculty', required: true, aliases: ['faculty'] },
  { field: 'majors', label: 'Majors', required: true, aliases: ['majors', 'major'] },
  {
    field: 'recommendedSemester',
    label: 'Recommended semester',
    required: true,
    aliases: ['recommendedsemester', 'semester'],
  },
  {
    field: 'offeringSeasons',
    label: 'Offering seasons',
    required: true,
    aliases: ['offeringseasons', 'offeringseason', 'seasons', 'season'],
  },
  { field: 'prerequisites', label: 'Prerequisites', required: true, aliases: ['prerequisites', 'prerequisite'] },
];

const HOUR_FIELDS = ['lectureHours', 'tutorialHours', 'labHours'];

// Fields an import may overwrite on an existing course. The code itself is the
// match key, so it keeps its stored spelling.
const UPDATABLE_FIELDS = [
  'name',
  'creditHours',
  ...HOUR_FIELDS,
  'courseType',
  'faculty',
  'majors',
  'recommendedSemester',
  'offeringSeasons',
  'prerequisites',
  'isActive',
];

const headerKey = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Lists inside one cell are separated by semicolons: "Winter; Spring". */
const splitList = (value) =>
  value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

/** "core" -> "Core". Unknown values are passed through so the schema reports them. */
const matchOption = (value, options) =>
  options.find((option) => option.toLowerCase() === value.toLowerCase()) ?? value;

const codeKey = (code) => String(code).toLowerCase();

class CourseImportError extends Error {
  constructor(message, errors, status = 422) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const fileError = (message) => new CourseImportError(message, [{ row: null, code: null, messages: [message] }]);

/** Maps each header cell to a course field, or explains why it cannot. */
const readHeader = (header) => {
  const columnIndex = {};
  const problems = [];

  header.fields.forEach((cell, index) => {
    const key = headerKey(cell);
    if (!key) return; // Spreadsheets often export trailing empty columns.
    const column = COLUMNS.find((candidate) => candidate.aliases.includes(key));
    if (!column) {
      problems.push(`"${cell.trim()}" is not a known column.`);
    } else if (column.field in columnIndex) {
      problems.push(`The ${column.label} column appears more than once.`);
    } else {
      columnIndex[column.field] = index;
    }
  });

  const missing = COLUMNS.filter((column) => column.required && !(column.field in columnIndex));
  if (missing.length > 0) {
    problems.unshift(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.map((c) => c.label).join(', ')}.`);
  }

  return { columnIndex, problems };
};

/** Turns one CSV row into course values the schema can validate. */
const readRow = (record, columnIndex) => {
  const cell = (field) => {
    if (!(field in columnIndex)) return undefined;
    return (record.fields[columnIndex[field]] ?? '').trim();
  };
  const orUndefined = (value) => (value === '' ? undefined : value);

  const values = {
    name: orUndefined(cell('name')),
    creditHours: orUndefined(cell('creditHours')),
    recommendedSemester: orUndefined(cell('recommendedSemester')),
    faculty: orUndefined(cell('faculty')),
  };

  // Contact hours are optional: a blank cell keeps the stored value (0 for a new course).
  for (const field of HOUR_FIELDS) {
    const value = cell(field);
    if (value) values[field] = value;
  }

  const courseType = cell('courseType');
  values.courseType = courseType ? matchOption(courseType, COURSE_TYPES) : undefined;

  values.majors = splitList(cell('majors')).flatMap((major) =>
    major.toLowerCase() === 'both' ? MAJORS : [matchOption(major, MAJORS)]
  );
  values.majors = [...new Set(values.majors)];
  values.offeringSeasons = [...new Set(splitList(cell('offeringSeasons')).map((s) => matchOption(s, SEASONS)))];

  return {
    code: normalizeCode(cell('code')),
    values,
    prerequisiteCodes: [...new Set(splitList(cell('prerequisites')).map(normalizeCode))],
  };
};

/**
 * Finds prerequisite loops in the catalogue as it would look after the import.
 * Returns, per imported course id, the prerequisite codes that lead back to it.
 */
const findLoops = (importedIds, graph) => {
  const loops = new Map();
  for (const target of importedIds) {
    for (const start of graph.get(target) ?? []) {
      const stack = [start];
      const seen = new Set();
      while (stack.length > 0) {
        const current = stack.pop();
        if (current === target) {
          if (!loops.has(target)) loops.set(target, []);
          loops.get(target).push(start);
          break;
        }
        if (seen.has(current)) continue;
        seen.add(current);
        for (const next of graph.get(current) ?? []) stack.push(next);
      }
    }
  }
  return loops;
};

/**
 * Validates the CSV and, only if every row is valid, writes it in one bulk
 * write. Throws CourseImportError (with `errors`) when nothing was imported.
 */
const importCoursesFromCsv = async (csvText, { userId = null } = {}) => {
  if (typeof csvText !== 'string' || csvText.trim() === '') {
    throw fileError('Choose a CSV file with at least one course to import.');
  }

  let records;
  try {
    records = parseCsv(csvText);
  } catch (error) {
    throw fileError(error.message);
  }
  records = records.filter((record) => record.fields.some((value) => value.trim() !== ''));

  const [header, ...dataRows] = records;
  if (!header) throw fileError('Choose a CSV file with at least one course to import.');

  const { columnIndex, problems } = readHeader(header);
  if (problems.length > 0) {
    throw new CourseImportError('The file’s columns are not valid. Nothing was imported.', [
      { row: header.line, code: null, messages: problems },
    ]);
  }
  if (dataRows.length === 0) throw fileError('The file has a header but no course rows.');

  const rows = dataRows.map((record) => ({
    line: record.line,
    ...readRow(record, columnIndex),
    hasExtraValues: record.fields.slice(header.fields.length).some((value) => value.trim() !== ''),
    messages: [],
  }));

  const catalogue = await Course.find({}).lean();
  const catalogueByCode = new Map(catalogue.map((course) => [codeKey(course.code), course]));

  // Every row gets its final id up front, so a prerequisite can point at a
  // course that is only created by this same file.
  const rowByCode = new Map();
  for (const row of rows) {
    if (!row.code) continue;
    const key = codeKey(row.code);
    const first = rowByCode.get(key);
    if (first) {
      row.messages.push(`${row.code} is already listed on row ${first.line}.`);
      continue;
    }
    rowByCode.set(key, row);
    row.existing = catalogueByCode.get(key) ?? null;
    row.id = row.existing ? row.existing._id : new mongoose.Types.ObjectId();
  }

  const codeById = new Map(catalogue.map((course) => [String(course._id), course.code]));
  for (const row of rowByCode.values()) codeById.set(String(row.id), row.existing?.code ?? row.code);

  for (const row of rows) {
    if (row.hasExtraValues) row.messages.push('This row has more values than the header has columns.');
    if (row.values.faculty === undefined) row.messages.push('Faculty is required.');

    const prerequisiteIds = [];
    for (const prerequisiteCode of row.prerequisiteCodes) {
      const key = codeKey(prerequisiteCode);
      if (row.code && key === codeKey(row.code)) {
        row.messages.push('A course cannot be its own prerequisite.');
        continue;
      }
      const inFile = rowByCode.get(key);
      const inCatalogue = catalogueByCode.get(key);
      if (inFile) prerequisiteIds.push(inFile.id);
      else if (inCatalogue && inCatalogue.isActive !== false) prerequisiteIds.push(inCatalogue._id);
      else row.messages.push(`Prerequisite ${prerequisiteCode} is not in the catalogue or in this file.`);
    }
    row.prerequisiteIds = prerequisiteIds;

    // The schema holds the field rules (Req 18), so it validates every row.
    const document = row.existing
      ? new Course({ ...row.existing, ...row.values, isActive: true, prerequisites: prerequisiteIds })
      : new Course({
          ...row.values,
          _id: row.id,
          code: row.code,
          prerequisites: prerequisiteIds,
          createdBy: userId,
        });
    try {
      await document.validate();
    } catch (error) {
      if (error.name !== 'ValidationError') throw error;
      row.messages.push(...validationMessages(error));
    }
    row.document = document;
  }

  // Prerequisite loops, judged on the catalogue as it would be after the import.
  const graph = new Map(catalogue.map((course) => [String(course._id), (course.prerequisites ?? []).map(String)]));
  for (const row of rowByCode.values()) graph.set(String(row.id), row.prerequisiteIds.map(String));
  const loops = findLoops([...rowByCode.values()].map((row) => String(row.id)), graph);
  for (const row of rowByCode.values()) {
    for (const prerequisiteId of loops.get(String(row.id)) ?? []) {
      const prerequisiteCode = codeById.get(prerequisiteId);
      row.messages.push(
        `${prerequisiteCode} cannot be a prerequisite because it already requires ${row.code} (directly or through other courses).`
      );
    }
  }

  const errors = rows
    .filter((row) => row.messages.length > 0)
    .map((row) => ({ row: row.line, code: row.code || null, messages: [...new Set(row.messages)] }));
  if (errors.length > 0) {
    throw new CourseImportError(
      `${errors.length} row${errors.length === 1 ? ' has' : 's have'} errors. Nothing was imported — fix the file and try again.`,
      errors
    );
  }

  const operations = rows.map((row) => {
    if (!row.existing) return { insertOne: { document: row.document.toObject() } };
    const update = {};
    for (const field of UPDATABLE_FIELDS) update[field] = row.document.get(field);
    return { updateOne: { filter: { _id: row.id }, update: { $set: update } } };
  });

  try {
    await Course.bulkWrite(operations, { ordered: true });
  } catch (error) {
    // Everything was validated first, so this only happens if the catalogue
    // changed underneath the import. Undo whatever part of it landed.
    try {
      const createdIds = rows.filter((row) => !row.existing).map((row) => row.id);
      if (createdIds.length > 0) await Course.deleteMany({ _id: { $in: createdIds } });
      for (const row of rows.filter((item) => item.existing)) {
        await Course.replaceOne({ _id: row.id }, row.existing);
      }
    } catch {
      // The original error is the one worth reporting.
    }
    throw new CourseImportError(
      `The import could not be saved: ${formatCourseError(error)} Nothing was imported.`,
      [],
      error.code === 11000 ? 409 : 500
    );
  }

  const created = rows.filter((row) => !row.existing).length;
  return { created, updated: rows.length - created };
};

module.exports = { importCoursesFromCsv, CourseImportError, COLUMNS };

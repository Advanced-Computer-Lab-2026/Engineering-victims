const mongoose = require('mongoose');
const Course = require('../models/Course');
const { FIELD_LABELS } = Course;

const FIELD_ORDER = Object.keys(FIELD_LABELS);

const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

/**
 * Same idea as the academic term errors: plain sentences the form can show
 * as-is instead of `Path "creditHours" ...` or a raw E11000 dump.
 */
const formatCourseError = (error, code) => {
  if (!error) return 'Could not save the course.';

  // The code index is case-insensitive, so error.keyValue holds a collation
  // key rather than readable text; the caller passes the code it tried to save.
  if (error.code === 11000) {
    return code ? `A course with the code ${code} already exists.` : 'That course already exists.';
  }

  if (error.name === 'ValidationError') {
    const positionOf = (path) => {
      const index = FIELD_ORDER.indexOf(path.split('.')[0]);
      return index === -1 ? FIELD_ORDER.length : index;
    };

    const messages = Object.values(error.errors ?? {})
      .sort((a, b) => positionOf(a.path) - positionOf(b.path))
      .map((detail) => {
        if (detail.name !== 'CastError') return detail.message;
        const label = FIELD_LABELS[detail.path.split('.')[0]] ?? 'One of the fields';
        return `${label} has an invalid value.`;
      })
      .filter(Boolean);

    if (messages.length > 0) return [...new Set(messages)].join(' ');
    return error.message || 'Could not save the course.';
  }

  if (error.status) return error.message;
  return 'Could not save the course.';
};

/** Shape sent to the client: `id` instead of `_id`, prerequisites as summaries. */
const toCourseResponse = (course) => ({
  id: String(course._id),
  code: course.code,
  name: course.name,
  creditHours: course.creditHours,
  lectureHours: course.lectureHours ?? 0,
  tutorialHours: course.tutorialHours ?? 0,
  labHours: course.labHours ?? 0,
  courseType: course.courseType,
  faculty: course.faculty,
  majors: course.majors ?? [],
  recommendedSemester: course.recommendedSemester,
  offeringSeasons: course.offeringSeasons ?? [],
  prerequisites: (course.prerequisites ?? []).map((prerequisite) => ({
    id: String(prerequisite._id),
    code: prerequisite.code,
    name: prerequisite.name,
  })),
  isActive: course.isActive !== false,
  createdAt: course.createdAt,
  updatedAt: course.updatedAt,
});

const findCourseResponse = async (id) => {
  const course = await Course.findById(id).populate('prerequisites', 'code name').lean();
  return toCourseResponse(course);
};

/**
 * Only the editable fields are copied from the request, so a client cannot set
 * createdBy or timestamps. Empty strings become undefined so "required" fires
 * instead of a cast error. Prerequisites are checked separately.
 */
const EDITABLE_FIELDS = FIELD_ORDER.filter((field) => field !== 'prerequisites');

const pickCourseFields = (body = {}) => {
  const values = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    values[field] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }
  return values;
};

/**
 * Prerequisites arrive as course ids. They must be existing courses, cannot
 * include the course itself, and cannot make the chain loop back to it
 * (A needs B needs A would make both courses impossible to take).
 */
const resolvePrerequisites = async (rawIds, courseId = null) => {
  if (rawIds === undefined) return undefined;
  if (!Array.isArray(rawIds)) throw badRequest('Prerequisites must be a list of courses.');

  const ids = [...new Set(rawIds.map(String))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) {
    throw badRequest('One of the prerequisites is not a valid course.');
  }
  if (courseId && ids.includes(String(courseId))) {
    throw badRequest('A course cannot be its own prerequisite.');
  }
  if (ids.length === 0) return [];

  const catalogue = await Course.find({}, 'code prerequisites').lean();
  const byId = new Map(catalogue.map((course) => [String(course._id), course]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) throw badRequest('One of the prerequisites no longer exists in the catalogue.');

  // A brand-new course has nothing depending on it yet, so it cannot close a loop.
  if (courseId) {
    const target = String(courseId);
    for (const startId of ids) {
      const stack = [startId];
      const seen = new Set();
      while (stack.length > 0) {
        const current = stack.pop();
        if (current === target) {
          throw badRequest(
            `${byId.get(startId).code} cannot be a prerequisite because it already requires this course.`
          );
        }
        if (seen.has(current)) continue;
        seen.add(current);
        for (const next of byId.get(current)?.prerequisites ?? []) stack.push(String(next));
      }
    }
  }

  return ids;
};

// Req 19: the catalogue lists every active course, prerequisites populated.
// Soft-deleted courses (req 21) stay in the database but are hidden here.
exports.listCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true })
      .populate('prerequisites', 'code name')
      .sort({ recommendedSemester: 1, code: 1 })
      .lean();
    res.status(200).json({ courses: courses.map(toCourseResponse) });
  } catch (error) {
    res.status(500).json({ message: 'Could not load the course catalogue.' });
  }
};

// Req 18: create a course in the catalogue.
exports.createCourse = async (req, res) => {
  let course;
  try {
    const values = pickCourseFields(req.body);
    values.prerequisites = (await resolvePrerequisites(req.body?.prerequisites)) ?? [];

    course = new Course({ ...values, createdBy: req.user?.userId ?? null });
    await course.save();

    res.status(201).json({ course: await findCourseResponse(course._id) });
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : 400);
    res.status(status).json({ message: formatCourseError(error, course?.code) });
  }
};

// Req 20: update a course in the catalogue.
exports.updateCourse = async (req, res) => {
  let course;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    const values = pickCourseFields(req.body);
    const prerequisites = await resolvePrerequisites(req.body?.prerequisites, course._id);
    if (prerequisites !== undefined) values.prerequisites = prerequisites;

    Object.assign(course, values);
    await course.save();

    res.status(200).json({ course: await findCourseResponse(course._id) });
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : 400);
    res.status(status).json({ message: formatCourseError(error, course?.code) });
  }
};

// Req 21: delete a course from the catalogue (soft delete, so history survives).
exports.deleteCourse = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'That course link is not valid.' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Soft delete following the project pattern (e.g., studentController.setAccountStatus)
    course.isActive = false;
    await course.save();

    res.status(200).json({
      message: `Course ${course.code} was deleted successfully.`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete the course', error: error.message });
  }
};

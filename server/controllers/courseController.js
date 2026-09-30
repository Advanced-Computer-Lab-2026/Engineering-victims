const mongoose = require('mongoose');
const Course = require('../models/Course');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const serialize = (course) => ({
  id: course._id,
  code: course.code,
  name: course.name,
  credits: course.credits,
  description: course.description,
  isActive: course.isActive,
  createdAt: course.createdAt,
  updatedAt: course.updatedAt,
});

exports.getCourses = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

    const [courses, total] = await Promise.all([
      Course.find({ isActive: true })
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Course.countDocuments({ isActive: true }),
    ]);

    res.status(200).json({
      courses: courses.map(serialize),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load courses', error: error.message });
  }
};

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

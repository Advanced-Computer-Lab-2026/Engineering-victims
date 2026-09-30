const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// All course management is restricted to Administrators (req 18-21).
const administratorOnly = [authenticate, requireRole('Administrator')];

router.get('/', ...administratorOnly, courseController.listCourses);
router.post('/', ...administratorOnly, courseController.createCourse);
router.patch('/:id', ...administratorOnly, courseController.updateCourse);
router.delete('/:id', ...administratorOnly, courseController.deleteCourse);

module.exports = router;

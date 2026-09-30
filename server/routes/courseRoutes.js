const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const administratorOnly = [authenticate, requireRole('Administrator')];

router.get('/', ...administratorOnly, courseController.listCourses);
router.post('/', ...administratorOnly, courseController.createCourse);
router.patch('/:id', ...administratorOnly, courseController.updateCourse);

module.exports = router;

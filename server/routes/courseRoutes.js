const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// All course management is restricted to Administrators
router.use(authenticate);
router.use(requireRole('Administrator'));

router.get('/', courseController.getCourses);
router.delete('/:id', courseController.deleteCourse);

module.exports = router;

const express = require('express');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const controller = require('../controllers/advisingScheduleDraftController');

const router = express.Router();
const staff = [authenticate, requireRole('Advisor', 'Coordinator')];

router.get('/students/:studentId', ...staff, controller.getDraft);
router.post('/students/:studentId', ...staff, controller.createDraft);
router.post('/students/:studentId/courses', ...staff, controller.addCourse);
router.delete('/students/:studentId/courses/:courseId', ...staff, controller.removeCourse);

module.exports = router;

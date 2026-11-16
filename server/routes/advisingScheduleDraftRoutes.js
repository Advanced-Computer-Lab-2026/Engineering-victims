const express = require('express');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const controller = require('../controllers/advisingScheduleDraftController');

const router = express.Router();
const staff = [authenticate, requireRole('Advisor', 'Coordinator')];

router.get('/students/:studentId', ...staff, controller.getDraft);
router.get('/students/:studentId/validation', ...staff, controller.getValidation);
router.post('/students/:studentId', ...staff, controller.createDraft);
router.post('/students/:studentId/ready', ...staff, controller.markReadyForReview);
router.post('/students/:studentId/courses', ...staff, controller.addCourse);
router.post('/students/:studentId/courses/:courseId/slots', ...staff, controller.assignSlot);
router.patch('/students/:studentId/slots/:scheduleId', ...staff, controller.changeSlot);
router.delete('/students/:studentId/slots/:scheduleId', ...staff, controller.removeSlot);
router.delete('/students/:studentId/courses/:courseId', ...staff, controller.removeCourse);

module.exports = router;

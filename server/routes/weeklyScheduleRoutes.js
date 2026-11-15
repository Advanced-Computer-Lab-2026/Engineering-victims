const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const weeklyScheduleController = require('../controllers/weeklyScheduleController');

// Req 31. Students read their own schedule through /me only; the id route is
// closed to them. Declared before '/:studentId' so "me" is not read as an id.
router.get('/me', authenticate, requireRole('Student'), weeklyScheduleController.getMySchedule);
router.get(
  '/:studentId',
  authenticate,
  requireRole('Advisor', 'Coordinator', 'Administrator'),
  weeklyScheduleController.getStudentSchedule
);

module.exports = router;

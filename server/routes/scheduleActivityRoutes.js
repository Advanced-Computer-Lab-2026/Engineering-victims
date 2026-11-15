const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const scheduleActivityController = require('../controllers/scheduleActivityController');

// Req 123, 124, 125: Global schedule activity history (Coordinator / Administrator)
router.get(
  '/',
  authenticate,
  requireRole('Coordinator', 'Administrator'),
  scheduleActivityController.getGlobalHistory
);

// Req 123: Per-student schedule activity history from advising details
router.get(
  '/student/:studentId',
  authenticate,
  requireRole('Coordinator', 'Administrator', 'Advisor'),
  scheduleActivityController.getStudentHistory
);

// Req 81 & 123: Process an advising schedule and automatically record activity
router.post(
  '/student/:studentId/process',
  authenticate,
  requireRole('Coordinator', 'Advisor'),
  scheduleActivityController.processAdvisingSchedule
);

// Req 82 & 123: Reopen a processed advising schedule and automatically record activity
router.post(
  '/student/:studentId/reopen',
  authenticate,
  requireRole('Coordinator', 'Advisor'),
  scheduleActivityController.reopenAdvisingSchedule
);

module.exports = router;

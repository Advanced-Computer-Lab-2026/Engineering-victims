const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const schedulingPreferenceController = require('../controllers/schedulingPreferenceController');

// Req 57: Advising Students manage their own preferences. requireRole stops
// staff here; the controller turns away Normal Students.
router.get('/me', authenticate, requireRole('Student'), schedulingPreferenceController.getMyPreferences);
router.put('/me', authenticate, requireRole('Student'), schedulingPreferenceController.saveMyPreferences);

// Req 58: Advisors and Coordinators read any Advising Student's preferences
// while building the draft. Read-only: there is no staff write route.
router.get(
  '/students/:studentId',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  schedulingPreferenceController.getStudentPreferences
);

module.exports = router;

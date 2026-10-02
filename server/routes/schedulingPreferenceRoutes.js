const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const schedulingPreferenceController = require('../controllers/schedulingPreferenceController');

// Req 57: Advising Students manage their own preferences. requireRole stops
// staff here; the controller turns away Normal Students.
router.get('/me', authenticate, requireRole('Student'), schedulingPreferenceController.getMyPreferences);
router.put('/me', authenticate, requireRole('Student'), schedulingPreferenceController.saveMyPreferences);

module.exports = router;

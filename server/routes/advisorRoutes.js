const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const advisorController = require('../controllers/advisorController');
const advisingStudentsController = require('../controllers/advisingStudentsController');

// FR 11.0, 12.0 name the Coordinator, but the /advisors screen is routed for
// both Coordinator and Administrator, so the API allows both. Keeping the API
// narrower than the route left an Administrator with a 403 banner on every
// call they could already reach from the UI.
const staffOnly = [authenticate, requireRole('Coordinator', 'Administrator')];

// FR 11.0: Add an advisor using their GUC email
router.post('/add', ...staffOnly, advisorController.addAdvisor);

// FR 12.0: Remove an advisor from the advising system
router.post('/remove', ...staffOnly, advisorController.removeAdvisor);

// Req 50: an Advisor views every Advising Student, not only their own. Declared
// before '/:email' so "advising-students" is not read as an email.
router.get(
  '/advising-students',
  authenticate,
  requireRole('Advisor'),
  advisingStudentsController.listAdvisingStudents
);

// Get list of all advisors (useful for UI)
router.get('/', ...staffOnly, advisorController.listAdvisors);

// Get single advisor details with their assigned students
router.get('/:email', ...staffOnly, advisorController.getAdvisor);

module.exports = router;

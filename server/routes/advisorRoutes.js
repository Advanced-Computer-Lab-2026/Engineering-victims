const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const advisorController = require('../controllers/advisorController');

// All routes require Coordinator role (FR 11.0, 12.0)
const coordinatorOnly = [authenticate, requireRole('Coordinator')];

// FR 11.0: Add an advisor using their GUC email
router.post('/add', ...coordinatorOnly, advisorController.addAdvisor);

// FR 12.0: Remove an advisor from the advising system
router.post('/remove', ...coordinatorOnly, advisorController.removeAdvisor);

// Get list of all advisors (useful for UI)
router.get('/', ...coordinatorOnly, advisorController.listAdvisors);

// Get single advisor details with their assigned students
router.get('/:email', ...coordinatorOnly, advisorController.getAdvisor);

module.exports = router;

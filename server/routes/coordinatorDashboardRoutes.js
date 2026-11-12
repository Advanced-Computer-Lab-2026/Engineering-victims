const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const coordinatorDashboardController = require('../controllers/coordinatorDashboardController');

// Req 122: Coordinator pending-work dashboard
router.get(
  '/pending-work',
  authenticate,
  requireRole('Coordinator', 'Administrator'),
  coordinatorDashboardController.getPendingWorkDashboard
);

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const scheduleActivityController = require('../controllers/scheduleActivityController');

// Req 126 (same access rules as the Req 127 export): recheck the current
// account so a stale token from a deactivated or re-roled user cannot export,
// and keep the file out of shared caches.
const requireActiveStaff = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('role isActive').lean();
    if (!user?.isActive || !['Coordinator', 'Administrator'].includes(user.role)) {
      return res.status(403).json({ message: 'An active Coordinator or Administrator account is required.' });
    }
    res.set('Cache-Control', 'no-store');
    return next();
  } catch {
    return res.status(500).json({ message: 'Could not verify staff access.' });
  }
};

// Req 123, 124, 125: Global schedule activity history (Coordinator / Administrator)
router.get(
  '/',
  authenticate,
  requireRole('Coordinator', 'Administrator'),
  scheduleActivityController.getGlobalHistory
);

// Req 126: Export the displayed global history (same filters and search) as CSV
router.get(
  '/export',
  authenticate,
  requireRole('Coordinator', 'Administrator'),
  requireActiveStaff,
  scheduleActivityController.exportGlobalHistory
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

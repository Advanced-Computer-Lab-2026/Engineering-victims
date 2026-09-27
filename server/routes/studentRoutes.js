const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const studentController = require('../controllers/studentController');

// Req 6-9 are for Coordinator and Administrator.
const staffOnly = [authenticate, requireRole('Coordinator', 'Administrator')];

router.get('/', ...staffOnly, studentController.listStudents);
// Declared before '/:id' so "stats" is not swallowed as an ObjectId.
router.get('/stats', ...staffOnly, studentController.getStats);
router.get('/:id', ...staffOnly, studentController.getStudent);

// Req 10 is Administrator only.
router.patch(
  '/:id/status',
  authenticate,
  requireRole('Administrator'),
  studentController.setAccountStatus
);

module.exports = router;

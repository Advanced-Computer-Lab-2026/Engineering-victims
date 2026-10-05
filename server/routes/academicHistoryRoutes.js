const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const academicHistoryController = require('../controllers/academicHistoryController');

// Req 54. Students read their own history through /me only; the id route is
// closed to them, which is what stops one student opening another's record.
// Declared before '/:studentId' so "me" is not read as an id.
router.get('/me', authenticate, requireRole('Student'), academicHistoryController.getMyHistory);
// Req 56: the same history as a PDF, with exactly the access of the page.
router.get('/me/pdf', authenticate, requireRole('Student'), academicHistoryController.downloadMyHistoryPdf);
// Req 55: one attended academic year (?year=2025/2026), under the same rules.
router.get('/me/transcript', authenticate, requireRole('Student'), academicHistoryController.getMyTranscript);
router.get(
  '/:studentId',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  academicHistoryController.getStudentHistory
);
router.get(
  '/:studentId/pdf',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  academicHistoryController.downloadStudentHistoryPdf
);
router.get(
  '/:studentId/transcript',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  academicHistoryController.getStudentTranscript
);

module.exports = router;

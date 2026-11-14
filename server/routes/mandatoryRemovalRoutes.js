const express = require('express');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const mandatoryRemovalController = require('../controllers/mandatoryRemovalController');

const router = express.Router();

// Req 64: only an Advisor submits a removal request.
router.post('/', authenticate, requireRole('Advisor'), mandatoryRemovalController.createRequest);

// The requests behind one student's mandatory list, for the staff who can
// already see that list.
router.get(
  '/student/:studentId',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  mandatoryRemovalController.listForStudent
);

module.exports = router;

const express = require('express');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const mandatoryRemovalController = require('../controllers/mandatoryRemovalController');

const router = express.Router();

// Req 64: only an Advisor submits a removal request.
router.post('/', authenticate, requireRole('Advisor'), mandatoryRemovalController.createRequest);

// Req 65-66: only a Coordinator lists every removal request and searches them.
router.get('/', authenticate, requireRole('Coordinator'), mandatoryRemovalController.listAll);

// The requests behind one student's mandatory list, for the staff who can
// already see that list.
router.get(
  '/student/:studentId',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  mandatoryRemovalController.listForStudent
);

module.exports = router;

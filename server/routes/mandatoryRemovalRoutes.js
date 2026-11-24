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

// Req 68: open one request from the list. Declared after '/student/:studentId'
// so "student" is not read as an id.
router.get('/:id', authenticate, requireRole('Coordinator'), mandatoryRemovalController.getOne);

// Req 69: approve or reject a request with a response note.
router.post('/:id/decision', authenticate, requireRole('Coordinator'), mandatoryRemovalController.decide);

module.exports = router;

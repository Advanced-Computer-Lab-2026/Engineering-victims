const express = require('express');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const exitExamRequestController = require('../controllers/exitExamRequestController');

const router = express.Router();

router.get('/mine', authenticate, requireRole('Student'), exitExamRequestController.listMine);
router.get('/plan/:planId', authenticate, requireRole('Advisor'), exitExamRequestController.listForPlan);
router.get('/', authenticate, requireRole('Coordinator'), exitExamRequestController.listPending);
router.post('/', authenticate, requireRole('Advisor'), exitExamRequestController.createRequest);
router.post(
  '/:requestId/decision',
  authenticate,
  requireRole('Coordinator'),
  exitExamRequestController.decideRequest
);

module.exports = router;

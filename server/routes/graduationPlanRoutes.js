const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const graduationPlanController = require('../controllers/graduationPlanController');

// Req 103-114: graduation planning is shared by the Advisor who builds the
// plan and the Coordinator who reviews it. Each route below is narrowed to the
// roles that own that step; the controller scopes every query so a private
// draft never leaves its creator (req 106) and a submitted plan is read-only
// (req 107).

// Req 110-112: an Advisor lists their own plans, a Coordinator every submitted
// plan. Same path, role-aware response.
router.get(
  '/',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  graduationPlanController.listPlans
);

// Req 114: the Advising Student's own accepted plan. Declared before
// '/:planId' so "me" is not read as a plan id.
router.get(
  '/me',
  authenticate,
  requireRole('Student'),
  graduationPlanController.getMyAcceptedPlan
);

// Req 103/106: only the Advisor builds and owns drafts.
router.post('/', authenticate, requireRole('Advisor'), graduationPlanController.createPlan);

// Req 103-107/110: the owner Advisor or a Coordinator reviewing a submitted plan.
router.get(
  '/:planId',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  graduationPlanController.getPlan
);
router.put('/:planId', authenticate, requireRole('Advisor'), graduationPlanController.updatePlan);
router.delete('/:planId', authenticate, requireRole('Advisor'), graduationPlanController.deletePlan);
router.post(
  '/:planId/submit',
  authenticate,
  requireRole('Advisor'),
  graduationPlanController.submitPlan
);

// Req 113: the Coordinator's decision with a response note.
router.post(
  '/:planId/decision',
  authenticate,
  requireRole('Coordinator'),
  graduationPlanController.decidePlan
);

module.exports = router;

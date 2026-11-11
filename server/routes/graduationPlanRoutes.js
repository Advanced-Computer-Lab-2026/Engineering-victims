const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const graduationPlanController = require('../controllers/graduationPlanController');

// Req 103-107: graduation planning is an Advisor workflow. Every query is
// scoped to the signed-in Advisor, so drafts stay private (req 106) and a
// submitted plan is read-only (req 107) without a separate public route.
router.use(authenticate, requireRole('Advisor'));

router.get('/', graduationPlanController.listMyPlans);
router.post('/', graduationPlanController.createPlan);
router.get('/:planId', graduationPlanController.getPlan);
router.put('/:planId', graduationPlanController.updatePlan);
router.delete('/:planId', graduationPlanController.deletePlan);
router.post('/:planId/submit', graduationPlanController.submitPlan);

module.exports = router;

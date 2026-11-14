const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const swapRequestController = require('../controllers/swapRequestController');

router.use(authenticate, requireRole('Student'));

// Req 35: Submit a whole-schedule swap request
router.post('/', swapRequestController.createSwapRequest);

// Req 36: View open whole-schedule swap requests eligible to complete
router.get('/eligible-open', swapRequestController.getEligibleOpenRequests);

// Req 38: View my submitted or completed swap requests
router.get('/mine', swapRequestController.getMySwapRequests);

// Req 37: Complete an eligible open whole-schedule swap request
router.post('/:id/complete', swapRequestController.completeSwapRequest);

// Req 39: Withdraw my own open whole-schedule swap request
router.patch('/:id/withdraw', swapRequestController.withdrawSwapRequest);

module.exports = router;

const express = require('express');
const router = express.Router();
const offeringController = require('../controllers/offeringController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

router.use(authenticate);
router.use(requireRole('Administrator'));

router.post('/', offeringController.createOffering);
router.get('/', offeringController.getOfferings);
router.get('/:id', offeringController.getOfferingDetails);
router.patch('/:id', offeringController.updateOffering);
router.patch('/slots/:id', offeringController.updateSlot);

module.exports = router;

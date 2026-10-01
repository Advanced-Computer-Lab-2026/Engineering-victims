const express = require('express');
const router = express.Router();
const offeringController = require('../controllers/offeringController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const staffReadOnly = [authenticate, requireRole('Coordinator', 'Administrator')];
const administratorOnly = [authenticate, requireRole('Administrator')];

router.get('/', ...staffReadOnly, offeringController.getOfferings);
router.get('/:id', ...staffReadOnly, offeringController.getOfferingDetails);
router.use(...administratorOnly);

router.post('/', offeringController.createOffering);
router.patch('/:id', offeringController.updateOffering);
router.patch('/:id/publish', offeringController.togglePublishStatus);
router.delete('/:id', offeringController.deleteOffering);
router.patch('/slots/:id', offeringController.updateSlot);
router.delete('/slots/:id', offeringController.deleteSlot);

module.exports = router;

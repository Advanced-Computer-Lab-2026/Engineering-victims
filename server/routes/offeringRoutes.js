const express = require('express');
const router = express.Router();
const offeringController = require('../controllers/offeringController');
const offeringDuplicateController = require('../controllers/offeringDuplicateController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const staffReadOnly = [authenticate, requireRole('Advisor', 'Coordinator', 'Administrator')];
const administratorOnly = [authenticate, requireRole('Administrator')];

router.get('/', ...staffReadOnly, offeringController.getOfferings);
router.get('/:id', ...staffReadOnly, offeringController.getOfferingDetails);
router.use(...administratorOnly);

// Req 24: Duplicate course offerings from a previous term into a target term
router.post('/duplicate', offeringDuplicateController.duplicateOfferings);

router.post('/', offeringController.createOffering);
router.patch('/:id', offeringController.updateOffering);
router.patch('/:id/publish', offeringController.togglePublishStatus);
router.delete('/:id', offeringController.deleteOffering);
router.patch('/slots/:id', offeringController.updateSlot);
router.delete('/slots/:id', offeringController.deleteSlot);

module.exports = router;

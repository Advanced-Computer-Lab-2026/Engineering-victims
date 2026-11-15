const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// Standard Schedule Templates are managed by Coordinators and Administrators
const staffOnly = [authenticate, requireRole('Coordinator', 'Administrator')];

router.post('/', ...staffOnly, templateController.createTemplate);
router.get('/', ...staffOnly, templateController.getTemplates);
router.patch('/:id', ...staffOnly, templateController.updateTemplate);
router.patch('/:id/publish', ...staffOnly, templateController.setTemplatePublicationStatus);
router.delete('/:id', ...staffOnly, templateController.deleteTemplate);

module.exports = router;

const express = require('express');
const router = express.Router();
const academicTermController = require('../controllers/academicTermController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const staffReadOnly = [authenticate, requireRole('Coordinator', 'Administrator')];
const administratorOnly = [authenticate, requireRole('Administrator')];

router.get('/', ...staffReadOnly, academicTermController.listTerms);
router.post('/', ...administratorOnly, academicTermController.createTerm);
router.patch('/:id', ...administratorOnly, academicTermController.updateTerm);

module.exports = router;

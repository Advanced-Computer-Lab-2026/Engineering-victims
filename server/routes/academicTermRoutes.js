const express = require('express');
const router = express.Router();
const academicTermController = require('../controllers/academicTermController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const administratorOnly = [authenticate, requireRole('Administrator')];

router.get('/', ...administratorOnly, academicTermController.listTerms);
router.post('/', ...administratorOnly, academicTermController.createTerm);
router.patch('/:id', ...administratorOnly, academicTermController.updateTerm);

module.exports = router;

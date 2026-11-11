const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const slotChangeRequestController = require('../controllers/slotChangeRequestController');

// Req 40: an Advising Student requests a change to one of their own slots.
// requireRole stops staff here; the controller turns away Normal Students.
// The student always comes from the token — there is no id in these paths.
router.get('/me/eligibility', authenticate, requireRole('Student'), slotChangeRequestController.getMyEligibility);
router.post('/me', authenticate, requireRole('Student'), slotChangeRequestController.createMyRequest);

module.exports = router;

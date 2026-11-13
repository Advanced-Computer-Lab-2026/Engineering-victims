const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const slotChangeRequestController = require('../controllers/slotChangeRequestController');

// Req 40: an Advising Student requests a change to one of their own slots.
// requireRole stops staff here; the controller turns away Normal Students.
// The student always comes from the token — there is no id in these paths.
router.get('/me/eligibility', authenticate, requireRole('Student'), slotChangeRequestController.getMyEligibility);
router.post('/me', authenticate, requireRole('Student'), slotChangeRequestController.createMyRequest);
// Req 41: the caller's own requests, statuses and staff responses.
router.get('/me', authenticate, requireRole('Student'), slotChangeRequestController.listMyRequests);
// Req 42: withdraw one of the caller's own Pending requests. The id names the
// request; ownership is still checked against the student from the token.
router.patch('/me/:id/withdraw', authenticate, requireRole('Student'), slotChangeRequestController.withdrawMyRequest);

module.exports = router;

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

// Req 43: Advisors list their assigned students' requests, Coordinators all of
// them. Same path, scope decided from the token by the controller.
router.get('/', authenticate, requireRole('Advisor', 'Coordinator'), slotChangeRequestController.listStaffRequests);
// Req 45: Advisor and course choices for the filters, in the caller's scope.
router.get(
  '/filter-options',
  authenticate,
  requireRole('Advisor', 'Coordinator'),
  slotChangeRequestController.listStaffFilterOptions
);
// Req 46: one request's details, looked up inside the caller's scope. Kept
// after the fixed paths above so "/filter-options" never reads as an id.
router.get('/:id', authenticate, requireRole('Advisor', 'Coordinator'), slotChangeRequestController.getStaffRequest);

module.exports = router;

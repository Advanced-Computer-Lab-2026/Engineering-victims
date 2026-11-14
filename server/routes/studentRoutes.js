const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const studentController = require('../controllers/studentController');

// Req 6-9 are for Coordinator and Administrator.
const staffOnly = [authenticate, requireRole('Coordinator', 'Administrator')];

// An Advisor reaches the same list and detail endpoints, but only ever over
// the students assigned to them. The scope is enforced inside listStudents /
// getStudent rather than by a second set of routes, so the page, the drawer and
// the filters all keep working unchanged — and so no query parameter can widen
// it. Everything that manages the directory (advisor assignment, stats, the
// advisor dropdown) stays staffOnly.
const directory = [authenticate, requireRole('Coordinator', 'Administrator', 'Advisor')];

router.get('/', ...directory, studentController.listStudents);
router.get('/advisors', ...staffOnly, studentController.listAdvisors);
// Declared before '/:id' so "stats" is not swallowed as an ObjectId.
router.get('/stats', ...staffOnly, studentController.getStats);
// Req 32: a student's own registered courses. Declared before '/:id' so
// "my-courses" is never read as an ObjectId.
router.get('/my-courses', authenticate, requireRole('Student'), studentController.getMyCourses);
// Req 33: view details of a specific registered course (lecture, tutorial, lab slots)
router.get('/my-courses/:courseId', authenticate, requireRole('Student'), studentController.getMyCourseDetails);
// Req 34: view eligible swap groups with exact same course set
router.get('/eligible-swap-groups', authenticate, requireRole('Student'), studentController.getEligibleSwapGroups);
// Req 34: the complete weekly schedule of one of those groups, re-checked
// against the caller's own course set inside the controller.
router.get(
  '/eligible-swap-groups/:group',
  authenticate,
  requireRole('Student'),
  studentController.getEligibleSwapGroupSchedule
);
router.patch(
  '/:id/advisor',
  ...staffOnly,
  studentController.assignAdvisor
);
router.get('/:id', ...directory, studentController.getStudent);
router.patch(
  '/:id/group',
  ...staffOnly,
  studentController.assignToGroup
);

// Req 10 is Administrator only.
router.patch(
  '/:id/status',
  authenticate,
  requireRole('Administrator'),
  studentController.setAccountStatus
);

module.exports = router;

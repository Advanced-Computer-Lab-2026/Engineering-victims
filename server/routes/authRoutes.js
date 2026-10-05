const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
// The explicit reset: the server only seeds a database that has never been
// populated, so this is the route that still wipes and rebuilds. It used to be
// open to anyone at all, which made an unauthenticated GET enough to destroy
// the database — now only an Administrator can trigger it, and nothing in the
// app calls it (the CLI equivalent is `node seed/seed.cjs`).
router.get('/seed', authenticate, requireRole('Administrator'), authController.seed);
router.get('/me', authenticate, authController.getMe);

module.exports = router;

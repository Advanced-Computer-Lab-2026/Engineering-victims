const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const walletController = require('../controllers/walletController');

// Req 89: Advising Student only. requireRole stops staff here; the controller
// then turns away a Normal Student, since both share the Student role.
router.get('/me', authenticate, requireRole('Student'), walletController.getMyWallet);

module.exports = router;

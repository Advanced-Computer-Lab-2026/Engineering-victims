const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

// FR 5.0: every account views and marks its own notifications.
router.get('/', authenticate, notificationController.listNotifications);
router.get('/unread-count', authenticate, notificationController.getUnreadCount);

// Declared before '/:id/read' so "read-all" is not parsed as an id.
router.patch('/read-all', authenticate, notificationController.markAllRead);
router.patch('/:id/read', authenticate, notificationController.markRead);

module.exports = router;

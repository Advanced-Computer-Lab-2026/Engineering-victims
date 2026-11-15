const mongoose = require('mongoose');
const Notification = require('../models/Notification');

/** Shapes a document for the API, mirroring the student controller's style. */
const serialize = (notification) => ({
  id: notification._id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  link: notification.link ?? null,
  isRead: notification.isRead,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

/** FR 5.0 only ever exposes the signed-in account's own notifications. */
const ownedBy = (req) => ({ user: req.user.userId });

/** A malformed id would otherwise surface as a 500 from the cast error. */
const isReadableId = (id) => mongoose.isValidObjectId(id);

exports.listNotifications = async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(ownedBy(req)).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ ...ownedBy(req), isRead: false }),
    ]);

    res.status(200).json({
      notifications: notifications.map(serialize),
      unreadCount,
    });
  } catch (error) {
    console.error('Notification list error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** Cheap count for the sidebar badge, so opening the nav never loads the list. */
exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ ...ownedBy(req), isRead: false });
    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** Marks a single notification as read. 404 when it is missing or not yours. */
exports.markRead = async (req, res) => {
  try {
    if (!isReadableId(req.params.id)) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...ownedBy(req) },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ notification: serialize(notification) });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** FR 5.0 "mark all as read". Returns the new count so the UI can update at once. */
exports.markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { ...ownedBy(req), isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    const unreadCount = await Notification.countDocuments({ ...ownedBy(req), isRead: false });

    res.status(200).json({ modifiedCount: result.modifiedCount, unreadCount });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

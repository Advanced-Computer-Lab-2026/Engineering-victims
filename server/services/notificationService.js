const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Single entry point for creating in-app notifications (FR 5.0).
 *
 * Controllers never write to the Notification collection directly — they call
 * one of these helpers, so every record has the same shape and appears on the
 * notifications page with no extra wiring:
 *
 *   const { notify, notifyRole } = require('../services/notificationService');
 *
 *   await notify(studentUserId, {
 *     type: 'approval',                       // info | success | warning | schedule | approval | payment
 *     title: 'Slot-change request approved',
 *     message: 'Your request to move CSEN 501 was approved.',
 *     link: '/notifications',                 // optional deep link
 *   });
 *
 *   await notifyRole('Coordinator', { ... });          // everyone holding a role
 *   await notifyMany(userIds, { ... });               // a set of accounts
 *   await notifyByEmail(student.email, { ... });      // records that store only an email
 *
 * A notification is a side effect: failing to create one must never fail the
 * action that triggered it, so every helper logs and resolves to [] instead of
 * throwing into the request.
 */

const DEFAULT_LINK = '/notifications';

const buildDocs = (userIds, payload) => {
  const { type = 'info', title, message, link = DEFAULT_LINK } = payload ?? {};

  if (!title || !message) {
    throw new Error('A notification needs both a title and a message.');
  }

  // Deduplicated so a user id passed twice never produces two records.
  const uniqueIds = [...new Set(userIds.filter(Boolean).map(String))];

  return uniqueIds.map((userId) => ({ user: userId, type, title, message, link }));
};

const emit = async (userIds, payload) => {
  try {
    const docs = buildDocs(userIds, payload);
    if (docs.length === 0) return [];
    return await Notification.insertMany(docs);
  } catch (error) {
    console.error('[notifications] Could not create notification:', error.message);
    return [];
  }
};

/** One account. */
const notify = async (userId, payload) => emit([userId], payload);

/** A set of accounts, e.g. every student assigned to one advisor. */
const notifyMany = async (userIds, payload) => emit(userIds, payload);

/** Every active account holding a role, e.g. notifyRole('Coordinator', {...}). */
const notifyRole = async (role, payload) => {
  try {
    const users = await User.find({ role, isActive: true }).select('_id');
    return emit(users.map((user) => user._id), payload);
  } catch (error) {
    console.error('[notifications] Could not resolve role recipients:', error.message);
    return [];
  }
};

/** For records that only carry a GUC email — silently skipped if no account matches. */
const notifyByEmail = async (email, payload) => {
  if (!email) return [];
  try {
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('_id');
    return user ? notify(user._id, payload) : [];
  } catch (error) {
    console.error('[notifications] Could not resolve recipient by email:', error.message);
    return [];
  }
};

module.exports = { notify, notifyMany, notifyRole, notifyByEmail };

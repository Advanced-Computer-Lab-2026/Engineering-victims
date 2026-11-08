const { createHash, randomUUID } = require('crypto');
const mongoose = require('mongoose');
const NotificationEvent = require('../models/NotificationEvent');
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const User = require('../models/User');
const { EVENTS } = require('./notificationEvents');

const MAX_ATTEMPTS = 8;
const LEASE_MS = 60000;
const eventKey = (name, entityId, occurrence, studentId) => createHash('sha256')
  .update(JSON.stringify([name, String(entityId), String(occurrence), String(studentId)])).digest('hex');

async function resolveRecipients(policy, student, session) {
  if (!student.isActive) return [];
  if (policy.studentTypes && !policy.studentTypes.includes(student.studentType)) return [];
  if (policy.audience !== 'student' && student.studentType !== 'Advising Student') return [];
  let filter;
  if (policy.audience === 'student') {
    filter = { role: 'Student', email: student.email };
  } else if (policy.audience === 'advisor') {
    if (!student.assignedAdvisor) return [];
    filter = { role: 'Advisor', _id: student.assignedAdvisor };
  } else {
    filter = { role: 'Coordinator' };
  }
  const users = await User.find({ ...filter, isActive: true }).select('_id').session(session || null);
  return [...new Set(users.map((user) => String(user._id)))];
}

// Strict API: callers must observe enqueue failures. With a MongoDB transaction,
// pass its session to commit the business mutation and this event atomically.
// Without a transaction, enqueue after saving and handle/reconcile any failure.
async function publishNotificationEvent({ name, entityId, occurrence, studentId, title, message, link = '/notifications' }, { session } = {}) {
  const policy = Object.hasOwn(EVENTS, name) ? EVENTS[name] : null;
  if (!policy) throw new Error('Unknown notification event');
  if (!entityId || occurrence == null || String(occurrence).trim() === '') throw new Error('Event entity and stable occurrence are required');
  if (!mongoose.isValidObjectId(studentId)) throw new Error('Valid studentId required');
  if (typeof title !== 'string' || !title.trim() || typeof message !== 'string' || !message.trim()) throw new Error('Title and message required');
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//') || /[\\\r\n]/.test(link)) throw new Error('Use a local application link');
  const key = eventKey(name, entityId, occurrence, studentId);
  const existing = await NotificationEvent.findOne({ key }).session(session || null);
  if (existing) return existing;
  const student = await Student.findById(studentId).session(session || null);
  if (!student) throw new Error('Student not found');
  const recipients = await resolveRecipients(policy, student, session);
  const record = {
    key, name, entityId: String(entityId), occurrence: String(occurrence), student: student._id, recipients,
    payload: { type: policy.type, title: title.trim(), message: message.trim(), link },
  };
  try {
    return await NotificationEvent.findOneAndUpdate({ key }, { $setOnInsert: record }, { upsert: true, new: true, runValidators: true, session });
  } catch (error) {
    // Transactions must be retried by their caller after a duplicate-key abort.
    if (error.code === 11000 && !session) return NotificationEvent.findOne({ key });
    throw error;
  }
}

async function deliverNextNotificationEvent(now = new Date()) {
  const leaseToken = randomUUID();
  const event = await NotificationEvent.findOneAndUpdate({
    $or: [
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { status: 'processing', leaseUntil: { $lte: now } },
    ],
  }, {
    $set: { status: 'processing', leaseUntil: new Date(now.getTime() + LEASE_MS), leaseToken },
    $inc: { attempts: 1 },
  }, { new: true, sort: { nextAttemptAt: 1 } });
  if (!event) return false;
  const owned = { _id: event._id, leaseToken };
  try {
    // Only one visible row per event/account, even after a crash or lease expiry.
    for (const user of event.recipients) {
      const active = await User.exists({ _id: user, isActive: true });
      if (!active) continue;
      await Notification.updateOne({ eventKey: event.key, user }, {
        $setOnInsert: {
          type: event.payload.type, title: event.payload.title, message: event.payload.message,
          link: event.payload.link, user, eventKey: event.key,
        },
      }, { upsert: true, runValidators: true });
    }
    await NotificationEvent.updateOne(owned, { $set: {
      status: 'delivered', deliveredAt: new Date(), leaseUntil: null, leaseToken: null, lastError: null,
    } });
  } catch (error) {
    await NotificationEvent.updateOne(owned, { $set: {
      status: event.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 1000 * 2 ** Math.min(event.attempts, 12))),
      leaseUntil: null, leaseToken: null, lastError: String(error.message).slice(0, 1000),
    } });
  }
  return true;
}

function startNotificationWorker({ intervalMs = 5000, batchSize = 25, onError = console.error } = {}) {
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      for (let i = 0; i < batchSize && !stopped; i += 1) {
        if (!await deliverNextNotificationEvent()) break;
      }
    } catch (error) {
      onError('[notifications] Worker failed:', error.message);
    } finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}

module.exports = { publishNotificationEvent, deliverNextNotificationEvent, startNotificationWorker, eventKey, resolveRecipients };

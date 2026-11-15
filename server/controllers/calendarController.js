const crypto = require('crypto');
const User = require('../models/User');
const Student = require('../models/Student');
const Connection = require('../models/CalendarConnection');
const OAuthState = require('../models/CalendarOAuthState');
const google = require('../services/googleCalendarClient');
const googleSchedule = require('../services/calendarScheduleService');
const { timezone } = googleSchedule;

// Check the current database account as well as the JWT; revoked roles and
// deactivated accounts must not retain calendar access until their JWT expires.
exports.ownStudent = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('email role isActive');
    if (!user || !user.isActive || user.role !== 'Student') return res.status(403).json({ message: 'An active student account is required.' });
    const student = await Student.findOne({ email: user.email, isActive: true });
    if (!student || !['Normal Student', 'Advising Student'].includes(student.studentType)) {
      return res.status(403).json({ message: 'No active student record is linked to this account.' });
    }
    req.calendarStudent = student;
    next();
  } catch { res.status(500).json({ message: 'Could not verify your student account.' }); }
};
const handle = (action) => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await action(req, res); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Calendar operation failed. Please try again.' }); }
};

exports.status = handle(async (req, res) => {
  const connection = await Connection.findOne({ user: req.user.userId }).lean();
  res.json({
    configured: google.isConfigured(),
    connected: Boolean(connection),
    email: connection?.googleEmail || null, needsReconnect: connection?.needsReconnect || false,
    lastSyncedAt: connection?.lastSyncedAt || null, timezone: timezone(),
  });
});
exports.connect = handle(async (req, res) => {
  if (req.body?.provider && req.body.provider !== 'google') throw google.fail('Only Google Calendar is supported.', 400);
  google.config();
  if (await Connection.exists({ user: req.user.userId })) throw google.fail('Disconnect your current calendar before connecting another provider.', 409);
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  await OAuthState.deleteMany({ user: req.user.userId });
  await OAuthState.create({ user: req.user.userId, stateHash: google.hash(state),
    verifier: google.encrypt(verifier), expiresAt: new Date(Date.now() + 10 * 60000) });
  res.json({ url: google.authorizationUrl(state, verifier), state });
});
exports.complete = handle(async (req, res) => {
  if (req.body?.provider && req.body.provider !== 'google') throw google.fail('Only Google Calendar is supported.', 400);
  google.config();
  const { state, code } = req.body;
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || typeof code !== 'string' || !code || code.length > 4096) {
    throw google.fail('Invalid calendar authorization response. Connect again.', 400);
  }
  const pending = await OAuthState.findOneAndDelete({ user: req.user.userId,
    stateHash: google.hash(state), expiresAt: { $gt: new Date() } }).select('+verifier');
  if (!pending) throw google.fail('Calendar authorization expired or was already used. Connect again.', 400);
  const identity = await google.exchangeCode(code, google.decrypt(pending.verifier));
  try {
    await Connection.create({ user: req.user.userId, googleSubject: identity.subject,
      googleEmail: identity.email, refreshToken: google.encrypt(identity.refreshToken) });
  } catch (error) {
    if (error.code === 11000) throw google.fail('A calendar is already connected. Refresh this page.', 409);
    throw error;
  }
  res.json({ message: 'Google Calendar connected. Select Sync to export your processed schedule.' });
});
exports.sync = handle(async (req, res) => {
  const connection = await Connection.findOne({ user: req.user.userId }).select('_id').lean();
  if (!connection) throw google.fail('Connect a calendar before synchronizing.', 409);
  res.json(await googleSchedule.synchronize(req.user.userId, req.calendarStudent));
});
exports.disconnect = handle(async (req, res) => {
  const user = req.user.userId;
  const connection = await Connection.findOneAndDelete({ user,
    $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date() } }],
  }).select('+refreshToken');
  if (!connection && await Connection.exists({ user })) throw google.fail('Wait for synchronization to finish before disconnecting.', 409);
  if (!connection) {
    await OAuthState.deleteMany({ user });
    return res.json({ message: 'No calendar is currently connected.' });
  }
  await OAuthState.deleteMany({ user });
  let revoked = true;
  try { await google.revoke(google.decrypt(connection.refreshToken)); }
  catch { revoked = false; }
  res.json({ message: revoked
    ? 'Disconnected. Previously exported events remain in Google Calendar.'
    : 'Disconnected locally. Previously exported events remain. Remove this app from your Google account permissions to revoke access.' });
});

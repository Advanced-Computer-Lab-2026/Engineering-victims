const nodemailer = require('nodemailer');

/**
 * Outbound email over Gmail SMTP (FR 13.0 advisor add/remove, Req 2 password
 * changed, and the one-time code behind forgot-password).
 *
 * Configuration lives entirely in the environment:
 *
 *   MAIL_USER=engineeringvictims1@gmail.com
 *   MAIL_PASS=abcdefghijklmnop          # 16-char Gmail App Password
 *
 * Both are read on every send, so the values can be filled in while the server
 * is running. The password is an App Password, not the account password:
 * Google rejects plain account passwords on SMTP.
 *
 * Email is a notification, not a transaction: a Gmail outage must never fail a
 * password reset or an advisor removal. Every helper therefore logs and resolves
 * to { ok: false }, matching how notificationService swallows its own errors —
 * the in-app Notification row is written either way.
 */

const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 587;

let transporter = null;
let missingWarned = false;

/** App Passwords are shown grouped in fours — the spaces are not significant. */
const readCredentials = () => {
  const user = String(process.env.MAIL_USER || '').trim();
  const pass = String(process.env.MAIL_PASS || '').replace(/\s+/g, '');
  return user && pass ? { user, pass } : null;
};

const isConfigured = () => Boolean(readCredentials());

const getTransporter = () => {
  const credentials = readCredentials();
  if (!credentials) return null;

  // Built once and reused; rebuilt if the credentials change underneath it.
  if (!transporter || transporter.options.auth.user !== credentials.user) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // port 587 upgrades with STARTTLS
      requireTLS: true,
      auth: credentials,
    });
  }
  return transporter;
};

/**
 * Sends one message. Never throws.
 *
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
const sendMail = async ({ to, subject, text, html }) => {
  if (!to) return { ok: false, error: 'No recipient' };

  const credentials = readCredentials();
  if (!credentials) {
    if (!missingWarned) {
      missingWarned = true;
      console.warn('[mail] MAIL_USER / MAIL_PASS are not set — email is disabled.');
      console.warn('[mail] Add them to server/.env (see server/.env.example).');
    }
    return { ok: false, error: 'Mail is not configured' };
  }

  try {
    await getTransporter().sendMail({
      from: `"University Schedule Management System" <${credentials.user}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`[mail] Sent "${subject}" to ${to}`);
    return { ok: true };
  } catch (error) {
    // Logged, never rethrown — see the contract at the top of this file.
    console.error(`[mail] Failed to send "${subject}" to ${to}:`, error.message);
    return { ok: false, error: error.message };
  }
};

/** Minimal inline-styled HTML so the message survives Gmail stripping classes. */
const wrap = (heading, paragraphs, code) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">
    <h2 style="margin:0 0 4px;font-size:18px">University Schedule Management System</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px">${heading}</p>
    ${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${p}</p>`).join('')}
    ${
      code
        ? `<p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:8px;padding:16px;margin:20px 0">${code}</p>`
        : ''
    }
    <p style="font-size:13px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px;margin-top:24px">
      This is an automated message from the University Schedule Management System.
    </p>
  </div>`;

/** Req 2 / forgot-password: the one-time reset code. */
const sendPasswordResetCode = (to, otp) =>
  sendMail({
    to,
    subject: 'Your password reset code',
    text:
      `Use this one-time code to reset your password.\n\n` +
      `Code: ${otp}\n\n` +
      `It expires in 10 minutes. If you did not request this, ignore this email.\n`,
    html: wrap(
      'Your password reset code',
      ['Use this one-time code to reset your password. It expires in <strong>10 minutes</strong>.'],
      otp
    ),
  });

/** Req 2: a security event the account should see after the change. */
const sendPasswordChanged = (to) =>
  sendMail({
    to,
    subject: 'Your password was changed',
    text:
      'The password for your GUC account was updated.\n\n' +
      'If this was not you, contact your coordinator immediately.\n',
    html: wrap('Your password was changed', [
      'The password for your GUC account was updated.',
      'If this was not you, contact your coordinator immediately.',
    ]),
  });

/** FR 13.0: the same events the in-app notification already records. */
const sendAdvisorChange = (to, { added, name }) =>
  added
    ? sendMail({
        to,
        subject: 'Added to the Advising System',
        text:
          `${name}, you have been added as an Advisor in the University Schedule Management System.\n`,
        html: wrap('Added to the Advising System', [
          `${name}, you have been added as an <strong>Advisor</strong> in the University Schedule Management System.`,
        ]),
      })
    : sendMail({
        to,
        subject: 'Removed from the Advising System',
        text:
          `${name}, you have been removed as an Advisor from the University Schedule Management System.\n` +
          'Your previous actions remain in the system history.\n',
        html: wrap('Removed from the Advising System', [
          `${name}, you have been removed as an <strong>Advisor</strong> from the University Schedule Management System.`,
          'Your previous actions remain in the system history.',
        ]),
      });

module.exports = {
  isConfigured,
  sendMail,
  sendPasswordResetCode,
  sendPasswordChanged,
  sendAdvisorChange,
};

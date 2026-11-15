const crypto = require('crypto');
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const fail = (message, status = 503) => Object.assign(new Error(message), { status });
function config() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  const key = Buffer.from(process.env.CALENDAR_TOKEN_KEY || '', 'base64');
  if (!clientId || !clientSecret || !redirectUri || key.length !== 32) {
    throw fail('Google Calendar is not configured. Contact your administrator.');
  }
  let redirect;
  try { redirect = new URL(redirectUri); } catch { throw fail('Invalid Calendar redirect configuration.'); }
  if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname))) {
    throw fail('Calendar requires an HTTPS redirect, except on localhost.');
  }
  if (redirect.pathname !== '/schedule' || redirect.search || redirect.hash || redirect.username || redirect.password) {
    throw fail('Calendar redirect must be the application /schedule page.');
  }
  return { clientId, clientSecret, redirectUri, key };
}
const isConfigured = () => { try { config(); return true; } catch { return false; } };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config().key, iv);
  return Buffer.concat([iv,
    cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
function decrypt(value) {
  const bytes = Buffer.from(value, 'base64');
  const cipher = crypto.createDecipheriv('aes-256-gcm', config().key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8');
}

async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); }
  catch { throw fail('Google Calendar could not be reached. Retry synchronization.'); }
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    // Never return provider bodies: they can contain credentials or private data.
    const error = fail(response.status === 429 ? 'Google Calendar is busy. Try again later.' : 'Google Calendar rejected the request. Try again or reconnect.');
    error.providerStatus = response.status;
    error.needsReconnect = data.error === 'invalid_grant' || response.status === 401;
    throw error;
  }
  return data;
}
const tokenRequest = (params) => request(TOKEN_URL, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params).toString(),
});
function authorizationUrl(state, verifier) {
  const cfg = config();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code',
    scope: `openid email ${SCOPE}`, access_type: 'offline', prompt: 'consent',
    state, code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return url.toString();
}
async function exchangeCode(code, verifier) {
  const cfg = config();
  const tokens = await tokenRequest({ client_id: cfg.clientId, client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri, grant_type: 'authorization_code', code, code_verifier: verifier });
  if (!tokens.access_token) throw fail('Google did not return an access token. Connect again.', 400);
  const grantedScopes = new Set(String(tokens.scope || '').split(/\s+/));
  // Google can return an already granted broader calendar scope. Accept that
  // grant, but continue requesting only calendar.events.owned on new consent.
  const canEditOwnedEvents = [SCOPE, 'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar'].some((scope) => grantedScopes.has(scope));
  if (!canEditOwnedEvents) {
    throw fail('Calendar access was not granted. Connect again and select the permission to see, create, change and delete calendar events on Google’s consent screen before continuing.', 400);
  }
  if (!tokens.refresh_token) {
    throw fail('Google granted calendar access but did not return offline access. Remove this app’s existing connection in your Google Account’s third-party connections, then connect again.', 400);
  }
  const profile = await request('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profile.sub) throw fail('Could not identify the connected Google account.');
  return { refreshToken: tokens.refresh_token, subject: profile.sub, email: profile.email || null };
}
async function accessToken(refreshToken) {
  const cfg = config();
  const tokens = await tokenRequest({ client_id: cfg.clientId, client_secret: cfg.clientSecret,
    grant_type: 'refresh_token', refresh_token: refreshToken });
  if (!tokens.access_token) throw fail('Reconnect your Google Calendar account.', 409);
  return tokens.access_token;
}
const eventRequest = (token, method, id = '', body) => request(`${EVENTS_URL}${id ? `/${encodeURIComponent(id)}` : ''}`, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function revoke(refreshToken) {
  return request('https://oauth2.googleapis.com/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }).toString(),
  });
}
module.exports = { config, isConfigured, hash, encrypt, decrypt, authorizationUrl, exchangeCode, accessToken, eventRequest, revoke, fail };

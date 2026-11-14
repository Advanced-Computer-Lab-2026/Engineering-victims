const google = require('../services/googleCalendarClient');
const originalFetch = global.fetch;
beforeEach(() => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'http://localhost:5173/schedule';
  process.env.CALENDAR_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
  global.fetch = jest.fn();
});
afterEach(() => { global.fetch = originalFetch; });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
test('AES-GCM encryption uses fresh nonces and detects tampering', () => {
  const first = google.encrypt('refresh-secret');
  expect(first).not.toBe(google.encrypt('refresh-secret'));
  expect(google.decrypt(first)).toBe('refresh-secret');
  const tampered = Buffer.from(first, 'base64');
  tampered[14] ^= 1;
  expect(() => google.decrypt(tampered.toString('base64'))).toThrow();
});
test('missing or insecure configuration disables connection', () => {
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'http://example.com/schedule';
  expect(google.isConfigured()).toBe(false);
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://example.com/schedule';
  expect(google.isConfigured()).toBe(true);
  delete process.env.CALENDAR_TOKEN_KEY;
  expect(google.isConfigured()).toBe(false);
});
test('token exchange sends the PKCE verifier and backend secret only to Google', async () => {
  global.fetch.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', scope: 'openid https://www.googleapis.com/auth/calendar.events.owned' }))
    .mockResolvedValueOnce(response({ sub: 'google-1', email: 'person@gmail.com' }));
  await expect(google.exchangeCode('code', 'verifier')).resolves.toEqual({ refreshToken: 'refresh', subject: 'google-1', email: 'person@gmail.com' });
  const params = new URLSearchParams(global.fetch.mock.calls[0][1].body);
  expect(params.get('code_verifier')).toBe('verifier');
  expect(params.get('client_secret')).toBe('test-secret');
  expect(global.fetch.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
});
test('declining calendar scope cannot create a connection', async () => {
  global.fetch.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', scope: 'openid email' }));
  await expect(google.exchangeCode('code', 'verifier')).rejects.toThrow('Calendar access was not granted');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('invalid grants are flagged for reconnection without exposing Google bodies', async () => {
  global.fetch.mockResolvedValueOnce(response({ error: 'invalid_grant', error_description: 'private-provider-details' }, 400));
  await expect(google.accessToken('refresh')).rejects.toMatchObject({ needsReconnect: true });
});
test('missing offline token is distinguished from denied calendar permission', async () => {
  global.fetch.mockResolvedValueOnce(response({ access_token: 'access', scope: 'https://www.googleapis.com/auth/calendar.events.owned' }));
  await expect(google.exchangeCode('code', 'verifier')).rejects.toThrow('did not return offline access');
});
test.each(['calendar', 'calendar.events'])('an existing broader %s grant authorizes owned events', async (scope) => {
  global.fetch.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', scope: `https://www.googleapis.com/auth/${scope}` }))
    .mockResolvedValueOnce(response({ sub: 'google-1' }));
  await expect(google.exchangeCode('code', 'verifier')).resolves.toMatchObject({ subject: 'google-1' });
});
test('read-only calendar grants remain insufficient', async () => {
  global.fetch.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', scope: 'https://www.googleapis.com/auth/calendar.readonly' }));
  await expect(google.exchangeCode('code', 'verifier')).rejects.toThrow('Calendar access was not granted');
});
test('event calls use bearer headers and primary-calendar endpoints', async () => {
  global.fetch.mockResolvedValueOnce(response({ id: 'event-1' }));
  await google.eventRequest('secret-access', 'POST', '', { summary: 'Class' });
  expect(global.fetch.mock.calls[0][0]).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-access');
  expect(global.fetch.mock.calls[0][0]).not.toContain('secret-access');
});
test('rate limits are retryable and cannot be mistaken for deleted events', async () => {
  global.fetch.mockResolvedValueOnce(response({}, 429));
  await expect(google.eventRequest('access', 'GET', 'event-1')).rejects.toMatchObject({ providerStatus: 429, status: 503 });
});

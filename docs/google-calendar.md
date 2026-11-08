# FR 116 — Google Calendar synchronization

Both Normal and Advising Students can connect Google Calendar from **My Schedule**,
then select **Sync schedule**. Sync exports only processed rows for the current
teaching term, or the next available processed term. An Advising Student must also
have workflow status `Processed`. Draft, review-ready and reopened schedules cannot
be exported. An expired teaching period is not offered for export.

Each slot becomes one weekly recurring series, starting on its first teaching day
and ending with its last occurrence inside the inclusive teaching period. Events
include the course code/name, slot type, time, room and instructor when available.
The default university timezone is `Africa/Cairo`, configurable with an IANA timezone
name. Explicit timezone plus recurrence count preserves local class times over DST.
The existing term API stores date-only inputs at UTC midnight; their YYYY-MM-DD is
interpreted as the university's teaching date, independently of browser timezone.

## Setup

1. In [Google Cloud Console](https://console.cloud.google.com/), enable **Google
   Calendar API** and configure an OAuth consent screen.
2. Create an OAuth client of type **Web application**. Register the exact frontend
   redirect URI, e.g. `http://localhost:5173/schedule`. Production requires HTTPS.
   This is the frontend `/schedule` route, not a backend callback. If Vite chooses
   a different port, use the registered port or update the configuration and client.
3. Configure `openid`, `email`, and
   `https://www.googleapis.com/auth/calendar.events.owned`. Add the Google accounts
   used for testing as consent-screen test users. Follow Google's publishing and
   verification requirements before distributing beyond testing.
4. Add these server-only values to `server/.env` (placeholders also appear in
   `server/.env.example`):

   ```dotenv
   GOOGLE_CALENDAR_CLIENT_ID=your-web-client-id
   GOOGLE_CALENDAR_CLIENT_SECRET=your-client-secret
   GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:5173/schedule
   CALENDAR_TOKEN_KEY=your-base64-encoded-32-byte-key
   UNIVERSITY_TIMEZONE=Africa/Cairo
   ```

   Generate the key with:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

5. Restart the API. Sign in as a student, open **My Schedule**, connect the desired
   Google account and grant access, then sync. Missing setup leaves the app usable
   and displays a setup-pending message. Credentials never belong in `VITE_*` vars.

Keep the encryption key stable and back it up privately. Rotating or losing it
requires disconnecting and reconnecting accounts. Never commit actual OAuth secrets
or the encryption key. This implementation does not request calendar passwords.

## Security and synchronization behavior

The backend starts OAuth with offline access, PKCE and a hashed, ten-minute state
record tied to the authenticated user. A same-tab state copy in `sessionStorage`
binds the browser return. The frontend removes OAuth response parameters from its
URL, then completes authorization through an authenticated POST. Completion consumes
the unexpired state atomically; replay and cross-user completion fail. Google access
and refresh tokens never reach the frontend. Refresh tokens and pending PKCE
verifiers are stored using authenticated AES-256-GCM encryption. Access tokens live
only in server memory for a synchronization operation.

The connected Google account can differ from the student's GUC account. Its stable
Google subject isolates mappings across accounts. Sync targets that account's
primary calendar. It creates no attendees or meeting invitations.

Repeated sync updates tracked series using durable mappings and deterministic
Google event IDs. A partial failure can be retried without starting new series.
Removed slots are deleted only from the synchronized term and only after verifying
the app's ownership marker. User-deleted series can be recreated with a reserved
replacement generation. A renewable connection lease serializes sync requests;
disconnect waits while a live sync holds the lease.

Disconnect removes stored credentials, invalidates pending authorizations and
attempts to revoke the Google grant. Previously exported events remain; the UI says
so. Mapping metadata is retained to avoid duplicate exports if the same Google
account reconnects. If provider revocation fails, the UI explains how to revoke
access in Google account settings. Revoked grants are detected on sync and prompt
disconnect/reconnect. Google testing-mode tokens may expire; see the OAuth guidance.

Synchronization is explicitly user-triggered. Automatic schedule-processing hooks,
Outlook support and two-way editing are outside this implementation. Personal
calendar edits do not modify university schedules. Database indexes are initialized
at API startup; deployments disabling automatic index creation must provision the
unique indexes before accepting calendar operations.

## API and verification

All routes require an authenticated, currently active Student and active linked
directory record. No route accepts a target user or target student from the client.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/calendar` | Safe connection/configuration status |
| POST | `/api/calendar/connect` | Begin OAuth |
| POST | `/api/calendar/complete` | Consume state and exchange code |
| POST | `/api/calendar/sync` | Synchronize own processed schedule |
| DELETE | `/api/calendar` | Disconnect and attempt grant revocation |

Run `npm test --prefix server -- --runInBand calendar`. Tests mock Google and MongoDB;
they never send calendar requests or change a real account. They cover ownership,
roles, encrypted tokens, OAuth state, processed-only export, teaching boundaries,
DST, repeated sync, deleted events, stale slots, lease conflicts and revoked grants.

Before deployment, use a disposable student account and calendar to verify consent,
refresh after restarting the server, real unique indexes/lease contention, repeated
sync, slot replacement, permission revocation and disconnect. That live acceptance
test requires operator-supplied Google OAuth credentials and consent.

Official references: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[Calendar scopes](https://developers.google.com/workspace/calendar/api/auth),
[recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents),
[event IDs and creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

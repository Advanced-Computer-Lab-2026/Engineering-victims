# Google Calendar integration

The student schedule page supports exporting a processed schedule to Google
Calendar. The project includes the integration code and the required
configuration variable names in `server/.env.example`; it does not include
Google OAuth credentials. Create an OAuth client in a Google Cloud project you
can access, then configure the server as follows.

## Google Cloud setup

1. In Google Cloud Console, select or create a project and enable the Google
   Calendar API.
2. Configure the OAuth consent screen for your testing audience.
3. Create an OAuth client ID for a **Web application**.
4. Add the exact application URL ending in `/schedule` as an authorized
   redirect URI. For local Vite development, this is usually
   `http://localhost:5173/schedule`.
5. Add the client ID and client secret to `server/.env` as
   `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`.

The redirect URI must match `GOOGLE_CALENDAR_REDIRECT_URI` and the browser's
origin exactly. For local development, set it to
`http://localhost:5173/schedule`.

## Encryption key and testing

Set `CALENDAR_TOKEN_KEY` to a stable, private, base64-encoded 32-byte key. The
example file includes this command to generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Changing the key makes previously stored refresh tokens unreadable, so
connected users would need to reconnect. Do not commit `server/.env` or share
the client secret or encryption key.

After setting the variables, restart the server. Sign in as a student with a
processed schedule, open **My Schedule**, select **Connect Google**, and approve
access. Select **Sync schedule** to export recurring class events for the
current or upcoming teaching period. Sync again after schedule changes.

Repeated syncs update events created by this application. Events not owned by
the application are not edited or deleted. Disconnecting removes the local
connection and attempts to revoke the Google refresh token; previously exported
events remain in Google Calendar.

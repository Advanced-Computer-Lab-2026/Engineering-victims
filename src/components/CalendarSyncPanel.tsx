import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, RefreshCw, Unplug } from 'lucide-react';
import { apiFetch } from '../lib/api';
import AlertBanner from './ui/AlertBanner';
import Card from './ui/Card';
import CustomButton from './ui/CustomButton';

interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
  lastSyncedAt: string | null;
  timezone: string;
}
const STATE_KEY = 'googleCalendarOAuthState';
const CalendarSyncPanel: React.FC<{ processed: boolean }> = ({ processed }) => {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null);
  const initialized = useRef(false);
  const load = async () => setStatus(await apiFetch<CalendarStatus>('/api/calendar'));

  useEffect(() => {
    // StrictMode replays effects. Consume each authorization response only once.
    if (initialized.current) return;
    initialized.current = true;
    const finish = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const denied = url.searchParams.get('error');
        if (code || state || denied) {
          ['code', 'state', 'error', 'error_description', 'scope', 'authuser', 'prompt', 'hd', 'session_state', 'client_info'].forEach((key) => url.searchParams.delete(key));
          window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
          const expected = sessionStorage.getItem(STATE_KEY);
          sessionStorage.removeItem(STATE_KEY);
          if (!state || !expected || state !== expected) throw new Error('Calendar authorization could not be verified. Connect again in this browser tab.');
          if (denied) throw new Error('Calendar connection was cancelled. You can connect again.');
          if (!code) throw new Error('The calendar provider did not return an authorization code. Connect again.');
          const result = await apiFetch<{ message: string }>('/api/calendar/complete', {
            method: 'POST', body: JSON.stringify({ code, state }),
          });
          setNotice({ error: false, message: result.message });
        }
      } catch (error) {
        setNotice({ error: true, message: error instanceof Error ? error.message : 'Could not connect Google Calendar.' });
      }
      try { await load(); }
      catch (error) { setNotice({ error: true, message: error instanceof Error ? error.message : 'Could not load calendar status.' }); }
      finally { setBusy(false); }
    };
    void finish();
  }, []);

  const act = async (action: 'connect' | 'sync' | 'disconnect' | 'reload') => {
    setBusy(true);
    setNotice(null);
    try {
      if (action === 'connect') {
        const result = await apiFetch<{ url: string; state: string }>('/api/calendar/connect', {
          method: 'POST',
        });
        const authUrl = new URL(result.url);
        if (authUrl.origin !== 'https://accounts.google.com' || authUrl.searchParams.get('redirect_uri') !== `${window.location.origin}/schedule`) {
          throw new Error('The calendar redirect address must match this application. Contact your administrator.');
        }
        sessionStorage.setItem(STATE_KEY, result.state);
        window.location.assign(result.url);
        return;
      }
      if (action === 'sync') {
        const result = await apiFetch<{ count: number; removed: number; term: string }>('/api/calendar/sync', { method: 'POST' });
        setNotice({ error: false, message: `Synchronized ${result.count} recurring class events for ${result.term}.${result.removed ? ` Removed ${result.removed} outdated events.` : ''}` });
      } else if (action === 'disconnect') {
        const result = await apiFetch<{ message: string }>('/api/calendar', { method: 'DELETE' });
        setNotice({ error: false, message: result.message });
      }
      await load();
    } catch (error) {
      setNotice({ error: true, message: error instanceof Error ? error.message : 'Calendar operation failed.' });
      try { await load(); } catch { /* Keep the operation error visible. */ }
    } finally { setBusy(false); }
  };

  return (
    <Card className="mb-5 p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-semibold text-on-surface"><CalendarDays className="h-4 w-4" aria-hidden />Calendar sync</h2>
          <p className="text-body text-on-surface-variant">Copy your processed schedule to Google Calendar for the teaching period.</p>
          {status?.connected && <p className="text-body text-on-surface">Connected{status.email ? ` as ${status.email}` : ''} · {status.timezone}</p>}
          {status?.lastSyncedAt && <p className="text-caption text-on-surface-variant">Last synchronized: {new Date(status.lastSyncedAt).toLocaleString()}</p>}
          {status && !status.configured && <p className="text-body text-warning">Calendar integration setup is pending. Contact your administrator.</p>}
          {status?.needsReconnect && <p className="text-body text-warning">Calendar access expired or was revoked. Disconnect, then connect again.</p>}
          {!processed && <p className="text-caption text-on-surface-variant">Synchronization becomes available when your schedule is processed.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.connected ? <>
            <CustomButton size="sm" disabled={busy || !processed || !status.configured || status.needsReconnect} onClick={() => void act('sync')} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>Sync schedule</CustomButton>
            <CustomButton size="sm" variant="secondary" disabled={busy} onClick={() => void act('disconnect')} icon={<Unplug className="h-4 w-4" aria-hidden />}>Disconnect</CustomButton>
          </> : <>
            <CustomButton size="sm" disabled={busy || !status?.configured} onClick={() => void act('connect')}>Connect Google</CustomButton>
          </>}
          {!status && !busy && <CustomButton size="sm" variant="secondary" onClick={() => void act('reload')}>Retry</CustomButton>}
        </div>
      </div>
      <p className="mt-3 text-caption text-on-surface-variant">Use Sync after a processed schedule changes. Disconnecting leaves previously exported events in your calendar.</p>
      {busy && <p className="mt-3 text-body text-on-surface-variant" role="status">Updating calendar connection…</p>}
      {notice && <div className="mt-3"><AlertBanner tone={notice.error ? 'error' : 'success'} onDismiss={() => setNotice(null)}>{notice.message}</AlertBanner></div>}
    </Card>
  );
};
export default CalendarSyncPanel;

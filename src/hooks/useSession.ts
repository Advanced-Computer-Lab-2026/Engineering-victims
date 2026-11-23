import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { createSessionStore } from '../lib/sessionStore';
import type { SessionUser } from '../lib/types';

const TOKEN_KEY = 'token';

/** One-shot message explaining why the sign-in screen is showing. */
export const SESSION_NOTICE_KEY = 'session-notice';

/** Reads and clears the notice, so it is shown exactly once. */
export const consumeSessionNotice = (): string | null => {
  const notice = sessionStorage.getItem(SESSION_NOTICE_KEY);
  if (notice) sessionStorage.removeItem(SESSION_NOTICE_KEY);
  return notice;
};

interface SessionState {
  user: SessionUser | null;
  isLoading: boolean;
  logout: () => void;
  /** Re-reads the session, e.g. after a token change. */
  refresh: () => void;
}

/**
 * The session is fetched once and shared.
 *
 * ProtectedRoute, AppLayout and the pages all need the current user. Without a
 * cache, mounting them together would fire one /api/auth/me request per
 * consumer, so the result is memoised at module scope and subscribers share it.
 * The cache is tied to the token it was loaded with (see sessionStore), so it
 * can never show one account while requests carry another account's token.
 */
const store = createSessionStore<SessionUser>({
  readToken: () => localStorage.getItem(TOKEN_KEY),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
  // apiFetch reads the same stored token synchronously when it sends.
  fetchUser: async () => (await apiFetch<{ user: SessionUser }>('/api/auth/me')).user,
});

if (typeof window !== 'undefined') {
  /**
   * `apiFetch` announces a rejected token rather than redirecting, so this stays
   * the one place that knows how a dead session is cleared. The guards then see
   * a null user and send the visitor to sign-in, which reads the notice.
   */
  window.addEventListener('session-expired', () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('user');
    sessionStorage.setItem(SESSION_NOTICE_KEY, 'Your session expired. Sign in again to continue.');
    store.clear();
  });

  // localStorage is shared by every tab. When another tab signs in as someone
  // else or signs out, this tab re-reads who it is now signed in as.
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === TOKEN_KEY || event.key === null) void store.load();
  });
}

export const useSession = (): SessionState => {
  const [snapshot, setSnapshot] = useState(() => {
    const current = store.getSnapshot();
    return store.isCurrent() ? current : { user: null, isLoading: true };
  });

  useEffect(() => {
    const unsubscribe = store.subscribe(setSnapshot);
    // Reload when nothing is cached or the cache belongs to a different token,
    // e.g. a sign-in that happened while no consumer was listening.
    void store.ensureCurrent().finally(() => setSnapshot(store.getSnapshot()));

    // Another component signed in or out.
    const onAuthChange = () => { void store.load(); };
    window.addEventListener('auth-changed', onAuthChange);

    return () => {
      unsubscribe();
      window.removeEventListener('auth-changed', onAuthChange);
    };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('user');
    store.clear();
  }, []);

  const refresh = useCallback(() => {
    void store.load();
  }, []);

  return { user: snapshot.user, isLoading: snapshot.isLoading, logout, refresh };
};

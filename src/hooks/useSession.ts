import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import type { SessionUser } from '../lib/types';

const TOKEN_KEY = 'token';

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
 */
let cachedUser: SessionUser | null = null;
let inFlight: Promise<void> | null = null;
const subscribers = new Set<(user: SessionUser | null) => void>();

const publish = (user: SessionUser | null) => {
  cachedUser = user;
  subscribers.forEach((notify) => notify(user));
};

const load = () => {
  if (inFlight) return inFlight;

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    publish(null);
    inFlight = null;
    return Promise.resolve();
  }

  inFlight = apiFetch<{ user: SessionUser }>('/api/auth/me')
    .then((response) => publish(response.user))
    .catch((err: ApiError) => {
      // Only an auth failure means the session is dead. A network blip must
      // not sign the user out.
      if (err.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        publish(null);
      } else {
        publish(null);
      }
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

export const useSession = (): SessionState => {
  const [user, setUser] = useState<SessionUser | null>(cachedUser);
  const [isLoading, setIsLoading] = useState(cachedUser === null);

  useEffect(() => {
    subscribers.add(setUser);

    if (cachedUser !== null) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
      load().finally(() => setIsLoading(false));
    }

    // Another component signed in or out.
    const onAuthChange = () => {
      setIsLoading(true);
      load().finally(() => setIsLoading(false));
    };
    window.addEventListener('auth-changed', onAuthChange);

    return () => {
      subscribers.delete(setUser);
      window.removeEventListener('auth-changed', onAuthChange);
    };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('user');
    publish(null);
  }, []);

  const refresh = useCallback(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, []);

  return { user, isLoading, logout, refresh };
};

/**
 * The signed-in user, shared by every useSession consumer in this tab.
 *
 * The token lives in localStorage, which every tab of the browser shares, but
 * the user loaded from /api/auth/me is cached in this tab's memory. A cached
 * user therefore only counts while the exact token it was loaded with is still
 * stored. When another tab signs in as someone else (or signs out), or a slow
 * /me answer for an older token arrives late, the tab reloads the session
 * instead of showing one identity while its API calls send another.
 *
 * Framework-free so the rules can be tested without a browser.
 */
export interface SessionSnapshot<U> {
  user: U | null;
  isLoading: boolean;
}

export interface SessionStoreDeps<U> {
  readToken: () => string | null;
  /** Called when the server rejects the stored token (401). */
  clearToken: () => void;
  /** GET /api/auth/me for this token. Rejects with `{ status }` on failure. */
  fetchUser: (token: string) => Promise<U>;
}

export const createSessionStore = <U>(deps: SessionStoreDeps<U>) => {
  let snapshot: SessionSnapshot<U> = { user: null, isLoading: false };
  /** The token the cached user was loaded with. */
  let userToken: string | null = null;
  let inFlight: { token: string; promise: Promise<void> } | null = null;
  const subscribers = new Set<(next: SessionSnapshot<U>) => void>();

  const publish = (next: SessionSnapshot<U>, token: string | null) => {
    snapshot = next;
    userToken = token;
    subscribers.forEach((notify) => notify(snapshot));
  };

  /** The cached user belongs to the token that is stored right now. */
  const isCurrent = () => snapshot.user !== null && userToken === deps.readToken();

  const load = (): Promise<void> => {
    const token = deps.readToken();
    if (!token) {
      inFlight = null;
      publish({ user: null, isLoading: false }, null);
      return Promise.resolve();
    }
    if (inFlight && inFlight.token === token) return inFlight.promise;

    // Never keep showing a user that belongs to a different token while the
    // new one is checked: role-gated screens wait instead of guessing.
    if (userToken !== token) publish({ user: null, isLoading: true }, null);

    const promise: Promise<void> = deps.fetchUser(token).then(
      (user) => {
        // The token changed while this answer was on its way: it describes an
        // account this tab no longer holds, so read the current one instead.
        if (deps.readToken() !== token) return load();
        publish({ user, isLoading: false }, token);
      },
      (error: { status?: number }) => {
        if (deps.readToken() !== token) return load();
        // Only an auth failure means the session is dead.
        if (error?.status === 401) deps.clearToken();
        publish({ user: null, isLoading: false }, null);
      }
    ).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { token, promise };
    return promise;
  };

  return {
    getSnapshot: () => snapshot,
    isCurrent,
    load,
    /** Loads only when the cached user is missing or belongs to another token. */
    ensureCurrent: () => (isCurrent() ? Promise.resolve() : load()),
    /** Local sign-out or an expired session: forget the user immediately. */
    clear: () => {
      inFlight = null;
      publish({ user: null, isLoading: false }, null);
    },
    subscribe: (notify: (next: SessionSnapshot<U>) => void) => {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
  };
};

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

interface HistoryNavigation {
  /** True when there is an earlier page to return to. */
  canGoBack: boolean;
  /** True when a page was left behind and can be re-entered. */
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

const entryFor = (location: { pathname: string; search: string; hash: string }) =>
  `${location.pathname}${location.search}${location.hash}`;

type NavigationType = 'POP' | 'PUSH' | 'REPLACE';

interface NavigationOutcome {
  /** Index the cursor landed on. */
  index: number;
  /** Where the cursor should sit on the next POP; null once consumed. */
  pendingIndex: number | null;
}

/**
 * The pure part of the stack update, kept separate from React so it can be
 * exercised without a DOM. `entries` is mutated in place (the hook owns it).
 *
 * - PUSH       → anything ahead of the cursor is dropped before appending,
 *                which is why navigating to a new page clears the forward
 *                history, just like Chrome
 * - REPLACE    → the current entry is overwritten (login redirects, guards)
 * - POP        → move the cursor to `pendingIndex` when this POP is one of
 *                our own button clicks, otherwise to the closest matching
 *                entry, which is how the browser's back/forward is followed
 */
export const applyNavigation = (
  entries: string[],
  index: number,
  entry: string,
  navigationType: NavigationType,
  pendingIndex: number | null
): NavigationOutcome => {
  if (navigationType === 'PUSH') {
    entries.length = index + 1;
    entries.push(entry);
    return { index: entries.length - 1, pendingIndex: null };
  }

  if (navigationType === 'REPLACE') {
    if (index >= 0) {
      entries[index] = entry;
      return { index, pendingIndex: null };
    }
    entries.push(entry);
    return { index: 0, pendingIndex: null };
  }

  if (pendingIndex !== null && entries[pendingIndex] === entry) {
    return { index: pendingIndex, pendingIndex: null };
  }

  let closest = -1;
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i] !== entry) continue;
    if (closest === -1 || Math.abs(i - index) < Math.abs(closest - index)) closest = i;
  }

  if (closest === -1) {
    entries.push(entry);
    return { index: entries.length - 1, pendingIndex: null };
  }

  return { index: closest, pendingIndex: null };
};

/**
 * Chrome-style back/forward controls for react-router.
 *
 * The router (and the browser history it sits on) will happily move backwards
 * and forwards, but it never says whether there is anywhere to go — so the
 * buttons cannot be enabled or disabled without tracking that ourselves. This
 * keeps its own stack of visited entries plus a cursor, updated by
 * `applyNavigation` above.
 *
 * The stack only covers this page load, so the buttons can never walk out of
 * the app: on the first page both are disabled.
 *
 * It lives at module scope rather than in component state on purpose — the
 * layout is declared on several route groups, so React Router may unmount it
 * while moving between pages such as /students and /terms, which would throw
 * the history away exactly when it is needed.
 */
const entries: string[] = [];
let cursor = -1;
let pendingIndex: number | null = null;
let lastSeen: string | null = null;

const currentStatus = () => ({ canGoBack: cursor > 0, canGoForward: cursor < entries.length - 1 });

export const useHistoryNavigation = (): HistoryNavigation => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();

  const [status, setStatus] = useState(currentStatus);

  useEffect(() => {
    const entry = entryFor(location);

    // React 18 StrictMode runs effects twice for the same navigation; a
    // location key + navigation type identifies one move, so it is recorded
    // once. Without this the first page would look like it had history.
    const signature = `${location.key}:${navigationType}`;
    if (lastSeen === signature) return;
    lastSeen = signature;

    const outcome = applyNavigation(entries, cursor, entry, navigationType, pendingIndex);

    cursor = outcome.index;
    pendingIndex = outcome.pendingIndex;
    setStatus(currentStatus());
  }, [location, navigationType]);

  const goBack = useCallback(() => {
    if (cursor <= 0) return;
    pendingIndex = cursor - 1;
    navigate(-1);
  }, [navigate]);

  const goForward = useCallback(() => {
    if (cursor >= entries.length - 1) return;
    pendingIndex = cursor + 1;
    navigate(1);
  }, [navigate]);

  return { canGoBack: status.canGoBack, canGoForward: status.canGoForward, goBack, goForward };
};

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { fetchUnreadCount } from '../lib/notificationsService';

interface UnreadCountState {
  unreadCount: number | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Unread notification count for the sidebar badge and dashboard tile.
 *
 * Subscribes to the "notifications-changed" broadcast, so marking something
 * read on the notifications page updates every other place showing the count
 * without a page reload.
 */
export const useUnreadCount = (): UnreadCountState => {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchUnreadCount()
      .then((response) => {
        setUnreadCount(response.unreadCount);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) setUnreadCount(null);
        setError(err instanceof ApiError ? err.message : 'Could not load unread notifications.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = window.setInterval(refreshIfVisible, 30_000);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('notifications-changed', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('notifications-changed', refresh);
    };
  }, [refresh]);

  return { unreadCount, isLoading, error, refresh };
};

export default useUnreadCount;

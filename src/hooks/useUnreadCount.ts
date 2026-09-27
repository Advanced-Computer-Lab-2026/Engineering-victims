import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { fetchUnreadCount } from '../lib/notificationsService';

interface UnreadCountState {
  unreadCount: number | null;
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

  const refresh = useCallback(() => {
    fetchUnreadCount()
      .then((response) => setUnreadCount(response.unreadCount))
      .catch((err: ApiError) => {
        // A signed-out or unreachable session shows no badge rather than a stale one.
        if (err.status === 401) setUnreadCount(null);
      });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('notifications-changed', refresh);
    return () => window.removeEventListener('notifications-changed', refresh);
  }, [refresh]);

  return { unreadCount, refresh };
};

export default useUnreadCount;

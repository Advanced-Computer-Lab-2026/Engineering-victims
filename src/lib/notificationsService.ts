import { apiFetch } from './api';
import type { NotificationSummary, NotificationsResponse } from './types';

/** FR 5.0: list the signed-in account's notifications plus its unread count. */
export const fetchNotifications = (): Promise<NotificationsResponse> =>
  apiFetch<NotificationsResponse>('/api/notifications');

/** Cheap count for the sidebar badge and dashboard tile. */
export const fetchUnreadCount = (): Promise<{ unreadCount: number }> =>
  apiFetch<{ unreadCount: number }>('/api/notifications/unread-count');

export const markNotificationRead = (
  id: string
): Promise<{ notification: NotificationSummary }> =>
  apiFetch<{ notification: NotificationSummary }>(`/api/notifications/${id}/read`, {
    method: 'PATCH',
  });

export const markAllNotificationsRead = (): Promise<{
  modifiedCount: number;
  unreadCount: number;
}> =>
  apiFetch<{ modifiedCount: number; unreadCount: number }>('/api/notifications/read-all', {
    method: 'PATCH',
  });

/**
 * Tells the sidebar badge and dashboard tile that the unread count changed.
 * Same pattern the app already uses for "auth-changed".
 */
export const broadcastNotificationsChanged = () => {
  window.dispatchEvent(new CustomEvent('notifications-changed'));
};

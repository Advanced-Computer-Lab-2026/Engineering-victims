import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { ApiError } from '../lib/api';
import {
  broadcastNotificationsChanged,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/notificationsService';
import { formatRelative } from '../lib/studentsService';
import type { NotificationSummary, NotificationType } from '../lib/types';

/** Icon and colour per notification type, so the list scans at a glance. */
const TYPE_META: Record<NotificationType, { icon: typeof Info; wrap: string }> = {
  info: { icon: Info, wrap: 'bg-primary-container text-on-primary-container' },
  success: { icon: CheckCircle2, wrap: 'bg-success-container text-success' },
  warning: { icon: AlertTriangle, wrap: 'bg-warning-container text-warning' },
  schedule: { icon: CalendarDays, wrap: 'bg-info-container text-info' },
  approval: { icon: ClipboardCheck, wrap: 'bg-tertiary-container text-on-tertiary-container' },
  payment: { icon: CreditCard, wrap: 'bg-secondary-container text-on-secondary-container' },
};

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** The row currently being marked, so only that button shows a spinner. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  /**
   * Loads the list. The first load shows the page spinner; later refreshes are
   * silent so a background poll never blanks the list under the reader.
   */
  const load = useCallback((showSpinner = false) => {
    if (showSpinner) setIsLoading(true);

    return fetchNotifications()
      .then((response) => {
        setNotifications(response.notifications);
        setUnreadCount(response.unreadCount);
        setError(null);
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => {
        if (showSpinner) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    load(true);

    // Backend events (account status, password change, and whatever later
    // sprints emit) create rows while this page may already be open, so poll
    // while the tab is visible instead of waiting for a manual reload.
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(false);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [load]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load(false);
    setIsRefreshing(false);
  };

  const unreadIds = useMemo(
    () => notifications.filter((item) => !item.isRead).map((item) => item.id),
    [notifications]
  );

  /** FR 5.0 — mark a single notification as read. */
  const handleMarkRead = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      const { notification } = await markNotificationRead(id);
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? notification : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      broadcastNotificationsChanged();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not update the notification.');
    } finally {
      setBusyId(null);
    }
  };

  /** FR 5.0 — mark every unread notification as read in one action. */
  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    setActionError(null);
    try {
      const result = await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => (item.isRead ? item : { ...item, isRead: true, readAt }))
      );
      setUnreadCount(result.unreadCount);
      broadcastNotificationsChanged();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not update the notifications.');
    } finally {
      setIsMarkingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[50vh] items-center justify-center gap-2 text-body text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your notifications...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`
            : 'Everything here has been read.'
        }
        meta={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && <Badge tone="indigo" dot>{unreadCount} unread</Badge>}
            <CustomButton
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              icon={
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  aria-hidden
                />
              }
            >
              Refresh
            </CustomButton>
            <CustomButton
              variant="secondary"
              size="sm"
              icon={<CheckCheck className="h-4 w-4" aria-hidden />}
              onClick={handleMarkAllRead}
              isLoading={isMarkingAll}
              disabled={unreadCount === 0}
            >
              Mark all as read
            </CustomButton>
          </div>
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      <div className="max-w-4xl space-y-4">
        {error && <AlertBanner tone="error">Could not load your notifications: {error}</AlertBanner>}
        {actionError && (
          <AlertBanner tone="error" onDismiss={() => setActionError(null)}>
            {actionError}
          </AlertBanner>
        )}

        {notifications.length === 0 ? (
          <EmptyState
            icon={<BellRing className="h-5 w-5" aria-hidden />}
            title="No notifications yet"
            description="Updates about schedules, requests and approvals will show up here."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-outline-variant">
              {notifications.map((notification) => {
                const meta = TYPE_META[notification.type] ?? TYPE_META.info;
                const Icon = meta.icon;

                return (
                  <li
                    key={notification.id}
                    className={`flex flex-wrap items-start gap-4 p-4 md:flex-nowrap ${
                      notification.isRead ? '' : 'bg-surface-container-low'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.wrap}`}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`truncate text-body ${
                            notification.isRead ? 'text-on-surface' : 'font-semibold text-on-surface'
                          }`}
                        >
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-primary"
                            title="Unread"
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      <p className="mt-0.5 text-body leading-relaxed text-on-surface-variant">
                        {notification.message}
                      </p>
                      <p className="mt-1.5 text-caption text-on-surface-variant">
                        {formatRelative(notification.createdAt)}
                      </p>
                    </div>

                    <div className="shrink-0 self-center">
                      {notification.isRead ? (
                        <Badge tone="neutral">Read</Badge>
                      ) : (
                        <CustomButton
                          variant="secondary"
                          size="sm"
                          onClick={() => handleMarkRead(notification.id)}
                          isLoading={busyId === notification.id}
                          disabled={busyId !== null && busyId !== notification.id}
                        >
                          Mark as read
                        </CustomButton>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {notifications.length > 0 && unreadIds.length === 0 && (
          <p className="text-center text-caption text-on-surface-variant">
            You are all caught up — {notifications.length} notification
            {notifications.length === 1 ? '' : 's'} read.
          </p>
        )}
      </div>
    </>
  );
};

export default NotificationsPage;

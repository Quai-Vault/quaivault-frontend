import { useState, useCallback } from 'react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  isNotificationsEnabled,
  setNotificationsEnabled,
} from '../utils/notifications';
import { notificationManager } from './NotificationContainer';

/**
 * Icon-only toggle button for browser notifications.
 * - If permission not yet requested: requests it on click
 * - If permission granted: toggles app-level enable/disable
 * - If permission denied: shows toast with instructions to unblock
 */
export function NotificationToggle() {
  const permission = getNotificationPermission();
  const [enabled, setEnabled] = useState(() => {
    return permission === 'granted' && isNotificationsEnabled();
  });
  const [permState, setPermState] = useState(permission);

  const handleClick = useCallback(async () => {
    if (permState === 'unsupported') return;

    if (permState === 'default') {
      const result = await requestNotificationPermission();
      setPermState(result);
      if (result === 'granted') {
        setNotificationsEnabled(true);
        setEnabled(true);
      }
      return;
    }

    if (permState === 'denied') {
      notificationManager.add({
        type: 'warning',
        message: 'Browser notifications are blocked. Click the lock icon in your address bar to allow notifications for this site.',
      });
      return;
    }

    // Permission granted — toggle app-level preference
    const next = !enabled;
    setNotificationsEnabled(next);
    setEnabled(next);
  }, [permState, enabled]);

  let title: string;
  if (permState === 'unsupported') {
    title = 'Browser notifications are not supported';
  } else if (permState === 'denied') {
    title = 'Notifications blocked — click for instructions';
  } else if (permState === 'default') {
    title = 'Enable browser notifications';
  } else {
    title = enabled ? 'Mute notifications' : 'Enable notifications';
  }

  return (
    <button
      onClick={handleClick}
      disabled={permState === 'unsupported'}
      className={`p-2 rounded-lg transition-colors ${
        permState === 'unsupported'
          ? 'text-dark-400 dark:text-dark-600 cursor-not-allowed opacity-60'
          : 'text-dark-400 dark:text-dark-500 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-dark-100 dark:hover:bg-vault-dark-4'
      }`}
      title={title}
      aria-label={title}
    >
      {enabled ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13.093A6 6 0 0018 11v-3.159c0-.538-.214-1.055-.595-1.436L16 5M4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9m11-4l-2-2m0 0l-2-2m2 2l2-2m-2 2l-2 2" />
        </svg>
      )}
    </button>
  );
}

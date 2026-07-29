import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNotificationsEnabled,
  setNotificationsEnabled,
  canShowBrowserNotifications,
  getNotificationPermission,
  requestNotificationPermission,
} from './notifications';

/** Stand in for the browser Notification API at a chosen permission state. */
const realNotification = globalThis.Notification;

function stubNotification(permission: NotificationPermission | null) {
  if (permission === null) {
    // A browser without the API: the property must be absent, not undefined,
    // since the code guards with `'Notification' in window`.
    delete (globalThis as { Notification?: unknown }).Notification;
    return;
  }
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  });
}

describe('notification preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    stubNotification('granted');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (realNotification) {
      (globalThis as { Notification?: unknown }).Notification = realNotification;
    }
    localStorage.clear();
  });

  describe('isNotificationsEnabled', () => {
    // Opt-out: having granted browser permission is taken as consent, so the
    // preference only has to record a deliberate "off".
    it('defaults to enabled when never set', () => {
      expect(isNotificationsEnabled()).toBe(true);
    });

    it('reports disabled once turned off', () => {
      setNotificationsEnabled(false);

      expect(isNotificationsEnabled()).toBe(false);
    });

    it('reports enabled once turned back on', () => {
      setNotificationsEnabled(false);
      setNotificationsEnabled(true);

      expect(isNotificationsEnabled()).toBe(true);
    });

    it('survives a reload by persisting the choice', () => {
      setNotificationsEnabled(false);

      expect(localStorage.getItem('quaivault-notifications-enabled')).toBe('false');
    });
  });

  describe('canShowBrowserNotifications', () => {
    it('is true with permission granted and the preference on', () => {
      expect(canShowBrowserNotifications()).toBe(true);
    });

    // Both gates matter: browser permission is not consent to keep notifying
    // after the user has switched them off in the app.
    it('is false when the app preference is off, despite permission', () => {
      setNotificationsEnabled(false);

      expect(canShowBrowserNotifications()).toBe(false);
    });

    it.each(['denied', 'default'] as const)('is false when permission is %s', (permission) => {
      stubNotification(permission);

      expect(canShowBrowserNotifications()).toBe(false);
    });

    it('is false in a browser without the Notification API', () => {
      stubNotification(null);

      expect(canShowBrowserNotifications()).toBe(false);
    });
  });

  describe('getNotificationPermission', () => {
    it.each(['granted', 'denied', 'default'] as const)('reports %s', (permission) => {
      stubNotification(permission);

      expect(getNotificationPermission()).toBe(permission);
    });

    // Distinguished from 'denied' so the UI can explain rather than nag.
    it('reports unsupported when the API is missing', () => {
      stubNotification(null);

      expect(getNotificationPermission()).toBe('unsupported');
    });
  });

  describe('requestNotificationPermission', () => {
    it('asks the browser and returns its answer', async () => {
      stubNotification('granted');

      await expect(requestNotificationPermission()).resolves.toBe('granted');
    });

    it('resolves denied without throwing when the API is missing', async () => {
      stubNotification(null);

      await expect(requestNotificationPermission()).resolves.toBe('denied');
    });
  });
});

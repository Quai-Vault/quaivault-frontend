/**
 * Browser notification utilities
 * Uses Service Worker registration.showNotification() for reliable delivery
 * even when the tab is in the foreground.
 */

const NOTIFICATIONS_ENABLED_KEY = 'quaivault-notifications-enabled';

/** Cached SW registration so we only register once. */
let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the minimal service worker needed for showNotification().
 * Safe to call multiple times — returns cached registration after the first.
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) return swRegistration;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return swRegistration;
  } catch (error) {
    console.warn('[Notifications] Service worker registration failed:', error);
    return null;
  }
}

// Kick off registration early so it's ready by the time we need it.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  getServiceWorkerRegistration();
}

/**
 * Check if the user has enabled notifications at the app level.
 * Defaults to true when browser permission is granted (opt-out model).
 */
export function isNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  // Default to true if never explicitly set
  return stored !== 'false';
}

/**
 * Set the app-level notification preference.
 * When disabled, sendBrowserNotification will silently no-op.
 */
export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

/**
 * Check if browser notifications are supported and permission is granted
 */
export function canShowBrowserNotifications(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted' &&
    isNotificationsEnabled()
  );
}

/**
 * Request notification permission from the user
 * @returns Promise that resolves to the permission state
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.requestPermission();
}

/**
 * Get current notification permission state
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Send a browser notification via the Service Worker for reliable delivery.
 * Falls back to `new Notification()` if the SW isn't available.
 */
export async function sendBrowserNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  if (!canShowBrowserNotifications()) return;

  const fullOptions: NotificationOptions = {
    icon: '/vite.svg',
    ...options,
  };

  try {
    const reg = await getServiceWorkerRegistration();
    if (reg) {
      await reg.showNotification(title, fullOptions);
    } else {
      new Notification(title, fullOptions);
    }
  } catch (error) {
    console.warn('[Notifications] Failed to show notification:', error);
  }
}
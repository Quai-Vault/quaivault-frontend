import { useState, useCallback, useEffect } from 'react';
import { NotificationToast, type Notification } from './NotificationToast';

let notificationIdCounter = 0;

// Global notification manager
class NotificationManager {
  private listeners: Set<(notifications: Notification[]) => void> = new Set();
  private notifications: Notification[] = [];
  private recentNotifications = new Map<string, number>(); // message -> timestamp for deduplication

  subscribe(callback: (notifications: Notification[]) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach((callback) => callback([...this.notifications]));
  }

  add(notification: Omit<Notification, 'id' | 'timestamp'>) {
    // Deduplication: Don't show the same notification within 2 seconds
    const messageKey = notification.message;
    const now = Date.now();
    const lastShown = this.recentNotifications.get(messageKey);
    
    if (lastShown && (now - lastShown) < 2000) {
      // Skip duplicate notification
      return;
    }
    
    this.recentNotifications.set(messageKey, now);
    
    // Clean up old entries (older than 5 seconds)
    for (const [key, timestamp] of this.recentNotifications.entries()) {
      if (now - timestamp > 5000) {
        this.recentNotifications.delete(key);
      }
    }
    
    const newNotification: Notification = {
      ...notification,
      id: `notification-${notificationIdCounter++}`,
      timestamp: Date.now(),
    };
    this.notifications.push(newNotification);
    this.notify();

    // Auto-remove after 10 seconds (increased from 5)
    setTimeout(() => {
      this.remove(newNotification.id);
    }, 10000);
  }

  remove(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
  }

  clear() {
    this.notifications = [];
    this.notify();
  }

  getNotifications(): Notification[] {
    return [...this.notifications];
  }
}

export const notificationManager = new NotificationManager();

export function NotificationContainer() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unsubscribe = notificationManager.subscribe((newNotifications) => {
      setNotifications(newNotifications);

      // Request notification permission when first notification arrives (user-initiated context)
      if (newNotifications.length > 0 && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch((err) => {
          console.warn('Failed to request notification permission:', err);
        });
      }
    });

    return unsubscribe;
  }, []);

  const handleDismiss = useCallback((id: string) => {
    notificationManager.remove(id);
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-[7.5rem] right-5 z-50 w-[28rem] max-w-[calc(100vw-18rem)]">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}

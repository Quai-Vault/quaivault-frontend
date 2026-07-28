import { useState, useCallback, useEffect } from 'react';
import { NotificationToast, type Notification } from './NotificationToast';
import { notificationManager } from './notificationManager';

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
    <div className="fixed top-20 right-2 left-2 sm:top-[7.5rem] sm:right-5 sm:left-auto z-50 sm:w-[28rem] sm:max-w-[calc(100vw-18rem)]">
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

// Minimal service worker for browser notifications.
// showNotification() requires an active SW registration,
// but we don't need any fetch/cache/push handling.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

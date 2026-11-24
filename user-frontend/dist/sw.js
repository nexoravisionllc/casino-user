/* Service worker for browser push notifications (see src/notifications/push.js).
 * Shows each push the server sends and opens the related page when clicked.
 * Deliberately does no caching. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: '/assets/logo-mark.svg',
    tag: data.id ? `n-${data.id}` : undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    // Open tabs refresh their bell.
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((tabs) => tabs.forEach((t) => t.postMessage({ type: 'notification' }))),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = tabs.find((t) => new URL(t.url).origin === self.location.origin);
    if (same) {
      await same.focus();
      if ('navigate' in same) return same.navigate(target);
      return undefined;
    }
    return self.clients.openWindow(target);
  })());
});

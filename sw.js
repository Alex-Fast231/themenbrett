// Service Worker: speichert nur die App-Dateien (keine Daten) und zeigt Push-Hinweise an.
const CACHE = 'themenbrett-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'config.js', 'util.js', 'pin.js', 'pdf.js',
  'backend-demo.js', 'backend-supabase.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-96.png',
  'vendor/supabase-2.118.0.js', 'vendor/jspdf-4.2.1.umd.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Erst aus dem Netz (damit Updates sofort ankommen), ohne Netz aus dem Zwischenspeicher.
// Anfragen an Supabase (andere Adresse) werden nicht angefasst.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

// Der Hinweis hat bewusst keinen Inhalt
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('FaSt Themenbrett', {
    body: 'Neuigkeiten im Themenbrett',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: 'themenbrett',
    renotify: true,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(scope));
    if (open) return open.focus();
    return self.clients.openWindow(scope);
  }));
});

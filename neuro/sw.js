// Сначала сеть, при её отсутствии кэш: после деплоя всегда свежая версия, а без интернета приложение всё равно открывается.
const CACHE = 'nz-v8-reminders';

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nz-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return; // запросы к облаку не трогаем
  e.respondWith((async () => {
    try {
      // no-cache: всегда сверяемся с сервером (GitHub Pages держит файлы в HTTP-кэше до 10 минут)
      const res = await fetch(req, sameOrigin ? { cache: 'no-cache' } : undefined);
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate' && url.pathname === new URL('./', self.registration.scope).pathname) {
        const landing = await caches.match(new URL('./', self.registration.scope).href);
        if (landing) return landing;
      }
      throw new Error('offline');
    }
  })());
});


const trainingUrl = new URL('training.html', self.registration.scope);

function reminderTarget(value) {
  const scope = new URL(self.registration.scope);
  const target = new URL(value || './', scope);
  if (target.origin !== scope.origin) return trainingUrl;
  if (target.pathname === scope.pathname || target.pathname === scope.pathname + 'index.html') {
    target.pathname = trainingUrl.pathname;
  }
  return target;
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Нейро-зарядка', {
    body: data.body || 'Несколько минут для себя. Начнём зарядку?',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'neuro-training',
    data: { url: reminderTarget(data.url).href, kind: data.kind || 'daily' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = reminderTarget(event.notification.data?.url);
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const tab of tabs) {
      const url = new URL(tab.url);
      if (url.origin === trainingUrl.origin && url.pathname === trainingUrl.pathname) {
        tab.postMessage({ type: 'neuro-reminder-open', kind: event.notification.data?.kind || 'daily' });
        return tab.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});

// Сначала сеть, при её отсутствии кэш: после деплоя всегда свежая версия, а без интернета приложение всё равно открывается.
const CACHE = 'nz-v8-reminders';

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
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
      if (req.mode === 'navigate') { const idx = await caches.match('./'); if (idx) return idx; }
      throw new Error('offline');
    }
  })());
});


self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{}const target=new URL(data.url||'./',self.registration.scope);if(target.origin!==self.location.origin)target.href=self.registration.scope;event.waitUntil(self.registration.showNotification(data.title||'Нейро-зарядка',{body:data.body||'Несколько минут для себя. Начнём зарядку?',icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:data.tag||'neuro-training',data:{url:target.href,kind:data.kind||'daily'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||self.registration.scope;event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const tab of tabs){if(new URL(tab.url).origin===self.location.origin&&new URL(tab.url).pathname.startsWith(new URL(self.registration.scope).pathname)){tab.postMessage({type:'neuro-reminder-open',kind:event.notification.data?.kind||'daily'});return tab.focus();}}return self.clients.openWindow(url);})());});

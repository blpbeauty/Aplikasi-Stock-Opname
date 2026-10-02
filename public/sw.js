importScripts('/offline-assets.js');
const CACHE_NAME = 'stock-opname-v7-' + self.__OFFLINE_VERSION;
const ROUTES = ['/', '/login', '/scan', '/input', '/history', '/profile'];
const rscKey = path => new URL(path + '?offline-rsc=1', self.location.origin).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(['/manifest.json', ...ROUTES]);
    // Cache each route's scripts and CSS, including pages not opened yet.
    const assets = new Set((self.__OFFLINE_ASSETS || []).map(path => new URL(path, self.location.origin).href));
    for (const path of ROUTES) {
      const html = await (await cache.match(path)).text();
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const url = new URL(match[1].replaceAll('&amp;', '&'), self.location.origin);
        if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) assets.add(url.href);
      }
      const response = await fetch(path, { headers: { RSC: '1' } });
      if (response.ok && (response.headers.get('Content-Type') || '').includes('text/x-component')) {
        await cache.put(rscKey(path), response);
      }
    }
    await cache.addAll([...assets]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('stock-opname-') && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isRsc = request.headers.get('RSC') === '1';
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (url.pathname.startsWith('/_next/static/') && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && !isRsc) await cache.put(request, response.clone());
      return response;
    } catch {
      if (isRsc) return await cache.match(rscKey(url.pathname)) || new Response('Offline', { status: 503 });
      if (cached) return cached;
      if (request.mode === 'navigate') return await cache.match(url.pathname) || await cache.match('/scan');
      return new Response('Offline', { status: 503 });
    }
  })());
});

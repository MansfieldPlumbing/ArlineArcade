/* Arline Arcade — service worker.
   Network-first for app code (HTML/JS/CSS) so you ALWAYS get the latest after a
   deploy — no more manual cache-clearing. Cache-first for static art (cards,
   images, fonts) for speed. Falls back to cache when offline. */
const VERSION = 'arline-v4';
const FALLBACK = './index.html';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;            // leave cross-origin alone
  const appCode = req.mode === 'navigate' || /\.(?:js|css|webmanifest|html)$/.test(url.pathname);
  e.respondWith(appCode ? networkFirst(req) : cacheFirst(req));
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'reload' });       // bypass the HTTP cache → newest
    (await caches.open(VERSION)).put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await caches.match(req);
    return cached || (req.mode === 'navigate' ? caches.match(FALLBACK) : Response.error());
  }
}
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    (await caches.open(VERSION)).put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

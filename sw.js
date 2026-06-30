/* Arline Arcade — service worker.
   Self-updating: no manual cache-clearing, and no "re-download everything" on a deploy.

   - App code (HTML/JS/CSS/manifest): NETWORK-FIRST → you always get the latest build
     the next time a page loads, falling back to cache only when offline.
   - Static art (cards, images, audio, fonts): STALE-WHILE-REVALIDATE under a STABLE
     cache → served instantly from cache, then revalidated in the background with a
     conditional request. Unchanged files come back 304 (a few bytes, nothing
     re-downloaded); only files that actually changed transfer, and show on next load.

   Because the cache name never changes, deploying never wipes the cache. Just edit and
   deploy — clients pick up changed art on their next visit and changed code on their
   next navigation. There is no VERSION to bump and no cache to clear by hand. */
const CACHE = 'arline-2';          // bumped once to evict a stale deck cached on some phones
const FALLBACK = './index.html';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // one-time cleanup of the old versioned caches (arline-v1 … arline-v4)
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
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
  e.respondWith(appCode ? networkFirst(req) : staleWhileRevalidate(req));
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'reload' });       // bypass HTTP cache → newest build
    (await caches.open(CACHE)).put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await caches.match(req);
    return cached || (req.mode === 'navigate' ? caches.match(FALLBACK) : Response.error());
  }
}

// Serve cached art immediately; revalidate in the background with a conditional request.
// Unchanged → 304 (no bytes re-downloaded); changed → 200, cache updated, shows next load.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const revalidate = fetch(req, cached ? { cache: 'no-cache' } : {})
    .then((res) => { if (res && res.ok) cache.put(req, res.clone()).catch(() => {}); return res; })
    .catch(() => null);
  return cached || (await revalidate) || Response.error();
}

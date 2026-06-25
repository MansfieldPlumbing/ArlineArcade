/* Registers the root service worker from any page depth, and auto-reloads once
   when a NEW version is deployed (so updates apply without manual refreshing). */
if ('serviceWorker' in navigator) {
  const swUrl = new URL('../../sw.js', import.meta.url);   // assets/js/ -> site root
  const scope = new URL('../../', import.meta.url);
  navigator.serviceWorker.register(swUrl, { scope }).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        // a new version finished installing while an old one is in control → it's an update
        if (nw.state === 'installed' && navigator.serviceWorker.controller) location.reload();
      });
    });
    // check for a new deploy: right now, whenever focus returns, and every 30 min
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
}

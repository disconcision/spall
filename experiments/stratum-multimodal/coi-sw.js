// Cross-origin isolation for this folder only. Moonshine's in-page speech engine runs threaded
// WebAssembly, which needs SharedArrayBuffer, which browsers expose only to pages served with
// COOP + COEP headers. The shared dev server (python http.server) can't send them, so this worker
// adds them to page loads under /stratum-multimodal/. COEP "credentialless" keeps no-cors loads
// such as the Google Fonts stylesheet working.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).then(r => {
    if (!r.ok && r.status !== 0) return r;
    const h = new Headers(r.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }));
});

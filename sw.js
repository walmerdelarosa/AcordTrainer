// Modo sin conexión: guarda la app y la sirve desde caché; se actualiza en segundo plano.
const VERSION = 'acortrainer-v2';
const FILES = [
  './', 'index.html', 'css/styles.css', 'icon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/theory.js', 'js/instrument.js', 'js/exercises.js', 'js/lessons.js', 'js/resources.js',
  'js/keyboard.js', 'js/audio.js', 'js/practice.js', 'js/video.js', 'js/surface.js', 'js/pckeys.js',
  'js/notation.js', 'js/player.js', 'js/rhythm.js', 'js/song.js', 'js/songview.js', 'js/library.js', 'js/icons.js',
  'js/pitch/yin.js', 'js/pitch/salience.js', 'js/pitch/tracker.js', 'js/pitch/bass.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: sameOrigin });
    const net = fetch(e.request).then((res) => { if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

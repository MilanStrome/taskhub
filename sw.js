/* TaskHub service worker - app-shell cache for full offline + install.
   API calls (script.google.com) and Drive content are NEVER cached. */
var CACHE = 'taskhub-shell-v3';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* tolerate missing files - cache whatever exists */
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  /* cross-origin (Apps Script API, Drive thumbnails): network only */
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;

  /* same-origin shell: stale-while-revalidate */
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
        var refresh = fetch(e.request).then(function (res) {
          if (res && res.ok) { try { c.put(e.request, res.clone()); } catch (err) {} }
          return res;
        }).catch(function () { return hit; });
        return hit || refresh;
      });
    })
  );
});

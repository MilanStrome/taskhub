/* TaskHub service worker - app-shell cache for full offline + install.
   API calls (script.google.com) and Drive content are NEVER cached. */
var CACHE = 'taskhub-shell-v4';
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
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }

  /* only same-origin http(s) GETs; API and Drive traffic passes through */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;

  /* stale-while-revalidate; never resolve respondWith with undefined */
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
        var refresh = fetch(e.request).then(function (res) {
          if (res && res.ok) { try { c.put(e.request, res.clone()); } catch (err) {} }
          return res;
        });
        if (hit) {
          refresh.catch(function () {});
          return hit;
        }
        return refresh;
      });
    }).catch(function () { return fetch(e.request); })
  );
});

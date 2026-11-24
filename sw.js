/*
 * 離線快取：首次開啟後，即使服務處網路中斷，重新整理也能載入頁面。
 * 策略：網路優先（有網路時一律載入最新版並更新快取），斷網時才改用快取。
 */
var CACHE = 'wujie7-live2026-__BUILD__';
var ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/board.css',
  './css/admin.css',
  './js/data.js',
  './js/store.js',
  './js/firebase-config.js',
  './js/cloud.js',
  './js/board.js',
  './js/ui.js',
  './js/tools.js',
  './js/admin.js',
  './js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('wujie7-live2026-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return fetch(req, { cache: 'no-cache' }).then(function (res) {
      // 帶 query（?mode=admin）的頁面一律對應同一份 index.html
      if (res && res.ok) cache.put(req.url.split('?')[0], res.clone());
      return res;
    }).catch(function () {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || Response.error();
      });
    });
  }));
});

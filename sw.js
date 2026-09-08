const CACHE_NAME = 'spectra-viz-v2'; // Naikkan versi cache di sini jika ada update
const urlsToCache = [
  './',
  './index.html',
  './main.js',
  './manifest.json'
];

// Saat instalasi Service Worker baru
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Langsung aktifkan SW baru tanpa menunggu tab lama ditutup
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Saat aktivasi, bersihkan cache lama yang versinya berbeda
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Menghapus cache lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Ambil alih kendali halaman segera
  );
});

// Strategi fetch: Network First, fallback to Cache (utamakan file terbaru dari server)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Jika internet/server merespons, update cache secara diam-diam
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Jika offline, ambil dari cache
        return caches.match(event.request);
      })
  );
});
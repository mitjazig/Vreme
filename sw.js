const CACHE = 'vreme-pwa-static-v9';

const ASSETS = [
  './',
  './index.html',
  './history.html',
  './css/styles.css',
  './vendor/chart.umd.min.js',
  './js/config.js',
  './js/chart-theme.js',
  './js/sheets.js',
  './js/weather-ui.js',
  './js/charts.js',
  './js/history-charts.js',
  './js/install-ui.js',
  './js/app.js',
  './js/history.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAppAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return /\.(html|js|css|webmanifest|svg)$/.test(url.pathname) || url.pathname.endsWith('/');
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw new Error('Offline');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.hostname.includes('google.com')) {
    event.respondWith(fetch(request));
    return;
  }

  if (isAppAsset(url)) {
    event.respondWith(networkFirst(request));
  }
});

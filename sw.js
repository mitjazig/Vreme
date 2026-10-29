const CACHE = 'vreme-pwa-static-v58';

const PWS_STATION = 'IKOPER43';
const PWS_API_KEY = '422e0bf8dee443c2ae0bf8dee4e3c22c';

const ASSETS = [
  './',
  './index.html',
  './history.html',
  './forecast.html',
  './records.html',
  './lokacija.html',
  './sreca.html',
  './css/styles.css',
  './vendor/chart.umd.min.js',
  './js/config.js',
  './js/chart-theme.js',
  './js/sheets.js',
  './js/pws.js',
  './js/brief.js',
  './js/folk.js',
  './js/onthisday.js',
  './js/weather-ui.js',
  './js/charts.js',
  './js/history-charts.js',
  './js/install-ui.js',
  './js/pwa-update.js',
  './js/contrast.js',
  './js/app.js',
  './js/history.js',
  './js/fwi.js',
  './js/bora.js',
  './js/forecast.js',
  './js/forecast-page.js',
  './js/lokacija-page.js',
  './js/sreca-page.js',
  './js/wind-rose.js',
  './js/notifications.js',
  './js/agro.js',
  './js/mushrooms.js',
  './js/arso-stations.js',
  './js/postaje-page.js',
  './postaje.html',
  './igra.html',
  './xmas.html',
  './js/igra.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(ASSETS.map((url) => cache.add(url).catch(() => null)));
      await self.skipWaiting();
    })(),
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
  return /\.(html|js|css|webmanifest|svg|png)$/.test(url.pathname) || url.pathname.endsWith('/');
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

function pwsUpstream(kind) {
  const base = 'https://api.weather.com/v2/pws/observations';
  const q = `stationId=${encodeURIComponent(PWS_STATION)}&format=json&units=m&numericPrecision=decimal&apiKey=${encodeURIComponent(PWS_API_KEY)}`;
  if (kind === 'current') return `${base}/current?${q}`;
  if (kind === 'hourly7') return `${base}/hourly/7day?${q}`;
  if (kind === 'today') return `${base}/all/1day?${q}`;
  return null;
}

async function proxyPws(kind) {
  const upstream = pwsUpstream(kind);
  if (!upstream) {
    return new Response(JSON.stringify({ error: 'Unknown PWS path' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const res = await fetch(upstream, { cache: 'no-store' });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.includes('/api/pws/')) {
    const kind = url.pathname.split('/').filter(Boolean).pop();
    event.respondWith(proxyPws(kind));
    return;
  }

  if (url.hostname.includes('google.com')) {
    event.respondWith(fetch(request));
    return;
  }

  if (isAppAsset(url)) {
    event.respondWith(networkFirst(request));
  }
});

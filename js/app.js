import { REFRESH_MS, APP_VERSION } from './config.js';
import { loadWeatherBundle } from './sheets.js';
import { renderHourlyChart, renderDailyChart } from './charts.js';
import {
  windLabel,
  weatherKind,
  weatherIcon,
  formatTime,
  formatTemp,
  formatNum,
  dailyStats,
  last24h,
} from './weather-ui.js';

const $ = (sel) => document.querySelector(sel);

const CACHE_KEY = 'vreme-pwa-cache-v1';

async function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStatus(msg, isError = false) {
  const el = $('#status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isError);
}

function setLoading(on) {
  document.body.classList.toggle('is-loading', on);
}

function updateWindCompass(deg) {
  const needle = $('#wind-needle');
  const label = $('#wind-dir-label');
  if (needle) needle.style.transform = `rotate(${deg ?? 0}deg)`;
  if (label) label.textContent = windLabel(deg);
}

function renderMetrics(latest) {
  const grid = $('#metrics');
  if (!grid || !latest) return;

  const items = [
    { label: 'Vlažnost', value: formatNum(latest.humidity, '%', 0) },
    { label: 'Veter', value: `${formatNum(latest.windSpeed, ' m/s')} (${windLabel(latest.windDir)})` },
    { label: 'Sunek', value: formatNum(latest.windGust, ' m/s') },
    { label: 'Tlak', value: formatNum(latest.pressure, ' hPa') },
    { label: 'Padavine', value: formatNum(latest.precipTotal, ' mm', 2) },
    { label: 'Intenzivnost', value: formatNum(latest.precipRate, ' mm/h', 1) },
    { label: 'UV', value: formatNum(latest.uv, '', 0) },
    { label: 'Sončno', value: formatNum(latest.solar, ' W/m²', 0) },
    { label: 'Rosišče', value: formatTemp(latest.dewpt) },
  ];

  const icons = {
    Vlažnost: '💧',
    Veter: '💨',
    Sunek: '🌬️',
    Tlak: '📊',
    Padavine: '🌧️',
    Intenzivnost: '☔',
    UV: '☀️',
    Sončno: '🔆',
    Rosišče: '🌫️',
  };

  grid.innerHTML = items
    .map(
      (m) => `
    <article class="metric">
      <span class="metric__icon" aria-hidden="true">${icons[m.label] || '·'}</span>
      <span class="metric__label">${m.label}</span>
      <span class="metric__value">${m.value}</span>
    </article>`,
    )
    .join('');
}

function renderHero(latest, summary) {
  const temp = latest?.temp ?? summary?.current;
  const kind = weatherKind(latest);
  $('#weather-icon').textContent = weatherIcon(kind);
  $('#temp-main').textContent = temp != null ? temp.toFixed(1) : '—';
  $('#temp-unit').textContent = '°C';
  $('#hero-sub').textContent = latest
    ? `Zadnja meritev · ${formatTime(latest.time, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`
  : 'Ni podatkov';

  const min = summary?.min;
  const max = summary?.max;
  $('#day-range').innerHTML =
    min != null && max != null
      ? `<span class="hero__chip hero__chip--cold">↓ ${formatTemp(min, 1)}</span><span class="hero__chip hero__chip--hot">↑ ${formatTemp(max, 1)}</span>`
      : '';

  updateWindCompass(latest?.windDir);
  $('#wind-speed').textContent = formatNum(latest?.windSpeed, ' m/s');
}

function renderCharts(readings) {
  if (typeof Chart === 'undefined') {
    throw new Error('Chart.js ni naložen');
  }
  const h24 = last24h(readings);
  const daily = dailyStats(readings);
  renderHourlyChart($('#chart-hourly'), h24, formatTime);
  renderDailyChart($('#chart-daily'), daily, formatTime);
}

function renderAll(bundle, fromCache = false) {
  const { readings, latest, summary, fetchedAt } = bundle;

  renderHero(latest, summary);
  renderMetrics(latest);

  let chartError = null;
  try {
    renderCharts(readings);
  } catch (e) {
    chartError = e;
    console.warn('Grafi:', e);
  }

  const when = fetchedAt ? formatTime(new Date(fetchedAt), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) : '—';

  let msg = fromCache
    ? `Offline – zadnji podatki (${when})`
    : `Posodobljeno ${when}`;
  if (chartError) msg += ' · grafi niso na voljo';
  setStatus(msg, fromCache || !!chartError);
}

function parseBundle(raw) {
  const readings = (raw.readings || []).map((r) => ({
    ...r,
    time: r.time ? new Date(r.time) : null,
  }));
  let latest = raw.latest
    ? { ...raw.latest, time: raw.latest.time ? new Date(raw.latest.time) : null }
    : null;
  if (!latest && readings.length) latest = readings[readings.length - 1];

  return {
    ...raw,
    readings,
    latest,
    fetchedAt: raw.fetchedAt ? new Date(raw.fetchedAt) : null,
  };
}

async function clearStaleCaches() {
  const key = 'vreme-app-ver';
  if (localStorage.getItem(key) === APP_VERSION) return;

  localStorage.removeItem(CACHE_KEY);
  localStorage.setItem(key, APP_VERSION);

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.update()));
  }
}

async function refresh() {
  setLoading(true);
  try {
    const bundle = await loadWeatherBundle();
    bundle.fetchedAt = bundle.fetchedAt.toISOString();
    bundle.readings = bundle.readings.map((r) => ({
      ...r,
      time: r.time?.toISOString?.() ?? r.time,
    }));
    if (bundle.latest?.time instanceof Date) {
      bundle.latest = {
        ...bundle.latest,
        time: bundle.latest.time.toISOString(),
      };
    }
    await saveCache(bundle);
    renderAll(parseBundle(bundle), false);
  } catch (err) {
    console.error(err);
    const cached = loadCache();
    if (cached) {
      try {
        renderAll(parseBundle(cached), true);
      } catch (renderErr) {
        console.error(renderErr);
        setStatus(`Napaka prikaza: ${renderErr.message}`, true);
      }
    } else {
      setStatus(
        `Napaka: ${err.message}. Preverite internet in da je Google Sheet javen (Kdorkoli s povezavo → Ogledovalec).`,
        true,
      );
    }
  } finally {
    setLoading(false);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      reg.update();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'activated' && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
    })
    .catch(console.warn);
}

function setupInstallPrompt() {
  let deferred;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('#btn-install')?.classList.remove('hidden');
  });

  $('#btn-install')?.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('#btn-install')?.classList.add('hidden');
  });
}

async function init() {
  if (location.protocol === 'file:') {
    setStatus(
      'Odprite prek strežnika: v mapi pwa zaženite „npx serve“ in odprite prikazani http:// naslov.',
      true,
    );
    return;
  }

  await clearStaleCaches();
  registerServiceWorker();
  setupInstallPrompt();
  $('#btn-refresh')?.addEventListener('click', refresh);

  const cached = loadCache();
  if (cached) {
    try {
      renderAll(parseBundle(cached), true);
    } catch (e) {
      console.warn('Predpomnjeni podatki:', e);
    }
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init().catch((e) => {
  console.error(e);
  setStatus(`Napaka zagona: ${e.message}`, true);
});

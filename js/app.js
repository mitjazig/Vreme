import { REFRESH_MS, APP_VERSION } from './config.js';
import { setupInstallUI } from './install-ui.js';
import { initPwaUpdates } from './pwa-update.js';
import { loadWeatherBundle } from './sheets.js';
import { renderHourlyChart, renderDailyChart, renderPrecipChart24h } from './charts.js';
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

function setText(sel, text) {
  const el = $(sel);
  if (el) el.textContent = text;
}

function setHtml(sel, html) {
  const el = $(sel);
  if (el) el.innerHTML = html;
}

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
  if (needle) needle.style.transform = `rotate(${deg ?? 0}deg)`;
}

function renderMetrics(latest) {
  const grid = $('#metrics');
  if (!grid || !latest) return;

  const items = [
    { label: 'Vlažnost', short: 'Vlaž.', value: formatNum(latest.humidity, '%', 0) },
    { label: 'Tlak', short: 'Tlak', value: formatNum(latest.pressure, ' hPa', 0) },
    { label: 'Padavine', short: 'Dež', value: formatNum(latest.precipTotal, ' mm', 1) },
    { label: 'Sunek', short: 'Sunek', value: formatNum(latest.windGust, ' m/s', 1) },
    { label: 'UV', short: 'UV', value: formatNum(latest.uv, '', 0) },
    { label: 'Sončno', short: 'Sonce', value: formatNum(latest.solar, ' W/m²', 0) },
  ];

  grid.innerHTML = items
    .map(
      (m) => `
    <div class="now-stat">
      <span class="now-stat__lbl">${m.short}</span>
      <span class="now-stat__val">${m.value}</span>
    </div>`,
    )
    .join('');
}

function renderHero(latest, summary) {
  const temp = latest?.temp ?? summary?.current;
  setText('#weather-icon', weatherIcon(weatherKind(latest)));
  setText('#temp-main', temp != null ? temp.toFixed(1) : '—');

  const timeStr = latest
    ? formatTime(latest.time, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Ni podatkov';
  setText('#hero-sub', timeStr);

  const min = summary?.min;
  const max = summary?.max;
  setHtml(
    '#day-range',
    min != null && max != null
      ? `<span class="now-ext now-ext--cold">${formatTemp(min, 0)}</span><span class="now-ext now-ext--hot">${formatTemp(max, 0)}</span>`
      : '',
  );

  updateWindCompass(latest?.windDir);
  setText('#wind-dir-label', windLabel(latest?.windDir));
  const spd = formatNum(latest?.windSpeed, ' m/s', 1);
  setText('#wind-speed', spd !== '—' ? spd : '—');
}

function renderCharts(readings) {
  if (typeof Chart === 'undefined') {
    throw new Error('Chart.js ni naložen');
  }
  const h24 = last24h(readings);
  const daily = dailyStats(readings);
  const hourly = $('#chart-hourly');
  const dailyCanvas = $('#chart-daily');
  const precipCanvas = $('#chart-precip-24h');
  if (hourly) renderHourlyChart(hourly, h24, formatTime);
  if (dailyCanvas) renderDailyChart(dailyCanvas, daily);
  if (precipCanvas) renderPrecipChart24h(precipCanvas, h24, formatTime);
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

async function init() {
  if (location.protocol === 'file:') {
    setStatus(
      'Odprite prek strežnika: v mapi pwa zaženite „npx serve“ in odprite prikazani http:// naslov.',
      true,
    );
    return;
  }

  await clearStaleCaches();
  initPwaUpdates();
  setupInstallUI();
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

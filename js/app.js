import { REFRESH_MS, APP_VERSION, YEAR_SHEETS } from './config.js';
import { sunriseSunset, moonPhase } from './astro.js';
import { getDayFacts } from './fun-facts.js';
import { setupInstallUI } from './install-ui.js';
import { initPwaUpdates } from './pwa-update.js';
import { loadWeatherBundle, fetchDayReadings } from './sheets.js';
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

/** 1. Občutek temperature — opisni niz glede na temp + vlažnost */
function feelsLikeLabel(temp, humidity) {
  if (temp == null) return null;
  // Poenostavljen heat index za visoke temperature
  let feels = temp;
  if (temp >= 27 && humidity != null) {
    feels = -8.784695 + 1.61139411 * temp + 2.3385 * humidity / 100
      - 0.14611605 * temp * humidity / 100
      - 0.012308094 * temp * temp
      - 0.016424828 * (humidity / 100) * (humidity / 100)
      + 0.002211732 * temp * temp * humidity / 100
      + 0.00072546 * temp * (humidity / 100) * (humidity / 100)
      - 0.000003582 * temp * temp * (humidity / 100) * (humidity / 100);
  }
  if (feels <= 0)  return { txt: 'Zmrzuje', cls: 'feel--freeze' };
  if (feels <= 8)  return { txt: 'Mrzlo', cls: 'feel--cold' };
  if (feels <= 15) return { txt: 'Hladno', cls: 'feel--cool' };
  if (feels <= 22) return { txt: 'Prijetno', cls: 'feel--nice' };
  if (feels <= 28) return { txt: 'Toplo', cls: 'feel--warm' };
  if (feels <= 35) return { txt: 'Vroče', cls: 'feel--hot' };
  return { txt: 'Zelo vroče', cls: 'feel--scorching' };
}

/** 2. Trend — primerjamo zadnjo meritev z meritvijo ~1h prej */
function tempTrend(readings) {
  if (!readings?.length) return null;
  const latest = readings[readings.length - 1];
  if (latest?.temp == null || !latest.time) return null;
  const cutoff = latest.time.getTime() - 50 * 60 * 1000; // ~50 min nazaj
  const older = [...readings].reverse().find(
    (r) => r.temp != null && r.time && r.time.getTime() <= cutoff,
  );
  if (!older) return null;
  const diff = latest.temp - older.temp;
  if (diff > 0.4)  return { arrow: '↑', cls: 'trend--up',   title: `+${diff.toFixed(1)}° v zadnji uri` };
  if (diff < -0.4) return { arrow: '↓', cls: 'trend--down', title: `${diff.toFixed(1)}° v zadnji uri` };
  return { arrow: '→', cls: 'trend--flat', title: 'Stabilno' };
}

/** 3. Čas zadnjega dežja */
function lastRainLabel(readings) {
  if (!readings?.length) return null;
  const latest = readings[readings.length - 1];
  if (latest?.precipTotal != null && latest.precipTotal > 0) return null; // dežuje zdaj
  // Poišči zadnji zapis z precipTotal > 0
  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i].precipTotal != null && readings[i].precipTotal > 0) {
      const diffMs = Date.now() - readings[i].time.getTime();
      const diffH = Math.round(diffMs / 3_600_000);
      if (diffH < 24)  return `pred ${diffH}h`;
      const diffD = Math.round(diffH / 24);
      return `pred ${diffD} ${diffD === 1 ? 'dnem' : diffD < 5 ? 'dnevi' : 'dnevi'}`;
    }
  }
  return 'ni podatka';
}

function renderMetrics(latest, readings) {
  const grid = $('#metrics');
  if (!grid || !latest) return;

  const trend = tempTrend(readings);
  const feel = feelsLikeLabel(latest.temp, latest.humidity);
  const lastRain = lastRainLabel(readings);
  const rainValue = latest.precipTotal > 0
    ? formatNum(latest.precipTotal, ' mm', 1)
    : lastRain ? `<span class="now-stat__sub">Zadnji: ${lastRain}</span>` : '0 mm';

  const items = [
    { short: 'Vlaž.', value: formatNum(latest.humidity, '%', 0) },
    { short: 'Tlak',  value: formatNum(latest.pressure, ' hPa', 0) },
    { short: 'Dež',   value: rainValue },
    { short: 'Sunek', value: formatNum(latest.windGust, ' m/s', 1) },
    { short: 'UV',    value: formatNum(latest.uv, '', 0) },
    { short: 'Sonce', value: formatNum(latest.solar, ' W/m²', 0) },
  ];

  // Trend + občutek v hero
  const trendEl = $('#temp-trend');
  if (trendEl && trend) {
    trendEl.textContent = trend.arrow;
    trendEl.className = `now-panel__trend ${trend.cls}`;
    trendEl.title = trend.title;
  }
  const feelEl = $('#temp-feel');
  if (feelEl && feel) {
    feelEl.textContent = feel.txt;
    feelEl.className = `now-panel__feel ${feel.cls}`;
  }

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

function todayMinMax(readings) {
  if (!readings?.length) return { min: null, max: null };
  const todayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' }).format(new Date());
  const todayReadings = readings.filter((r) => {
    if (!r.time || r.temp == null) return false;
    const k = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' }).format(r.time);
    return k === todayKey;
  });
  if (!todayReadings.length) return { min: null, max: null };
  const temps = todayReadings.map((r) => r.temp);
  return { min: Math.min(...temps), max: Math.max(...temps) };
}

/** —— Zanimivost dneva —— */
function renderDayFact(latest) {
  const el = document.getElementById('day-fact');
  if (!el) return;
  const { primary, secondary } = getDayFacts(latest);
  el.hidden = false;
  el.innerHTML = `
    <span class="day-fact__icon">💡</span>
    <div class="day-fact__body">
      <p class="day-fact__text">${primary}</p>
      ${secondary ? `<p class="day-fact__secondary">${secondary}</p>` : ''}
    </div>`;
}

/** —— Sončni pas + lunina faza —— */
function renderSunStrip() {
  const el = document.getElementById('sun-strip');
  if (!el) return;

  const now    = new Date();
  const sun    = sunriseSunset(now);
  const moon   = moonPhase(now);

  if (!sun) { el.hidden = true; return; }

  const fmt = (d) => d.toLocaleTimeString('sl-SI', {
    timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit',
  });

  // Pozicija Sonca na 24h časovnici (0–100%)
  const minOfDay = now.getHours() * 60 + now.getMinutes();
  const sunPct   = (minOfDay / (24 * 60)) * 100;

  // Širina dnevnega okna
  const risePct  = (sun.riseMin / (24 * 60)) * 100;
  const setPct   = (sun.setMin  / (24 * 60)) * 100;
  const dayWidth = setPct - risePct;

  const isDay    = minOfDay >= sun.riseMin && minOfDay <= sun.setMin;
  const sunIcon  = isDay ? '☀️' : '🌙';

  const dayH  = Math.floor(sun.dayMinutes / 60);
  const dayM  = sun.dayMinutes % 60;
  const dayLen = `${dayH}h ${dayM}min`;

  // Lunin vpliv na plimo
  const tideTag = moon.tideEffect === 'spring'
    ? '<span class="moon-tide moon-tide--spring">☊ Pomladna plima</span>'
    : moon.tideEffect === 'neap'
    ? '<span class="moon-tide moon-tide--neap">☋ Mrtvina</span>'
    : '';

  // Dnevi do naslednje polne lune / mlaja
  const nextEvent = moon.daysToFull <= moon.daysToNew
    ? `🌕 čez ${moon.daysToFull < 1 ? 'manj kot dan' : Math.round(moon.daysToFull) + ' dni'}`
    : `🌑 čez ${moon.daysToNew  < 1 ? 'manj kot dan' : Math.round(moon.daysToNew)  + ' dni'}`;

  el.hidden = false;
  el.innerHTML = `
    <div class="sun-arc">
      <div class="sun-arc__track">
        <div class="sun-arc__day" style="left:${risePct.toFixed(1)}%;width:${dayWidth.toFixed(1)}%"></div>
        <div class="sun-arc__marker" style="left:clamp(0%,${sunPct.toFixed(1)}%,98%)">
          <span class="sun-arc__dot" title="${isDay ? 'Dan' : 'Noč'}">${sunIcon}</span>
        </div>
      </div>
      <div class="sun-arc__labels">
        <span class="sun-arc__rise">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 3v1M4.22 6.22l.7.7M2 14h1M21 14h1M19.07 6.92l.71-.7M17 14a5 5 0 1 0-10 0"/><path d="M3 19h18M5 17l2-3M19 17l-2-3"/></svg>
          ${fmt(sun.sunrise)}
        </span>
        <span class="sun-arc__daylen">${dayLen}</span>
        <span class="sun-arc__set">
          ${fmt(sun.sunset)}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 3v1M4.22 6.22l.7.7M2 14h1M21 14h1M19.07 6.92l.71-.7M17 14a5 5 0 1 0-10 0"/><path d="M3 19h18M5 21l2-3M19 21l-2-3"/></svg>
        </span>
      </div>
    </div>
    <div class="moon-pill">
      <span class="moon-pill__icon">${moon.emoji}</span>
      <span class="moon-pill__name">${moon.name}</span>
      <span class="moon-pill__illum">${moon.illum}%</span>
      <span class="moon-pill__next">${nextEvent}</span>
      ${tideTag}
    </div>`;
}

function renderHero(latest, summary, readings) {
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

  const { min, max } = todayMinMax(readings);
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

/** —— Ta dan v zgodovini —— */
async function renderDayHistory() {
  const el = document.getElementById('day-history');
  if (!el) return;

  const now    = new Date();
  const month  = now.getMonth() + 1;
  const day    = now.getDate();
  const curYear = now.getFullYear();

  // Pretekla leta ki imajo podatke
  const pastYears = Object.keys(YEAR_SHEETS)
    .map(Number)
    .filter((y) => y < curYear)
    .sort((a, b) => b - a); // od najnovejšega

  if (!pastYears.length) { el.hidden = true; return; }

  // Vzporedno fetch vseh let
  el.hidden = false;
  el.innerHTML = `<div class="dh-loading">Nalagam zgodovino…</div>`;

  const results = await Promise.allSettled(
    pastYears.map((y) => fetchDayReadings(y, month, day).then((r) => ({ year: y, readings: r })))
  );

  const entries = results
    .filter((r) => r.status === 'fulfilled' && r.value.readings.length)
    .map((r) => {
      const { year, readings } = r.value;
      const temps = readings.map((x) => x.temp).filter((t) => t != null);
      const precip = readings.length ? (readings[readings.length - 1].precipTotal ?? 0) : 0;
      const windGusts = readings.map((x) => x.windGust).filter((g) => g != null);
      return {
        year,
        min:  temps.length ? Math.min(...temps) : null,
        max:  temps.length ? Math.max(...temps) : null,
        rain: precip,
        wind: windGusts.length ? Math.max(...windGusts) : null,
      };
    });

  if (!entries.length) { el.hidden = true; return; }

  // Rekordni vrednosti čez vsa ta leta
  const recMax  = Math.max(...entries.filter((e) => e.max  != null).map((e) => e.max));
  const recMin  = Math.min(...entries.filter((e) => e.min  != null).map((e) => e.min));
  const recRain = Math.max(...entries.filter((e) => e.rain  > 0).map((e) => e.rain));

  const dateLabel = now.toLocaleDateString('sl-SI', { day: 'numeric', month: 'long' });

  el.innerHTML = `
    <div class="dh-header">
      <span class="dh-header__icon">📅</span>
      <span class="dh-header__title">Ta dan v preteklosti</span>
      <span class="dh-header__date">${dateLabel}</span>
    </div>
    <div class="dh-scroll">
      ${entries.map((e) => {
        const isHotRec  = e.max  != null && e.max  === recMax;
        const isColdRec = e.min  != null && e.min  === recMin;
        const isRainRec = e.rain > 0      && e.rain === recRain;
        const hasRain   = e.rain > 0.1;

        return `<div class="dh-card">
          <span class="dh-card__year">${e.year}</span>
          <div class="dh-card__temps">
            <span class="dh-card__max${isHotRec  ? ' dh-card__max--rec' : ''}"
                  title="${isHotRec ? 'Rekord za ta dan' : ''}">
              ${e.max != null ? e.max.toFixed(1) + '°' : '—'}${isHotRec ? ' 🔥' : ''}
            </span>
            <span class="dh-card__min${isColdRec ? ' dh-card__min--rec' : ''}"
                  title="${isColdRec ? 'Rekord za ta dan' : ''}">
              ${e.min != null ? e.min.toFixed(1) + '°' : '—'}${isColdRec ? ' ❄️' : ''}
            </span>
          </div>
          ${hasRain
            ? `<span class="dh-card__rain${isRainRec ? ' dh-card__rain--rec' : ''}">
                 ${e.rain.toFixed(1)} mm${isRainRec ? ' 💧' : ''}
               </span>`
            : `<span class="dh-card__rain dh-card__rain--dry">·</span>`}
          ${e.wind != null ? `<span class="dh-card__wind">${e.wind.toFixed(1)} m/s</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
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

  renderHero(latest, summary, readings);
  renderMetrics(latest, readings);
  renderSunStrip();
  renderDayFact(latest);

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

  // Ta dan v preteklosti – enkrat ob zagonu (podatki se ne spremenijo čez dan)
  renderDayHistory();

}

init().catch((e) => {
  console.error(e);
  setStatus(`Napaka zagona: ${e.message}`, true);
});

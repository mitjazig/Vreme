import { REFRESH_MS, APP_VERSION, YEAR_SHEETS } from './config.js';
import { initWindRose } from './wind-rose.js';
import { sunriseSunset, moonPhase } from './astro.js';
import { moonDayType, getSowingCalendar } from './agro.js';
import { getDayFacts } from './fun-facts.js';
import { setupInstallUI } from './install-ui.js';
import { initPwaUpdates } from './pwa-update.js';
import { initContrast } from './contrast.js';
import { loadWeatherBundle, fetchDayReadings } from './sheets.js';
import { renderHourlyChart, renderDailyChart, renderPrecipChart24h } from './charts.js';
import { calcBoraJugo } from './bora.js';
import { fetchYesterdayModels } from './forecast.js';

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
  return null; // ni zanesljivega zadnjega dežja v predpomnilniku
}

function renderMetrics(latest, readings) {
  const grid = $('#metrics');
  if (!grid || !latest) return;

  const trend = tempTrend(readings);
  const feel = feelsLikeLabel(latest.temp, latest.humidity);
  const lastRain = lastRainLabel(readings);
  const rainValue = latest.precipTotal > 0
    ? formatNum(latest.precipTotal, ' mm', 1)
    : lastRain
      ? `<span class="now-stat__sub">Zadnji: ${lastRain}</span>`
      : '0 mm';

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
    const temp = latest?.temp;
    const hum  = latest?.humidity;
    const windKmh = (latest?.windSpeed ?? 0) * 3.6;
    let feelNum = temp;
    if (temp != null) {
      if (temp <= 10 && windKmh > 5) {
        // Wind chill
        feelNum = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * temp * Math.pow(windKmh, 0.16);
      } else if (temp >= 27 && hum != null) {
        // Heat index (že izračunan v feelsLikeLabel)
        const h = hum / 100;
        feelNum = -8.784695 + 1.61139411 * temp + 2.3385 * h - 0.14611605 * temp * h
          - 0.012308094 * temp * temp - 0.016424828 * h * h
          + 0.002211732 * temp * temp * h + 0.00072546 * temp * h * h
          - 0.000003582 * temp * temp * h * h;
      }
    }
    const numStr = feelNum != null ? ` · Občutek ${feelNum.toFixed(0)}°` : '';
    feelEl.textContent = feel.txt + numStr;
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
  if (!readings?.length) return { min: null, max: null, avg: null };
  const todayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' }).format(new Date());
  const todayReadings = readings.filter((r) => {
    if (!r.time || r.temp == null) return false;
    const k = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' }).format(r.time);
    return k === todayKey;
  });
  if (!todayReadings.length) return { min: null, max: null, avg: null };
  const temps = todayReadings.map((r) => r.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const avg = temps.reduce((s, t) => s + t, 0) / temps.length;
  return { min, max, avg };
}

/** Klima za današnji koledarski dan (pretekla leta) – s predpomnilnikom */
async function loadClimateForToday() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const curYear = now.getFullYear();
  const lsKey = `vreme-climate-v1-${month}-${day}`;

  try {
    const cached = JSON.parse(localStorage.getItem(lsKey) || 'null');
    if (cached?.entries?.length && cached.year === curYear) return cached;
  } catch { /* ignore */ }

  const pastYears = Object.keys(YEAR_SHEETS)
    .map(Number)
    .filter((y) => y < curYear)
    .sort((a, b) => b - a);

  if (!pastYears.length) return { entries: [], year: curYear };

  const results = await Promise.allSettled(
    pastYears.map((y) => fetchDayReadings(y, month, day).then((r) => ({ year: y, readings: r }))),
  );

  const entries = results
    .filter((r) => r.status === 'fulfilled' && r.value.readings.length)
    .map((r) => {
      const { year, readings } = r.value;
      const temps = readings.map((x) => x.temp).filter((t) => t != null);
      const precip = readings.length ? (readings[readings.length - 1].precipTotal ?? 0) : 0;
      const windGusts = readings.map((x) => x.windGust).filter((g) => g != null);
      const avg = temps.length ? temps.reduce((s, t) => s + t, 0) / temps.length : null;
      return {
        year,
        min: temps.length ? Math.min(...temps) : null,
        max: temps.length ? Math.max(...temps) : null,
        avg,
        rain: precip,
        wind: windGusts.length ? Math.max(...windGusts) : null,
      };
    });

  const payload = { entries, year: curYear, month, day };
  try {
    localStorage.setItem(lsKey, JSON.stringify(payload));
  } catch { /* quota */ }
  return payload;
}

function fmtDelta(d, unit = '°') {
  if (d == null || Number.isNaN(d)) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}${unit}`;
}

async function renderAnomaly(readings) {
  const el = document.getElementById('anomaly-content');
  const card = document.getElementById('anomaly-card');
  if (!el) return;

  el.innerHTML = '<p class="forecast-loading">Nalagam…</p>';
  const today = todayMinMax(readings);
  const climate = await loadClimateForToday();
  const entries = climate.entries ?? [];

  if (!entries.length || today.max == null) {
    if (card) card.hidden = true;
    return;
  }
  if (card) card.hidden = false;

  const maxs = entries.map((e) => e.max).filter((v) => v != null);
  const mins = entries.map((e) => e.min).filter((v) => v != null);
  const avgs = entries.map((e) => e.avg).filter((v) => v != null);
  const rains = entries.map((e) => e.rain).filter((v) => v != null);

  const climMax = maxs.reduce((s, v) => s + v, 0) / maxs.length;
  const climMin = mins.reduce((s, v) => s + v, 0) / mins.length;
  const climAvg = avgs.length ? avgs.reduce((s, v) => s + v, 0) / avgs.length : null;
  const climRain = rains.length ? rains.reduce((s, v) => s + v, 0) / rains.length : 0;

  const dMax = today.max - climMax;
  const dMin = today.min != null ? today.min - climMin : null;
  const dAvg = today.avg != null && climAvg != null ? today.avg - climAvg : null;

  const yearsN = entries.length;
  const dateLabel = new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'long' });

  const deltaCls = (d) => {
    if (d == null) return '';
    if (Math.abs(d) < 1) return 'anom--flat';
    return d > 0 ? 'anom--hot' : 'anom--cold';
  };

  el.innerHTML = `
    <div class="anom-grid">
      <div class="anom-item">
        <span class="anom-item__lbl">Max danes</span>
        <span class="anom-item__now">${today.max.toFixed(1)}°</span>
        <span class="anom-item__clim">povp. ${climMax.toFixed(1)}°</span>
        <span class="anom-item__delta ${deltaCls(dMax)}">${fmtDelta(dMax)}</span>
      </div>
      <div class="anom-item">
        <span class="anom-item__lbl">Min danes</span>
        <span class="anom-item__now">${today.min != null ? today.min.toFixed(1) + '°' : '—'}</span>
        <span class="anom-item__clim">povp. ${climMin.toFixed(1)}°</span>
        <span class="anom-item__delta ${deltaCls(dMin)}">${fmtDelta(dMin)}</span>
      </div>
      <div class="anom-item">
        <span class="anom-item__lbl">Povp. T</span>
        <span class="anom-item__now">${today.avg != null ? today.avg.toFixed(1) + '°' : '—'}</span>
        <span class="anom-item__clim">povp. ${climAvg != null ? climAvg.toFixed(1) + '°' : '—'}</span>
        <span class="anom-item__delta ${deltaCls(dAvg)}">${fmtDelta(dAvg)}</span>
      </div>
    </div>
    <p class="tide-note">${dateLabel} · odstop od povprečja ${yearsN} ${yearsN === 1 ? 'leta' : yearsN < 5 ? 'let' : 'let'} · padavine klima ~${climRain.toFixed(1)} mm</p>`;
}

/** —— Meteoalarm opozorila —— */
/** —— BBQ indeks iz postajnih podatkov —— */
const BBQ_LEVELS = [
  { min: 8.5, emoji: '🔥', label: 'Idealno za žar!',    color: '#22c55e' },
  { min: 7,   emoji: '😎', label: 'Odlično',             color: '#86efac' },
  { min: 5.5, emoji: '🙂', label: 'Solidno',             color: '#fde047' },
  { min: 4,   emoji: '😐', label: 'Gre, ampak…',         color: '#fb923c' },
  { min: 2,   emoji: '😬', label: 'Rajši v kuhinjo',     color: '#f87171' },
  { min: 0,   emoji: '🌧️', label: 'Absolutno ne',        color: '#94a3b8' },
];

function calcBbqStation(latest) {
  if (!latest) return null;
  const temp    = latest.temp    ?? 20;
  const windKmh = (latest.windSpeed ?? 0) * 3.6;  // m/s → km/h
  const humid   = latest.humidity ?? 50;
  const uv      = latest.uv      ?? 3;
  const raining = (latest.precipTotal ?? 0) > 0;

  // Temperatura (0–3): idealno 22–28°C
  let tPts = 0;
  if (temp >= 22 && temp <= 28) tPts = 3;
  else if (temp >= 18 && temp <= 32) tPts = 2;
  else if (temp >= 12 && temp <= 36) tPts = 1;

  // Dež (0–3): trenutno dežuje ali ne
  const rPts = raining ? 0 : 3;

  // Veter (0–2)
  let wPts = 0;
  if (windKmh < 10) wPts = 2;
  else if (windKmh < 20) wPts = 1.5;
  else if (windKmh < 30) wPts = 1;
  else if (windKmh < 45) wPts = 0.5;

  // Vlaga (0–1): idealno 35–70%
  const hPts = (humid >= 35 && humid <= 70) ? 1 : 0.5;

  // UV (0–1)
  const uvPts = uv >= 2 && uv <= 7 ? 1 : 0.5;

  const raw = tPts + rPts + wPts + hPts + uvPts;
  const maxRaw = 3 + 3 + 2 + 1 + 1; // = 10
  return Math.round((raw / maxRaw) * 10 * 2) / 2;  // 0–10, korak 0.5
}

function renderBbqHome(latest) {
  const el = document.getElementById('bbq-home-content');
  const sub = document.getElementById('bbq-home-sub');
  if (!el) return;

  const score = calcBbqStation(latest);
  if (score == null) {
    el.innerHTML = '<p class="forecast-loading">Ni podatkov.</p>';
    return;
  }

  const level = BBQ_LEVELS.find(l => score >= l.min) ?? BBQ_LEVELS.at(-1);
  const pct   = (score / 10) * 100;
  const windKmh = Math.round((latest.windSpeed ?? 0) * 3.6);
  const raining = (latest.precipTotal ?? 0) > 0;

  const warnings = [];
  if (raining)                             warnings.push('🌧 Dežuje');
  if (windKmh > 30)                        warnings.push(`💨 Veter ${windKmh} km/h`);
  if ((latest.temp ?? 20) > 34)            warnings.push('🌡️ Zelo vroče');
  if ((latest.temp ?? 20) < 12)            warnings.push('🥶 Prehladno');
  if ((latest.uv ?? 0) > 8)               warnings.push('☀️ Visok UV');

  if (sub) sub.textContent = `Rakitovec · ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`;

  el.innerHTML = `
    <div class="bbq-hero">
      <span class="bbq-hero__emoji">${level.emoji}</span>
      <div class="bbq-hero__info">
        <span class="bbq-hero__score" style="color:${level.color}">${score.toFixed(1)}<span class="bbq-hero__of">/10</span></span>
        <span class="bbq-hero__label">${level.label}</span>
      </div>
    </div>
    <div class="bbq-bar-wrap">
      <div class="bbq-bar">
        <div class="bbq-bar__fill" style="width:${pct.toFixed(0)}%;background:${level.color}"></div>
      </div>
    </div>
    ${warnings.length ? `<div class="bbq-warnings">${warnings.map(w => `<span class="bbq-warning">${w}</span>`).join('')}</div>` : ''}`;
}

/** Hitri pregled – kompaktni čipi */
function renderGlance(latest, readings) {
  const el = $('#glance');
  if (!el || !latest) return;
  const h24 = last24h(readings);
  let rain24 = 0;
  for (let i = 1; i < h24.length; i++) {
    const prev = h24[i - 1]?.precipTotal;
    const cur = h24[i]?.precipTotal;
    if (prev != null && cur != null && cur >= prev) rain24 += cur - prev;
  }
  const bora = calcBoraJugo(latest);
  const gustKmh = latest.windGust != null ? Math.round(latest.windGust * 3.6) : null;
  const windTag = bora?.type === 'burja' ? 'Burja' : bora?.type === 'jugo' ? 'Jugo' : bora?.type === 'mirno' ? 'Mirno' : 'Veter';

  el.hidden = false;
  el.innerHTML = `
    <div class="glance__chip"><span class="glance__k">T</span><span class="glance__v">${latest.temp != null ? `${latest.temp.toFixed(1)}°` : '—'}</span></div>
    <div class="glance__chip"><span class="glance__k">Sunki</span><span class="glance__v">${gustKmh != null ? `${gustKmh} km/h` : '—'}</span></div>
    <div class="glance__chip"><span class="glance__k">24h dež</span><span class="glance__v">${rain24 > 0.05 ? `${rain24.toFixed(1)} mm` : '0'}</span></div>
    <div class="glance__chip glance__chip--accent"><span class="glance__k">${bora?.emoji ?? '💨'}</span><span class="glance__v">${windTag}</span></div>`;
}

function renderBora(latest) {
  const el = $('#bora-content');
  if (!el) return;
  const b = calcBoraJugo(latest);
  if (!b) {
    el.innerHTML = '<p class="forecast-loading">Ni podatkov o vetru.</p>';
    return;
  }
  const gustKmh = Math.round(b.gustMs * 3.6);
  const dirStr = b.dir != null ? windLabel(b.dir) : '—';
  el.innerHTML = `
    <div class="bora-hero ${b.cls}">
      <span class="bora-hero__emoji">${b.emoji}</span>
      <div class="bora-hero__body">
        <span class="bora-hero__title">${b.title}</span>
        <span class="bora-hero__meta">${dirStr} · sunki ${gustKmh} km/h</span>
        <span class="bora-hero__tip">${b.tip}</span>
      </div>
      <div class="bora-meter" aria-hidden="true">
        ${[1, 2, 3, 4, 5].map((i) => `<span class="bora-meter__seg ${i <= b.score ? 'is-on' : ''}"></span>`).join('')}
      </div>
    </div>`;
}

function stationYesterdayStats(readings) {
  if (!readings?.length) return null;
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' });
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yKey = fmt.format(y);
  const dayReadings = readings.filter((r) => r.time && fmt.format(r.time) === yKey);
  if (dayReadings.length < 4) return { dateKey: yKey, thin: true };

  const temps = dayReadings.map((r) => r.temp).filter((t) => t != null);
  const max = temps.length ? Math.max(...temps) : null;
  const min = temps.length ? Math.min(...temps) : null;
  let rain = 0;
  const sorted = [...dayReadings].sort((a, b) => a.time - b.time);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1].precipTotal;
    const b = sorted[i].precipTotal;
    if (a != null && b != null && b >= a) rain += b - a;
  }
  return { dateKey: yKey, max, min, rain, thin: false };
}

async function renderSkill(readings) {
  const el = $('#skill-content');
  if (!el) return;
  let obs = stationYesterdayStats(readings);

  if (!obs || obs.thin || obs.max == null) {
    try {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const dayRows = await fetchDayReadings(y.getFullYear(), y.getMonth() + 1, y.getDate());
      obs = stationYesterdayStats(dayRows);
    } catch { /* ignore */ }
  }

  if (!obs || obs.thin || obs.max == null) {
    el.innerHTML = '<p class="forecast-loading">Za primerjavo potrebujem več meritev včeraj.</p>';
    return;
  }
  try {
    const { models } = await fetchYesterdayModels(obs.dateKey);
    const rows = Object.values(models).map((m) => {
      const dMax = m.max != null && obs.max != null ? m.max - obs.max : null;
      const dMin = m.min != null && obs.min != null ? m.min - obs.min : null;
      const fmtD = (d) => (d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}°`);
      return `<div class="skill-row">
        <span class="skill-row__model">${m.short}</span>
        <span class="skill-row__val">${m.max != null ? `${Math.round(m.max)}°` : '—'}</span>
        <span class="skill-row__delta ${dMax != null && Math.abs(dMax) >= 2 ? 'is-off' : ''}">${fmtD(dMax)}</span>
        <span class="skill-row__val">${m.min != null ? `${Math.round(m.min)}°` : '—'}</span>
        <span class="skill-row__delta ${dMin != null && Math.abs(dMin) >= 2 ? 'is-off' : ''}">${fmtD(dMin)}</span>
      </div>`;
    }).join('');
    el.innerHTML = `
      <div class="skill-obs">
        <span>Postaja včeraj</span>
        <strong>${obs.max.toFixed(1)}°</strong> / <strong>${obs.min != null ? `${obs.min.toFixed(1)}°` : '—'}</strong>
        <span class="skill-obs__rain">${obs.rain > 0.1 ? `${obs.rain.toFixed(1)} mm` : 'brez dežja'}</span>
      </div>
      <div class="skill-head"><span></span><span>Max</span><span>±</span><span>Min</span><span>±</span></div>
      ${rows}
      <p class="tide-note">Odstop = napoved − postaja · ${obs.dateKey}</p>`;
  } catch (err) {
    el.innerHTML = `<p class="forecast-loading">Primerjava ni na voljo (${err.message}).</p>`;
  }
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

  const now = new Date();
  el.hidden = false;
  el.innerHTML = `<div class="dh-loading">Nalagam zgodovino…</div>`;

  const climate = await loadClimateForToday();
  const entries = climate.entries ?? [];
  if (!entries.length) { el.hidden = true; return; }

  const recMax  = Math.max(...entries.filter((e) => e.max  != null).map((e) => e.max));
  const recMin  = Math.min(...entries.filter((e) => e.min  != null).map((e) => e.min));
  const rainEntries = entries.filter((e) => e.rain > 0);
  const recRain = rainEntries.length ? Math.max(...rainEntries.map((e) => e.rain)) : null;

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
        const isRainRec = recRain != null && e.rain > 0 && e.rain === recRain;
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

/** —— Lunarni kmetijski nasvet —— */
function renderAgro() {
  const el = document.getElementById('agro-content');
  const descEl = document.getElementById('agro-head-desc');
  if (!el) return;

  const now  = new Date();
  const moon = moonPhase(now);
  const day  = moonDayType(now, moon);
  const sow  = getSowingCalendar(now.getMonth() + 1);
  const monthName = now.toLocaleDateString('sl-SI', { month: 'long' });

  if (descEl) descEl.textContent = `${day.info.emoji} ${day.info.sl} · ${moon.emoji} ${moon.name}`;

  el.innerHTML = `
    <div class="agro-type" style="border-left:3px solid ${day.info.color}">
      <span class="agro-type__badge" style="background:${day.info.color}20;color:${day.info.color}">${day.info.emoji} ${day.info.sl}</span>
      <span class="agro-type__sign">${day.zodiac.emoji} Luna v ${day.zodiac.name}</span>
      <p class="agro-type__tip">${day.info.tip}</p>
      <p class="agro-phase">${day.phaseAdvice}</p>
      ${day.woodTip
        ? `<p class="agro-wood">🪵 Odličen čas za žaganje in cepljenje drv — les bo trši in se bo manj krivil.</p>`
        : `<p class="agro-wood agro-wood--next">🪵 Žaganje drv: naslednji dober čas čez <strong>${day.woodNextDays} ${day.woodNextDays === 1 ? 'dan' : day.woodNextDays < 5 ? 'dni' : 'dni'}</strong> (zadnja četrtina lune)</p>`}
    </div>
    <div class="agro-sow">
      <div class="agro-sow__head">Setveni nasvet — ${monthName}</div>
      <div class="agro-sow__grid">
        ${sow.map((s) => `
          <div class="agro-sow__item">
            <span class="agro-sow__icon">${s.icon}</span>
            <div>
              <span class="agro-sow__crop">${s.crop}</span>
              <span class="agro-sow__action">${s.action}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

/** —— Tekoči mesec povzetek —— */
function renderMonthSummary(readings) {
  const el = document.getElementById('month-summary');
  if (!el) return;

  const now = new Date();
  const curMonth = now.getMonth();
  const curYear  = now.getFullYear();

  const monthReadings = readings.filter((r) => {
    if (!r.time || r.temp == null) return false;
    return r.time.getMonth() === curMonth && r.time.getFullYear() === curYear;
  });

  if (!monthReadings.length) { el.hidden = true; return; }

  const temps = monthReadings.map((r) => r.temp).filter((t) => t != null);
  const minT  = Math.min(...temps);
  const maxT  = Math.max(...temps);
  const avgT  = temps.reduce((s, t) => s + t, 0) / temps.length;

  // Skupne padavine — zadnja vrednost precipTotal za vsak dan
  const dayTotals = {};
  monthReadings.forEach((r) => {
    if (r.precipTotal == null) return;
    const d = r.time.toDateString();
    dayTotals[d] = r.precipTotal;
  });
  const totalRain = Object.values(dayTotals).reduce((s, v) => s + v, 0);

  const monthName = now.toLocaleDateString('sl-SI', { month: 'long' });

  el.hidden = false;
  el.innerHTML = `
    <div class="ms-head">${monthName} ${curYear}</div>
    <div class="ms-grid">
      <div class="ms-item">
        <span class="ms-lbl">Min</span>
        <span class="ms-val ms-val--cold">${minT.toFixed(1)}°</span>
      </div>
      <div class="ms-item">
        <span class="ms-lbl">Povp.</span>
        <span class="ms-val">${avgT.toFixed(1)}°</span>
      </div>
      <div class="ms-item">
        <span class="ms-lbl">Max</span>
        <span class="ms-val ms-val--hot">${maxT.toFixed(1)}°</span>
      </div>
      <div class="ms-item">
        <span class="ms-lbl">Padavine</span>
        <span class="ms-val ms-val--rain">${totalRain.toFixed(1)} mm</span>
      </div>
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
  renderGlance(latest, readings);
  renderMetrics(latest, readings);
  renderMonthSummary(readings);
  renderAgro();
  renderBora(latest);
  renderBbqHome(latest);
  renderSkill(readings);
  renderSunStrip();
  renderDayFact(latest);
  renderAnomaly(readings);

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
  initContrast();
  setupInstallUI();
  initWindRose();
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

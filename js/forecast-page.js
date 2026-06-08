import { initPwaUpdates } from './pwa-update.js';
import { fetchForecast, fetchHourlyForecast, fetchSeaTemp, wmoIcon, wmoLabel, fetchAirQuality, calcTides } from './forecast.js';
import { fetchAlerts, alertCls, alertLabel } from './alerts.js';

const $ = (sel) => document.querySelector(sel);

function setStatus(msg, isError = false) {
  const el = $('#status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isError);
}

function renderAlerts(alerts) {
  const el = $('#alerts-container');
  if (!el) return;
  if (!alerts?.length) { el.innerHTML = ''; return; }
  el.innerHTML = alerts.map((a) => `
    <div class="alert-banner ${alertCls(a.severity)}" role="alert">
      <span class="alert-banner__icon">⚠️</span>
      <div class="alert-banner__body">
        <strong>${alertLabel(a.severity)}</strong>
        <span>${a.event || a.title}</span>
      </div>
    </div>
  `).join('');
}

function renderForecast(days) {
  const el = $('#forecast-days');
  if (!el) return;
  if (!days?.length) { el.innerHTML = '<p class="forecast-loading">Napoved ni na voljo.</p>'; return; }

  const DAY_SL = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];
  el.innerHTML = days.map((d, i) => {
    const label = i === 0 ? 'Danes' : i === 1 ? 'Jutri' : DAY_SL[d.date.getDay()];
    const hasRain = d.rain != null && d.rain > 0.1;
    const rainProb = d.rainProb != null ? `${d.rainProb}%` : '';
    return `<div class="forecast-day">
      <span class="forecast-day__lbl">${label}</span>
      <span class="forecast-day__icon" title="${wmoLabel(d.code)}">${wmoIcon(d.code)}</span>
      <span class="forecast-day__temps">
        <span class="forecast-day__max">${d.max != null ? Math.round(d.max) + '°' : '—'}</span>
        <span class="forecast-day__min">${d.min != null ? Math.round(d.min) + '°' : '—'}</span>
      </span>
      ${hasRain
        ? `<span class="forecast-day__rain">${d.rain.toFixed(1)} mm${rainProb ? `<br><span class="forecast-day__prob">${rainProb}</span>` : ''}</span>`
        : `<span class="forecast-day__rain forecast-day__rain--none">·</span>`}
    </div>`;
  }).join('');
}

function renderHourly(hours) {
  const el = $('#forecast-hourly');
  if (!el) return;
  if (!hours?.length) { el.innerHTML = '<p class="forecast-loading">Urna napoved ni na voljo.</p>'; return; }

  el.innerHTML = `<div class="hourly-scroll">${hours.map((h) => {
    const timeStr = h.time.toLocaleTimeString('sl-SI', {
      timeZone: 'Europe/Ljubljana',
      hour: '2-digit', minute: '2-digit',
    });
    const dayStr = h.time.toLocaleDateString('sl-SI', {
      timeZone: 'Europe/Ljubljana',
      weekday: 'short', day: 'numeric',
    });
    const isNewDay = h.isNewDay;
    return `${isNewDay ? `<div class="hourly-day-sep">${dayStr}</div>` : ''}
    <div class="hourly-item">
      <span class="hourly-item__time">${timeStr}</span>
      <span class="hourly-item__icon" title="${wmoLabel(h.code)}">${wmoIcon(h.code)}</span>
      <span class="hourly-item__temp">${h.temp != null ? Math.round(h.temp) + '°' : '—'}</span>
      ${h.precip > 0
        ? `<span class="hourly-item__rain">${h.precip.toFixed(1)}<span class="hourly-item__unit">mm</span></span>`
        : `<span class="hourly-item__rain hourly-item__rain--none">·</span>`}
      ${h.precipProb != null
        ? `<span class="hourly-item__prob">${h.precipProb}%</span>`
        : ''}
    </div>`;
  }).join('')}</div>`;
}

/** —— Temperatura morja —— */
function renderSeaTemp(sea) {
  const el = $('#sea-content');
  if (!el) return;
  if (!sea || sea.current == null) {
    el.innerHTML = '<p class="forecast-loading">Podatki o temperaturi morja niso na voljo.</p>';
    return;
  }

  const DAY_SL = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];
  const days = sea.daily ?? [];

  el.innerHTML = `
    <div class="sea-current">
      <span class="sea-current__val">${sea.current.toFixed(1)}°C</span>
      <span class="sea-current__lbl">trenutno</span>
    </div>
    <div class="sea-week">
      ${days.map((d, i) => {
        const label = i === 0 ? 'Danes' : i === 1 ? 'Jutri' : DAY_SL[d.date.getDay()];
        return `<div class="sea-day">
          <span class="sea-day__lbl">${label}</span>
          <span class="sea-day__val">${d.max != null ? d.max.toFixed(1) + '°' : '—'}</span>
        </div>`;
      }).join('')}
    </div>`;
}

/** —— Plima / oseka —— */
function renderTides() {
  const el = document.getElementById('tide-content');
  if (!el) return;

  const now = new Date();
  // Round down to hour start for consistent display
  const fromMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime();
  const { points, extrema } = calcTides(fromMs, 36);

  const fmtTime = (d) => d.toLocaleTimeString('sl-SI', {
    timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit',
  });
  const fmtDay = (d) => d.toLocaleDateString('sl-SI', {
    timeZone: 'Europe/Ljubljana', weekday: 'short', day: 'numeric',
  });

  // SVG mini chart
  const W = 320, H = 80, PAD = 4;
  const levels = points.map((p) => p.level);
  const lMin = Math.min(...levels);
  const lMax = Math.max(...levels);
  const xScale = (W - PAD * 2) / (points.length - 1);
  const yScale = (H - PAD * 2) / (lMax - lMin || 1);
  const toX = (i) => PAD + i * xScale;
  const toY = (v) => H - PAD - (v - lMin) * yScale;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.level).toFixed(1)}`).join(' ');
  const fillD = `${pathD} L${toX(points.length - 1).toFixed(1)},${H} L${PAD},${H} Z`;

  // Now marker
  const nowIdx = points.findIndex((p) => p.time >= now);
  const nowX = nowIdx >= 0 ? toX(nowIdx) : toX(0);
  const nowY = nowIdx >= 0 ? toY(points[nowIdx].level) : H / 2;

  // Next 6 extrema
  const upcoming = extrema.filter((e) => e.time >= now).slice(0, 6);

  const tideLabel = (e) => e.type === 'high' ? 'Visoka voda' : 'Nizka voda';
  const tideIcon = (e) => e.type === 'high' ? '🌊' : '🏖️';

  el.innerHTML = `
    <div class="tide-chart-wrap">
      <svg class="tide-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="tideGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.04"/>
          </linearGradient>
        </defs>
        <path d="${fillD}" fill="url(#tideGrad)"/>
        <path d="${pathD}" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="${nowX.toFixed(1)}" y1="${PAD}" x2="${nowX.toFixed(1)}" y2="${H - PAD}" stroke="rgba(248,250,252,0.5)" stroke-width="1" stroke-dasharray="3,3"/>
        <circle cx="${nowX.toFixed(1)}" cy="${nowY.toFixed(1)}" r="3.5" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>
      </svg>
      <div class="tide-axis">
        <span>${(lMax + 0.26).toFixed(2)} m</span>
        <span>${((lMin + lMax) / 2 + 0.26).toFixed(2)} m</span>
        <span>${(lMin + 0.26).toFixed(2)} m</span>
      </div>
    </div>
    <div class="tide-extrema">
      ${upcoming.map((e) => {
        const isToday = e.time.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' }) === now.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' });
        return `<div class="tide-event tide-event--${e.type}">
          <span class="tide-event__icon">${tideIcon(e)}</span>
          <div class="tide-event__info">
            <span class="tide-event__label">${tideLabel(e)}</span>
            <span class="tide-event__time">${isToday ? '' : fmtDay(e.time) + ' '}${fmtTime(e.time)}</span>
          </div>
          <span class="tide-event__level">${(e.level + 0.26).toFixed(2)} m</span>
        </div>`;
      }).join('')}
    </div>
    <p class="tide-note">* Višine so relativne glede na povprečno gladino morja (MSL). Harmonični model – orientacijska vrednost.</p>`;
}

/** —— Kakovost zraka —— */
function renderAirQuality(aq) {
  const el = document.getElementById('aq-content');
  if (!el) return;
  if (!aq || aq.aqi == null) {
    el.innerHTML = '<p class="forecast-loading">Podatki o kakovosti zraka niso na voljo.</p>';
    return;
  }

  const aqi = Math.round(aq.aqi);
  let label, cls;
  if (aqi <= 20)       { label = 'Dobra';           cls = 'aqi--good'; }
  else if (aqi <= 40)  { label = 'Sprejemljiva';    cls = 'aqi--fair'; }
  else if (aqi <= 60)  { label = 'Zmerna';          cls = 'aqi--moderate'; }
  else if (aqi <= 80)  { label = 'Slaba';           cls = 'aqi--poor'; }
  else if (aqi <= 100) { label = 'Zelo slaba';      cls = 'aqi--verypoor'; }
  else                 { label = 'Izredno slaba';   cls = 'aqi--hazardous'; }

  const pct = Math.min(100, aqi);
  const pollutants = [
    { lbl: 'PM10',  val: aq.pm10,  unit: 'μg/m³', limit: 40 },
    { lbl: 'PM2.5', val: aq.pm25,  unit: 'μg/m³', limit: 25 },
    { lbl: 'NO₂',   val: aq.no2,   unit: 'μg/m³', limit: 40 },
    { lbl: 'O₃',    val: aq.ozone, unit: 'μg/m³', limit: 100 },
  ].filter((p) => p.val != null);

  el.innerHTML = `
    <div class="aq-hero ${cls}">
      <div class="aq-aqi">
        <span class="aq-aqi__val">${aqi}</span>
        <span class="aq-aqi__lbl">EU AQI</span>
      </div>
      <div class="aq-bar-wrap">
        <div class="aq-bar">
          <div class="aq-bar__fill ${cls}" style="width:${pct}%"></div>
          <div class="aq-bar__marker" style="left:${pct}%"></div>
        </div>
        <span class="aq-label ${cls}">${label}</span>
      </div>
    </div>
    <div class="aq-pollutants">
      ${pollutants.map((p) => {
        const pct2 = Math.min(100, (p.val / (p.limit * 2)) * 100);
        const over = p.val > p.limit;
        return `<div class="aq-poll">
          <span class="aq-poll__lbl">${p.lbl}</span>
          <div class="aq-poll__bar"><div class="aq-poll__fill ${over ? 'aq-poll__fill--over' : ''}" style="width:${pct2.toFixed(0)}%"></div></div>
          <span class="aq-poll__val ${over ? 'aq-poll__val--over' : ''}">${p.val.toFixed(1)} ${p.unit}</span>
        </div>`;
      }).join('')}
    </div>
    <p class="tide-note">Vir: Open-Meteo Air Quality API · ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}</p>`;
}

/** —— Radar zemljevid (Leaflet + RainViewer) —— */
let radarMap = null;
let radarFrames = [];
let radarLayers = [];
let radarIdx = 0;
let radarTimer = null;
let radarPlaying = false;

async function initRadarMap() {
  const mapEl = document.getElementById('radar-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Inicializiraj Leaflet zemljevid centriran na Koper
  radarMap = L.map('radar-map', { zoomControl: true, attributionControl: true }).setView([45.55, 13.9], 7);

  // Temni tile layer (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(radarMap);

  // Marker za postajo
  L.circleMarker([45.5547, 13.7282], {
    radius: 6,
    fillColor: '#38bdf8',
    color: '#fff',
    weight: 2,
    fillOpacity: 1,
  }).bindTooltip('IKOPER43 · Koper', { permanent: false }).addTo(radarMap);

  await loadRadarFrames();
}

async function loadRadarFrames() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await res.json();

    const past = data.radar?.past ?? [];
    const nowcast = data.radar?.nowcast ?? [];
    radarFrames = [...past, ...nowcast];

    // Predobremi tile layerje
    radarLayers = radarFrames.map((frame) =>
      L.tileLayer(`${data.host}${frame.path}/512/{z}/{x}/{y}/4/1_1.png`, {
        opacity: 0.65,
        zIndex: 10,
      })
    );

    if (radarFrames.length) {
      showRadarFrame(radarFrames.length - 1); // zadnji frame
      const upd = document.getElementById('radar-updated');
      if (upd) upd.textContent = `Posodobljeno: ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`;
    }
  } catch (e) {
    console.warn('Radar:', e);
  }
}

function showRadarFrame(idx) {
  if (!radarMap || !radarLayers.length) return;
  radarIdx = Math.max(0, Math.min(idx, radarLayers.length - 1));

  // Odstrani vse layerje, dodaj trenutnega
  radarLayers.forEach((l) => { if (radarMap.hasLayer(l)) radarMap.removeLayer(l); });
  radarLayers[radarIdx].addTo(radarMap);

  // Posodobi UI
  const frame = radarFrames[radarIdx];
  const dt = new Date(frame.time * 1000);
  const timeEl = document.getElementById('radar-time');
  if (timeEl) timeEl.textContent = dt.toLocaleTimeString('sl-SI', {
    timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit',
  });

  const prog = document.getElementById('radar-progress');
  if (prog) prog.style.width = `${((radarIdx + 1) / radarLayers.length) * 100}%`;

  // Označi nowcast frame
  const isNowcast = radarIdx >= (radarFrames.length - (radarFrames.length - (radarFrames.filter(f => f.time <= Date.now()/1000).length)));
  if (timeEl) timeEl.classList.toggle('radar-time--forecast', frame.time > Date.now() / 1000);
}

function toggleRadarPlay() {
  radarPlaying = !radarPlaying;
  const icon = document.getElementById('radar-play-icon');
  if (icon) icon.innerHTML = radarPlaying
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'  // pause
    : '<path d="M8 5v14l11-7z"/>';  // play

  if (radarPlaying) {
    radarTimer = setInterval(() => {
      const next = (radarIdx + 1) % radarLayers.length;
      showRadarFrame(next);
    }, 500);
  } else {
    clearInterval(radarTimer);
  }
}



async function load() {
  setStatus('Nalagam napoved…');
  try {
    const [forecast, hourly, alerts, sea, aq] = await Promise.allSettled([
      fetchForecast(),
      fetchHourlyForecast(),
      fetchAlerts(),
      fetchSeaTemp(),
      fetchAirQuality(),
    ]);

    if (forecast.status === 'fulfilled') renderForecast(forecast.value);
    else renderForecast(null);

    if (hourly.status === 'fulfilled') renderHourly(hourly.value);
    else renderHourly(null);

    if (alerts.status === 'fulfilled') renderAlerts(alerts.value);

    if (sea.status === 'fulfilled') renderSeaTemp(sea.value);
    else renderSeaTemp(null);

    if (aq.status === 'fulfilled') renderAirQuality(aq.value);
    else renderAirQuality(null);

    // Plima se računa lokalno, ne zahteva API klica
    renderTides();

    setStatus(`Posodobljeno ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setStatus(`Napaka: ${err.message}`, true);
  }
}

function refreshArsoRadar() {
  const img = document.getElementById('radar-img');
  const info = document.getElementById('radar-arso-updated');
  if (!img) return;
  img.src = `https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif?t=${Date.now()}`;
  if (info) info.textContent = `Posodobljeno: ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`;
}

async function init() {
  initPwaUpdates();
  $('#btn-reload')?.addEventListener('click', load);

  await load();
  setInterval(load, 30 * 60 * 1000);

  // Leaflet + RainViewer
  await initRadarMap();
  document.getElementById('radar-play')?.addEventListener('click', toggleRadarPlay);
  setInterval(loadRadarFrames, 10 * 60 * 1000);

  // ARSO GIF
  refreshArsoRadar();
  setInterval(refreshArsoRadar, 10 * 60 * 1000);
}

init();

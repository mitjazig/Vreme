import { initPwaUpdates } from './pwa-update.js';
import { fetchForecast, fetchHourlyForecast, fetchSeaTemp, wmoIcon, wmoLabel } from './forecast.js';
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
    const [forecast, hourly, alerts, sea] = await Promise.allSettled([
      fetchForecast(),
      fetchHourlyForecast(),
      fetchAlerts(),
      fetchSeaTemp(),
    ]);

    if (forecast.status === 'fulfilled') renderForecast(forecast.value);
    else renderForecast(null);

    if (hourly.status === 'fulfilled') renderHourly(hourly.value);
    else renderHourly(null);

    if (alerts.status === 'fulfilled') renderAlerts(alerts.value);

    if (sea.status === 'fulfilled') renderSeaTemp(sea.value);
    else renderSeaTemp(null);

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

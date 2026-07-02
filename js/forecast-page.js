import { initPwaUpdates } from './pwa-update.js';
import { fetchForecast, fetchHourlyForecast, fetchSeaTemp, wmoIcon, wmoLabel, fetchAirQuality, calcTides, fetchFireDanger, fetchLocationForecast, reverseGeocode, fetchWarnings, fetchWindyWaves } from './forecast.js';
import { moonPhase, STATION_LAT, STATION_LON } from './astro.js';
import { LightningTracker } from './lightning.js';

const $ = (sel) => document.querySelector(sel);

function setStatus(msg, isError = false) {
  const el = $('#status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isError);
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

/** —— Lunina faza (pill za vgraditev) —— */
function renderMoonPill() {
  const m = moonPhase();
  const fmtDate = (d) => d.toLocaleDateString('sl-SI', {
    timeZone: 'Europe/Ljubljana', day: 'numeric', month: 'short',
  });

  const effect = m.tideEffect === 'spring'
    ? '<span class="moon-tide moon-tide--spring">☊ Pomladna plima</span>'
    : m.tideEffect === 'neap'
    ? '<span class="moon-tide moon-tide--neap">☋ Mrtvina</span>'
    : '';

  const nextEvent = m.daysToFull <= m.daysToNew
    ? `Polna luna: ${fmtDate(m.nextFull)}`
    : `Mlaj: ${fmtDate(m.nextNew)}`;

  return `<div class="moon-forecast-pill">
    <span class="moon-forecast-pill__icon">${m.emoji}</span>
    <div class="moon-forecast-pill__body">
      <span class="moon-forecast-pill__name">${m.name} · ${m.illum}%</span>
      <span class="moon-forecast-pill__next">${nextEvent} ${effect}</span>
    </div>
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
    <p class="tide-note">* Višine so relativne glede na povprečno gladino morja (MSL). Harmonični model – orientacijska vrednost.</p>
    ${renderMoonPill()}`;

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

/** —— Požarna nevarnost (FWI) —— */
function fwiInfo(fwi) {
  if (fwi == null) return { label: '—',          cls: '',              bar: 0   };
  if (fwi <  5.4)  return { label: 'Nizka',       cls: 'fwi--low',      bar: Math.min(fwi / 5.4 * 20, 20) };
  if (fwi < 11.2)  return { label: 'Zmerna',      cls: 'fwi--moderate', bar: 20 + (fwi - 5.4)  / 5.8  * 20 };
  if (fwi < 21.3)  return { label: 'Visoka',      cls: 'fwi--high',     bar: 40 + (fwi - 11.2) / 10.1 * 20 };
  if (fwi < 38.0)  return { label: 'Zelo visoka', cls: 'fwi--veryhigh', bar: 60 + (fwi - 21.3) / 16.7 * 20 };
  return              { label: 'Ekstremna',        cls: 'fwi--extreme',  bar: Math.min(80 + (fwi - 38) / 20 * 20, 100) };
}

function renderFireDanger(days) {
  const el = document.getElementById('fire-content');
  if (!el) return;
  if (!days?.length || days.every(d => d.fwi == null)) {
    el.innerHTML = '<p class="forecast-loading">Podatki o požarni nevarnosti niso na voljo.</p>';
    return;
  }

  const DAY_SL = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];
  const today = days[0];
  const info = fwiInfo(today.fwi);

  el.innerHTML = `
    <div class="fwi-hero ${info.cls}">
      <div class="fwi-hero__val">${today.fwi != null ? today.fwi.toFixed(1) : '—'}</div>
      <div class="fwi-hero__body">
        <span class="fwi-hero__label">FWI — ${info.label}</span>
        <div class="fwi-bar-wrap">
          <div class="fwi-bar">
            <div class="fwi-bar__track">
              <span class="fwi-bar__seg fwi-bar__seg--low"></span>
              <span class="fwi-bar__seg fwi-bar__seg--moderate"></span>
              <span class="fwi-bar__seg fwi-bar__seg--high"></span>
              <span class="fwi-bar__seg fwi-bar__seg--veryhigh"></span>
              <span class="fwi-bar__seg fwi-bar__seg--extreme"></span>
            </div>
            <div class="fwi-bar__marker" style="left:${info.bar.toFixed(1)}%"></div>
          </div>
          <div class="fwi-bar__labels"><span>Nizka</span><span>Zmerna</span><span>Visoka</span><span>Zelo vis.</span><span>Ekstremna</span></div>
        </div>
      </div>
    </div>
    <div class="fwi-week">
      ${days.map((d, i) => {
        const inf = fwiInfo(d.fwi);
        const lbl = i === 0 ? 'Danes' : i === 1 ? 'Jutri' : DAY_SL[d.date.getDay()];
        return `<div class="fwi-day ${inf.cls}">
          <span class="fwi-day__lbl">${lbl}</span>
          <span class="fwi-day__val">${d.fwi != null ? d.fwi.toFixed(0) : '—'}</span>
          <span class="fwi-day__tag">${inf.label}</span>
        </div>`;
      }).join('')}
    </div>
    <p class="tide-note">FWI (Canadian Fire Weather Index) · Open-Meteo · višja vrednost = večja nevarnost</p>`;
}

/** —— Napoved za mojo lokacijo —— */
function renderLocationForecast(data, locationName, lat, lon) {
  const el = document.getElementById('loc-content');
  if (!el) return;

  const DAY_SL = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];
  const { current, daily } = data;
  const locLabel = locationName ?? `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;

  el.innerHTML = `
    <div class="loc-header">
      <span class="loc-header__pin">📍</span>
      <span class="loc-header__name">${locLabel}</span>
    </div>
    <div class="loc-current">
      <span class="loc-current__icon" title="${wmoLabel(current.code)}">${wmoIcon(current.code)}</span>
      <span class="loc-current__temp">${current.temp != null ? Math.round(current.temp) + '°C' : '—'}</span>
      <span class="loc-current__sub">${wmoLabel(current.code)}${current.humidity != null ? ' · ' + Math.round(current.humidity) + '% vl.' : ''}${current.wind != null ? ' · 💨 ' + current.wind.toFixed(0) + ' km/h' : ''}</span>
    </div>
    <div class="loc-days">
      ${daily.map((d, i) => {
        const lbl = i === 0 ? 'Danes' : i === 1 ? 'Jutri' : DAY_SL[d.date.getDay()];
        const hasRain = d.rain != null && d.rain > 0.1;
        return `<div class="loc-day">
          <span class="loc-day__lbl">${lbl}</span>
          <span class="loc-day__icon">${wmoIcon(d.code)}</span>
          <span class="loc-day__temps"><b>${d.max != null ? Math.round(d.max) + '°' : '—'}</b> <span class="loc-day__min">${d.min != null ? Math.round(d.min) + '°' : ''}</span></span>
          ${hasRain ? `<span class="loc-day__rain">${d.rain.toFixed(1)} mm</span>` : '<span class="loc-day__rain loc-day__rain--none">·</span>'}
        </div>`;
      }).join('')}
    </div>`;
}

async function initLocationForecast() {
  const btn = document.getElementById('loc-btn');
  const el  = document.getElementById('loc-content');
  if (!btn || !el) return;

  btn.addEventListener('click', async () => {
    if (!navigator.geolocation) {
      el.innerHTML = '<p class="forecast-loading">Geolokacija ni podprta v tem brskalniku.</p>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Pridobivam lokacijo…';
    el.innerHTML = '<p class="forecast-loading">Nalagam…</p>';

    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 })
      );
      const { latitude: lat, longitude: lon } = pos.coords;

      const [data, locationName] = await Promise.all([
        fetchLocationForecast(lat, lon),
        reverseGeocode(lat, lon),
      ]);

      renderLocationForecast(data, locationName, lat, lon);
      btn.textContent = '📍 Posodobi lokacijo';
    } catch (err) {
      const msg = err.code === 1 ? 'Dostop do lokacije zavrnjen.'
                : err.code === 2 ? 'Lokacija ni na voljo.'
                : err.code === 3 ? 'Prekoračen čas za pridobitev lokacije.'
                : `Napaka: ${err.message}`;
      el.innerHTML = `<p class="forecast-loading forecast-loading--err">${msg}</p>`;
      btn.textContent = '📍 Napoved za mojo lokacijo';
    } finally {
      btn.disabled = false;
    }
  });
}

/** —— Valovi (Windy) —— */
function renderWaves(points) {
  const el = document.getElementById('waves-content');
  if (!el) return;
  if (!points?.length) { el.innerHTML = '<p class="forecast-loading">Ni podatkov.</p>'; return; }

  const DIR_LABELS = ['S','SSV','SV','VSV','V','VJV','JV','JJV','J','JJZ','JZ','ZJZ','Z','ZSZ','SZ','SSZ'];
  function dirLabel(deg) { return DIR_LABELS[Math.round(deg / 22.5) % 16] ?? '—'; }
  function waveColor(h) {
    if (h < 0.1) return '#38bdf8';
    if (h < 0.3) return '#34d399';
    if (h < 0.6) return '#a3e635';
    if (h < 1.0) return '#fbbf24';
    if (h < 2.0) return '#f97316';
    return '#f43f5e';
  }

  // Grupiranje po dnevu
  let lastDate = null;
  const rows = points.map(p => {
    const dateStr = p.time.toLocaleDateString('sl-SI', { weekday: 'short', day: 'numeric', month: 'numeric' });
    const timeStr = p.time.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
    const isNewDay = dateStr !== lastDate;
    if (isNewDay) lastDate = dateStr;
    const h = p.height ?? 0;
    const color = waveColor(h);
    const arrowStyle = p.dir != null ? `transform:rotate(${p.dir}deg);display:inline-block` : 'display:none';
    return `${isNewDay ? `<div class="waves-day-sep">${dateStr}</div>` : ''}
    <div class="waves-row">
      <span class="waves-row__time">${timeStr}</span>
      <span class="waves-row__h" style="color:${color}">${h.toFixed(2)} m</span>
      <span class="waves-row__dir"><span style="${arrowStyle}">↑</span> ${p.dir != null ? dirLabel(p.dir) : '—'}</span>
      <span class="waves-row__per">${p.period != null ? p.period.toFixed(1) + ' s' : '—'}</span>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="waves-list">${rows}</div>`;
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



/** —— Strele (Blitzortung) —— */
let lightningTracker = null;

function updateLightningUI() {
  if (!lightningTracker) return;
  const s = lightningTracker.stats();

  // Status dot
  const dot = document.getElementById('lightning-dot');
  if (dot) {
    dot.className = `lightning-dot ${s.connected ? 'lightning-dot--on' : 'lightning-dot--off'}`;
    dot.title = s.connected ? 'Povezan' : 'Vzpostavljam povezavo…';
  }

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ls-5m',  s.total5);
  set('ls-15m', s.total15);
  set('ls-1h',  s.total60);

  const nearEl = document.getElementById('ls-nearest');
  const nearWrap = document.getElementById('ls-nearest-wrap');
  if (s.nearest && nearEl) {
    nearEl.textContent = `${s.nearest.km} km`;
    const ageMin = Math.round((Date.now() - s.nearest.time) / 60_000);
    nearEl.title = `pred ${ageMin} min`;
    nearWrap?.classList.toggle('lightning-stat--danger', s.nearest.km < 20);
  } else if (nearEl) {
    nearEl.textContent = '—';
    nearWrap?.classList.remove('lightning-stat--danger');
  }

  // Osveži barve markerjev vsakič
  lightningTracker.refreshColors();
}

function initLightningMap() {
  const mapEl = document.getElementById('lightning-map');
  if (!mapEl || typeof L === 'undefined') return;

  const lMap = L.map('lightning-map', { zoomControl: true, attributionControl: false })
    .setView([46.0, 14.5], 6); // Slovenija v centru

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© CARTO',
    subdomains: 'abcd',
    maxZoom: 10,
  }).addTo(lMap);

  // Postaja
  L.circleMarker([STATION_LAT, STATION_LON], {
    radius: 5, fillColor: '#38bdf8', color: '#fff', weight: 2, fillOpacity: 1,
  }).bindTooltip('IKOPER43 · Rakitovec', { permanent: false }).addTo(lMap);

  // Krog 50 km od postaje
  L.circle([STATION_LAT, STATION_LON], {
    radius: 50_000,
    color: 'rgba(56,189,248,0.25)',
    fillColor: 'transparent',
    weight: 1,
    dashArray: '4,6',
  }).addTo(lMap);

  lightningTracker = new LightningTracker(lMap, updateLightningUI);
  lightningTracker.connect();

  // Osveži barve vsako minuto
  setInterval(() => lightningTracker?.refreshColors(), 60_000);
}

function renderWarnings(warnings) {
  const el = document.getElementById('warn-list');
  const card = document.getElementById('warn-card');
  if (!el) return;
  if (!warnings?.length) {
    el.innerHTML = '<p class="warn-none">✅ Ni opozoril za naslednjih 7 dni.</p>';
    return;
  }
  const LEVEL_COLOR = { yellow: '#fbbf24', orange: '#f97316', red: '#f43f5e' };
  el.innerHTML = warnings.map(w => `
    <div class="warn-row warn-row--${w.level}">
      <span class="warn-row__bar" style="background:${LEVEL_COLOR[w.level]}"></span>
      <span class="warn-row__icon">${w.icon}</span>
      <div class="warn-row__body">
        <span class="warn-row__title">${w.title}</span>
        <span class="warn-row__desc">${w.desc}</span>
      </div>
      <span class="warn-row__badge warn-row__badge--${w.level}">${w.level === 'yellow' ? 'Rumena' : w.level === 'orange' ? 'Oranžna' : 'Rdeča'}</span>
    </div>`).join('');
}

async function load() {
  setStatus('Nalagam napoved…');
  try {
    const [forecast, hourly, sea, aq, fire, warnings, waves] = await Promise.allSettled([
      fetchForecast(),
      fetchHourlyForecast(),
      fetchSeaTemp(),
      fetchAirQuality(),
      fetchFireDanger(),
      fetchWarnings(),
      fetchWindyWaves(),
    ]);

    if (forecast.status === 'fulfilled') renderForecast(forecast.value);
    else renderForecast(null);

    if (hourly.status === 'fulfilled') renderHourly(hourly.value);
    else renderHourly(null);

    if (sea.status === 'fulfilled') renderSeaTemp(sea.value);
    else renderSeaTemp(null);

    if (aq.status === 'fulfilled') renderAirQuality(aq.value);
    else renderAirQuality(null);

    if (fire.status === 'fulfilled') renderFireDanger(fire.value);
    else renderFireDanger(null);

    if (warnings.status === 'fulfilled') renderWarnings(warnings.value);
    else renderWarnings([]);

    if (waves.status === 'fulfilled') renderWaves(waves.value);
    else renderWaves(null);

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

/** —— Satelitska slika (EUMETSAT WMS) —— */
let satLayer = 'msg_fes:rgb_naturalenhncd';

function satelliteUrl(layer) {
  const bbox = '7,42,22,50'; // Slovenija + širša okolica
  return `https://view.eumetsat.int/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap`
    + `&LAYERS=${encodeURIComponent(layer)}&BBOX=${bbox}&WIDTH=700&HEIGHT=460`
    + `&SRS=EPSG:4326&FORMAT=image/jpeg&t=${Date.now()}`;
}

function refreshSatellite() {
  const img = document.getElementById('satellite-img');
  const info = document.getElementById('satellite-updated');
  if (!img) return;
  const newImg = new Image();
  newImg.onload = () => {
    img.src = newImg.src;
    if (info) info.textContent = `Posodobljeno: ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`;
  };
  newImg.src = satelliteUrl(satLayer);
}

function initSatellite() {
  document.querySelectorAll('.sat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sat-btn').forEach(b => b.classList.remove('sat-btn--active'));
      btn.classList.add('sat-btn--active');
      satLayer = btn.dataset.layer;
      refreshSatellite();
    });
  });
  refreshSatellite();
  setInterval(refreshSatellite, 15 * 60 * 1000);
}

async function init() {
  initPwaUpdates();
  $('#btn-reload')?.addEventListener('click', load);

  await load();
  setInterval(load, 30 * 60 * 1000);

  // Napoved za lokacijo
  initLocationForecast();

  // Leaflet + Strele
  initLightningMap();

  // Leaflet + RainViewer
  await initRadarMap();
  document.getElementById('radar-play')?.addEventListener('click', toggleRadarPlay);
  setInterval(loadRadarFrames, 10 * 60 * 1000);

  // ARSO GIF
  refreshArsoRadar();
  setInterval(refreshArsoRadar, 10 * 60 * 1000);

  // Satelit
  initSatellite();
}

init();

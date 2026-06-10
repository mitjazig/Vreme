import { fetchLocationForecast, reverseGeocode, wmoIcon, wmoLabel } from './forecast.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'lokacija_last';

const DAY_SL  = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];

function windDirLabel(deg) {
  if (deg == null) return '';
  const dirs = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function setStatus(msg, isErr = false) {
  const el = $('status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isErr);
}

/** Trenutne razmere */
function renderCurrent(c, locationName) {
  const el = $('loc-current');
  if (!el || !c) return;

  const windStr = c.wind != null
    ? `${windDirLabel(c.windDir)} ${c.wind.toFixed(0)} km/h${c.gust != null ? ` (sunki ${c.gust.toFixed(0)})` : ''}`
    : null;

  el.innerHTML = `
    <div class="loc-now">
      <div class="loc-now__left">
        <span class="loc-now__icon" title="${wmoLabel(c.code)}">${wmoIcon(c.code)}</span>
        <div>
          <div class="loc-now__temp">${c.temp != null ? Math.round(c.temp) + '°C' : '—'}</div>
          ${c.feel != null && Math.abs(c.feel - c.temp) >= 2
            ? `<div class="loc-now__feel">Občutek ${Math.round(c.feel)}°C</div>`
            : ''}
        </div>
      </div>
      <div class="loc-now__meta">
        <span class="loc-now__desc">${wmoLabel(c.code)}</span>
        ${windStr ? `<span class="loc-now__wind">💨 ${windStr}</span>` : ''}
        ${c.humidity != null ? `<span class="loc-now__hum">💧 ${Math.round(c.humidity)} %</span>` : ''}
        ${c.pressure != null ? `<span class="loc-now__pres">⊞ ${c.pressure.toFixed(0)} hPa</span>` : ''}
      </div>
    </div>`;
}

/** 7-dnevna napoved */
function renderDaily(days) {
  const el = $('loc-daily');
  if (!el) return;
  el.innerHTML = days.map((d, i) => {
    const label  = i === 0 ? 'Danes' : i === 1 ? 'Jutri' : DAY_SL[d.date.getDay()];
    const hasRain = (d.rain ?? 0) > 0.1;
    const hasSnow = (d.snow ?? 0) > 0.1;
    const uvStr  = d.uvMax != null ? `UV ${d.uvMax.toFixed(0)}` : '';
    return `<div class="forecast-day forecast-day--wide">
      <span class="forecast-day__lbl">${label}</span>
      <span class="forecast-day__icon" title="${wmoLabel(d.code)}">${wmoIcon(d.code)}</span>
      <span class="forecast-day__temps">
        <span class="forecast-day__max">${d.max != null ? Math.round(d.max) + '°' : '—'}</span>
        <span class="forecast-day__min">${d.min != null ? Math.round(d.min) + '°' : ''}</span>
      </span>
      <span class="forecast-day__rain ${!hasRain && !hasSnow ? 'forecast-day__rain--none' : ''}">
        ${hasSnow ? `❄️ ${d.snow.toFixed(0)} cm` : hasRain ? `🌧 ${d.rain.toFixed(1)} mm${d.rainProb ? `<br><small>${d.rainProb}%</small>` : ''}` : '·'}
      </span>
      ${d.gustMax != null ? `<span class="forecast-day__wind">💨 ${d.gustMax.toFixed(0)}</span>` : '<span></span>'}
      ${uvStr ? `<span class="forecast-day__uv">${uvStr}</span>` : '<span></span>'}
    </div>`;
  }).join('');
}

/** Urna napoved */
function renderHourly(hours) {
  const el = $('loc-hourly');
  if (!el) return;

  let lastDate = null;
  el.innerHTML = `<div class="hourly-scroll">${hours.map(h => {
    const timeStr = h.time.toLocaleTimeString('sl-SI', { timeZone: 'auto', hour: '2-digit', minute: '2-digit' });
    const dateStr = h.time.toLocaleDateString('sl-SI', { weekday: 'short', day: 'numeric' });
    const dateKey = h.time.toDateString();
    const isNewDay = dateKey !== lastDate;
    if (isNewDay) lastDate = dateKey;

    const hasSnow = (h.snowfall ?? 0) > 0;
    const hasPrecip = (h.precip ?? 0) > 0 || hasSnow;

    return `${isNewDay ? `<div class="hourly-day-sep">${dateStr}</div>` : ''}
    <div class="hourly-item hourly-item--wide">
      <span class="hourly-item__time">${timeStr}</span>
      <span class="hourly-item__icon">${wmoIcon(h.code)}</span>
      <span class="hourly-item__temp">${h.temp != null ? Math.round(h.temp) + '°' : '—'}</span>
      ${h.feel != null && Math.abs(h.feel - h.temp) >= 2
        ? `<span class="hourly-item__feel">(${Math.round(h.feel)}°)</span>`
        : '<span></span>'}
      ${hasPrecip
        ? `<span class="hourly-item__rain">${hasSnow ? '❄️' : ''}${h.precip > 0 ? h.precip.toFixed(1) : ''}<span class="hourly-item__unit">mm</span></span>`
        : `<span class="hourly-item__rain hourly-item__rain--none">·</span>`}
      ${h.precipProb != null ? `<span class="hourly-item__prob">${h.precipProb}%</span>` : '<span></span>'}
      ${h.wind != null ? `<span class="hourly-item__wind">💨${h.wind.toFixed(0)}</span>` : '<span></span>'}
    </div>`;
  }).join('')}</div>`;
}

function showForecast() {
  $('loc-empty').classList.add('hidden');
  $('loc-forecast').classList.remove('hidden');
  $('btn-refresh-loc').classList.remove('hidden');
}

function showEmpty() {
  $('loc-empty').classList.remove('hidden');
  $('loc-forecast').classList.add('hidden');
  $('btn-refresh-loc').classList.add('hidden');
}

async function loadForecast(lat, lon, nameHint = null) {
  setStatus('Nalagam napoved…');
  try {
    const [data, geoName] = await Promise.all([
      fetchLocationForecast(lat, lon),
      nameHint ? Promise.resolve(nameHint) : reverseGeocode(lat, lon),
    ]);

    const name = geoName ?? `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
    $('loc-station').textContent = name;
    $('loc-title').textContent = 'Napoved';
    document.title = `${name} – Vreme`;

    renderCurrent(data.current, name);
    renderDaily(data.daily);
    renderHourly(data.hourly);
    showForecast();

    setStatus(`Posodobljeno ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`);

    // Shrani lokacijo za naslednji obisk
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lon, name }));
  } catch (err) {
    setStatus(`Napaka: ${err.message}`, true);
  }
}

async function geolocate() {
  if (!navigator.geolocation) {
    setStatus('Geolokacija ni podprta v tem brskalniku.', true);
    return;
  }
  setStatus('Pridobivam lokacijo…');
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12_000, enableHighAccuracy: false })
    );
    await loadForecast(pos.coords.latitude, pos.coords.longitude);
  } catch (err) {
    const msg = err.code === 1 ? 'Dostop do lokacije je zavrnjen.'
              : err.code === 2 ? 'Lokacija ni na voljo.'
              : err.code === 3 ? 'Prekoračen čas za pridobitev lokacije.'
              : `Napaka: ${err.message}`;
    setStatus(msg, true);
  }
}

function init() {
  // Gumb za geolokacijo
  $('btn-geolocate')?.addEventListener('click', geolocate);

  // Gumb za spremembo lokacije
  $('btn-change-loc')?.addEventListener('click', showEmpty);

  // Gumb za osvežitev
  $('btn-refresh-loc')?.addEventListener('click', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const { lat, lon, name } = JSON.parse(saved);
      loadForecast(lat, lon, name);
    }
  });

  // Prednastavljena mesta
  document.querySelectorAll('.loc-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat  = parseFloat(btn.dataset.lat);
      const lon  = parseFloat(btn.dataset.lon);
      const name = btn.dataset.name;
      loadForecast(lat, lon, name);
    });
  });

  // Poizkusi naložiti zadnjo shranjeno lokacijo
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const { lat, lon, name } = JSON.parse(saved);
      loadForecast(lat, lon, name);
    } catch { /* pokvarjen localStorage */ }
  }
}

init();

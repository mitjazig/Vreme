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
    const label   = i === 0 ? 'Danes' : i === 1 ? 'Jutri' : DAY_SL[d.date.getDay()] + ' ' + d.date.getDate() + '.';
    const hasRain = (d.rain ?? 0) > 0.1;
    const hasSnow = (d.snow ?? 0) > 0.1;
    const precip  = hasSnow ? `❄️ ${d.snow.toFixed(0)} cm`
                  : hasRain ? `🌧 ${d.rain.toFixed(1)} mm${d.rainProb ? ` · ${d.rainProb}%` : ''}`
                  : '';
    const wind    = d.gustMax != null ? `💨 ${Math.round(d.gustMax)} km/h` : '';
    const uv      = d.uvMax != null   ? `UV ${Math.round(d.uvMax)}` : '';

    return `<div class="loc-day-row">
      <span class="loc-day-row__lbl">${label}</span>
      <span class="loc-day-row__icon" title="${wmoLabel(d.code)}">${wmoIcon(d.code)}</span>
      <span class="loc-day-row__temps">
        <b>${d.max != null ? Math.round(d.max) + '°' : '—'}</b>
        <span class="loc-day-row__min">${d.min != null ? Math.round(d.min) + '°' : ''}</span>
      </span>
      <span class="loc-day-row__extra">
        ${precip ? `<span class="loc-day-row__tag loc-day-row__tag--precip">${precip}</span>` : ''}
        ${wind   ? `<span class="loc-day-row__tag loc-day-row__tag--wind">${wind}</span>` : ''}
        ${uv     ? `<span class="loc-day-row__tag loc-day-row__tag--uv">${uv}</span>` : ''}
      </span>
    </div>`;
  }).join('');
}

/** Snežna napoved */
function renderSnow(daily, hourly) {
  const el = document.getElementById('loc-snow');
  if (!el) return;

  const hasAnySnow = daily.some(d => (d.snow ?? 0) > 0.1);

  const nowH = hourly[0];
  const snowDepthCm = nowH?.snowDepth != null ? Math.round(nowH.snowDepth * 100) : null;
  const freezeLevel = nowH?.freezeLevel != null ? Math.round(nowH.freezeLevel) : null;

  const next24 = hourly.slice(0, 24).filter(h => h.freezeLevel != null);
  const freezeMin = next24.length ? Math.round(Math.min(...next24.map(h => h.freezeLevel))) : null;
  const freezeMax = next24.length ? Math.round(Math.max(...next24.map(h => h.freezeLevel))) : null;

  const pills = [];
  if (snowDepthCm != null && snowDepthCm > 0)
    pills.push(`<span class="snow-pill snow-pill--depth">❄️ ${snowDepthCm} cm na tleh</span>`);
  if (freezeLevel != null) {
    const rangeStr = (freezeMin != null && freezeMax != null && freezeMin !== freezeMax)
      ? ` (${freezeMin.toLocaleString()}–${freezeMax.toLocaleString()} m / 24h)`
      : '';
    pills.push(`<span class="snow-pill snow-pill--freeze">🌡️ Meja: ${freezeLevel.toLocaleString()} m${rangeStr}</span>`);
  }

  el.innerHTML = `
    ${pills.length ? `<div class="snow-pills">${pills.join('')}</div>` : ''}
    ${hasAnySnow ? `
    <div class="snow-days">
      ${daily.filter(d => (d.snow ?? 0) > 0.1).map(d => {
        const lbl = d.date.toDateString() === new Date().toDateString()
          ? 'Danes' : DAY_SL[d.date.getDay()] + ' ' + d.date.getDate() + '.';
        const barW = Math.min(100, (d.snow / 30) * 100);
        return `<div class="snow-day">
          <span class="snow-day__lbl">${lbl}</span>
          <div class="snow-day__bar-wrap"><div class="snow-day__bar" style="width:${barW.toFixed(0)}%"></div></div>
          <span class="snow-day__val">❄️ ${d.snow.toFixed(1)} cm</span>
        </div>`;
      }).join('')}
    </div>` : `<p class="snow-none">Ni pričakovanega snega v 7 dneh.</p>`}
    <p class="tide-note">Meja sneženja = nadmorska višina 0°C · ICON-D2</p>`;
}

/** Urna napoved */
function renderHourly(hours) {
  const el = $('loc-hourly');
  if (!el) return;

  let lastDate = null;
  el.innerHTML = `<div class="hourly-scroll">${hours.map(h => {
    const timeStr = h.time.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
    const dateStr = h.time.toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'short' });
    const dateKey = h.time.toDateString();
    const isNewDay = dateKey !== lastDate;
    if (isNewDay) lastDate = dateKey;

    const hasSnow  = (h.snowfall ?? 0) > 0.05;
    const hasPrecip = (h.precip ?? 0) > 0.05 || hasSnow;
    const feelDiff = h.feel != null && h.temp != null && Math.abs(h.feel - h.temp) >= 2;

    const tempStr = h.temp != null
      ? `${Math.round(h.temp)}°${feelDiff ? `<span class="hourly-feel"> (${Math.round(h.feel)}°)</span>` : ''}`
      : '—';

    const precipStr = hasPrecip
      ? `${hasSnow ? '❄️' : '🌧'} ${h.precip > 0 ? h.precip.toFixed(1) + ' mm' : ''}${h.precipProb ? ` ${h.precipProb}%` : ''}`
      : '';

    const windStr = h.wind != null ? `💨 ${Math.round(h.wind)}` : '';

    return `${isNewDay ? `<div class="hourly-day-sep">${dateStr}</div>` : ''}
    <div class="loc-hour-row">
      <span class="loc-hour-row__time">${timeStr}</span>
      <span class="loc-hour-row__icon">${wmoIcon(h.code)}</span>
      <span class="loc-hour-row__temp">${tempStr}</span>
      <span class="loc-hour-row__right">
        ${precipStr ? `<span class="loc-hour-row__precip">${precipStr}</span>` : ''}
        ${windStr   ? `<span class="loc-hour-row__wind">${windStr}</span>` : ''}
      </span>
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
    renderSnow(data.daily, data.hourly);
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

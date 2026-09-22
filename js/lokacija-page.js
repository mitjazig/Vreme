import { fetchLocationForecast, reverseGeocode, wmoIcon, wmoLabel } from './forecast.js';
import { initContrast } from './contrast.js';
import { initPwaUpdates } from './pwa-update.js';

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
  const el    = $('loc-current');
  const title = $('loc-now-title');
  const desc  = $('loc-now-desc');
  if (!el || !c) return;

  if (title) title.textContent = c.temp != null ? `${Math.round(c.temp)}°C` : 'Trenutno';
  if (desc)  desc.textContent  = wmoLabel(c.code) ?? '—';

  const windStr = c.wind != null
    ? `${windDirLabel(c.windDir)} ${Math.round(c.wind)} km/h${c.gust != null ? ` · sunki ${Math.round(c.gust)}` : ''}`
    : null;

  const rows = [
    c.feel != null && Math.abs(c.feel - c.temp) >= 2
      ? `<span>🌡️ Občutek ${Math.round(c.feel)}°C</span>` : null,
    windStr ? `<span>💨 ${windStr}</span>` : null,
    c.humidity != null ? `<span>💧 ${Math.round(c.humidity)} %</span>` : null,
    c.pressure != null ? `<span>⊞ ${c.pressure.toFixed(0)} hPa</span>` : null,
  ].filter(Boolean);

  el.innerHTML = rows.length
    ? `<div class="loc-now-pills">${rows.join('')}</div>`
    : '';
}

/** BBQ indeks */
function calcBbq(c, today) {
  if (!c) return null;
  const temp  = c.temp  ?? 20;
  const wind  = c.wind  ?? 0;
  const humid = c.humidity ?? 50;
  const rainProb = today?.rainProb ?? 0;
  const uv    = today?.uvMax ?? 3;

  // Temperatura (0–3 točke): idealno 22–28°C
  let tPts = 0;
  if (temp >= 22 && temp <= 28) tPts = 3;
  else if (temp >= 18 && temp <= 32) tPts = 2;
  else if (temp >= 12 && temp <= 36) tPts = 1;

  // Dež (0–3 točke)
  let rPts = 0;
  if (rainProb <= 10) rPts = 3;
  else if (rainProb <= 25) rPts = 2.5;
  else if (rainProb <= 40) rPts = 1.5;
  else if (rainProb <= 60) rPts = 0.5;

  // Veter (0–2 točke): idealno < 15 km/h
  let wPts = 0;
  if (wind < 10) wPts = 2;
  else if (wind < 20) wPts = 1.5;
  else if (wind < 30) wPts = 1;
  else if (wind < 45) wPts = 0.5;

  // Vlaga (0–1 točka): idealno 40–65%
  const hPts = (humid >= 35 && humid <= 70) ? 1 : 0.5;

  // UV (0–1 točka): UV 3–6 je idealno, >8 je preveč
  const uvPts = (uv >= 2 && uv <= 7) ? 1 : 0.5;

  const raw = tPts + rPts + wPts + hPts + uvPts;
  const maxRaw = 3 + 3 + 2 + 1 + 1;
  return Math.round((raw / maxRaw) * 10 * 2) / 2; // 0–10, korak 0.5
}

const BBQ_LEVELS = [
  { min: 8.5, emoji: '🔥', label: 'Idealno za žar!',    color: '#22c55e' },
  { min: 7,   emoji: '😎', label: 'Odlično',             color: '#86efac' },
  { min: 5.5, emoji: '🙂', label: 'Solidno',             color: '#fde047' },
  { min: 4,   emoji: '😐', label: 'Gre, ampak…',         color: '#fb923c' },
  { min: 2,   emoji: '😬', label: 'Rajši v kuhinjo',     color: '#f87171' },
  { min: 0,   emoji: '🌧️', label: 'Absolutno ne',        color: '#94a3b8' },
];

function renderBbq(c, today) {
  const el = document.getElementById('loc-bbq');
  if (!el) return;

  const score = calcBbq(c, today);
  if (score == null) {
    el.innerHTML = '<p class="forecast-loading">Ni podatkov.</p>';
    return;
  }

  const level = BBQ_LEVELS.find(l => score >= l.min) ?? BBQ_LEVELS.at(-1);
  const pct   = (score / 10) * 100;

  const warnings = [];
  if ((today?.rainProb ?? 0) > 40) warnings.push('🌧 Možne padavine');
  if ((c?.wind ?? 0) > 30)         warnings.push('💨 Močan veter');
  if ((c?.temp ?? 20) > 34)        warnings.push('🌡️ Zelo vroče');
  if ((c?.temp ?? 20) < 12)        warnings.push('🥶 Prehladno');
  if ((today?.uvMax ?? 0) > 8)     warnings.push('☀️ Visok UV — zaščita obvezna');

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

/** 16-dnevna napoved */
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

/** Aktivnosti */
function renderActivities(current, today) {
  const el = document.getElementById('loc-activities');
  if (!el || !current) return;

  const temp  = current.temp  ?? 20;
  const gust  = current.gust  ?? 0;
  const code  = current.code  ?? 0;
  const rain  = today?.rain   ?? 0;
  const uvMax = today?.uvMax  ?? 0;
  const wind  = current.wind  ?? 0;

  const isStorm = code >= 95;
  const isRain  = code >= 51 || rain > 5;
  const isHot   = temp > 34;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  const items = [
    {
      icon: '🏖️', label: 'Plaža',
      score: clamp(
        (temp >= 28 ? 9 : temp >= 24 ? 7 : temp >= 20 ? 4 : 1)
        - (gust > 40 ? 3 : gust > 25 ? 1 : 0)
        - (isRain ? 6 : 0) - (isStorm ? 8 : 0), 0, 10),
    },
    {
      icon: '🚴', label: 'Kolesarjenje',
      score: clamp(
        (temp >= 14 && temp <= 30 ? 8 : temp >= 10 ? 5 : 2)
        - (gust > 50 ? 4 : gust > 30 ? 2 : 0)
        - (isRain ? 4 : 0) - (isStorm ? 7 : 0), 0, 10),
    },
    {
      icon: '🥾', label: 'Pohodništvo',
      score: clamp(
        (temp >= 8 && temp <= 30 ? 8 : temp >= 5 ? 5 : 2)
        + (code <= 1 ? 2 : 0)
        - (gust > 60 ? 3 : 0)
        - (isRain ? 3 : 0) - (isStorm ? 6 : 0), 0, 10),
    },
    {
      icon: '⛵', label: 'Jadranje',
      score: clamp(
        (wind >= 10 && wind <= 35 ? 9 : wind >= 5 ? 5 : wind > 35 ? 3 : 2)
        - (isStorm ? 8 : 0) - (code >= 61 ? 2 : 0), 0, 10),
    },
    {
      icon: '🌿', label: 'Piknik',
      score: clamp(
        (temp >= 18 && temp <= 32 ? 8 : temp >= 15 ? 5 : 2)
        + (code <= 1 ? 2 : 0)
        - (gust > 35 ? 2 : 0)
        - (isRain ? 5 : 0) - (isStorm ? 8 : 0), 0, 10),
    },
    {
      icon: '🏊', label: 'Plavanje',
      score: clamp(
        (temp >= 27 ? 9 : temp >= 23 ? 6 : temp >= 18 ? 3 : 0)
        - (isStorm ? 8 : 0) - (isRain ? 2 : 0), 0, 10),
    },
  ];

  el.innerHTML = items.map(a => {
    const pct = a.score * 10;
    const color = a.score >= 8 ? '#34d399' : a.score >= 6 ? '#a3e635' : a.score >= 4 ? '#fbbf24' : '#f87171';
    const label = a.score >= 8 ? 'Odlično' : a.score >= 6 ? 'Dobro' : a.score >= 4 ? 'Zmerno' : 'Slabo';
    return `<div class="act-row">
      <span class="act-row__icon">${a.icon}</span>
      <div class="act-row__body">
        <div class="act-row__top">
          <span class="act-row__name">${a.label}</span>
          <span class="act-row__score" style="color:${color}">${label}</span>
        </div>
        <div class="act-bar"><div class="act-bar__fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
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

  // Temperaturni profil po višinah (dnevno povprečje za naslednjih 5 dni)
  const profileDays = new Map();
  for (const h of hourly.slice(0, 120)) {
    const key = h.time.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' });
    const d = profileDays.get(key) ?? { time: h.time, freeze: [], t850: [], t700: [] };
    if (h.freezeLevel != null) d.freeze.push(h.freezeLevel);
    if (h.t850 != null) d.t850.push(h.t850);
    if (h.t700 != null) d.t700.push(h.t700);
    profileDays.set(key, d);
  }
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const profile = [...profileDays.values()].slice(0, 5).map(d => ({
    time: d.time,
    freeze: avg(d.freeze),
    t850:   avg(d.t850),   // ~1500 m
    t700:   avg(d.t700),   // ~3000 m
  }));

  const todayStr = new Date().toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' });

  el.innerHTML = `
    ${pills.length ? `<div class="snow-pills">${pills.join('')}</div>` : ''}

    ${profile.some(d => d.freeze != null) ? `
    <div class="freeze-profile">
      <p class="freeze-profile__title">Sneška meja · naslednjih 5 dni</p>
      <div class="freeze-profile__rows">
        ${profile.map(d => {
          const key = d.time.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' });
          const lbl = key === todayStr ? 'Danes' : DAY_SL[d.time.getDay()] + ' ' + d.time.getDate() + '.';
          const fm  = d.freeze != null ? Math.round(d.freeze) : null;
          const MAX_ALT = 4000;
          const pct = fm != null ? Math.min(100, Math.max(0, (fm / MAX_ALT) * 100)) : 0;
          const t850str = d.t850 != null ? `${d.t850 > 0 ? '+' : ''}${d.t850.toFixed(0)}°` : '—';
          const t700str = d.t700 != null ? `${d.t700 > 0 ? '+' : ''}${d.t700.toFixed(0)}°` : '—';
          const color = fm == null ? '#94a3b8' : fm < 500 ? '#f87171' : fm < 1500 ? '#fb923c' : fm < 2500 ? '#facc15' : '#7dd3fc';
          return `<div class="fp-row">
            <span class="fp-row__lbl">${lbl}</span>
            <div class="fp-row__bar-wrap">
              <div class="fp-row__bar" style="width:${pct.toFixed(0)}%;background:${color}"></div>
            </div>
            <span class="fp-row__val" style="color:${color}">${fm != null ? fm.toLocaleString() + ' m' : '—'}</span>
            <span class="fp-row__temps">1500m ${t850str} · 3000m ${t700str}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

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
    </div>` : `<p class="snow-none">Ni pričakovanega snega v 16 dneh.</p>`}
    <p class="tide-note">Sneška meja = višina 0°C izoterme · 850 hPa ≈ 1500 m · 700 hPa ≈ 3000 m</p>`;
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


/** Iskanje kraja prek Open-Meteo geocoding */
async function searchPlace(query) {
  if (!query.trim()) return;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=sl&format=json`;
  const res  = await fetch(url);
  const json = await res.json();
  return json.results ?? [];
}

function renderSearchResults(results) {
  const el = $('loc-search-results');
  if (!el) return;

  if (!results.length) {
    el.innerHTML = '<li class="loc-search-result loc-search-result--empty">Ni rezultatov</li>';
    el.classList.remove('hidden');
    return;
  }

  el.innerHTML = results.map((r, i) => {
    const parts = [r.admin1, r.country].filter(Boolean).join(', ');
    return `<li class="loc-search-result" role="option" tabindex="0"
      data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name}${parts ? `, ${parts}` : ''}" data-i="${i}">
      <span class="loc-search-result__name">${r.name}</span>
      ${parts ? `<span class="loc-search-result__sub">${parts}</span>` : ''}
    </li>`;
  }).join('');
  el.classList.remove('hidden');

  el.querySelectorAll('.loc-search-result[data-lat]').forEach(li => {
    li.addEventListener('click', () => {
      loadForecast(parseFloat(li.dataset.lat), parseFloat(li.dataset.lon), li.dataset.name);
      el.classList.add('hidden');
      $('loc-search-input').value = '';
    });
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') li.click();
    });
  });
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
    renderActivities(data.current, data.daily[0]);
    renderBbq(data.current, data.daily[0]);
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
  initPwaUpdates();
  initContrast();

  // Gumb za geolokacijo (v loc-empty in topbar)
  $('btn-geolocate')?.addEventListener('click', geolocate);
  $('btn-geolocate-top')?.addEventListener('click', geolocate);

  // Gumb za osvežitev
  $('btn-refresh-loc')?.addEventListener('click', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const { lat, lon, name } = JSON.parse(saved);
      loadForecast(lat, lon, name);
    }
  });

  // Iskanje kraja
  const searchInput = $('loc-search-input');
  const searchBtn   = $('btn-loc-search');
  const resultsEl   = $('loc-search-results');

  async function doSearch() {
    const q = searchInput?.value ?? '';
    if (!q.trim()) return;
    searchBtn.disabled = true;
    searchBtn.textContent = '…';
    setStatus('Iščem…');
    try {
      const results = await searchPlace(q);
      setStatus('');
      renderSearchResults(results);
    } catch (err) {
      setStatus(`Napaka iskanja: ${err.message}`, true);
      renderSearchResults([]);
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Išči';
    }
  }

  searchBtn?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // Zapri rezultate ob kliku zunaj
  document.addEventListener('click', e => {
    if (!e.target.closest('.loc-search-wrap')) resultsEl?.classList.add('hidden');
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

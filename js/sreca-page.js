import { fetchLocationForecast, reverseGeocode, wmoIcon, wmoLabel } from './forecast.js';

const $ = (id) => document.getElementById(id);
const DAY_SL = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];

// Naključne eksotične regije (lat_min, lat_max, lon_min, lon_max, label, emoji, opis)
const RANDOM_REGIONS = [
  { lat: [-60, -75], lon: [-180, 180], name: 'Antarktika', emoji: '🧊', desc: 'Hladnejše od hladilnika. Verjetno.' },
  { lat: [-5,  5],   lon: [-75, -50],  name: 'Amazonija', emoji: '🌿', desc: 'Kjer dežuje 200 dni na leto in to je normalno.' },
  { lat: [60,  72],  lon: [100, 140],  name: 'Sibirija',  emoji: '🌨️', desc: 'Kjer -50°C velja za "sprejemljivo".' },
  { lat: [20,  30],  lon: [45,  60],   name: 'Arabska puščava', emoji: '🏜️', desc: 'Pesek, sonce, še več sonca.' },
  { lat: [-10, 10],  lon: [100, 120],  name: 'Borneo',    emoji: '🦧', desc: 'Džungla, vlaga in orangutani.' },
  { lat: [60,  66],  lon: [-25, -14],  name: 'Islandija',  emoji: '🌋', desc: 'Kjer sonce ob polnoči ni anomalija.' },
  { lat: [-35, -25], lon: [25,  35],   name: 'Južna Afrika', emoji: '🦁', desc: 'Na drugi strani ekvatorja je čisto drugač.' },
  { lat: [18,  22],  lon: [-158,-156], name: 'Havaji',    emoji: '🌺', desc: 'Tropski raj, ki je vedno vroč in vlažen.' },
  { lat: [-56, -52], lon: [-70, -64],  name: 'Ognjena zemlja', emoji: '🚢', desc: 'Konec sveta. Dobesedno.' },
  { lat: [70,  80],  lon: [15,  30],   name: 'Svalbard',  emoji: '🐻‍❄️', desc: 'Polarni medvedi in arktična noč.' },
  { lat: [-25, -15], lon: [120, 140],  name: 'Avstralija (Outback)', emoji: '🦘', desc: 'Puščava, kengurusi in 45°C.' },
  { lat: [25,  35],  lon: [75,  90],   name: 'Himalaja',  emoji: '🏔️', desc: 'Streha sveta. Kisik neobvezen.' },
];

function randomLocation() {
  const region = RANDOM_REGIONS[Math.floor(Math.random() * RANDOM_REGIONS.length)];
  const lat = region.lat[0] + Math.random() * (region.lat[1] - region.lat[0]);
  const lon = region.lon[0] + Math.random() * (region.lon[1] - region.lon[0]);
  return { lat: +lat.toFixed(4), lon: +lon.toFixed(4), region };
}

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

function renderCurrent(c) {
  const el    = $('sreca-current');
  const title = $('sreca-now-title');
  const desc  = $('sreca-now-desc');
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

function renderDaily(days) {
  const el = $('sreca-daily');
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

function renderHourly(hours) {
  const el = $('sreca-hourly');
  if (!el) return;

  let lastDate = null;
  el.innerHTML = `<div class="hourly-scroll">${hours.slice(0, 48).map(h => {
    const timeStr = h.time.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
    const dateStr = h.time.toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'short' });
    const dateKey = h.time.toDateString();
    const isNewDay = dateKey !== lastDate;
    if (isNewDay) lastDate = dateKey;

    const hasSnow   = (h.snowfall ?? 0) > 0.05;
    const hasPrecip = (h.precip ?? 0) > 0.05 || hasSnow;
    const feelDiff  = h.feel != null && h.temp != null && Math.abs(h.feel - h.temp) >= 2;
    const tempStr   = h.temp != null
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

function renderFunDesc(name, region) {
  const el = $('sreca-fun-desc');
  if (!el) return;
  el.innerHTML = `
    <div class="sreca-fun-card">
      <span class="sreca-fun-card__emoji">${region?.emoji ?? '🌍'}</span>
      <div>
        <strong>${name}</strong>
        <p>${region?.desc ?? 'Zanimivo kraj z zanimivim vremenom.'}</p>
      </div>
    </div>`;
}

function showForecast() {
  $('sreca-intro').classList.add('hidden');
  $('sreca-forecast').classList.remove('hidden');
  $('btn-refresh-sreca').classList.remove('hidden');
}

function showIntro() {
  $('sreca-intro').classList.remove('hidden');
  $('sreca-forecast').classList.add('hidden');
  $('btn-refresh-sreca').classList.add('hidden');
}

let _lastLat, _lastLon, _lastRegion;

async function loadForecast(lat, lon, nameHint, region = null) {
  _lastLat = lat; _lastLon = lon; _lastRegion = region;
  setStatus('Nalagam napoved…');
  try {
    const [data, geoName] = await Promise.all([
      fetchLocationForecast(lat, lon),
      nameHint ? Promise.resolve(nameHint) : reverseGeocode(lat, lon),
    ]);

    const name = geoName ?? `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    $('sreca-region').textContent = region?.name ?? name;
    $('sreca-title').textContent  = name;
    $('sreca-model-desc').textContent = 'ICON-seamless · 7 dni';
    document.title = `${name} – Vreme`;

    renderFunDesc(name, region);
    renderCurrent(data.current);
    renderDaily(data.daily);
    renderHourly(data.hourly);
    showForecast();

    setStatus(`Posodobljeno ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setStatus(`Napaka: ${err.message}`, true);
  }
}

function throwDice() {
  const { lat, lon, region } = randomLocation();
  loadForecast(lat, lon, null, region);
}

function init() {
  $('btn-sreca')?.addEventListener('click', throwDice);
  $('btn-sreca-again')?.addEventListener('click', throwDice);
  $('btn-sreca-change')?.addEventListener('click', showIntro);
  $('btn-refresh-sreca')?.addEventListener('click', () => {
    if (_lastLat != null) loadForecast(_lastLat, _lastLon, null, _lastRegion);
  });

  document.querySelectorAll('.loc-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat    = parseFloat(btn.dataset.lat);
      const lon    = parseFloat(btn.dataset.lon);
      const name   = btn.dataset.name;
      loadForecast(lat, lon, name, null);
    });
  });
}

init();

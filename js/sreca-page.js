import { fetchMultiLocation, wmoIcon } from './forecast.js';
import { initPwaUpdates } from './pwa-update.js';

const GROUPS = {
  slo: [
    { name: 'Ljubljana',    emoji: '🏛️', lat: 46.0569, lon: 14.5058 },
    { name: 'Maribor',     emoji: '🍇', lat: 46.5547, lon: 15.6459 },
    { name: 'Bled',        emoji: '🏔️', lat: 46.3639, lon: 14.1094 },
    { name: 'Portorož',    emoji: '🏖️', lat: 45.5133, lon: 13.5928 },
    { name: 'Kranjska Gora', emoji: '⛷️', lat: 46.5108, lon: 13.8454 },
    { name: 'Celje',       emoji: '🏰', lat: 46.2310, lon: 15.2677 },
    { name: 'Novo Mesto',  emoji: '🌿', lat: 45.8044, lon: 15.1700 },
    { name: 'Triglav',     emoji: '⛰️', lat: 46.3786, lon: 13.8364 },
  ],
  hrv: [
    { name: 'Zagreb',      emoji: '🇭🇷', lat: 45.8150, lon: 15.9819 },
    { name: 'Split',       emoji: '☀️',  lat: 43.5081, lon: 16.4402 },
    { name: 'Dubrovnik',   emoji: '🌊',  lat: 42.6507, lon: 18.0944 },
    { name: 'Rovinj',      emoji: '⚓',  lat: 45.0811, lon: 13.6387 },
    { name: 'Zadar',       emoji: '🏛️',  lat: 44.1194, lon: 15.2422 },
    { name: 'Pula',        emoji: '🏟️',  lat: 44.8683, lon: 13.8481 },
    { name: 'Hvar',        emoji: '🌺',  lat: 43.1729, lon: 16.4412 },
    { name: 'Makarska',    emoji: '🏖️',  lat: 43.2969, lon: 17.0175 },
  ],
  eu: [
    { name: 'Dunaj',       emoji: '🇦🇹', lat: 48.2082, lon: 16.3738 },
    { name: 'Rim',         emoji: '🇮🇹', lat: 41.9028, lon: 12.4964 },
    { name: 'Benetke',     emoji: '🚣', lat: 45.4408, lon: 12.3155 },
    { name: 'Barcelona',   emoji: '🇪🇸', lat: 41.3851, lon: 2.1734  },
    { name: 'Pariz',       emoji: '🇫🇷', lat: 48.8566, lon: 2.3522  },
    { name: 'London',      emoji: '🇬🇧', lat: 51.5074, lon: -0.1278 },
    { name: 'Amsterdam',   emoji: '🇳🇱', lat: 52.3676, lon: 4.9041  },
    { name: 'Atene',       emoji: '🏺',  lat: 37.9838, lon: 23.7275 },
    { name: 'Rimini',      emoji: '🏄',  lat: 44.0594, lon: 12.5683 },
    { name: 'München',     emoji: '🍺',  lat: 48.1351, lon: 11.5820 },
  ],
};

function setStatus(msg, isErr = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isErr);
}

function tempColor(t) {
  if (t == null) return 'var(--muted)';
  if (t >= 35) return '#ef4444';
  if (t >= 30) return '#f97316';
  if (t >= 25) return '#fbbf24';
  if (t >= 20) return '#a3e635';
  if (t >= 15) return '#34d399';
  if (t >= 10) return '#38bdf8';
  return '#818cf8';
}

function renderGrid(elId, locations) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = locations.map(loc => {
    const temp = loc.temp != null ? `${Math.round(loc.temp)}°` : '—';
    const maxT = loc.maxToday != null ? `↑${Math.round(loc.maxToday)}°` : '';
    const minT = loc.minToday != null ? `↓${Math.round(loc.minToday)}°` : '';
    const icon = wmoIcon(loc.code);
    const color = tempColor(loc.temp);
    const rain = loc.rain > 0.5 ? `<span class="kraj-rain">🌧 ${loc.rain.toFixed(0)} mm</span>` : '';
    return `<div class="kraj-tile">
      <div class="kraj-tile__top">
        <span class="kraj-tile__emoji">${loc.emoji}</span>
        <span class="kraj-tile__name">${loc.name}</span>
        <span class="kraj-tile__icon">${icon}</span>
      </div>
      <div class="kraj-tile__temp" style="color:${color}">${temp}</div>
      <div class="kraj-tile__range">${maxT} ${minT} ${rain}</div>
    </div>`;
  }).join('');
}

async function load() {
  setStatus('Nalagam…');
  try {
    const [slo, hrv, eu] = await Promise.all([
      fetchMultiLocation(GROUPS.slo),
      fetchMultiLocation(GROUPS.hrv),
      fetchMultiLocation(GROUPS.eu),
    ]);
    renderGrid('grid-slo', slo);
    renderGrid('grid-hrv', hrv);
    renderGrid('grid-eu', eu);
    setStatus(`Posodobljeno ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setStatus(`Napaka: ${err.message}`, true);
  }
}

function init() {
  initPwaUpdates();
  document.getElementById('btn-reload')?.addEventListener('click', load);
  load();
  setInterval(load, 30 * 60 * 1000);
}

init();

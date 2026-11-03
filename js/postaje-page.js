import { fetchAllArsoStations, arsoIcon } from './arso-stations.js';
import { initPwaUpdates } from './pwa-update.js';
import { initContrast } from './contrast.js';
import { getStationStatus } from './station-status.js';
import './site-nav.js';

const $ = (id) => document.getElementById(id);

let allStations = [];
let currentSort = 'name';
let filterQuery = '';

function setStatus(msg, isErr = false) {
  const el = $('status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isErr);
}

function sortStations(stations, sort) {
  const s = [...stations];
  if (sort === 'name')      return s.sort((a, b) => a.name.localeCompare(b.name, 'sl'));
  if (sort === 'temp-desc') return s.sort((a, b) => (b.temp ?? -999) - (a.temp ?? -999));
  if (sort === 'temp-asc')  return s.sort((a, b) => (a.temp ?? 999)  - (b.temp ?? 999));
  if (sort === 'wind-desc') return s.sort((a, b) => (b.windKmh ?? 0) - (a.windKmh ?? 0));
  if (sort === 'rain-desc') return s.sort((a, b) => (b.rain ?? 0) - (a.rain ?? 0));
  return s;
}

function filterStations(stations, q) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return stations;
  return stations.filter((s) =>
    (s.name || '').toLowerCase().includes(needle)
    || (s.desc || '').toLowerCase().includes(needle)
  );
}

function tempColor(t) {
  if (t == null) return '';
  if (t >= 35) return '#ef4444';
  if (t >= 30) return '#f97316';
  if (t >= 25) return '#fbbf24';
  if (t >= 20) return '#a3e635';
  if (t >= 15) return '#34d399';
  if (t >= 10) return '#38bdf8';
  if (t >= 5)  return '#818cf8';
  if (t >= 0)  return '#a78bfa';
  return '#93c5fd';
}

function freshnessDot(updated) {
  if (!updated) return '';
  const st = getStationStatus(updated);
  const icon = st.level === 'fresh' ? '🟢' : st.level === 'stale' ? '🟡' : st.level === 'offline' ? '🔴' : '⚪';
  return `<span class="st-row__fresh" title="${st.detail}">${icon}</span>`;
}

function renderList(stations) {
  const el = $('stations-list');
  if (!el) return;

  if (!stations.length) {
    el.innerHTML = '<p class="stations-empty">Ni rezultatov za iskano lokacijo.</p>';
    return;
  }

  const temps = stations.map(s => s.temp).filter(t => t != null);
  const maxTemp = temps.length ? Math.max(...temps) : null;
  const minTemp = temps.length ? Math.min(...temps) : null;

  el.innerHTML = stations.map(s => {
    const color = tempColor(s.temp);
    const tempStr = s.temp != null ? `${s.temp > 0 ? '+' : ''}${s.temp}°` : '—';
    const isMax = maxTemp != null && s.temp === maxTemp;
    const isMin = minTemp != null && s.temp === minTemp;
    const badge = isMax ? '<span class="st-badge st-badge--hot">MAX</span>'
                : isMin ? '<span class="st-badge st-badge--cold">MIN</span>' : '';
    const typeBadge = s.type === 'ams' ? '<span class="st-badge st-badge--ams">AMS</span>' : '';

    const wind = [s.windDir, s.windKmh != null ? `${s.windKmh} km/h` : null]
      .filter(Boolean).join(' ');
    const meta = [
      s.desc,
      s.humidity != null ? `${s.humidity}% vlaga` : null,
      wind || null,
      s.rain != null && s.rain > 0 ? `🌧 ${s.rain} mm` : null,
    ].filter(Boolean).join(' · ');

    return `<div class="st-row">
      <span class="st-row__icon" aria-hidden="true">${arsoIcon(s.icon)}</span>
      <div class="st-row__info">
        <span class="st-row__name">${s.name}${badge}${typeBadge}${freshnessDot(s.updated)}</span>
        ${meta ? `<span class="st-row__meta">${meta}</span>` : ''}
      </div>
      <span class="st-row__temp" style="color:${color}">${tempStr}</span>
    </div>`;
  }).join('');
}

function refreshView() {
  renderList(sortStations(filterStations(allStations, filterQuery), currentSort));
}

function applySort(sort) {
  currentSort = sort;
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.toggle('sort-btn--active', btn.dataset.sort === sort);
  });
  refreshView();
}

async function load() {
  setStatus('Nalagam postaje…');
  try {
    allStations = await fetchAllArsoStations();
    refreshView();
    setStatus(`${allStations.length} postaj · ${new Date().toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setStatus('Podatek trenutno ni na voljo.', true);
    $('stations-list').innerHTML = '<p class="stations-empty">Postaje trenutno niso dosegljive.</p>';
    console.warn(err);
  }
}

function init() {
  initPwaUpdates();
  initContrast();

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => applySort(btn.dataset.sort));
  });

  const filter = $('stations-filter');
  let t = null;
  filter?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      filterQuery = filter.value;
      refreshView();
    }, 180);
  });

  $('btn-reload')?.addEventListener('click', load);

  load();
}

init();

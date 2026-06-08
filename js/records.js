/**
 * records.js – Absolutni rekordi postaje IKOPER43 · Rakitovec
 * Zbere podatke iz vseh razpoložljivih let in izračuna:
 *  - absolutne rekorde (najhladnejši/najtoplejši dan, največ dežja, najmočnejši sunek)
 *  - mesečne klimatološke povprečke
 *  - temperaturni heatmap za izbrano leto
 */

import { APP_VERSION, YEAR_SHEETS } from './config.js';
import { initPwaUpdates } from './pwa-update.js';
import { fetchYearReadings } from './sheets.js';
import { aggregateByDay } from './weather-ui.js';

const $ = (sel) => document.querySelector(sel);

const MONTHS_SL = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec'];

function setStatus(msg, isError = false) {
  const el = $('#status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isError);
}

function setLoading(on) {
  document.body.classList.toggle('is-loading', on);
}

function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('sl-SI', {
    timeZone: 'Europe/Ljubljana', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return d.toLocaleDateString('sl-SI', {
    timeZone: 'Europe/Ljubljana', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Temperatura → razred za heatmap */
function tempClass(t) {
  if (t == null)  return null;
  if (t < 0)      return 'freezing';
  if (t < 8)      return 'cold';
  if (t < 14)     return 'cool';
  if (t < 20)     return 'mild';
  if (t < 26)     return 'warm';
  if (t < 32)     return 'hot';
  return 'scorching';
}

/** ——— Absolutni rekordi ——— */
function renderAllTimeRecords(allDaily, years) {
  const el = $('#all-time-records');
  if (!el) return;

  // Posodobi subtitle
  const rangeEl = $('#records-range');
  if (rangeEl) rangeEl.textContent = `${Math.min(...years)}–${Math.max(...years)} · ${allDaily.length} dni`;

  // Poišči rekorde
  let hotDay = null, coldDay = null, rainDay = null, windDay = null;

  for (const d of allDaily) {
    if (d.max != null && (hotDay == null  || d.max > hotDay.max))   hotDay  = d;
    if (d.min != null && (coldDay == null || d.min < coldDay.min))  coldDay = d;
    if (d.rain != null && (rainDay == null || d.rain > rainDay.rain)) rainDay = d;
    if (d.windMax != null && (windDay == null || d.windMax > windDay.windMax)) windDay = d;
  }

  // Mrzlih/vročih dni
  const hotDays  = allDaily.filter((d) => d.max != null && d.max >= 30).length;
  const coldDays = allDaily.filter((d) => d.min != null && d.min <= 0).length;
  const rainDays = allDaily.filter((d) => d.rain != null && d.rain > 0.1).length;

  const items = [
    {
      cls: 'hot', icon: '🌡️', label: 'Najtoplejši dan',
      val: hotDay ? `${hotDay.max.toFixed(1)}°C` : '—',
      date: hotDay ? fmtDate(hotDay.maxTime ?? hotDay.date) : '',
    },
    {
      cls: 'cold', icon: '❄️', label: 'Najhladnejši dan',
      val: coldDay ? `${coldDay.min.toFixed(1)}°C` : '—',
      date: coldDay ? fmtDate(coldDay.minTime ?? coldDay.date) : '',
    },
    {
      cls: 'rain', icon: '🌧️', label: 'Največ dežja v dnevu',
      val: rainDay ? `${rainDay.rain.toFixed(1)} mm` : '—',
      date: rainDay ? fmtDate(rainDay.date) : '',
    },
    {
      cls: 'wind', icon: '💨', label: 'Najmočnejši sunek',
      val: windDay ? `${windDay.windMax.toFixed(1)} m/s` : '—',
      date: windDay ? fmtDate(windDay.date) : '',
    },
    {
      cls: '', icon: '🔥', label: 'Vročih dni (≥30°)',
      val: `${hotDays}`,
      date: `od ${allDaily.length} dni z meritvami`,
    },
    {
      cls: '', icon: '🧊', label: 'Mrzlih noči (≤0°)',
      val: `${coldDays}`,
      date: '',
    },
    {
      cls: 'rain', icon: '💧', label: 'Deževnih dni',
      val: `${rainDays}`,
      date: `${(rainDays / allDaily.length * 100).toFixed(0)}% dni`,
    },
  ];

  el.innerHTML = items.map((item) => `
    <div class="record-item${item.cls ? ' record-item--' + item.cls : ''}">
      <span class="record-item__icon">${item.icon}</span>
      <span class="record-item__label">${item.label}</span>
      <span class="record-item__val">${item.val}</span>
      ${item.date ? `<span class="record-item__date">${item.date}</span>` : ''}
    </div>`).join('');
}

/** ——— Mesečna klimatologija ——— */
function renderMonthlyClimate(allDaily) {
  const el = $('#monthly-climate');
  if (!el) return;

  // Grupiraj po mesecu
  const months = Array.from({ length: 12 }, () => ({ temps: [], mins: [], maxs: [], rain: [] }));

  for (const d of allDaily) {
    const m = d.date.getMonth();
    if (d.avg  != null) months[m].temps.push(d.avg);
    if (d.min  != null) months[m].mins.push(d.min);
    if (d.max  != null) months[m].maxs.push(d.max);
    if (d.rain != null) months[m].rain.push(d.rain);
  }

  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const sum = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) : null;

  const rows = months.map((m, i) => {
    const avgT  = avg(m.temps);
    const avgMin = avg(m.mins);
    const avgMax = avg(m.maxs);
    const avgRain = sum(m.rain);
    const years = m.temps.length > 0 ? Math.round(m.temps.length / 28) || 1 : 1;
    return { month: i, avgT, avgMin, avgMax, avgRain: avgRain ? avgRain / years : null };
  });

  el.innerHTML = `<div class="climate-row">${rows.map((r) => `
    <div class="climate-month">
      <span class="climate-month__lbl">${MONTHS_SL[r.month]}</span>
      <span class="climate-month__max">${r.avgMax != null ? r.avgMax.toFixed(0) + '°' : '—'}</span>
      <span class="climate-month__avg">${r.avgT  != null ? r.avgT.toFixed(0)  + '°' : '—'}</span>
      <span class="climate-month__min">${r.avgMin != null ? r.avgMin.toFixed(0) + '°' : '—'}</span>
      <span class="climate-month__rain">${r.avgRain != null ? r.avgRain.toFixed(0) + ' mm' : '—'}</span>
    </div>`).join('')}
  </div>`;
}

/** ——— Temperaturni heatmap ——— */
function renderHeatmap(daily, year) {
  const wrap = $('#heatmap-wrap');
  if (!wrap) return;

  // Indeksiraj po datumskem ključu
  const dayMap = new Map();
  for (const d of daily) {
    const key = `${d.date.getFullYear()}-${String(d.date.getMonth()+1).padStart(2,'0')}-${String(d.date.getDate()).padStart(2,'0')}`;
    dayMap.set(key, d.avg ?? d.max ?? d.min);
  }

  const jan1 = new Date(year, 0, 1);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalDays = isLeap ? 366 : 365;

  // Dan v tednu za 1. jan (0=ned … 6=sob) → odmik za pon-aligniranje
  const startDow = (jan1.getDay() + 6) % 7; // 0=pon

  // Mesečni naslovi — pozicija v stolpcih
  const monthStarts = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(year, m, 1);
    const dayOfYear = Math.floor((d - jan1) / 86400000);
    const col = Math.floor((dayOfYear + startDow) / 7);
    monthStarts.push({ col, label: MONTHS_SL[m] });
  }

  const totalCols = Math.ceil((totalDays + startDow) / 7);

  // Gradi celice
  const cells = [];
  // Prazne celice na začetku
  for (let i = 0; i < startDow; i++) {
    cells.push('<div class="heatmap-cell heatmap-cell--empty"></div>');
  }

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(year, 0, 1 + i);
    const key = `${year}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const temp = dayMap.get(key);
    const cls  = tempClass(temp);
    const title = temp != null
      ? `${d.toLocaleDateString('sl-SI', {day:'numeric',month:'short'})}: ${temp.toFixed(1)}°C`
      : d.toLocaleDateString('sl-SI', {day:'numeric',month:'short'});
    cells.push(`<div class="heatmap-cell${cls ? ' heatmap-cell--data' : ''}" ${cls ? `data-t="${cls}"` : ''} title="${title}"></div>`);
  }

  // Mesečne oznake (nad gridom)
  const CELL_W = 13; // 11px cell + 2px gap
  const monthLabelsHtml = monthStarts.map((ms) =>
    `<span style="margin-left:${ms.col === 0 ? 0 : `${ms.col * CELL_W - (monthStarts[0]?.col ?? 0) * CELL_W}px`}">${ms.label}</span>`
  ).join('');

  // Dan v tednu oznake
  const dowLabels = ['P','T','S','Č','P','S','N'].map((l, i) =>
    i % 2 === 1 ? `<span>${l}</span>` : '<span></span>'
  ).join('');

  wrap.innerHTML = `
    <div style="display:flex;gap:0;align-items:flex-start">
      <div class="heatmap-dow-labels">${dowLabels}</div>
      <div style="overflow-x:auto;scrollbar-width:none">
        <div class="heatmap-month-labels" style="padding-left:0">${monthLabelsHtml}</div>
        <div class="heatmap-grid" style="grid-template-columns:repeat(${totalCols},11px)">
          ${cells.join('')}
        </div>
      </div>
    </div>`;
}

/** ——— Nalaganje podatkov ——— */
let allDaily = [];
let dailyByYear = {};
let availableYears = [];

async function loadAllYears() {
  setLoading(true);
  setStatus('Nalagam podatke iz vseh let…');

  const years = Object.keys(YEAR_SHEETS).map(Number).sort((a, b) => a - b);
  const results = await Promise.allSettled(
    years.map((y) => fetchYearReadings(y).then((readings) => ({ year: y, readings })))
  );

  availableYears = [];
  allDaily = [];
  dailyByYear = {};

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { year, readings } = r.value;
    if (!readings.length) continue;
    availableYears.push(year);
    const daily = aggregateByDay(readings);
    dailyByYear[year] = daily;
    allDaily.push(...daily);
  }

  return availableYears;
}

function populateYearSelect(years) {
  const sel = $('#heatmap-year');
  if (!sel) return;
  sel.innerHTML = '';
  [...years].reverse().forEach((y) => {
    sel.append(new Option(String(y), String(y)));
  });
  sel.value = String(years[years.length - 1]);
}

async function init() {
  if (location.protocol === 'file:') {
    setStatus('Odprite prek strežnika (npx serve).', true);
    return;
  }

  initPwaUpdates();
  $('#btn-reload')?.addEventListener('click', loadAndRender);
  await loadAndRender();
}

async function loadAndRender() {
  try {
    const years = await loadAllYears();

    if (!years.length) {
      setStatus('Ni podatkov.', true);
      return;
    }

    renderAllTimeRecords(allDaily, years);
    renderMonthlyClimate(allDaily);

    populateYearSelect(years);
    const selYear = Number($('#heatmap-year')?.value ?? years[years.length - 1]);
    renderHeatmap(dailyByYear[selYear] ?? [], selYear);

    $('#heatmap-year')?.addEventListener('change', (e) => {
      const y = Number(e.target.value);
      renderHeatmap(dailyByYear[y] ?? [], y);
    });

    const total = allDaily.length;
    setStatus(`${total} dni · ${years.join(', ')} · posodobljeno ${new Date().toLocaleTimeString('sl-SI', { hour:'2-digit', minute:'2-digit' })}`);
  } catch (err) {
    console.error(err);
    setStatus(`Napaka: ${err.message}`, true);
  } finally {
    setLoading(false);
  }
}

init();

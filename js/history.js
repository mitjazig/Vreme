import { APP_VERSION } from './config.js';
import { fetchDataBounds, fetchMonthReadings, fetchYearReadings } from './sheets.js';
import {
  aggregateByDay,
  monthSummary,
  formatTemp,
  formatNum,
} from './weather-ui.js';
import {
  destroyHistoryCharts,
  renderTempRangeChart,
  renderTempAvgChart,
  renderTempHourlyChart,
  renderPrecipChart,
} from './history-charts.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const MONTHS_SL = [
  'Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij',
  'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December',
];

let bounds = null;
let currentView = 'daily';

function setStatus(msg, isError = false) {
  const el = $('#status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('status--error', isError);
}

function setLoading(on) {
  document.body.classList.toggle('is-loading', on);
}

function setView(view) {
  currentView = view;
  $$('.view-toggle__btn').forEach((btn) => {
    btn.classList.toggle('view-toggle__btn--active', btn.dataset.view === view);
  });
  $('#charts-daily')?.classList.toggle('hidden', view !== 'daily');
  $('#charts-hourly')?.classList.toggle('hidden', view !== 'hourly');
}

function populateFilters() {
  const yearSel = $('#filter-year');
  const monthSel = $('#filter-month');
  if (!yearSel || !monthSel || !bounds) return;

  yearSel.innerHTML = '';
  [...bounds.years].reverse().forEach((y) => {
    yearSel.append(new Option(String(y), String(y)));
  });

  monthSel.innerHTML = '<option value="all">Celotno leto</option>';
  MONTHS_SL.forEach((name, i) => {
    monthSel.append(new Option(name, String(i + 1)));
  });

  const now = bounds.last;
  yearSel.value = String(now.getFullYear());
  monthSel.value = String(now.getMonth() + 1);
}

function renderSummary(summary, label) {
  const el = $('#period-summary');
  if (!el) return;
  el.innerHTML = `
    <p class="summary-strip__label">${label}</p>
    <div class="stat-pills">
      <div class="stat-pill stat-pill--cold">
        <span class="stat-pill__lbl">Min</span>
        <span class="stat-pill__val">${formatTemp(summary.min)}</span>
      </div>
      <div class="stat-pill stat-pill--warm">
        <span class="stat-pill__lbl">Povpr.</span>
        <span class="stat-pill__val">${formatTemp(summary.avg)}</span>
      </div>
      <div class="stat-pill stat-pill--hot">
        <span class="stat-pill__lbl">Max</span>
        <span class="stat-pill__val">${formatTemp(summary.max)}</span>
      </div>
      <div class="stat-pill stat-pill--rain">
        <span class="stat-pill__lbl">Dež</span>
        <span class="stat-pill__val">${formatNum(summary.rainTotal, ' mm', 1)}</span>
      </div>
      <div class="stat-pill">
        <span class="stat-pill__lbl">Deževni dnevi</span>
        <span class="stat-pill__val">${summary.rainyDays ?? '—'}</span>
      </div>
      <div class="stat-pill">
        <span class="stat-pill__lbl">Dni</span>
        <span class="stat-pill__val">${summary.days}</span>
      </div>
    </div>`;
}

function renderTable(daily) {
  const tbody = $('#history-table tbody');
  if (!tbody) return;

  if (!daily.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="data-table__empty">Ni podatkov.</td></tr>';
    return;
  }

  tbody.innerHTML = daily
    .map((d) => {
      const dateStr = d.date.toLocaleDateString('sl-SI', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      const hot = d.max != null && d.max >= 28;
      const cold = d.min != null && d.min <= 0;
      return `<tr class="${hot ? 'row-hot' : cold ? 'row-cold' : ''}">
        <td>${dateStr}</td>
        <td>${formatTemp(d.min)}</td>
        <td>${formatTemp(d.max)}</td>
        <td>${formatTemp(d.avg)}</td>
        <td>${formatNum(d.humidity, '%', 0)}</td>
        <td>${d.rain != null && d.rain > 0 ? formatNum(d.rain, ' mm', 1) : '·'}</td>
      </tr>`;
    })
    .join('');
}

function renderCharts(readings, daily, label, isYear) {
  destroyHistoryCharts();

  if (currentView === 'hourly' && !isYear && readings.length) {
    setView('hourly');
    const title = $('#chart-hourly-title');
    if (title) title.textContent = `Urne temperature – ${label}`;
    renderTempHourlyChart($('#chart-temp-hourly'), readings);
    return;
  }

  if (isYear && currentView === 'hourly') {
    setView('daily');
  } else {
    setView('daily');
  }

  renderTempRangeChart($('#chart-temp-range'), daily);
  renderTempAvgChart($('#chart-temp-avg'), daily);
  renderPrecipChart($('#chart-precip'), daily);
}

async function loadPeriod() {
  const year = Number($('#filter-year')?.value);
  const monthVal = $('#filter-month')?.value;
  const isYear = monthVal === 'all';

  if (!year) return;

  setLoading(true);
  setStatus('Nalagam statistiko…');

  try {
    const readings = isYear
      ? await fetchYearReadings(year)
      : await fetchMonthReadings(year, Number(monthVal));

    const daily = aggregateByDay(readings);
    const summary = monthSummary(daily);

    const monthName = isYear ? String(year) : MONTHS_SL[Number(monthVal) - 1];
    const label = isYear ? `Leto ${year}` : `${monthName} ${year}`;

    renderSummary(summary, label);
    renderTable(daily);
    renderCharts(readings, daily, label, isYear);

    setStatus(
      `${readings.length} meritev · ${daily.length} dni · ${new Date().toLocaleTimeString('sl-SI')}`,
    );
  } catch (err) {
    console.error(err);
    setStatus(`Napaka: ${err.message}`, true);
    renderTable([]);
    $('#period-summary').innerHTML = '';
    destroyHistoryCharts();
  } finally {
    setLoading(false);
  }
}

async function clearStaleCaches() {
  const key = 'vreme-app-ver';
  if (localStorage.getItem(key) === APP_VERSION) return;
  localStorage.setItem(key, APP_VERSION);
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

async function init() {
  if (location.protocol === 'file:') {
    setStatus('Odprite prek strežnika (npx serve).', true);
    return;
  }

  await clearStaleCaches();

  $$('.view-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === 'hourly' && $('#filter-month')?.value === 'all') {
        setStatus('Urni prikaz je na voljo za posamezen mesec.', true);
        return;
      }
      setView(btn.dataset.view);
      loadPeriod();
    });
  });

  try {
    bounds = await fetchDataBounds();
    populateFilters();
    await loadPeriod();
  } catch (err) {
    setStatus(`Napaka: ${err.message}`, true);
  }

  $('#filter-year')?.addEventListener('change', loadPeriod);
  $('#filter-month')?.addEventListener('change', () => {
    if ($('#filter-month')?.value === 'all' && currentView === 'hourly') setView('daily');
    loadPeriod();
  });
  $('#btn-reload')?.addEventListener('click', loadPeriod);
}

init();

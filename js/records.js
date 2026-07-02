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

/** ——— Rekordi po izbranem letu ——— */
function renderYearRecords(daily, year) {
  const el = $('#year-records-grid');
  const desc = $('#year-records-desc');
  if (!el) return;

  if (!daily?.length) {
    el.innerHTML = '<p class="forecast-loading">Ni podatkov za to leto.</p>';
    if (desc) desc.textContent = String(year);
    return;
  }

  let hotDay = null, coldDay = null, rainDay = null, windDay = null;
  for (const d of daily) {
    if (d.max  != null && (hotDay  == null || d.max  > hotDay.max))    hotDay  = d;
    if (d.min  != null && (coldDay == null || d.min  < coldDay.min))   coldDay = d;
    if (d.rain != null && (rainDay == null || d.rain > rainDay.rain))  rainDay = d;
    if (d.windMax != null && (windDay == null || d.windMax > windDay.windMax)) windDay = d;
  }

  const hotDays  = daily.filter((d) => d.max != null && d.max >= 30).length;
  const coldDays = daily.filter((d) => d.min != null && d.min <= 0).length;
  const rainDays = daily.filter((d) => d.rain != null && d.rain > 0.1).length;
  const totalRain = daily.reduce((s, d) => s + (d.rain ?? 0), 0);
  const avgTemps = daily.filter((d) => d.avg != null);
  const avgYear  = avgTemps.length ? avgTemps.reduce((s, d) => s + d.avg, 0) / avgTemps.length : null;

  if (desc) desc.textContent = `${year} · ${daily.length} dni meritev`;

  const items = [
    { cls: 'hot',  icon: '🌡️', label: 'Najtoplejši dan',    val: hotDay  ? `${hotDay.max.toFixed(1)}°C`     : '—', date: hotDay  ? fmtDate(hotDay.maxTime  ?? hotDay.date)  : '' },
    { cls: 'cold', icon: '❄️', label: 'Najhladnejši dan',   val: coldDay ? `${coldDay.min.toFixed(1)}°C`    : '—', date: coldDay ? fmtDate(coldDay.minTime ?? coldDay.date) : '' },
    { cls: 'rain', icon: '🌧️', label: 'Največ dežja v dnevu', val: rainDay ? `${rainDay.rain.toFixed(1)} mm` : '—', date: rainDay ? fmtDate(rainDay.date) : '' },
    { cls: 'wind', icon: '💨', label: 'Najmočnejši sunek',  val: windDay ? `${windDay.windMax.toFixed(1)} m/s` : '—', date: windDay ? fmtDate(windDay.date) : '' },
    { cls: '',     icon: '🌡️', label: 'Povprečna temp.',    val: avgYear != null ? `${avgYear.toFixed(1)}°C` : '—', date: '' },
    { cls: 'rain', icon: '💧', label: 'Skupne padavine',    val: `${totalRain.toFixed(0)} mm`, date: `${rainDays} deževnih dni` },
    { cls: '',     icon: '🔥', label: 'Vroči dnevi (≥30°)', val: `${hotDays}`, date: '' },
    { cls: '',     icon: '🧊', label: 'Mrzle noči (≤0°)',   val: `${coldDays}`, date: '' },
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

/** ——— Primerjava let ——— */
function renderYearCompare(dailyByYear, years) {
  const el = $('#year-compare');
  if (!el) return;

  const sorted = [...years].sort((a, b) => a - b);

  const stats = sorted.map((year) => {
    const daily = dailyByYear[year] ?? [];
    let hotDay = null, coldDay = null, rainDay = null, windDay = null;
    let totalRain = 0, hotDays = 0, coldDays = 0, rainDays = 0;
    const temps = [];
    for (const d of daily) {
      if (d.max != null && (hotDay == null || d.max > hotDay.max)) hotDay = d;
      if (d.min != null && (coldDay == null || d.min < coldDay.min)) coldDay = d;
      if (d.rain != null && (rainDay == null || d.rain > rainDay.rain)) rainDay = d;
      if (d.windMax != null && (windDay == null || d.windMax > windDay.windMax)) windDay = d;
      if (d.rain != null) totalRain += d.rain;
      if (d.max != null && d.max >= 30) hotDays++;
      if (d.min != null && d.min <= 0) coldDays++;
      if (d.rain != null && d.rain > 0.1) rainDays++;
      if (d.avg != null) temps.push(d.avg);
    }
    const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    return { year, days: daily.length, maxTemp: hotDay?.max ?? null, minTemp: coldDay?.min ?? null,
      maxRain: rainDay?.rain ?? null, maxWind: windDay?.windMax ?? null,
      totalRain, hotDays, coldDays, rainDays, avgTemp };
  });

  // Find extremes for bar scaling
  const maxOf = (key) => Math.max(...stats.map(s => s[key] ?? 0));
  const minOf = (key) => Math.min(...stats.filter(s => s[key] != null).map(s => s[key]));
  const extremes = {
    maxTemp: maxOf('maxTemp'), minTemp: minOf('minTemp'),
    maxRain: maxOf('maxRain'), maxWind: maxOf('maxWind'),
    totalRain: maxOf('totalRain'), hotDays: maxOf('hotDays'),
    coldDays: maxOf('coldDays'), avgTemp: maxOf('avgTemp'),
  };

  function bar(val, max, color) {
    if (val == null || max === 0) return '<div class="yc-bar"></div>';
    const pct = Math.max(4, Math.round(Math.abs(val) / Math.abs(max) * 100));
    return `<div class="yc-bar"><div class="yc-bar__fill" style="width:${pct}%;background:${color}"></div></div>`;
  }

  const rows = [
    { label: 'Maks. temp.', key: 'maxTemp', fmt: v => v?.toFixed(1) + '°C', color: '#f87171', unit: '' },
    { label: 'Min. temp.',  key: 'minTemp', fmt: v => v?.toFixed(1) + '°C', color: '#38bdf8', unit: '' },
    { label: 'Povp. temp.', key: 'avgTemp', fmt: v => v?.toFixed(1) + '°C', color: '#a78bfa', unit: '' },
    { label: 'Maks. dež/dan', key: 'maxRain', fmt: v => v?.toFixed(0) + ' mm', color: '#34d399', unit: '' },
    { label: 'Skupaj dež',  key: 'totalRain', fmt: v => v?.toFixed(0) + ' mm', color: '#22d3ee', unit: '' },
    { label: 'Maks. sunek', key: 'maxWind', fmt: v => v?.toFixed(1) + ' m/s', color: '#fbbf24', unit: '' },
    { label: 'Vroči dnevi ≥30°', key: 'hotDays', fmt: v => v + ' dni', color: '#fb923c', unit: '' },
    { label: 'Mrzle noči ≤0°', key: 'coldDays', fmt: v => v + ' dni', color: '#818cf8', unit: '' },
  ];

  el.innerHTML = `
    <div class="yc-table-wrap">
      <table class="yc-table">
        <thead>
          <tr>
            <th class="yc-th yc-th--label"></th>
            ${sorted.map(y => `<th class="yc-th">${y}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr class="yc-row">
              <td class="yc-td yc-td--label">${row.label}</td>
              ${stats.map(s => {
                const val = s[row.key];
                const isMax = val != null && val === (row.key === 'minTemp'
                  ? Math.min(...stats.filter(x => x[row.key] != null).map(x => x[row.key]))
                  : Math.max(...stats.filter(x => x[row.key] != null).map(x => x[row.key])));
                return `<td class="yc-td${isMax ? ' yc-td--best' : ''}">
                  <span class="yc-val">${val != null ? row.fmt(val) : '—'}</span>
                  ${bar(val, extremes[row.key], row.color)}
                </td>`;
              }).join('')}
            </tr>`).join('')}
          <tr class="yc-row yc-row--muted">
            <td class="yc-td yc-td--label">Dni meritev</td>
            ${stats.map(s => `<td class="yc-td"><span class="yc-val">${s.days}</span></td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>`;
}

/** ——— Temperaturni heatmap ——— */
function renderHeatmap(daily, year) {
  const wrap = $('#heatmap-wrap');
  if (!wrap) return;

  // Index by date key
  const dayMap = new Map();
  for (const d of daily) {
    const key = `${d.date.getFullYear()}-${String(d.date.getMonth()+1).padStart(2,'0')}-${String(d.date.getDate()).padStart(2,'0')}`;
    dayMap.set(key, d.avg ?? d.max ?? d.min);
  }

  // Day-number header (1–31)
  const dayNums = Array.from({ length: 31 }, (_, i) =>
    `<div class="hm2-day-num">${i + 1}</div>`
  ).join('');

  // 12 month rows
  const monthRows = MONTHS_SL.map((mLabel, m) => {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const cells = Array.from({ length: 31 }, (_, d) => {
      if (d >= daysInMonth) return '<div class="hm2-cell hm2-cell--out"></div>';
      const day = d + 1;
      const key = `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const temp = dayMap.get(key);
      const cls  = tempClass(temp);
      const title = temp != null
        ? `${day}. ${mLabel}: ${temp.toFixed(1)}°C`
        : `${day}. ${mLabel}`;
      return `<div class="hm2-cell${cls ? ' hm2-cell--data' : ''}" ${cls ? `data-t="${cls}"` : ''} title="${title}"></div>`;
    }).join('');
    return `<div class="hm2-row"><div class="hm2-month-lbl">${mLabel}</div>${cells}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="hm2-wrap">
      <div class="hm2-header">
        <div class="hm2-month-lbl"></div>${dayNums}
      </div>
      ${monthRows}
    </div>`;
}

/** ——— Letni trend + klimatska anomalija ——— */
function renderTrend(dailyByYear, years) {
  const el = $('#trend-wrap');
  if (!el) return;

  const sorted = [...years].sort((a, b) => a - b);
  const avgByYear = sorted.map((y) => {
    const daily = dailyByYear[y] ?? [];
    const temps = daily.filter((d) => d.avg != null).map((d) => d.avg);
    return { year: y, avg: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null };
  }).filter((r) => r.avg != null);

  if (avgByYear.length < 2) { el.innerHTML = '<p class="forecast-loading">Premalo podatkov.</p>'; return; }

  const overallAvg = avgByYear.reduce((s, r) => s + r.avg, 0) / avgByYear.length;
  const minAvg = Math.min(...avgByYear.map(r => r.avg));
  const maxAvg = Math.max(...avgByYear.map(r => r.avg));
  const range = maxAvg - minAvg || 1;

  const W = 280, H = 90, padL = 30, padR = 8, padT = 10, padB = 18;
  const gW = W - padL - padR, gH = H - padT - padB;
  const xStep = gW / (avgByYear.length - 1);
  const yPos = (v) => padT + gH - ((v - minAvg) / range) * gH;

  const pts = avgByYear.map((r, i) => ({ x: padL + i * xStep, y: yPos(r.avg), ...r }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fill = `${line} L${pts.at(-1).x.toFixed(1)},${H - padB} L${pts[0].x.toFixed(1)},${H - padB} Z`;

  // Avg line
  const avgY = yPos(overallAvg);

  const dots = pts.map((p) => {
    const anom = p.avg - overallAvg;
    const col = anom > 0.3 ? '#f87171' : anom < -0.3 ? '#60a5fa' : '#a3e635';
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${col}" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
      <title>${p.year}: ${p.avg.toFixed(2)}°C (${anom > 0 ? '+' : ''}${anom.toFixed(2)}°)</title>`;
  });

  const labels = pts.map((p) =>
    `<text x="${p.x.toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.35)" font-family="DM Sans,sans-serif">${p.year}</text>`
  );

  const yLabels = [minAvg, overallAvg, maxAvg].map((v) =>
    `<text x="${padL - 3}" y="${yPos(v) + 3}" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.3)" font-family="DM Sans,sans-serif">${v.toFixed(1)}°</text>`
  );

  el.innerHTML = `
    <svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;padding:0.5rem 1rem">
      <path d="${fill}" fill="rgba(251,146,60,0.1)"/>
      <path d="${line}" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="${padL}" y1="${avgY.toFixed(1)}" x2="${W - padR}" y2="${avgY.toFixed(1)}" stroke="rgba(255,255,255,0.15)" stroke-width="0.8" stroke-dasharray="3,3"/>
      <text x="${W - padR - 2}" y="${avgY - 2}" text-anchor="end" font-size="6.5" fill="rgba(255,255,255,0.3)" font-family="DM Sans,sans-serif">avg ${overallAvg.toFixed(1)}°</text>
      ${yLabels.join('')}
      ${dots.join('')}
      ${labels.join('')}
    </svg>
    <div class="trend-anomaly">
      ${avgByYear.map((r) => {
        const anom = r.avg - overallAvg;
        const col = anom > 0.3 ? '#f87171' : anom < -0.3 ? '#60a5fa' : '#a3e635';
        const h = Math.abs(anom) / Math.max(...avgByYear.map(x => Math.abs(x.avg - overallAvg))) * 28;
        return `<div class="trend-anom-col" title="${r.year}: ${anom > 0 ? '+' : ''}${anom.toFixed(2)}°C">
          ${anom > 0 ? `<div class="trend-anom-bar trend-anom-bar--pos" style="height:${h.toFixed(0)}px;background:${col}"></div><div class="trend-anom-spacer"></div>` : `<div class="trend-anom-spacer"></div><div class="trend-anom-bar trend-anom-bar--neg" style="height:${h.toFixed(0)}px;background:${col}"></div>`}
          <span class="trend-anom-yr">${String(r.year).slice(2)}</span>
        </div>`;
      }).join('')}
    </div>`;
}

/** ——— Tekoči mesec vs povprečje ——— */
function renderMonthVsAvg(dailyByYear, years) {
  const el = $('#month-vs-avg');
  const desc = $('#month-vs-avg-desc');
  if (!el) return;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curDay = now.getDate();

  // Tekoči mesec
  const curDaily = (dailyByYear[curYear] ?? []).filter((d) => d.date.getMonth() === curMonth);

  // Klimatološko povprečje za ta mesec (brez tekočega leta)
  const pastYears = years.filter((y) => y < curYear);
  const histDays = {};
  for (const y of pastYears) {
    for (const d of (dailyByYear[y] ?? [])) {
      if (d.date.getMonth() !== curMonth) continue;
      const day = d.date.getDate();
      if (!histDays[day]) histDays[day] = { temps: [], maxs: [], mins: [], rain: [] };
      if (d.avg  != null) histDays[day].temps.push(d.avg);
      if (d.max  != null) histDays[day].maxs.push(d.max);
      if (d.min  != null) histDays[day].mins.push(d.min);
      if (d.rain != null) histDays[day].rain.push(d.rain);
    }
  }
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const MONTHS_FULL = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december'];
  if (desc) desc.textContent = `${MONTHS_FULL[curMonth]} ${curYear} · primerjava s ${pastYears.join('–')}`;

  if (!curDaily.length) { el.innerHTML = '<p class="forecast-loading">Ni podatkov za tekoči mesec.</p>'; return; }

  // Metrike
  const curTemps = curDaily.filter(d => d.avg != null).map(d => d.avg);
  const curMaxs  = curDaily.filter(d => d.max != null).map(d => d.max);
  const curMins  = curDaily.filter(d => d.min != null).map(d => d.min);
  const curRain  = curDaily.reduce((s, d) => s + (d.rain ?? 0), 0);
  const curHot   = curDaily.filter(d => d.max != null && d.max >= 30).length;

  const histAllTemps = Object.values(histDays).flatMap(d => d.temps);
  const histAllMaxs  = Object.values(histDays).flatMap(d => d.maxs);
  const histAllMins  = Object.values(histDays).flatMap(d => d.mins);
  const histRainSum  = pastYears.length ? pastYears.map((y) =>
    (dailyByYear[y] ?? []).filter(d => d.date.getMonth() === curMonth).reduce((s, d) => s + (d.rain ?? 0), 0)
  ).reduce((a, b) => a + b, 0) / pastYears.length : null;

  const rows = [
    { label: 'Povp. temperatura', cur: avg(curTemps), hist: avg(histAllTemps), unit: '°C', fmt: (v) => v?.toFixed(1) },
    { label: 'Povp. maksimum',    cur: avg(curMaxs),  hist: avg(histAllMaxs),  unit: '°C', fmt: (v) => v?.toFixed(1) },
    { label: 'Povp. minimum',     cur: avg(curMins),  hist: avg(histAllMins),  unit: '°C', fmt: (v) => v?.toFixed(1) },
    { label: 'Skupaj padavine',   cur: curRain,        hist: histRainSum,        unit: ' mm', fmt: (v) => v?.toFixed(0) },
    { label: 'Vroči dnevi ≥30°',  cur: curHot,         hist: null,               unit: ' dni', fmt: (v) => String(v) },
  ];

  el.innerHTML = rows.map((r) => {
    const diff = r.cur != null && r.hist != null ? r.cur - r.hist : null;
    const isAbove = diff != null && diff > 0;
    const col = diff == null ? '' : Math.abs(diff) < 0.3 ? '#a3e635' : isAbove ? '#f87171' : '#60a5fa';
    const diffStr = diff != null ? `${isAbove ? '+' : ''}${r.fmt(diff)}${r.unit}` : '';
    return `<div class="mva-row">
      <span class="mva-label">${r.label}</span>
      <span class="mva-cur">${r.cur != null ? r.fmt(r.cur) + r.unit : '—'}</span>
      <span class="mva-hist">${r.hist != null ? 'povp. ' + r.fmt(r.hist) + r.unit : ''}</span>
      <span class="mva-diff" style="color:${col}">${diffStr}</span>
    </div>`;
  }).join('');
}

/** ——— Padavinski kalendar ——— */
function renderRainCalendar(daily, year) {
  const wrap = $('#rain-cal-wrap');
  if (!wrap) return;

  const dayMap = new Map();
  for (const d of daily) {
    const key = `${d.date.getFullYear()}-${String(d.date.getMonth()+1).padStart(2,'0')}-${String(d.date.getDate()).padStart(2,'0')}`;
    dayMap.set(key, d.rain ?? 0);
  }

  function rainClass(mm) {
    if (mm == null) return '';
    if (mm < 0.1)  return 'dry';
    if (mm < 2)    return 'r1';
    if (mm < 5)    return 'r2';
    if (mm < 15)   return 'r3';
    if (mm < 30)   return 'r4';
    return 'r5';
  }

  const dayNums = Array.from({ length: 31 }, (_, i) =>
    `<div class="hm2-day-num">${i + 1}</div>`
  ).join('');

  const monthRows = MONTHS_SL.map((mLabel, m) => {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const cells = Array.from({ length: 31 }, (_, d) => {
      if (d >= daysInMonth) return '<div class="hm2-cell hm2-cell--out"></div>';
      const day = d + 1;
      const key = `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const mm = dayMap.has(key) ? dayMap.get(key) : null;
      const cls = rainClass(mm);
      const title = mm != null ? `${day}. ${mLabel}: ${mm.toFixed(1)} mm` : `${day}. ${mLabel}`;
      return `<div class="hm2-cell rc-cell${cls ? ' rc-' + cls : ''}" title="${title}"></div>`;
    }).join('');
    return `<div class="hm2-row"><div class="hm2-month-lbl">${mLabel}</div>${cells}</div>`;
  }).join('');

  wrap.innerHTML = `<div class="hm2-wrap">
    <div class="hm2-header"><div class="hm2-month-lbl"></div>${dayNums}</div>
    ${monthRows}
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
    renderYearCompare(dailyByYear, years);
    renderTrend(dailyByYear, years);
    renderMonthVsAvg(dailyByYear, years);
    renderMonthlyClimate(allDaily);

    // Rain calendar year selector
    const rainSel = $('#rain-cal-year');
    if (rainSel && !rainSel.options.length) {
      [...years].reverse().forEach((y) => rainSel.append(new Option(String(y), String(y))));
      rainSel.value = String(years[years.length - 1]);
      rainSel.addEventListener('change', (e) => renderRainCalendar(dailyByYear[Number(e.target.value)] ?? [], Number(e.target.value)));
    }
    renderRainCalendar(dailyByYear[Number(rainSel?.value ?? years[years.length - 1])] ?? [], Number(rainSel?.value ?? years[years.length - 1]));

    // Rekordi po letu
    const yrSel = $('#year-records-select');
    if (yrSel && !yrSel.options.length) {
      [...years].reverse().forEach((y) => yrSel.append(new Option(String(y), String(y))));
      yrSel.value = String(years[years.length - 1]);
      yrSel.addEventListener('change', (e) => {
        const y = Number(e.target.value);
        renderYearRecords(dailyByYear[y] ?? [], y);
      });
    }
    renderYearRecords(dailyByYear[Number(yrSel?.value ?? years[years.length - 1])] ?? [], Number(yrSel?.value ?? years[years.length - 1]));

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

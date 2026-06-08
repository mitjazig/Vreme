import { CHART, baseChartOptions } from './chart-theme.js';

const charts = {};

function destroy(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

export function destroyHistoryCharts() {
  Object.keys(charts).forEach(destroy);
}

function dayLabels(daily) {
  return daily.map((d) =>
    d.date.toLocaleDateString('sl-SI', { day: 'numeric', month: 'short' }),
  );
}

/** Dnevni min–max razpon (plavajoči stolpci) */
export function renderTempRangeChart(canvas, daily) {
  if (!canvas || typeof Chart === 'undefined') return;
  destroy('range');

  // Barvanje: hladno (modro) → toplo (zlato) → vroče (rdeče) glede na max temp dneva
  const barColors = daily.map((d) => {
    const t = d.max ?? d.min ?? 15;
    if (t <= 5)  return 'rgba(56,189,248,0.55)';
    if (t <= 15) return 'rgba(99,179,237,0.55)';
    if (t <= 22) return 'rgba(245,158,11,0.55)';
    if (t <= 28) return 'rgba(251,113,60,0.55)';
    return 'rgba(244,63,94,0.65)';
  });

  charts.range = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: dayLabels(daily),
      datasets: [
        {
          label: 'Min – max °C',
          data: daily.map((d) => [d.min, d.max]),
          backgroundColor: barColors,
          borderColor: barColors.map((c) => c.replace(/[\d.]+\)$/, '0.9)')),
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const [min, max] = ctx.raw;
              return `${min?.toFixed(1)} °C – ${max?.toFixed(1)} °C`;
            },
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: '°C', color: CHART.text },
        },
      },
    }),
  });
}

/** Povprečna dnevna temperatura */
export function renderTempAvgChart(canvas, daily) {
  if (!canvas || typeof Chart === 'undefined') return;
  destroy('avg');

  charts.avg = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dayLabels(daily),
      datasets: [
        {
          label: 'Povprečje °C',
          data: daily.map((d) => d.avg),
          borderColor: CHART.temp,
          backgroundColor: CHART.tempFill,
          fill: true,
          tension: 0.35,
          pointRadius: daily.length > 45 ? 0 : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: CHART.temp,
          borderWidth: 2,
        },
        {
          label: 'Min °C',
          data: daily.map((d) => d.min),
          borderColor: CHART.cold,
          borderDash: [5, 5],
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
        {
          label: 'Max °C',
          data: daily.map((d) => d.max),
          borderColor: '#f43f5e',
          borderDash: [5, 5],
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
      ],
    },
    options: baseChartOptions(),
  });
}

/** Urne temperature za izbrani mesec */
export function renderTempHourlyChart(canvas, readings) {
  if (!canvas || typeof Chart === 'undefined') return;
  destroy('hourly');

  const labels = readings.map((r) =>
    r.time.toLocaleString('sl-SI', {
      timeZone: 'Europe/Ljubljana',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
    }),
  );

  charts.hourly = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temperatura °C',
          data: readings.map((r) => r.temp),
          borderColor: CHART.temp,
          backgroundColor: CHART.tempFill,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: baseChartOptions({
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 9 } } },
      },
    }),
  });
}

/** Dnevne padavine */
export function renderPrecipChart(canvas, daily) {
  if (!canvas || typeof Chart === 'undefined') return;
  destroy('rain');

  charts.rain = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: dayLabels(daily),
      datasets: [
        {
          label: 'Padavine mm',
          data: daily.map((d) => d.rain ?? 0),
          backgroundColor: CHART.rainFill,
          borderColor: CHART.rain,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: baseChartOptions({
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'mm', color: CHART.text },
        },
      },
    }),
  });
}

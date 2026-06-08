import { CHART, baseChartOptions } from './chart-theme.js';

let hourlyChart;
let dailyChart;

export function renderHourlyChart(canvas, readings, formatTime) {
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = readings.map((r) =>
    formatTime(r.time, { hour: '2-digit', minute: '2-digit' }),
  );

  if (hourlyChart) hourlyChart.destroy();

  hourlyChart = new Chart(canvas, {
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
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Vlažnost %',
          data: readings.map((r) => r.humidity),
          borderColor: CHART.cold,
          backgroundColor: CHART.coldFill,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y1',
        },
      ],
    },
    options: baseChartOptions({
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: '°C', color: CHART.text },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          title: { display: true, text: '%', color: CHART.text },
        },
      },
    }),
  });
}

export function renderDailyChart(canvas, daily) {
  if (!canvas || typeof Chart === 'undefined') return;

  if (dailyChart) dailyChart.destroy();

  dailyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: daily.map((d) => d.label),
      datasets: [
        {
          label: 'Min °C',
          data: daily.map((d) => d.min),
          backgroundColor: 'rgba(56, 189, 248, 0.65)',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Max °C',
          data: daily.map((d) => d.max),
          backgroundColor: 'rgba(245, 158, 11, 0.85)',
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: baseChartOptions(),
  });
}

export const CHART = {
  temp: '#f59e0b',
  tempLight: 'rgba(245, 158, 11, 0.35)',
  tempFill: 'rgba(245, 158, 11, 0.12)',
  cold: '#38bdf8',
  coldFill: 'rgba(56, 189, 248, 0.15)',
  purple: '#a78bfa',
  rain: '#34d399',
  rainFill: 'rgba(52, 211, 153, 0.45)',
  grid: 'rgba(148, 163, 184, 0.08)',
  text: '#94a3b8',
  font: "'DM Sans', system-ui, sans-serif",
};

export function baseChartOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: CHART.text,
          boxWidth: 10,
          boxHeight: 10,
          padding: 14,
          font: { family: CHART.font, size: 11 },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { family: CHART.font, size: 12 },
        bodyFont: { family: CHART.font, size: 12 },
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        ticks: { color: CHART.text, maxTicksLimit: 10, font: { size: 10 } },
        grid: { color: CHART.grid },
        border: { display: false },
      },
      y: {
        ticks: { color: CHART.text, font: { size: 10 } },
        grid: { color: CHART.grid },
        border: { display: false },
      },
    },
    ...overrides,
  };
}

const WIND_SL = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];

export function windLabel(deg) {
  if (deg == null || Number.isNaN(deg)) return '—';
  const i = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return WIND_SL[i];
}

export function weatherKind(reading) {
  if (!reading) return 'unknown';
  const { precipRate, solar, temp } = reading;
  if (precipRate != null && precipRate > 0.1) return 'rain';
  if (temp != null && temp < 2 && (reading.humidity ?? 0) > 85) return 'fog';
  if (solar != null && solar > 400) return 'sunny';
  if (solar != null && solar > 80) return 'partly';
  if (solar != null && solar > 0) return 'cloudy';
  return 'night';
}

const ICONS = {
  sunny: '☀️',
  partly: '⛅',
  cloudy: '☁️',
  rain: '🌧️',
  fog: '🌫️',
  night: '🌙',
  unknown: '🌡️',
};

export function weatherIcon(kind) {
  return ICONS[kind] || ICONS.unknown;
}

export function formatTime(date, opts = {}) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('sl-SI', {
    timeZone: 'Europe/Ljubljana',
    ...opts,
  }).format(date);
}

export function formatTemp(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}°`;
}

export function formatNum(v, unit = '', digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}${unit}`;
}

/** Dnevni min/max iz urnih meritev */
const dayKeyFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' });

export function dayKey(date) {
  return dayKeyFmt.format(date);
}

/** Dnevna agregacija za zgodovino */
export function aggregateByDay(readings, initialPrecipTotal = null) {
  const days = new Map();

  for (const r of readings) {
    if (!r.time) continue;
    const key = dayKey(r.time);
    let d = days.get(key);
    if (!d) {
      d = {
        key,
        date: new Date(r.time.getFullYear(), r.time.getMonth(), r.time.getDate()),
        temps: [],
        humidity: [],
        windGust: [],
        windSpeed: [],
        precipTotal: null,
        solar: [],
      };
      days.set(key, d);
    }
    if (r.temp != null) d.temps.push(r.temp);
    if (r.humidity != null) d.humidity.push(r.humidity);
    if (r.windGust != null) d.windGust.push(r.windGust);
    if (r.windSpeed != null) d.windSpeed.push(r.windSpeed);
    if (r.solar != null) d.solar.push(r.solar);
    if (r.precipTotal != null) d.precipTotal = r.precipTotal;
  }

  const sorted = [...days.values()].sort((a, b) => a.date - b.date);
  let prevPrecip = initialPrecipTotal;

  return sorted.map((d) => {
    const rain =
      d.precipTotal != null && prevPrecip != null
        ? Math.max(0, d.precipTotal - prevPrecip)
        : null;
    if (d.precipTotal != null) prevPrecip = d.precipTotal;

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    return {
      key: d.key,
      date: d.date,
      min: d.temps.length ? Math.min(...d.temps) : null,
      max: d.temps.length ? Math.max(...d.temps) : null,
      avg: avg(d.temps),
      humidity: avg(d.humidity),
      windMax: d.windGust.length ? Math.max(...d.windGust) : null,
      windAvg: avg(d.windSpeed),
      rain,
      precipTotal: d.precipTotal,
    };
  });
}

export function monthSummary(daily) {
  const temps = daily.flatMap((d) => [d.min, d.max].filter((v) => v != null));
  const rains = daily.map((d) => d.rain).filter((v) => v != null);
  return {
    days: daily.length,
    min: temps.length ? Math.min(...temps) : null,
    max: temps.length ? Math.max(...temps) : null,
    avg: daily.filter((d) => d.avg != null).length
      ? daily.reduce((s, d) => s + d.avg, 0) / daily.filter((d) => d.avg != null).length
      : null,
    rainTotal: rains.length ? rains.reduce((a, b) => a + b, 0) : null,
    rainyDays: rains.filter((r) => r > 0.1).length,
  };
}

export function dailyStats(readings) {
  const byDay = new Map();
  for (const r of readings) {
    if (!r.time || r.temp == null) continue;
    const key = dayKey(r.time);
    const cur = byDay.get(key) || { min: r.temp, max: r.temp, label: key };
    cur.min = Math.min(cur.min, r.temp);
    cur.max = Math.max(cur.max, r.temp);
    byDay.set(key, cur);
  }
  return [...byDay.values()].slice(-7);
}

export function last24h(readings) {
  if (!readings.length) return [];
  const end = readings[readings.length - 1].time?.getTime() ?? Date.now();
  const start = end - 24 * 60 * 60 * 1000;
  return readings.filter((r) => r.time && r.time.getTime() >= start);
}

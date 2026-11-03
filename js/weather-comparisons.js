import { PRESSURE_TREND_HPA } from './weather-thresholds.js';

const TZ = 'Europe/Ljubljana';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });

function sameLocalDay(a, b) {
  return dayFmt.format(a) === dayFmt.format(b);
}

/**
 * Primerjava s približno isto uro včeraj (± toleranceMin).
 */
export function compareWithYesterday(readings, latest, toleranceMin = 45) {
  if (!latest?.time || latest.temp == null || !readings?.length) return null;
  const target = latest.time.getTime() - 24 * 3600_000;
  let best = null;
  let bestDiff = Infinity;
  for (const r of readings) {
    if (!r.time || r.temp == null) continue;
    const diff = Math.abs(r.time.getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  if (!best || bestDiff > toleranceMin * 60_000) return null;

  const dTemp = latest.temp - best.temp;
  const dWind = (latest.windSpeed ?? null) != null && best.windSpeed != null
    ? (latest.windSpeed - best.windSpeed) * 3.6
    : null;
  const dHum = latest.humidity != null && best.humidity != null
    ? latest.humidity - best.humidity
    : null;

  const lines = [];
  if (Math.abs(dTemp) >= 0.5) {
    lines.push(dTemp > 0
      ? `+${dTemp.toFixed(1)} °C topleje kot včeraj ob tej uri`
      : `${dTemp.toFixed(1)} °C hladneje kot včeraj ob tej uri`);
  }
  if (dWind != null && Math.abs(dWind) >= 4) {
    lines.push(dWind > 0
      ? `${Math.round(dWind)} km/h bolj vetrovno`
      : `${Math.round(Math.abs(dWind))} km/h manj vetrovno`);
  }
  if (dHum != null && Math.abs(dHum) >= 8) {
    lines.push(dHum > 0
      ? `vlaga ${Math.round(dHum)} % višja`
      : `vlaga ${Math.round(Math.abs(dHum))} % nižja`);
  }
  if (!lines.length) {
    lines.push('Podobno kot včeraj ob tej uri.');
  }

  return {
    lines,
    yesterdayTime: best.time,
    dTemp,
    dWind,
    dHum,
  };
}

/**
 * Trend tlaka iz meritev (hPa / okno ur).
 */
export function pressureTrend(readings, hours = 6) {
  if (!readings?.length) return null;
  const withP = readings.filter((r) => r.time && r.pressure != null);
  if (withP.length < 2) return null;
  const latest = withP[withP.length - 1];
  const cutoff = latest.time.getTime() - hours * 3600_000;
  let oldest = null;
  for (const r of withP) {
    if (r.time.getTime() >= cutoff) {
      oldest = r;
      break;
    }
  }
  if (!oldest || oldest === latest) {
    oldest = withP[Math.max(0, withP.length - 8)];
  }
  const delta = latest.pressure - oldest.pressure;
  const spanH = Math.max(0.5, (latest.time - oldest.time) / 3600_000);
  const per6 = (delta / spanH) * 6;

  let label = 'stabilen';
  let arrow = '→';
  let cls = 'pressure--flat';
  if (per6 <= PRESSURE_TREND_HPA.strongDrop) {
    label = 'močno pada'; arrow = '↓↓'; cls = 'pressure--down-strong';
  } else if (per6 <= PRESSURE_TREND_HPA.drop) {
    label = 'pada'; arrow = '↓'; cls = 'pressure--down';
  } else if (per6 >= PRESSURE_TREND_HPA.strongRise) {
    label = 'močno raste'; arrow = '↑↑'; cls = 'pressure--up-strong';
  } else if (per6 >= PRESSURE_TREND_HPA.rise) {
    label = 'raste'; arrow = '↑'; cls = 'pressure--up';
  }

  return {
    current: latest.pressure,
    delta: per6,
    hours: 6,
    label,
    arrow,
    cls,
    text: `${Math.round(latest.pressure)} hPa · ${arrow} ${Math.abs(per6).toFixed(1)} hPa / 6h · ${label}`,
  };
}

/**
 * Povzetek 24h serije za nadpis grafa.
 */
export function chartDaySummary(readings) {
  if (!readings?.length) return null;
  let minT = null; let minAt = null;
  let maxT = null; let maxAt = null;
  let maxGust = null; let gustAt = null;
  let rainStart = null; let rainEnd = null;
  let rainMax = 0;

  for (const r of readings) {
    if (!r.time) continue;
    if (r.temp != null) {
      if (minT == null || r.temp < minT) { minT = r.temp; minAt = r.time; }
      if (maxT == null || r.temp > maxT) { maxT = r.temp; maxAt = r.time; }
    }
    if (r.windGust != null && (maxGust == null || r.windGust > maxGust)) {
      maxGust = r.windGust;
      gustAt = r.time;
    }
    if (r.precipTotal != null && r.precipTotal > rainMax) rainMax = r.precipTotal;
  }

  const fmt = (d) => d?.toLocaleTimeString('sl-SI', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  }) ?? '—';

  const parts = [];
  if (minT != null) parts.push(`Najhladneje ${minT.toFixed(1)} °C ob ${fmt(minAt)}`);
  if (maxT != null) parts.push(`najtopleje ${maxT.toFixed(1)} °C ob ${fmt(maxAt)}`);
  if (maxGust != null) parts.push(`sunki ${(maxGust * 3.6).toFixed(0)} km/h ob ${fmt(gustAt)}`);
  if (rainMax > 0.1) parts.push(`padavine ${rainMax < 1 ? rainMax.toFixed(1) : Math.round(rainMax)} mm`);

  void rainStart; void rainEnd; void sameLocalDay;
  return parts.length ? parts.join(' · ') : null;
}

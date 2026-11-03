/**
 * Deterministični »Danes na kratko« in »Kaj je danes pomembno?«.
 */
import { calcBoraJugo } from './bora.js';
import { RAIN_MM, ANOMALY_C, UV, msToKmh } from './weather-thresholds.js';

function rainTodayMm(readings) {
  if (!readings?.length) return 0;
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' });
  const today = fmt.format(new Date());
  let max = 0;
  for (const r of readings) {
    if (!r.time || r.precipTotal == null) continue;
    if (fmt.format(r.time) !== today) continue;
    if (r.precipTotal > max) max = r.precipTotal;
  }
  return max;
}

/**
 * Kratke točke za danes (max 4).
 * @returns {Array<{text:string, href?:string}>}
 */
export function buildTodayBullets({ latest, summary, readings, bora }) {
  const bullets = [];
  const rainMm = rainTodayMm(readings);
  const b = bora ?? calcBoraJugo(latest);
  const gustKmh = msToKmh(latest?.windGust);

  if (summary?.max != null) {
    bullets.push({ text: `do ${Math.round(summary.max)} °C`, href: './forecast.html#sec-danes' });
  } else if (latest?.temp != null) {
    bullets.push({ text: `zdaj ${latest.temp.toFixed(1)} °C` });
  }

  if (b?.type === 'burja' && b.score >= 2) {
    bullets.push({
      text: `${b.label.toLowerCase()} burja · sunki ~${gustKmh != null ? Math.round(gustKmh) : '—'} km/h`,
      href: './forecast.html#sec-veter',
    });
  } else if (b?.type === 'jugo' && b.score >= 2) {
    bullets.push({ text: `${b.label.toLowerCase()} jugo`, href: './forecast.html#sec-veter' });
  } else if (gustKmh != null && gustKmh >= 40) {
    bullets.push({
      text: `sunki do ~${Math.round(gustKmh)} km/h`,
      href: './forecast.html#sec-veter',
    });
  }

  if (rainMm >= RAIN_MM.significant) {
    bullets.push({
      text: `padavine danes ${rainMm < 10 ? rainMm.toFixed(1) : Math.round(rainMm)} mm`,
      href: './forecast.html#sec-radar',
    });
  } else if (rainMm < RAIN_MM.notable && (latest?.precipRate ?? 0) < 0.2) {
    bullets.push({ text: 'brez večjih padavin', href: './forecast.html#sec-radar' });
  } else if (rainMm >= RAIN_MM.notable) {
    bullets.push({
      text: `rahle padavine (${rainMm.toFixed(1)} mm)`,
      href: './forecast.html#sec-radar',
    });
  }

  if (summary?.min != null && summary?.max != null && summary.max - summary.min >= 10) {
    bullets.push({
      text: `veliko nihanje T (${Math.round(summary.min)}–${Math.round(summary.max)} °C)`,
      href: './forecast.html#sec-danes',
    });
  }

  return bullets.slice(0, 4);
}

/**
 * Pametni poudarki – samo relevantno (max 4), z prioriteto in povezavami.
 * @param {{ anomalyDelta?: number|null, bbqScore?: number|null, mushroomScore?: number|null, seaTemp?: number|null }} extras
 */
export function buildImportantHighlights({ latest, summary, readings, bora, extras = {} }) {
  const scored = [];
  const rainMm = rainTodayMm(readings);
  const b = bora ?? calcBoraJugo(latest);
  const gustKmh = msToKmh(latest?.windGust) ?? 0;
  const raining = (latest?.precipRate ?? 0) > 0.2;

  if (b?.type === 'burja' && b.score >= 2) {
    scored.push({
      score: 90 + b.score * 2,
      icon: '🌬',
      text: `Burja · ${b.label.toLowerCase()}${gustKmh ? ` · sunki ~${Math.round(gustKmh)} km/h` : ''}`,
      href: './forecast.html#sec-veter',
    });
  } else if (b?.type === 'jugo' && b.score >= 2) {
    scored.push({
      score: 85 + b.score * 2,
      icon: '🌊',
      text: `Jugo · ${b.label.toLowerCase()}`,
      href: './forecast.html#sec-veter',
    });
  } else if (gustKmh >= 50) {
    scored.push({
      score: 88,
      icon: '💨',
      text: `Močni sunki ~${Math.round(gustKmh)} km/h`,
      href: './forecast.html#sec-veter',
    });
  } else if (extras.peakGustKmh != null && extras.peakGustKmh >= 50) {
    const when = extras.peakTimeLabel ? ` okoli ${extras.peakTimeLabel}` : '';
    scored.push({
      score: 87,
      icon: '💨',
      text: `Sunki se krepijo${when} (~${Math.round(extras.peakGustKmh)} km/h)`,
      href: './forecast.html#sec-veter',
    });
  }

  if (raining) {
    scored.push({ score: 86, icon: '🌧', text: 'Trenutno dežuje', href: './forecast.html#sec-radar' });
  } else if (rainMm >= RAIN_MM.significant) {
    scored.push({
      score: 80,
      icon: '🌧',
      text: `Danes že ${rainMm < 10 ? rainMm.toFixed(1) : Math.round(rainMm)} mm padavin`,
      href: './forecast.html#sec-radar',
    });
  } else if (rainMm < RAIN_MM.trace) {
    scored.push({ score: 40, icon: '🌤', text: 'Brez omembe vrednega dežja', href: './forecast.html#sec-radar' });
  }

  const dAnom = extras.anomalyDelta;
  if (dAnom != null && Math.abs(dAnom) >= ANOMALY_C.notable) {
    scored.push({
      score: 70 + Math.min(15, Math.abs(dAnom) * 2),
      icon: '🌡',
      text: `${dAnom > 0 ? '+' : ''}${dAnom.toFixed(1)} °C glede na večletno povprečje`,
      href: './history.html',
    });
  }

  if (latest?.uv != null && latest.uv >= UV.high) {
    scored.push({
      score: 65,
      icon: '☀️',
      text: `Visok UV (${Math.round(latest.uv)})`,
      href: './forecast.html#sec-sonce',
    });
  }

  if (extras.seaTemp != null && Number.isFinite(extras.seaTemp)) {
    scored.push({
      score: 48,
      icon: '🌊',
      text: `Morje ~${Math.round(extras.seaTemp)} °C`,
      href: './forecast.html#sec-morje',
    });
  }

  if (extras.bbqScore != null && extras.bbqScore >= 7) {
    scored.push({ score: 55, icon: '🔥', text: `BBQ pogoji: zelo dobri (${extras.bbqScore.toFixed(1)}/10)` });
  }
  if (extras.mushroomScore != null && extras.mushroomScore >= 6.5) {
    scored.push({ score: 52, icon: '🍄', text: `Gobji indeks: ugoden (${extras.mushroomScore.toFixed(1)}/10)` });
  }

  if (latest?.temp != null && latest.temp <= 1) {
    scored.push({
      score: 84,
      icon: '❄️',
      text: 'Temperatura okoli ničle — pazite na poledico',
      href: './forecast.html#sec-dnevi',
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = [];
  for (const item of scored) {
    if (top.length >= 4) break;
    if (item.score < 45 && top.length >= 2) continue;
    top.push(item);
  }
  return top;
}

export { rainTodayMm };

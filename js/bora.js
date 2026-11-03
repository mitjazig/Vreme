/**
 * Burja / jugo indeks za Obalo (Rakitovec–Koper).
 * Burja: SV–V (približno 0–80°), jugo: JV–JZ (približno 100–200°).
 * Sunki v m/s (kot postaja). Open-Meteo napoved: km/h.
 */
import { GUST_MS, kmhToMs } from './weather-thresholds.js';

function inRange(deg, lo, hi) {
  if (deg == null || Number.isNaN(deg)) return false;
  const d = ((deg % 360) + 360) % 360;
  if (lo <= hi) return d >= lo && d <= hi;
  return d >= lo || d <= hi;
}

/** @param {number} gustMs */
export function gustLevel(gustMs) {
  if (gustMs == null) return { score: 0, label: '—', cls: '', intensity: 'mirno' };
  if (gustMs < GUST_MS.calm)  return { score: 1, label: 'Šibka', cls: 'bora--calm', intensity: 'šibko' };
  if (gustMs < GUST_MS.moderate) return { score: 2, label: 'Zmerna', cls: 'bora--mod', intensity: 'zmerno' };
  if (gustMs < GUST_MS.strong) return { score: 3, label: 'Močna', cls: 'bora--strong', intensity: 'močno' };
  if (gustMs < GUST_MS.severe) return { score: 4, label: 'Zelo močna', cls: 'bora--severe', intensity: 'zelo močno' };
  return { score: 5, label: 'Orkanska', cls: 'bora--extreme', intensity: 'zelo močno' };
}

function classifyDir(dir, gustMs) {
  const isBora = inRange(dir, 0, 80);
  const isJugo = inRange(dir, 100, 200);
  if (gustMs < GUST_MS.calm) return 'mirno';
  if (isBora) return 'burja';
  if (isJugo) return 'jugo';
  return 'mešan';
}

/**
 * @param {{ windDir?: number|null, windGust?: number|null, windSpeed?: number|null }} latest
 */
export function calcBoraJugo(latest) {
  if (!latest) return null;
  const dir = latest.windDir;
  const gust = latest.windGust ?? (latest.windSpeed != null ? latest.windSpeed * 1.3 : null);
  const speed = latest.windSpeed ?? null;
  if (gust == null && speed == null) return null;

  const isBora = inRange(dir, 0, 80);
  const isJugo = inRange(dir, 100, 200);
  const g = gust ?? speed ?? 0;
  const level = gustLevel(g);

  let type = 'mešan';
  let emoji = '💨';
  let tip = 'Veter ni tipična burja ali jugo.';
  if (isBora && g >= 5) {
    type = 'burja';
    emoji = '🌬️';
    tip = 'Hladen severovzhodnik s Krasa proti morju.';
  } else if (isJugo && g >= 5) {
    type = 'jugo';
    emoji = '🌊';
    tip = 'Topli južni veter z Jadrana — vlažen, pogosto z dežjem.';
  } else if (g < 5) {
    type = 'mirno';
    emoji = '😌';
    tip = 'Šibek veter ali brezvetrje.';
    return {
      type, emoji, tip,
      ...gustLevel(g),
      intensity: 'mirno',
      gustMs: g,
      dir,
      title: 'Mirno',
    };
  }

  const title = type === 'burja' ? `Burja · ${level.label}`
    : type === 'jugo' ? `Jugo · ${level.label}`
    : `Veter · ${level.label}`;

  return {
    type,
    emoji,
    tip,
    title,
    gustMs: g,
    speedMs: speed,
    dir,
    ...level,
  };
}

/**
 * Dopolni trenutno klasifikacijo z urno napovedjo vetra (Open-Meteo, km/h).
 * @param {ReturnType<typeof calcBoraJugo>} current
 * @param {Array<{time:Date, wind:number|null, gust:number|null, dir:number|null}>} hourly
 */
export function enrichBoraWithForecast(current, hourly) {
  if (!current) return null;
  if (!hourly?.length) {
    return { ...current, timeline: null, peak: null, trend: null };
  }

  const now = Date.now();
  const next18 = hourly
    .filter((h) => h.time && h.time.getTime() >= now - 30 * 60_000)
    .slice(0, 18);

  const typed = next18.map((h) => {
    const gustMs = kmhToMs(h.gust ?? h.wind ?? 0) ?? 0;
    const type = classifyDir(h.dir, gustMs);
    return { ...h, gustMs, type, level: gustLevel(gustMs) };
  });

  let peak = typed[0] ?? null;
  for (const h of typed) {
    if ((h.gustMs ?? 0) > (peak?.gustMs ?? 0)) peak = h;
  }

  const prefer = current.type === 'burja' || current.type === 'jugo' ? current.type : null;
  const relevant = prefer
    ? typed.filter((h) => h.type === prefer || h.gustMs >= GUST_MS.moderate)
    : typed;

  const fmt = (d) => d.toLocaleTimeString('sl-SI', {
    timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit',
  });

  const lines = [];
  lines.push(`trenutno: ${(current.intensity || current.label || '').toLowerCase() || '—'}`);

  // Okrepitev: prvi čas ko sunki zrastejo za ≥5 m/s nad trenutnimi
  const base = current.gustMs ?? 0;
  const ramp = relevant.find((h) => h.gustMs >= base + 5 && h.time.getTime() > now);
  if (ramp) lines.push(`okrepitev po ${fmt(ramp.time)}`);

  if (peak && peak.gustMs >= GUST_MS.calm) {
    lines.push(`najmočnejši sunki okoli ${fmt(peak.time)} (~${Math.round(peak.gustMs * 3.6)} km/h)`);
  }

  // Slabenje: po vrhu, ko pade pod zmerno
  if (peak) {
    const after = typed.filter((h) => h.time > peak.time);
    const ease = after.find((h) => h.gustMs < GUST_MS.moderate);
    if (ease && peak.gustMs >= GUST_MS.moderate) {
      lines.push(`slabenje po ${fmt(ease.time)}`);
    }
  }

  let trend = 'stabilno';
  if (ramp && peak && peak.gustMs > base + 3) trend = 'krepi se';
  else if (peak && peak.time.getTime() <= now + 3600_000 && typed.at(-1)?.gustMs < base - 3) {
    trend = 'slabi';
  } else if (typed.length >= 3) {
    const mid = typed[Math.floor(typed.length / 2)]?.gustMs ?? base;
    const end = typed.at(-1)?.gustMs ?? base;
    if (end > mid + 3) trend = 'krepi se';
    else if (end < mid - 3) trend = 'slabi';
  }

  return {
    ...current,
    peak: peak
      ? { time: peak.time, gustMs: peak.gustMs, gustKmh: Math.round(peak.gustMs * 3.6) }
      : null,
    trend,
    timeline: lines,
  };
}

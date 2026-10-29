/**
 * Gobji indeks – heuristika po dežju, temperaturi in sezoni (Kras / Rakitovec).
 * Ni uradna napoved; micelij + lokalni gozd odločita. Open-Meteo past 21 dni.
 */

const LAT = 45.469639;
const LON = 13.971358;

/** Sezonska utež (1 = vrh, Kras) */
const SEASON = {
  1: 0.05, 2: 0.08, 3: 0.2, 4: 0.4,
  5: 0.7, 6: 0.55, 7: 0.45, 8: 0.75,
  9: 1, 10: 1, 11: 0.7, 12: 0.2,
};

const LEVELS = [
  { min: 8, emoji: '🍄', label: 'Odlično – v gozd!', color: '#22c55e' },
  { min: 6.5, emoji: '👍', label: 'Zelo dobro', color: '#86efac' },
  { min: 5, emoji: '🙂', label: 'Solidno', color: '#fde047' },
  { min: 3.5, emoji: '😐', label: 'Šibko', color: '#fb923c' },
  { min: 1.5, emoji: '😕', label: 'Slabo', color: '#f87171' },
  { min: 0, emoji: '💤', label: 'Ni sezona / suša', color: '#94a3b8' },
];

const SPECIES = [
  { name: 'Maslenke', after: [2, 4], t: [15, 20] },
  { name: 'Golobice', after: [3, 5], t: [12, 20] },
  { name: 'Lisičke', after: [4, 7], t: [16, 22] },
  { name: 'Jurčki', after: [7, 10], t: [15, 22] },
  { name: 'Siroke', after: [7, 12], t: [12, 18] },
];

function dayKey(d) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Ljubljana' });
}

function sumRain(days, fromAgo, toAgo) {
  // fromAgo..toAgo inclusive, 0 = today
  return days
    .filter((d) => d.ago >= fromAgo && d.ago <= toAgo)
    .reduce((s, d) => s + (d.rain || 0), 0);
}

function best2DayRain(days, fromAgo, toAgo) {
  const slice = days
    .filter((d) => d.ago >= fromAgo && d.ago <= toAgo)
    .sort((a, b) => a.ago - b.ago);
  let best = 0;
  for (let i = 0; i < slice.length; i++) {
    const a = slice[i].rain || 0;
    const b = slice[i + 1]?.rain || 0;
    best = Math.max(best, a, a + b);
  }
  return best;
}

function daysSinceRain(days, threshold = 5) {
  const past = days.filter((d) => d.ago >= 0).sort((a, b) => a.ago - b.ago);
  for (const d of past) {
    if ((d.rain || 0) >= threshold) return d.ago;
  }
  return null;
}

function tempFactor(days) {
  const last5 = days.filter((d) => d.ago >= 0 && d.ago <= 4 && d.avg != null);
  if (!last5.length) return { factor: 0.3, avg: null };

  const avg = last5.reduce((s, d) => s + d.avg, 0) / last5.length;
  const last3 = days.filter((d) => d.ago >= 0 && d.ago <= 2);
  const hotPeak = last3.some((d) => d.max != null && d.max >= 30);
  const hotStretch = days.filter((d) => d.ago >= 0 && d.ago <= 4 && d.max != null && d.max >= 27).length >= 3;
  const frost = last5.some((d) => d.min != null && d.min <= -2);

  if (frost) return { factor: 0, avg, note: 'Zmrzal ustavi rast' };
  let f = avg >= 10 && avg <= 18 ? 1 : avg >= 6 && avg <= 24 ? 0.7 : 0.2;
  if (hotPeak) f = Math.min(f, 0.3);
  if (hotStretch) f *= 0.7;
  return { factor: f, avg };
}

function moistureFactor(days) {
  const rain7 = sumRain(days, 0, 6);
  const rain14 = sumRain(days, 0, 13);
  const rain21 = sumRain(days, 0, 20);
  const soakIdeal = best2DayRain(days, 10, 21); // 14–21 dni okno + rob
  const soakMid = best2DayRain(days, 7, 14);
  const soakRecent = best2DayRain(days, 0, 7);

  let f = 0.15;
  let window = 'none';
  if (soakIdeal >= 12) { f = 1; window = 'ideal'; }
  else if (soakIdeal >= 6) { f = 0.75; window = 'ideal'; }
  else if (soakMid >= 12) { f = 0.65; window = 'mid'; }
  else if (soakMid >= 6) { f = 0.5; window = 'mid'; }
  else if (soakRecent >= 12) { f = 0.4; window = 'soon'; }
  else if (soakRecent >= 6) { f = 0.3; window = 'soon'; }
  else if (rain21 >= 20) { f = 0.45; window = 'spread'; }
  else if (rain21 >= 8) { f = 0.25; window = 'spread'; }

  // Sušenje listja po dobrem dežju
  if (window === 'ideal' || window === 'mid') {
    const after = days.filter((d) => d.ago >= 0 && d.ago <= 8 && d.max != null && d.max >= 27);
    if (after.length >= 3) f *= 0.55;
    else if (rain7 < 1 && rain14 >= 10) f *= 0.75;
  }

  if (rain21 < 3) f = Math.min(f, 0.12);

  return {
    factor: Math.max(0, Math.min(1, f)),
    rain7, rain14, rain21,
    soakIdeal, soakMid, soakRecent,
    window,
  };
}

function pickSpecies(daysSince, avgT) {
  if (daysSince == null || avgT == null) return [];
  return SPECIES.filter((s) => {
    const [a, b] = s.after;
    const [t0, t1] = s.t;
    return daysSince >= a && daysSince <= b + 2 && avgT >= t0 - 2 && avgT <= t1 + 2;
  }).map((s) => s.name);
}

function advice(score, moist, daysSince, seasonW, temp) {
  if (seasonW < 0.25) return 'Zunaj sezone za večino gob – počakajte pomlad/jesen.';
  if (temp.factor === 0) return temp.note || 'Zmrzal – počakajte toplejše dni.';
  if (moist.rain21 < 5) return 'Predolgo suho – potreben je dober dež (≥10–15 mm).';
  if (moist.window === 'soon' && (daysSince == null || daysSince <= 3)) {
    return 'Po svežem dežju: prve maslenke/golobice čez 2–4 dni, jurčki čez ~teden.';
  }
  if (daysSince != null && daysSince >= 7 && daysSince <= 14 && score >= 5) {
    return 'Okno za jurčke in večje gobe – preverite znane gozdove.';
  }
  if (daysSince != null && daysSince >= 3 && daysSince <= 6 && score >= 4) {
    return 'Čas za manjše gobe (maslenke, golobice, lisičke).';
  }
  if (moist.window === 'ideal' && moist.factor < 0.5) {
    return 'Bil je dober dež, a vročina/suša je oslabila rast.';
  }
  if (score >= 7) return 'Pogoji so ugodni – lokalni gozd odloči.';
  if (score >= 4) return 'Mešano – najboljši so senčni, vlažni predeli.';
  return 'Šibki pogoji – raje počakajte naslednji dež + blago vreme.';
}

/**
 * @param {{ date: Date, rain: number, avg: number|null, min: number|null, max: number|null }[]} daily
 */
export function calcMushroomIndex(daily, now = new Date()) {
  if (!daily?.length) return null;

  const today = dayKey(now);
  const days = daily.map((d) => {
    const key = dayKey(d.date);
    const t0 = new Date(`${today}T12:00:00`);
    const t1 = new Date(`${key}T12:00:00`);
    const ago = Math.round((t0 - t1) / 86_400_000);
    return { ...d, key, ago };
  }).filter((d) => d.ago >= 0 && d.ago <= 21);

  if (days.length < 5) return null;

  const month = now.getMonth() + 1;
  const seasonW = SEASON[month] ?? 0.5;
  const moist = moistureFactor(days);
  const temp = tempFactor(days);
  const since = daysSinceRain(days, 5);

  const raw = seasonW * moist.factor * temp.factor * 10;
  const score = Math.round(raw * 2) / 2; // 0.5 korak
  const level = LEVELS.find((l) => score >= l.min) ?? LEVELS.at(-1);
  const species = pickSpecies(since, temp.avg);

  return {
    score,
    level,
    seasonW,
    moist,
    temp,
    daysSinceRain: since,
    species,
    tip: advice(score, moist, since, seasonW, temp),
    source: 'Open-Meteo · Rakitovec',
  };
}

export async function fetchMushroomIndex() {
  const params = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'Europe/Ljubljana',
    past_days: '21',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const d = data.daily;
  if (!d?.time?.length) throw new Error('Ni dnevnih podatkov');

  const daily = d.time.map((t, i) => {
    const mean = d.temperature_2m_mean?.[i];
    const max = d.temperature_2m_max?.[i] ?? null;
    const min = d.temperature_2m_min?.[i] ?? null;
    return {
      date: new Date(`${t}T12:00:00`),
      rain: d.precipitation_sum?.[i] ?? 0,
      avg: mean != null ? mean : (max != null && min != null ? (max + min) / 2 : null),
      max,
      min,
    };
  });

  return calcMushroomIndex(daily);
}

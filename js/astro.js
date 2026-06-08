/**
 * astro.js – Astronomski izračuni brez API-ja
 * Postaja: IKOPER43 · Rakitovec, Slovenija
 *
 * Sončni vzhod/zahod: NOAA algoritem (Meeus, Astronomical Algorithms)
 * Lunine faze: sinodični period s kalibriranim referenčnim datumom
 */

export const STATION_LAT = 45.4837;  // Rakitovec °N
export const STATION_LON = 13.8806;  // Rakitovec °E

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ——— Interni pomočniki ———————————————————————————————————

function julianDate(ms) {
  return ms / 86_400_000 + 2_440_587.5;
}

// ——— SONCE ——————————————————————————————————————————————

/**
 * Izračuna sončni vzhod, zahod, poldne in dolžino dneva
 * @param {Date}   date  – datum (čas se ignorira)
 * @param {number} lat   – geografska širina v °N
 * @param {number} lon   – geografska dolžina v °E
 * @returns {{ sunrise: Date, sunset: Date, noon: Date, dayMinutes: number } | null}
 */
export function sunriseSunset(date, lat = STATION_LAT, lon = STATION_LON) {
  const dayStart = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const JD = julianDate(dayStart);
  const T  = (JD - 2_451_545.0) / 36_525; // julijansko stoletje

  // Geometrijska srednja dolžina in anomalija Sonca
  const L0  = ((280.46646 + T * (36_000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M   = 357.52911 + T * (35_999.05029 - 0.0001537 * T);
  const Mr  = M * DEG;

  // Enačba centra
  const C = Math.sin(Mr)     * (1.914602 - T * (0.004817 + 0.000014 * T))
          + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T)
          + Math.sin(3 * Mr) * 0.000289;

  // Navidezna dolžina Sonca
  const omega  = 125.04 - 1_934.136 * T;
  const lambda = (L0 + C) - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  // Naklon ekliptike in deklinacija
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps  = eps0 + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG)) * RAD;

  // Enačba časa (minute)
  const ey   = Math.tan((eps / 2) * DEG) ** 2;
  const L0r  = L0 * DEG;
  const e    = 0.016_708_634;
  const eqT  = 4 * RAD * (
    ey * Math.sin(2 * L0r)
    - 2 * e * Math.sin(Mr)
    + 4 * e * ey * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * ey ** 2 * Math.sin(4 * L0r)
    - 1.25 * e ** 2 * Math.sin(2 * Mr)
  );

  // Kotni kot vzhoda (90.833° = polmer diska + atmosferska refrakcija)
  const cosHa = (Math.cos(90.833 * DEG) - Math.sin(lat * DEG) * Math.sin(decl * DEG))
              / (Math.cos(lat * DEG) * Math.cos(decl * DEG));

  if (cosHa > 1 || cosHa < -1) return null; // polarni dan ali noč

  const ha = Math.acos(cosHa) * RAD;

  // Časi v minutah od UTC polnoči
  const noonMin = 720 - 4 * lon - eqT;
  const riseMin = noonMin - 4 * ha;
  const setMin  = noonMin + 4 * ha;

  return {
    sunrise:    new Date(dayStart + riseMin * 60_000),
    sunset:     new Date(dayStart + setMin  * 60_000),
    noon:       new Date(dayStart + noonMin * 60_000),
    dayMinutes: Math.round(setMin - riseMin),
    riseMin,
    setMin,
    noonMin,
  };
}

/**
 * Zlata ura – 60 min po vzhodu in pred zahodom
 */
export function goldenHour(sunrise, sunset) {
  if (!sunrise || !sunset) return null;
  return {
    mornStart: sunrise,
    mornEnd:   new Date(sunrise.getTime() + 60 * 60_000),
    evStart:   new Date(sunset.getTime()  - 60 * 60_000),
    evEnd:     sunset,
  };
}

// ——— LUNA ——————————————————————————————————————————————

/**
 * Faza lune za dani datum
 * Referenca: mlaj 6. jan 2000, 18:14 UTC → JD 2451550.259
 */
export function moonPhase(date = new Date()) {
  const SYNODIC    = 29.530_588_67;
  const KNOWN_NEW  = 2_451_550.259;

  const JD    = julianDate(date.getTime());
  const phase = ((JD - KNOWN_NEW) % SYNODIC + SYNODIC) % SYNODIC;
  const illum = Math.round((1 - Math.cos(2 * Math.PI * phase / SYNODIC)) / 2 * 100);

  let name, emoji;
  if      (phase <  1.85) { name = 'Mlaj';               emoji = '🌑'; }
  else if (phase <  7.38) { name = 'Naraščajoči srp';    emoji = '🌒'; }
  else if (phase <  9.22) { name = 'Prva četrtina';      emoji = '🌓'; }
  else if (phase < 14.75) { name = 'Naraščajoč polmesec'; emoji = '🌔'; }
  else if (phase < 16.61) { name = 'Polna luna';         emoji = '🌕'; }
  else if (phase < 22.15) { name = 'Pojemajoč polmesec'; emoji = '🌖'; }
  else if (phase < 23.99) { name = 'Zadnja četrtina';    emoji = '🌗'; }
  else                    { name = 'Pojemajoči srp';     emoji = '🌘'; }

  const daysToFull = ((14.75 - phase) % SYNODIC + SYNODIC) % SYNODIC;
  const daysToNew  = ((      - phase) % SYNODIC + SYNODIC) % SYNODIC;

  // Naslednja polna luna in mlaj (Date)
  const msToFull = daysToFull * 86_400_000;
  const msToNew  = daysToNew  * 86_400_000;

  return {
    phase,
    illum,
    name,
    emoji,
    daysToFull: +daysToFull.toFixed(1),
    daysToNew:  +daysToNew.toFixed(1),
    nextFull:   new Date(date.getTime() + msToFull),
    nextNew:    new Date(date.getTime() + msToNew),
    /** Vpliv na plimo: spring (polna/mlaj) ali neap (četrtini) */
    tideEffect: (phase < 2 || Math.abs(phase - 14.75) < 2) ? 'spring'
              : (Math.abs(phase - 7.38) < 2 || Math.abs(phase - 22.15) < 2) ? 'neap'
              : 'normal',
  };
}

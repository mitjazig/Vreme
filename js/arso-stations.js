/**
 * arso-stations.js – Podatki iz ARSO postaj za Slovenijo
 * Dva feeda: sinoptične postaje + avtomatske (AMS)
 * Brezplačen javen XML, CORS dostopen.
 */

const ARSO_SYN_URL = 'https://meteo.arso.gov.si/uploads/probase/www/observ/surface/text/sl/observation_si_latest.xml';
const ARSO_AMS_URL = 'https://meteo.arso.gov.si/uploads/probase/www/observ/surface/text/sl/observationAms_si_latest.xml';

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const ICON_MAP = [
  ['clear',       '☀️'],
  ['sunny',       '☀️'],
  ['lightFG',     '🌫️'],
  ['FG',          '🌫️'],
  ['fog',         '🌫️'],
  ['snow',        '❄️'],
  ['sleet',       '🌨️'],
  ['thunder',     '⛈️'],
  ['storm',       '⛈️'],
  ['heavyRain',   '🌧️'],
  ['rain',        '🌧️'],
  ['lightRain',   '🌦️'],
  ['showers',     '🌦️'],
  ['overcast',    '☁️'],
  ['modCloudy',   '🌥️'],
  ['cloudy',      '🌥️'],
  ['mcloudy',     '🌥️'],
  ['pcloudy',     '⛅'],
  ['mostlyClear', '🌤️'],
];

export function arsoIcon(name) {
  if (!name) return '🌡️';
  const n = name.toLowerCase();
  for (const [key, emoji] of ICON_MAP) {
    if (n.includes(key.toLowerCase())) return emoji;
  }
  return '🌡️';
}

function txt(el, tag) {
  const v = el.querySelector(tag)?.textContent?.trim();
  return v || null;
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function parseSyn(doc) {
  const stations = [];
  for (const m of doc.querySelectorAll('metData')) {
    const lat = num(txt(m, 'domain_lat'));
    const lon = num(txt(m, 'domain_lon'));
    if (lat == null || lon == null) continue;
    stations.push({
      name:     txt(m, 'domain_longTitle') || txt(m, 'domain_title') || '?',
      short:    txt(m, 'domain_title') || '?',
      lat, lon,
      temp:     num(txt(m, 't')),
      tempMax:  null,
      tempMin:  null,
      humidity: num(txt(m, 'rh')),
      windKmh:  num(txt(m, 'ff_val_kmh')),
      windDir:  txt(m, 'dd_shortText'),
      gustKmh:  num(txt(m, 'ffmax_val_kmh')),
      icon:     txt(m, 'nn_icon'),
      desc:     txt(m, 'nn_shortText'),
      pressure: num(txt(m, 'msl')),
      rain:     num(txt(m, 'rr24h_val')),
      solar:    null,
      updated:  txt(m, 'valid'),
      type:     'syn',
    });
  }
  return stations;
}

function parseAms(doc) {
  const stations = [];
  for (const m of doc.querySelectorAll('metData')) {
    const lat = num(txt(m, 'domain_lat'));
    const lon = num(txt(m, 'domain_lon'));
    if (lat == null || lon == null) continue;
    // Icon field name differs in AMS feed
    const icon = txt(m, 'nn_icon-wwsyn_icon') || txt(m, 'nn_icon');
    stations.push({
      name:     txt(m, 'domain_longTitle') || txt(m, 'domain_title') || '?',
      short:    txt(m, 'domain_title') || '?',
      lat, lon,
      temp:     num(txt(m, 't')),
      tempMax:  num(txt(m, 'tx')),
      tempMin:  num(txt(m, 'tn')),
      humidity: num(txt(m, 'rh')),
      windKmh:  num(txt(m, 'ff_val_kmh')),
      windDir:  txt(m, 'dd_shortText'),
      gustKmh:  num(txt(m, 'ffmax_val_kmh')),
      icon,
      desc:     null,
      pressure: num(txt(m, 'msl')),
      rain:     num(txt(m, 'rr_val')),
      solar:    num(txt(m, 'gSunRad')),
      updated:  txt(m, 'valid'),
      type:     'ams',
    });
  }
  return stations;
}

async function fetchXml(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ARSO HTTP ${res.status}`);
  const xml = await res.text();
  return new DOMParser().parseFromString(xml, 'text/xml');
}

/** Vse postaje za Slovenijo (oba feeda združena) */
export async function fetchAllArsoStations() {
  const [synDoc, amsDoc] = await Promise.all([
    fetchXml(ARSO_SYN_URL),
    fetchXml(ARSO_AMS_URL),
  ]);
  const syn = parseSyn(synDoc);
  const ams = parseAms(amsDoc);

  // Dedupliciraj: če AMS postaja leži < 2 km od sinoptične, ohrani sinoptično
  const combined = [...syn];
  for (const a of ams) {
    const duplicate = syn.some(s => haversine(s.lat, s.lon, a.lat, a.lon) < 2);
    if (!duplicate) combined.push(a);
  }
  return combined;
}

/** Najbližje postaje za dano lokacijo */
export async function fetchArsoStations(userLat, userLon, maxCount = 7, maxDistKm = 200) {
  const [synDoc, amsDoc] = await Promise.all([
    fetchXml(ARSO_SYN_URL),
    fetchXml(ARSO_AMS_URL).catch(() => null),
  ]);

  const syn = parseSyn(synDoc);
  const ams = amsDoc ? parseAms(amsDoc) : [];

  const combined = [...syn];
  for (const a of ams) {
    const duplicate = syn.some(s => haversine(s.lat, s.lon, a.lat, a.lon) < 2);
    if (!duplicate) combined.push(a);
  }

  return combined
    .map(s => ({ ...s, dist: Math.round(haversine(userLat, userLon, s.lat, s.lon)) }))
    .filter(s => s.dist <= maxDistKm)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxCount);
}

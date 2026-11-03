/**
 * Priljubljeni in nedavni kraji (localStorage, brez računa).
 */

const FAV_KEY = 'vreme_favs';
const RECENT_KEY = 'vreme_recent';
const MAX_FAVS = 12;
const MAX_RECENT = 6;

function safeParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function read(key) {
  try {
    return safeParse(localStorage.getItem(key), []);
  } catch {
    return [];
  }
}

function write(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function samePlace(a, b) {
  if (!a || !b) return false;
  if (a.name && b.name && a.name === b.name) return true;
  return Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
}

function normalize(place) {
  if (!place || place.lat == null || place.lon == null) return null;
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    name: String(place.name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`).slice(0, 80),
  };
}

export function getFavourites() {
  return read(FAV_KEY).map(normalize).filter(Boolean);
}

export function isFavourite(place) {
  const p = normalize(place);
  if (!p) return false;
  return getFavourites().some((f) => samePlace(f, p));
}

export function toggleFavourite(place) {
  const p = normalize(place);
  if (!p) return { ok: false, favourites: getFavourites(), added: false };
  let list = getFavourites();
  const idx = list.findIndex((f) => samePlace(f, p));
  let added = false;
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list = [p, ...list].slice(0, MAX_FAVS);
    added = true;
  }
  write(FAV_KEY, list);
  return { ok: true, favourites: list, added };
}

export function removeFavourite(place) {
  const p = normalize(place);
  if (!p) return getFavourites();
  const list = getFavourites().filter((f) => !samePlace(f, p));
  write(FAV_KEY, list);
  return list;
}

export function getRecent() {
  return read(RECENT_KEY).map(normalize).filter(Boolean);
}

export function pushRecent(place) {
  const p = normalize(place);
  if (!p) return getRecent();
  const list = [p, ...getRecent().filter((r) => !samePlace(r, p))].slice(0, MAX_RECENT);
  write(RECENT_KEY, list);
  return list;
}

export function clearRecent() {
  write(RECENT_KEY, []);
}

export function removeRecent(place) {
  const p = normalize(place);
  if (!p) return getRecent();
  const list = getRecent().filter((r) => !samePlace(r, p));
  write(RECENT_KEY, list);
  return list;
}

/** Query za lokacija.html */
export function lokacijaUrl({ lat, lon, name }) {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  if (name) q.set('name', name);
  return `./lokacija.html?${q.toString()}`;
}

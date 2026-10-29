/**
 * Na današnji dan – zgodovina (Wikipedia On This Day API)
 */

const CACHE_PREFIX = 'vreme-onthisday-v1-';

function dateKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}-${d}`;
}

/** Nekaj slovenskih / regionalnih dogodkov (dopolnilo k Wikipediji) */
const SI_EXTRA = {
  '06-25': [{ year: 1991, text: 'Slovenija razglasi neodvisnost.', kind: 'event', lang: 'sl' }],
  '10-05': [{ year: 1918, text: 'V Zagrebu ustanovljena Država Slovencev, Hrvatov in Srbov.', kind: 'event', lang: 'sl' }],
  '05-01': [{ year: 2004, text: 'Slovenija vstopi v Evropsko unijo.', kind: 'event', lang: 'sl' }],
  '03-29': [{ year: 2004, text: 'Slovenija vstopi v NATO.', kind: 'event', lang: 'sl' }],
  '12-23': [{ year: 1990, text: 'Plebiscit o samostojnosti Slovenije — večina za neodvisnost.', kind: 'event', lang: 'sl' }],
  '06-26': [{ year: 1991, text: 'Začetek desetdnevne vojne za Slovenijo.', kind: 'event', lang: 'sl' }],
  '10-31': [{ year: 1517, text: 'Martin Luther objavi 95 tez — začetek reformacije (praznik v Sloveniji).', kind: 'event', lang: 'sl' }],
  '11-01': [{ year: null, text: 'Dan spomina na mrtve — tradicionalni obisk pokopališč po Sloveniji.', kind: 'holiday', lang: 'sl' }],
  '02-08': [{ year: 1849, text: 'Umrl France Prešeren — Prešernov dan, slovenski kulturni praznik.', kind: 'death', lang: 'sl' }],
  '12-03': [{ year: 1800, text: 'Rojen France Prešeren, največji slovenski pesnik.', kind: 'birth', lang: 'sl' }],
  '04-27': [{ year: 1941, text: 'V Ljubljani ustanovljena OF — Osvobodilna fronta slovenskega naroda.', kind: 'event', lang: 'sl' }],
};

function normalizeWikiItem(item, kind) {
  const text = (item.text || '').trim();
  if (!text || text.length < 20) return null;
  const page = item.pages?.[0];
  return {
    year: item.year ?? null,
    text,
    kind,
    lang: 'en',
    url: page?.content_urls?.desktop?.page
      ?? (page?.titles?.normalized
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.titles.normalized.replace(/ /g, '_'))}`
        : null),
  };
}

function scoreItem(item) {
  // Bolj zanimivi: smrti znanih, vojne, odkritja; manj: zelo kratki / lokalni šport
  let s = 0;
  if (item.kind === 'selected') s += 5;
  if (item.kind === 'event') s += 3;
  if (item.kind === 'death') s += 4;
  if (item.kind === 'birth') s += 1;
  if (item.lang === 'sl') s += 6;
  if (item.year != null && item.year < 1900) s += 1;
  if (item.year != null && item.year >= 1900 && item.year < 2000) s += 2;
  const t = item.text.toLowerCase();
  if (/war|battle|empire|assass|died|death|invent|discover|earthquake|hurricane|independence|king|queen|emperor|ottoman|churchill|napoleon|vojn|umrl|bitka/.test(t)) s += 3;
  if (/football|soccer|cricket|baseball|nba|nhl/.test(t)) s -= 2;
  return s;
}

function pickInteresting(items, limit = 5) {
  const seen = new Set();
  const ranked = [...items]
    .filter((it) => {
      const key = `${it.year}|${it.text.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((it) => ({ ...it, _score: scoreItem(it) }))
    .sort((a, b) => b._score - a._score || (b.year ?? 0) - (a.year ?? 0));

  // Raznolikost: max 2 smrti, vsaj 1 dogodek če obstaja
  const out = [];
  let deaths = 0;
  for (const it of ranked) {
    if (out.length >= limit) break;
    if (it.kind === 'death' && deaths >= 2) continue;
    if (it.kind === 'death') deaths++;
    out.push(it);
  }
  return out.map(({ _score, ...rest }) => rest);
}

export async function fetchOnThisDay(date = new Date()) {
  const key = dateKey(date);
  try {
    const cached = sessionStorage.getItem(CACHE_PREFIX + key);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }

  const [m, d] = key.split('-');
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${m}/${d}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Api-User-Agent': 'VremePWA/1.7 (https://localhost; weather station IKOPER43)',
    },
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = await res.json();

  const items = [];
  for (const it of data.selected ?? []) {
    const n = normalizeWikiItem(it, 'selected');
    if (n) items.push(n);
  }
  for (const it of data.events ?? []) {
    const n = normalizeWikiItem(it, 'event');
    if (n) items.push(n);
  }
  for (const it of data.deaths ?? []) {
    const n = normalizeWikiItem(it, 'death');
    if (n) items.push(n);
  }
  for (const it of data.births ?? []) {
    const n = normalizeWikiItem(it, 'birth');
    if (n) items.push(n);
  }

  const extras = SI_EXTRA[key] ?? [];
  const picked = pickInteresting([...extras, ...items], 5);
  const payload = {
    key,
    items: picked,
    source: 'Wikipedia · On this day',
  };

  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(payload));
  } catch { /* ignore */ }

  return payload;
}

export function kindLabel(kind) {
  return {
    selected: 'Dogodek',
    event: 'Dogodek',
    death: 'Smrt',
    birth: 'Rojstvo',
    holiday: 'Praznik',
  }[kind] ?? 'Zgodovina';
}

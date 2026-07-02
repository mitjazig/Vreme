/**
 * Meteoalarm opozorila za Slovenijo
 */

const FEED_URL = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovenia';

function colorFromTitle(title) {
  const t = (title ?? '').toLowerCase();
  if (t.includes('violet') || t.includes('purple')) return 'violet';
  if (t.includes('red'))    return 'red';
  if (t.includes('orange')) return 'orange';
  return 'yellow';
}

export function alertCls(color)  { return `alert--${color ?? 'yellow'}`; }
export function alertLabel(color) {
  return { violet: 'Vijolično opozorilo', red: 'Rdeče opozorilo', orange: 'Oranžno opozorilo' }[color] ?? 'Rumeno opozorilo';
}

const EVENT_SL = {
  thunderstorm: 'Nevihte', rain: 'Dež', 'rain-flood': 'Padavine/poplave',
  flood: 'Poplave', wind: 'Veter', snow: 'Sneg', ice: 'Led', fog: 'Megla',
  heat: 'Vročina', cold: 'Mraz', avalanche: 'Plazovi', 'forest fire': 'Požar',
};
function translateEvent(ev) {
  if (!ev) return ev;
  const lower = ev.toLowerCase();
  for (const [en, sl] of Object.entries(EVENT_SL))
    if (lower.includes(en)) return sl;
  return ev;
}

function getText(str, tag) {
  const m = str.match(new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function parseAtom(xml) {
  const now = new Date();
  const seen = new Set();
  const results = [];
  let m;
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  while ((m = re.exec(xml)) !== null) {
    const e = m[1];
    const title   = getText(e, 'title');
    const expires = getText(e, 'expires');
    const event   = getText(e, 'event');
    const to = new Date(expires ?? 0);
    if (isNaN(to) || to <= now || to.getFullYear() < 2020) continue;
    const color  = colorFromTitle(title);
    const key    = `${color}:${translateEvent(event)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ title, event, eventSl: translateEvent(event), color, to });
  }
  const order = { violet: 0, red: 1, orange: 2, yellow: 3 };
  return results.sort((a, b) => (order[a.color] ?? 9) - (order[b.color] ?? 9));
}

export async function fetchAlerts() {
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(FEED_URL)}`;
  try {
    const res = await fetch(proxy, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) return null;          // null = prikaži fallback link
    let xml = await res.text();
    // allorigins včasih vrne JSON z base64
    if (xml.trim().startsWith('{')) {
      try {
        const j = JSON.parse(xml);
        const c = j.contents ?? '';
        xml = c.includes('base64,') ? atob(c.split('base64,')[1]) : c;
      } catch { return null; }
    }
    if (!xml.includes('<entry>')) return null;
    return parseAtom(xml);
  } catch {
    return null;    // timeout ali omrežna napaka → fallback link
  }
}

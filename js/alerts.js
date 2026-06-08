/**
 * Meteoalarm opozorila za Slovenijo
 * RSS feed – CORS-friendly
 */

const FEED_URL = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovenia';

// Barvni razredi po nivoju
const LEVEL_CLS = {
  'Minor':    'alert--yellow',
  'Moderate': 'alert--orange',
  'Severe':   'alert--red',
  'Extreme':  'alert--violet',
};

const LEVEL_LABEL = {
  'Minor':    'Rumeno opozorilo',
  'Moderate': 'Oranžno opozorilo',
  'Severe':   'Rdeče opozorilo',
  'Extreme':  'Vijolično opozorilo',
};

export async function fetchAlerts() {
  try {
    // Uporabimo allOrigins proxy ker Meteoalarm nima CORS headerjev
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(FEED_URL)}`;
    const res = await fetch(proxy, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return parseAtom(data.contents);
  } catch {
    return [];
  }
}

function parseAtom(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const entries = [...doc.querySelectorAll('entry')];
  const now = new Date();

  return entries
    .map((e) => {
      const title   = e.querySelector('title')?.textContent ?? '';
      const summary = e.querySelector('summary')?.textContent ?? '';
      const from    = new Date(e.querySelector('cap\\:effective, effective')?.textContent ?? 0);
      const to      = new Date(e.querySelector('cap\\:expires, expires')?.textContent ?? 0);
      const severity = e.querySelector('cap\\:severity, severity')?.textContent ?? 'Minor';
      const event    = e.querySelector('cap\\:event, event')?.textContent ?? '';

      return { title, summary, from, to, severity, event };
    })
    .filter((a) => a.to > now); // samo aktivni alarmi
}

export function alertCls(severity) {
  return LEVEL_CLS[severity] ?? 'alert--yellow';
}

export function alertLabel(severity) {
  return LEVEL_LABEL[severity] ?? 'Opozorilo';
}

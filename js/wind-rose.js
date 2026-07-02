/**
 * wind-rose.js – Veter roža iz zgodovinskih podatkov IKOPER43
 */
import { fetchMonthReadings } from './sheets.js';

const SPEED_BINS = [
  { maxKmh: 5,        color: '#38bdf8', label: '< 5' },
  { maxKmh: 15,       color: '#34d399', label: '5–15' },
  { maxKmh: 30,       color: '#fbbf24', label: '15–30' },
  { maxKmh: Infinity, color: '#f97316', label: '30+' },
];

const DIR16 = ['S','SSV','SV','VSV','V','VJV','JV','JJV','J','JJZ','JZ','ZJZ','Z','ZSZ','SZ','SSZ'];
const SECTORS = 16;
const SECTOR_DEG = 360 / SECTORS;

function processReadings(readings) {
  const bins = Array.from({ length: SECTORS }, () => new Array(SPEED_BINS.length).fill(0));
  let calms = 0, total = 0;

  for (const r of readings) {
    if (r.windDir == null || r.windSpeed == null) continue;
    total++;
    const kmh = r.windSpeed * 3.6;
    if (kmh < 1) { calms++; continue; }
    const si = Math.round(r.windDir / SECTOR_DEG) % SECTORS;
    const bi = SPEED_BINS.findIndex(b => kmh < b.maxKmh);
    bins[si][bi === -1 ? SPEED_BINS.length - 1 : bi]++;
  }

  return { bins, calms, total };
}

function buildSVG({ bins, calms, total }) {
  if (total === 0) return '<p style="padding:1rem;color:var(--muted);font-size:0.8rem">Ni podatkov</p>';

  const W = 300, H = 330, cx = 150, cy = 148, maxR = 100;

  const sectorTotals = bins.map(b => b.reduce((s, v) => s + v, 0));
  const maxPct = Math.max(...sectorTotals) / total * 100;
  const scale = maxR / (maxPct * 1.15);

  // Reference ring values
  const ringStep = maxPct > 20 ? 10 : maxPct > 10 ? 5 : 2;
  const rings = [];
  for (let p = ringStep; p < maxPct * 1.1; p += ringStep) rings.push(p);

  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Background circle
  s += `<circle cx="${cx}" cy="${cy}" r="${maxR + 6}" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;

  // Reference rings
  for (const p of rings) {
    const r = p * scale;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
    s += `<text x="${cx + 3}" y="${cy - r + 8}" font-size="7" fill="rgba(255,255,255,0.28)" font-family="DM Sans,sans-serif">${p}%</text>`;
  }

  // Cross lines
  for (const a of [0, 90]) {
    const rad = a * Math.PI / 180;
    s += `<line x1="${cx - (maxR + 8) * Math.sin(rad)}" y1="${cy - (maxR + 8) * Math.cos(rad)}" x2="${cx + (maxR + 8) * Math.sin(rad)}" y2="${cy + (maxR + 8) * Math.cos(rad)}" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>`;
  }

  // Sectors
  for (let si = 0; si < SECTORS; si++) {
    const angleDeg = si * SECTOR_DEG - 90; // 0=N=up
    const halfW = SECTOR_DEG / 2 * 0.82;
    let inner = 0;

    for (let bi = 0; bi < SPEED_BINS.length; bi++) {
      const cnt = bins[si][bi];
      if (cnt === 0) continue;
      const outer = inner + (cnt / total * 100) * scale;

      const a1 = (angleDeg - halfW) * Math.PI / 180;
      const a2 = (angleDeg + halfW) * Math.PI / 180;
      const largeArc = halfW * 2 > 180 ? 1 : 0;

      const ox1 = cx + outer * Math.cos(a1), oy1 = cy + outer * Math.sin(a1);
      const ox2 = cx + outer * Math.cos(a2), oy2 = cy + outer * Math.sin(a2);
      const ix1 = cx + inner * Math.cos(a1), iy1 = cy + inner * Math.sin(a1);
      const ix2 = cx + inner * Math.cos(a2), iy2 = cy + inner * Math.sin(a2);

      const path = inner < 1
        ? `M ${cx} ${cy} L ${ox1} ${oy1} A ${outer} ${outer} 0 ${largeArc} 1 ${ox2} ${oy2} Z`
        : `M ${ix1} ${iy1} A ${inner} ${inner} 0 ${largeArc} 1 ${ix2} ${iy2} L ${ox2} ${oy2} A ${outer} ${outer} 0 ${largeArc} 0 ${ox1} ${oy1} Z`;

      s += `<path d="${path}" fill="${SPEED_BINS[bi].color}" opacity="0.82"/>`;
      inner = outer;
    }
  }

  // Direction labels
  const LABEL_DIRS = [
    { si: 0, lbl: 'S', bold: true },
    { si: 4, lbl: 'V', bold: true },
    { si: 8, lbl: 'J', bold: true },
    { si: 12, lbl: 'Z', bold: true },
    { si: 2, lbl: 'SV', bold: false },
    { si: 6, lbl: 'JV', bold: false },
    { si: 10, lbl: 'JZ', bold: false },
    { si: 14, lbl: 'SZ', bold: false },
  ];
  for (const { si, lbl, bold } of LABEL_DIRS) {
    const a = (si * SECTOR_DEG - 90) * Math.PI / 180;
    const r = maxR + 17;
    s += `<text x="${cx + r * Math.cos(a)}" y="${cy + r * Math.sin(a)}" text-anchor="middle" dominant-baseline="middle" font-size="${bold ? 11 : 9}" font-weight="${bold ? 700 : 500}" fill="${bold ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'}" font-family="DM Sans,sans-serif">${lbl}</text>`;
  }

  // Calm center
  const calmPct = (calms / total * 100).toFixed(1);
  s += `<circle cx="${cx}" cy="${cy}" r="12" fill="rgba(56,189,248,0.2)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>`;
  s += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="rgba(255,255,255,0.75)" font-family="DM Sans,sans-serif">${calmPct}%</text>`;

  // Legend row
  const legY = cy + maxR + 22;
  const legW = SPEED_BINS.length * 62;
  const legX = cx - legW / 2;
  SPEED_BINS.forEach((b, i) => {
    const x = legX + i * 62;
    s += `<rect x="${x}" y="${legY}" width="9" height="9" rx="2" fill="${b.color}"/>`;
    s += `<text x="${x + 12}" y="${legY + 8}" font-size="8" fill="rgba(255,255,255,0.55)" font-family="DM Sans,sans-serif">${b.label} km/h</text>`;
  });

  // Stats row
  const domSi = sectorTotals.indexOf(Math.max(...sectorTotals));
  const calmR = calms / total * 100;
  s += `<text x="${cx}" y="${legY + 20}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.3)" font-family="DM Sans,sans-serif">${total} meritev · prevladujoč: ${DIR16[domSi]} · tišina: ${calmR.toFixed(0)}%</text>`;

  s += '</svg>';
  return s;
}

export async function initWindRose() {
  const el = document.getElementById('wind-rose-svg');
  if (!el) return;

  el.innerHTML = '<p style="padding:1rem;color:var(--muted);font-size:0.8rem">Nalagam…</p>';

  try {
    // Fetch current + previous 2 months
    const now = new Date();
    const months = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const results = await Promise.allSettled(
      months.map(m => fetchMonthReadings(m.year, m.month).then(r => r.readings ?? r))
    );

    const allReadings = results.flatMap(r => r.status === 'fulfilled' ? (Array.isArray(r.value) ? r.value : r.value.readings ?? []) : []);

    const data = processReadings(allReadings);
    el.innerHTML = buildSVG(data);

    // Period label
    const infoEl = document.getElementById('wind-rose-info');
    if (infoEl) {
      const oldest = months.at(-1);
      infoEl.textContent = `${oldest.month}/${oldest.year} – ${months[0].month}/${months[0].year}`;
    }
  } catch (err) {
    el.innerHTML = `<p style="padding:1rem;color:var(--muted);font-size:0.8rem">Napaka: ${err.message}</p>`;
  }
}

/**
 * Burja / jugo indeks za Obalo (Rakitovec–Koper).
 * Burja: SV–V (približno 0–80°), jugo: JV–JZ (približno 100–200°).
 * Sunki v m/s (kot postaja).
 */

function inRange(deg, lo, hi) {
  if (deg == null || Number.isNaN(deg)) return false;
  const d = ((deg % 360) + 360) % 360;
  if (lo <= hi) return d >= lo && d <= hi;
  return d >= lo || d <= hi;
}

/** @param {number} gustMs */
function gustLevel(gustMs) {
  if (gustMs == null) return { score: 0, label: '—', cls: '' };
  if (gustMs < 5)  return { score: 1, label: 'Šibka', cls: 'bora--calm' };
  if (gustMs < 10) return { score: 2, label: 'Zmerna', cls: 'bora--mod' };
  if (gustMs < 15) return { score: 3, label: 'Močna', cls: 'bora--strong' };
  if (gustMs < 20) return { score: 4, label: 'Zelo močna', cls: 'bora--severe' };
  return { score: 5, label: 'Orkanska', cls: 'bora--extreme' };
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
    dir,
    ...level,
  };
}

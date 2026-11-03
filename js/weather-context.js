/**
 * Lahki skupni kontekst Kopra za header na drugih straneh.
 */

const CTX_KEY = 'vreme_ctx_koper';
const MAX_AGE_MS = 30 * 60 * 1000;

export function saveWeatherContext( partial ) {
  try {
    const prev = loadWeatherContext(true) || {};
    const next = {
      ...prev,
      ...partial,
      place: partial.place || prev.place || 'Koper',
      savedAt: Date.now(),
    };
    localStorage.setItem(CTX_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

/**
 * @param {boolean} [ignoreAge]
 * @returns {{ place:string, temp?:number|null, gustKmh?:number|null, windTag?:string|null, alertCount?:number, savedAt:number }|null}
 */
export function loadWeatherContext(ignoreAge = false) {
  try {
    const raw = localStorage.getItem(CTX_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (!ignoreAge && data.savedAt && Date.now() - data.savedAt > MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function formatContextChip(ctx) {
  if (!ctx) return null;
  const parts = [];
  parts.push(ctx.place || 'Koper');
  if (ctx.temp != null && Number.isFinite(ctx.temp)) {
    parts.push(`${Number(ctx.temp).toFixed(1)} °C`);
  }
  if (ctx.windTag) {
    parts.push(ctx.windTag);
  } else if (ctx.gustKmh != null && Number.isFinite(ctx.gustKmh) && ctx.gustKmh >= 20) {
    parts.push(`sunki ${Math.round(ctx.gustKmh)} km/h`);
  }
  return parts.join(' · ');
}

/**
 * Weather Underground PWS – IKOPER43 (preko SW proxyja ./api/pws/…)
 * units=m → T °C, padavine mm, veter km/h, tlak hPa
 */

async function waitForSw(ms = 2500) {
  if (!('serviceWorker' in navigator)) return;
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(r, ms)),
    ]);
  } catch { /* ignore */ }
}

async function fetchPwsJson(kind) {
  await waitForSw();
  const res = await fetch(`./api/pws/${kind}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`PWS ${kind} HTTP ${res.status}`);
  return res.json();
}

function kmhToMs(v) {
  return v == null ? null : v / 3.6;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Trenutna meritev → enaka oblika kot sheets.normalizeReading */
export function normalizeCurrentObs(obs) {
  if (!obs) return null;
  const m = obs.metric ?? obs.imperial ?? {};
  const time = obs.obsTimeUtc ? new Date(obs.obsTimeUtc) : null;
  return {
    time,
    temp: num(m.temp),
    humidity: num(obs.humidity),
    windDir: num(obs.winddir),
    windSpeed: kmhToMs(num(m.windSpeed)),
    windGust: kmhToMs(num(m.windGust)),
    pressure: num(m.pressure),
    precipRate: num(m.precipRate),
    precipTotal: num(m.precipTotal),
    uv: num(obs.uv),
    solar: num(obs.solarRadiation),
    dewpt: num(m.dewpt),
    source: 'pws',
  };
}

/** Urna 7-dnevna → reading */
export function normalizeHourlyObs(obs) {
  if (!obs) return null;
  const m = obs.metric ?? {};
  const time = obs.obsTimeUtc ? new Date(obs.obsTimeUtc) : null;
  return {
    time,
    temp: num(m.tempAvg ?? m.tempHigh),
    humidity: num(obs.humidityAvg ?? obs.humidityHigh),
    windDir: num(obs.winddirAvg),
    windSpeed: kmhToMs(num(m.windspeedAvg)),
    windGust: kmhToMs(num(m.windgustHigh)),
    pressure: num(m.pressureMax ?? m.pressureMin),
    precipRate: num(m.precipRate),
    precipTotal: num(m.precipTotal),
    uv: num(obs.uvHigh),
    solar: num(obs.solarRadiationHigh),
    dewpt: num(m.dewptAvg),
    source: 'pws',
  };
}

export async function fetchPwsCurrent() {
  const data = await fetchPwsJson('current');
  return normalizeCurrentObs(data.observations?.[0]);
}

export async function fetchPwsHourly7() {
  const data = await fetchPwsJson('hourly7');
  return (data.observations ?? [])
    .map(normalizeHourlyObs)
    .filter((r) => r?.time)
    .sort((a, b) => a.time - b.time);
}

/** Vse meritve tekočega dneva (hitre točke, ne samo urne) */
export async function fetchPwsTodayLive() {
  const data = await fetchPwsJson('today');
  return (data.observations ?? [])
    .map(normalizeHourlyObs)
    .filter((r) => r?.time)
    .sort((a, b) => a.time - b.time);
}

/** Redčenje za grafe (max N točk, ohrani začetek/konec) */
export function decimateReadings(readings, maxPoints = 120) {
  if (!readings?.length || readings.length <= maxPoints) return readings ?? [];
  const step = Math.ceil(readings.length / maxPoints);
  const out = [];
  for (let i = 0; i < readings.length; i += step) out.push(readings[i]);
  const last = readings[readings.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function summaryFromReadings(readings) {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' });
  const today = fmt.format(new Date());
  const todayRows = readings.filter((r) => r.time && fmt.format(r.time) === today && r.temp != null);
  if (!todayRows.length) return {};
  const temps = todayRows.map((r) => r.temp);
  const latest = readings.filter((r) => r.temp != null).at(-1);
  let minAt = null;
  let maxAt = null;
  let min = Infinity;
  let max = -Infinity;
  for (const r of todayRows) {
    if (r.temp < min) { min = r.temp; minAt = r.time; }
    if (r.temp > max) { max = r.temp; maxAt = r.time; }
  }
  return {
    current: latest?.temp ?? null,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    minAt,
    maxAt,
  };
}

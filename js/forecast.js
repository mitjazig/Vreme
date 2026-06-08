/**
 * Open-Meteo napoved za Koper
 * https://open-meteo.com – brez API ključa, CORS-friendly
 */

const LAT = 45.5547;
const LON = 13.7282;

const WMO_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

const WMO_LABELS = {
  0: 'Jasno', 1: 'Pretežno jasno', 2: 'Delno oblačno', 3: 'Oblačno',
  45: 'Megla', 48: 'Ivje',
  51: 'Rahel dež', 53: 'Zmerni dež', 55: 'Močan dež',
  61: 'Rahel dež', 63: 'Zmerni dež', 65: 'Močan dež',
  71: 'Rahel sneg', 73: 'Zmerni sneg', 75: 'Močan sneg',
  80: 'Plohe', 81: 'Močne plohe', 82: 'Nevihte s plohami',
  95: 'Nevihta', 96: 'Nevihta s točo', 99: 'Močna nevihta',
};

export function wmoIcon(code) {
  return WMO_ICONS[code] ?? '🌡️';
}

export function wmoLabel(code) {
  return WMO_LABELS[code] ?? '—';
}

export async function fetchHourlyForecast() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    hourly: ['temperature_2m', 'weather_code', 'precipitation', 'precipitation_probability'].join(','),
    timezone: 'Europe/Ljubljana',
    forecast_days: '3',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();

  const { hourly } = json;
  const now = new Date();
  let lastDate = null;

  return hourly.time
    .map((t, i) => {
      const time = new Date(t);
      const dateKey = time.toLocaleDateString('sl-SI', { timeZone: 'Europe/Ljubljana' });
      const isNewDay = dateKey !== lastDate;
      if (isNewDay) lastDate = dateKey;
      return {
        time,
        temp: hourly.temperature_2m[i],
        code: hourly.weather_code[i],
        precip: hourly.precipitation[i] ?? 0,
        precipProb: hourly.precipitation_probability[i],
        isNewDay,
      };
    })
    .filter((h) => h.time >= now);
}

/** Trenutna temperatura morja + 7-dnevna napoved */
export async function fetchSeaTemp() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    current: 'sea_surface_temperature',
    daily: 'sea_surface_temperature_max,sea_surface_temperature_min',
    timezone: 'Europe/Ljubljana',
    forecast_days: '7',
  });
  const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`);
  if (!res.ok) throw new Error(`Marine API HTTP ${res.status}`);
  const json = await res.json();
  const current = json.current?.sea_surface_temperature ?? null;
  const daily = json.daily?.time?.map((date, i) => ({
    date: new Date(date),
    max: json.daily.sea_surface_temperature_max?.[i] ?? null,
    min: json.daily.sea_surface_temperature_min?.[i] ?? null,
  })) ?? [];
  return { current, daily };
}

/** ——————— Plima / oseka ——————— */
// Harmonični model za Koper (Severni Jadran)
// Konstante: [hitrost °/h, amplituda m, faza °]
// Referenčna epoha: 2000-01-01 00:00 UTC
// Faza = G (lokalni zamik) − V0 − u pri epohi
const TIDE_CONST = [
  [28.9841042, 0.117, 147.2], // M2 – glavna lunarna polobroča
  [30.0000000, 0.062, 296.0], // S2 – glavna sončna polobroča
  [15.0410686, 0.074, 345.3], // K1 – lunarna dnevna
  [13.9430356, 0.038, 174.8], // O1 – lunarna dnevna
  [28.4397295, 0.022, 253.7], // N2 – večja lunarna eliptična
];
const TIDE_EPOCH = Date.UTC(2000, 0, 1);

export function calcTides(fromMs = Date.now(), hoursAhead = 36) {
  const STEP_MIN = 15;
  const points = [];
  for (let m = 0; m <= hoursAhead * 60; m += STEP_MIN) {
    const t = new Date(fromMs + m * 60_000);
    const hrs = (t.getTime() - TIDE_EPOCH) / 3_600_000;
    let h = 0;
    for (const [speed, amp, phase] of TIDE_CONST) {
      h += amp * Math.cos((speed * hrs - phase) * (Math.PI / 180));
    }
    points.push({ time: t, level: +h.toFixed(3) });
  }

  // Poišči vrhove (visoka/nizka voda)
  const extrema = [];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1].level, c = points[i].level, n = points[i + 1].level;
    if (c >= p && c >= n && c - Math.min(p, n) > 0.01) {
      extrema.push({ ...points[i], type: 'high' });
    } else if (c <= p && c <= n && Math.max(p, n) - c > 0.01) {
      extrema.push({ ...points[i], type: 'low' });
    }
  }
  return { points, extrema };
}

/** ——————— Kakovost zraka (Open-Meteo) ——————— */
export async function fetchAirQuality() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    current: ['european_aqi', 'pm10', 'pm2_5', 'nitrogen_dioxide', 'ozone'].join(','),
    hourly: ['european_aqi', 'pm10', 'pm2_5'].join(','),
    timezone: 'Europe/Ljubljana',
    forecast_days: '2',
  });
  const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
  if (!res.ok) throw new Error(`AQ API HTTP ${res.status}`);
  const json = await res.json();
  const c = json.current ?? {};
  return {
    aqi: c.european_aqi ?? null,
    pm10: c.pm10 ?? null,
    pm25: c.pm2_5 ?? null,
    no2: c.nitrogen_dioxide ?? null,
    ozone: c.ozone ?? null,
  };
}

export async function fetchForecast() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
    ].join(','),
    timezone: 'Europe/Ljubljana',
    forecast_days: '7',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();

  const { daily } = json;
  return daily.time.map((date, i) => ({
    date: new Date(date),
    code: daily.weather_code[i],
    max: daily.temperature_2m_max[i],
    min: daily.temperature_2m_min[i],
    rain: daily.precipitation_sum[i],
    rainProb: daily.precipitation_probability_max[i],
  }));
}

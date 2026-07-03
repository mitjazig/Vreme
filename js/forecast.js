/**
 * Open-Meteo napoved za Koper
 * https://open-meteo.com – brez API ključa, CORS-friendly
 */

const LAT = 45.4837; // Rakitovec
const LON = 13.8806; // Rakitovec

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
    hourly: ['temperature_2m', 'apparent_temperature', 'weather_code', 'precipitation', 'precipitation_probability'].join(','),
    timezone: 'Europe/Ljubljana',
    forecast_days: '5',
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
        temp:       hourly.temperature_2m[i],
        feel:       hourly.apparent_temperature?.[i] ?? null,
        code:       hourly.weather_code[i],
        precip:     hourly.precipitation[i] ?? 0,
        precipProb: hourly.precipitation_probability[i],
        isNewDay,
      };
    })
    .filter((h) => h.time >= now);
}

/** Napoved vetra – 7 dni urno */
export async function fetchWindForecast() {
  const params = new URLSearchParams({
    latitude: LAT, longitude: LON,
    hourly: ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m'].join(','),
    timezone: 'Europe/Ljubljana',
    forecast_days: '7',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const { hourly } = await res.json();
  const now = new Date();
  return hourly.time
    .map((t, i) => ({
      time:  new Date(t),
      wind:  hourly.wind_speed_10m?.[i]      ?? null,
      gust:  hourly.wind_gusts_10m?.[i]      ?? null,
      dir:   hourly.wind_direction_10m?.[i]  ?? null,
    }))
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

/** ——————— Požarna nevarnost (FWI) ——————— */
export async function fetchFireDanger() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    daily: 'fire_weather_index',
    timezone: 'Europe/Ljubljana',
    forecast_days: '7',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Fire API HTTP ${res.status}`);
  const { daily } = await res.json();
  return (daily.time ?? []).map((date, i) => ({
    date: new Date(date),
    fwi: daily.fire_weather_index?.[i] ?? null,
  }));
}

/** ——————— Napoved za poljubno lokacijo (7 dni + urna) ——————— */
export async function fetchLocationForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      'temperature_2m', 'apparent_temperature', 'weather_code',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
      'relative_humidity_2m', 'surface_pressure',
    ].join(','),
    hourly: [
      'temperature_2m', 'apparent_temperature', 'weather_code',
      'precipitation', 'precipitation_probability',
      'wind_speed_10m', 'wind_gusts_10m',
      'snowfall', 'snow_depth', 'freezinglevel_height',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_sum', 'precipitation_probability_max',
      'wind_speed_10m_max', 'wind_gusts_10m_max', 'uv_index_max',
      'snowfall_sum', 'precipitation_hours',
    ].join(','),
    models: 'icon_seamless',   // ICON-D2 (2 km) kjer je na voljo, ICON-EU sicer
    timezone: 'auto',
    forecast_days: '7',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const { current, hourly, daily } = await res.json();

  const now = new Date();
  return {
    current: {
      temp:     current?.temperature_2m       ?? null,
      feel:     current?.apparent_temperature ?? null,
      code:     current?.weather_code         ?? null,
      wind:     current?.wind_speed_10m       ?? null,
      windDir:  current?.wind_direction_10m   ?? null,
      gust:     current?.wind_gusts_10m       ?? null,
      humidity: current?.relative_humidity_2m ?? null,
      pressure: current?.surface_pressure     ?? null,
    },
    hourly: (hourly?.time ?? [])
      .map((t, i) => {
        const time = new Date(t);
        return {
          time,
          temp:       hourly.temperature_2m?.[i]          ?? null,
          feel:       hourly.apparent_temperature?.[i]    ?? null,
          code:       hourly.weather_code?.[i]            ?? null,
          precip:     hourly.precipitation?.[i]           ?? 0,
          precipProb: hourly.precipitation_probability?.[i] ?? null,
          wind:       hourly.wind_speed_10m?.[i]          ?? null,
          gust:       hourly.wind_gusts_10m?.[i]          ?? null,
          snowfall:   hourly.snowfall?.[i]           ?? 0,
          snowDepth:  hourly.snow_depth?.[i]          ?? null,  // m
          freezeLevel: hourly.freezinglevel_height?.[i] ?? null, // m asl
        };
      })
      .filter(h => h.time >= now),
    daily: (daily?.time ?? []).map((date, i) => ({
      date:      new Date(date),
      code:      daily.weather_code?.[i]              ?? null,
      max:       daily.temperature_2m_max?.[i]        ?? null,
      min:       daily.temperature_2m_min?.[i]        ?? null,
      rain:      daily.precipitation_sum?.[i]         ?? 0,
      rainProb:  daily.precipitation_probability_max?.[i] ?? null,
      windMax:   daily.wind_speed_10m_max?.[i]        ?? null,
      gustMax:   daily.wind_gusts_10m_max?.[i]        ?? null,
      uvMax:     daily.uv_index_max?.[i]              ?? null,
      snow:      daily.snowfall_sum?.[i]           ?? 0,
      precipHrs: daily.precipitation_hours?.[i]    ?? null,
    })),
  };
}

/** ——————— Opozorila (izpeljana iz Open-Meteo napovedi) ——————— */
export async function fetchWarnings() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_sum', 'wind_gusts_10m_max', 'snowfall_sum',
    ].join(','),
    timezone: 'Europe/Ljubljana',
    forecast_days: '7',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { daily } = await res.json();

  const DAY_SL = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];
  const warnings = [];
  const nowHour = new Date().getHours();

  daily.time.forEach((date, i) => {
    // Danes preskočimo — trenutne razmere so vidne v ostalih karticah
    if (i === 0) return;
    const d = {
      date: new Date(date),
      code: daily.weather_code[i],
      max:  daily.temperature_2m_max[i]  ?? null,
      min:  daily.temperature_2m_min[i]  ?? null,
      rain: daily.precipitation_sum[i]   ?? 0,
      gust: daily.wind_gusts_10m_max[i]  ?? 0,
      snow: daily.snowfall_sum[i]        ?? 0,
    };
    const lbl = i === 0 ? 'Danes' : i === 1 ? 'Jutri' : DAY_SL[d.date.getDay()] + ' ' + d.date.getDate() + '.';

    if (d.code >= 95)
      warnings.push({ icon: '⛈️', title: 'Nevihta', desc: `${lbl} · ${WMO_LABELS[d.code] ?? ''}`, level: d.code >= 99 ? 'red' : d.code >= 96 ? 'orange' : 'yellow', day: i });

    if (d.gust >= 70)
      warnings.push({ icon: '💨', title: 'Sunki vetra', desc: `${lbl} · do ${Math.round(d.gust)} km/h`, level: d.gust >= 120 ? 'red' : d.gust >= 90 ? 'orange' : 'yellow', day: i });

    if (d.rain >= 30)
      warnings.push({ icon: '🌧️', title: 'Obilne padavine', desc: `${lbl} · ${d.rain.toFixed(0)} mm`, level: d.rain >= 100 ? 'red' : d.rain >= 60 ? 'orange' : 'yellow', day: i });

    if (d.max != null && d.max >= 35)
      warnings.push({ icon: '🌡️', title: 'Vročinski val', desc: `${lbl} · do ${Math.round(d.max)}°C`, level: d.max >= 40 ? 'red' : d.max >= 38 ? 'orange' : 'yellow', day: i });

    if (d.snow >= 20)
      warnings.push({ icon: '❄️', title: 'Obilno sneženje', desc: `${lbl} · ${d.snow.toFixed(0)} cm`, level: d.snow >= 60 ? 'red' : d.snow >= 40 ? 'orange' : 'yellow', day: i });
  });

  return warnings;
}

/** ——————— Windy – napoved valov (gfsWave) ——————— */
const WINDY_KEY = '58UhOvksR2vlquJJOYKnpoCAAfgscf9e';

export async function fetchWindyWaves() {
  const res = await fetch('https://api.windy.com/api/point-forecast/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: LAT, lon: LON,
      model: 'gfsWave',
      parameters: ['waves'],
      levels: ['surface'],
      key: WINDY_KEY,
    }),
  });
  if (!res.ok) throw new Error(`Windy HTTP ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.message ?? d.error);

  const now = Date.now();
  return d.ts
    .map((t, i) => ({
      time:   new Date(t),
      height: d['waves_height-surface'][i] ?? null,
      dir:    d['waves_direction-surface'][i] ?? null,
      period: d['waves_period-surface'][i] ?? null,
    }))
    .filter(p => p.time.getTime() >= now - 3_600_000)
    .slice(0, 16); // ~2 dni pri 3h korakih
}

/** ——————— Napoved za več lokacij hkrati ——————— */
export async function fetchMultiLocation(locations) {
  const lats = locations.map(l => l.lat).join(',');
  const lons = locations.map(l => l.lon).join(',');
  const params = new URLSearchParams({
    latitude: lats, longitude: lons,
    current: ['temperature_2m', 'weather_code', 'wind_speed_10m'].join(','),
    daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'].join(','),
    timezone: 'auto',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const results = Array.isArray(json) ? json : [json];
  return results.map((r, i) => ({
    ...locations[i],
    temp:   r.current?.temperature_2m ?? null,
    code:   r.current?.weather_code   ?? null,
    wind:   r.current?.wind_speed_10m ?? null,
    maxToday: r.daily?.temperature_2m_max?.[0] ?? null,
    minToday: r.daily?.temperature_2m_min?.[0] ?? null,
    rain:   r.daily?.precipitation_sum?.[0] ?? 0,
  }));
}

export async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
      { headers: { 'Accept-Language': 'sl' } }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const a = j.address ?? {};
    return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
  } catch {
    return null;
  }
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
      'sunrise',
      'sunset',
    ].join(','),
    timezone: 'Europe/Ljubljana',
    forecast_days: '7',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();

  const { daily } = json;
  return daily.time.map((date, i) => ({
    date:     new Date(date),
    code:     daily.weather_code[i],
    max:      daily.temperature_2m_max[i],
    min:      daily.temperature_2m_min[i],
    rain:     daily.precipitation_sum[i],
    rainProb: daily.precipitation_probability_max[i],
    sunrise:  daily.sunrise?.[i] ? new Date(daily.sunrise[i]) : null,
    sunset:   daily.sunset?.[i]  ? new Date(daily.sunset[i])  : null,
  }));
}

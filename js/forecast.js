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

import { SHEET, YEAR_SHEETS } from './config.js';

function gvizUrl({ gid, sheet, query }) {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET.id}/gviz/tq`;
  const params = new URLSearchParams({ tqx: 'out:json', headers: '1' });
  if (sheet) params.set('sheet', sheet);
  else params.set('gid', gid ?? SHEET.dataGid);
  if (query) params.set('tq', query);
  return `${base}?${params}`;
}

function sheetForYear(year) {
  const sheet = YEAR_SHEETS[year];
  if (!sheet) throw new Error(`Podatki za leto ${year} niso na voljo`);
  return sheet;
}

function parseGvizResponse(text) {
  const trimmed = text.trim();
  let payload = trimmed;

  const wrapped = trimmed.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\)\s*;?\s*$/);
  if (wrapped) {
    payload = wrapped[1];
  } else {
    payload = trimmed.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  }

  let json;
  try {
    json = JSON.parse(payload);
  } catch {
    throw new Error('Neveljaven odgovor Google Sheets');
  }

  if (json.status === 'error') {
    const detail = json.errors?.[0]?.detailed_message || json.errors?.[0]?.message;
    throw new Error(detail || 'Napaka pri branju lista');
  }
  return json.table;
}

function cellValue(cell) {
  if (!cell || cell.v == null) return null;
  return cell.v;
}

function parseGvizDate(v) {
  if (typeof v === 'string' && v.startsWith('Date(')) {
    const [, y, m, d, h = 0, min = 0, s = 0] = v.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?/);
    return new Date(+y, +m, +d, +h, +min, +s);
  }
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  return null;
}

function isHeaderLabel(label) {
  if (!label) return false;
  if (!isNaN(Number(label))) return false;       // pure number → data value
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) return false; // ISO date → data value
  return true;
}

export function rowsToObjects(table) {
  const cols = table.cols;
  return table.rows.map((row) => {
    const obj = {};
    row.c.forEach((cell, i) => {
      const col = cols[i];
      const label = (col.label || '').trim();
      const key = isHeaderLabel(label) ? label : (col.id || `col${i}`);
      let val = cellValue(cell);
      if (key === 'Date' || key === 'Obstimeutc' || key === 'B') {
        const parsed = parseGvizDate(val) ?? (val ? new Date(val) : null);
        val = parsed && !Number.isNaN(parsed.getTime()) ? parsed : val;
      }
      obj[key] = val;
    });
    return obj;
  });
}

export async function fetchGviz(opts) {
  const url = typeof opts === 'string' ? gvizUrl({ gid: SHEET.dataGid, query: opts }) : gvizUrl(opts);
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', mode: 'cors' });
  } catch {
    throw new Error('Ni omrežne povezave do Google Sheets');
  }
  if (!res.ok) throw new Error(`Google Sheets HTTP ${res.status}`);
  const table = parseGvizResponse(await res.text());
  return rowsToObjects(table);
}

async function fetchSheetDateBounds(sheetName) {
  const [firstRow, lastRow] = await Promise.all([
    fetchGviz({ sheet: sheetName, query: 'select C order by C asc limit 1' }),
    fetchGviz({ sheet: sheetName, query: 'select C order by C desc limit 1' }),
  ]);
  const first = firstRow[0]?.Date;
  const last = lastRow[0]?.Date;
  if (!(first instanceof Date) || !(last instanceof Date)) return null;
  return { first, last };
}

/** Prvi/zadnji datum in leta, ki imajo podatke (2022–2026) */
export async function fetchDataBounds() {
  const yearKeys = Object.keys(YEAR_SHEETS)
    .map(Number)
    .sort((a, b) => a - b);
  const available = [];
  let first = null;
  let last = null;

  const results = await Promise.all(
    yearKeys.map(async (year) => {
      try {
        const bounds = await fetchSheetDateBounds(YEAR_SHEETS[year]);
        return bounds ? { year, ...bounds } : null;
      } catch {
        return null;
      }
    }),
  );

  for (const item of results) {
    if (!item) continue;
    available.push(item.year);
    if (!first || item.first < first) first = item.first;
    if (!last || item.last > last) last = item.last;
  }

  if (!available.length || !first || !last) {
    throw new Error('Ni veljavnih datumov v listu');
  }

  return { first, last, years: available };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Obdobje [start, end) – end ekskluziven */
export function monthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = month === 12 ? new Date(year + 1, 0, 1) : new Date(year, month, 1);
  return { start, end };
}

export function yearRange(year) {
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

function dateQueryLiteral(d) {
  return `date '${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}'`;
}

export async function fetchReadingsRange(start, end, year) {
  const sheetRef = sheetForYear(year);
  const sheetParam = typeof sheetRef === 'number'
    ? { gid: sheetRef }
    : { sheet: sheetRef };
  const q = [
    'select B,C,O,M,L,S,T,U,V,W,K,G,Q',
    `where C >= ${dateQueryLiteral(start)} and C < ${dateQueryLiteral(end)}`,
    'order by C asc',
  ].join(' ');
  let rows = await fetchGviz({ ...sheetParam, query: q });

  // Fallback for sheets where col C is stored as numeric serial (not datetime):
  // fetch all rows and filter by time in JS.
  if (rows.length === 0 && typeof sheetRef === 'number') {
    const allRows = await fetchGviz({ ...sheetParam, query: 'select B,C,O,M,L,S,T,U,V,W,K,G,Q' });
    rows = allRows;
  }

  return rows
    .map(normalizeReading)
    .filter((r) => r.time && r.time >= start && r.time < end);
}

async function fetchPrecipTotalBefore(date, year) {
  const sheetRef = sheetForYear(year);
  const sheetParam = typeof sheetRef === 'number' ? { gid: sheetRef } : { sheet: sheetRef };
  const q = [
    'select Q',
    `where C < ${dateQueryLiteral(date)} and Q is not null`,
    'order by C desc limit 1',
  ].join(' ');
  try {
    const rows = await fetchGviz({ ...sheetParam, query: q });
    const row = rows[0] ?? {};
    return num(Object.values(row).find((x) => x != null) ?? null);
  } catch {
    return null;
  }
}

/**
 * Vrne meritve za točno določen dan v določenem letu.
 * Hiter (1 query/leto), namenjen "ta dan v zgodovini".
 */
export async function fetchDayReadings(year, month, day) {
  const start = new Date(year, month - 1, day);
  const end   = new Date(year, month - 1, day + 1);
  return fetchReadingsRange(start, end, year);
}

export async function fetchMonthReadings(year, month) {
  const { start, end } = monthRange(year, month);

  // Extend 1 day back to capture readings that are local-month but UTC-previous-day
  // (e.g. local June 1 00:00–01:59 CEST = UTC May 31 22:00–23:59).
  const extStart = new Date(start.getTime() - 24 * 3600_000);
  const extYear  = extStart.getFullYear();

  let allReadings = [];
  if (extYear < year) {
    // January: extStart is in the previous calendar year — query both sheets.
    try { allReadings = await fetchReadingsRange(extStart, start, extYear); } catch { /* no prev year */ }
    allReadings.push(...await fetchReadingsRange(start, end, year));
  } else {
    allReadings = await fetchReadingsRange(extStart, end, year);
  }

  // Split into boundary (pre-month) vs actual local-month readings.
  const localFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' });
  const prefix   = `${year}-${String(month).padStart(2, '0')}`;
  const preReadings = allReadings.filter(r => r.time && !localFmt.format(r.time).startsWith(prefix));
  const readings    = allReadings.filter(r => r.time &&  localFmt.format(r.time).startsWith(prefix));

  // Use last precipTotal seen before the local month as baseline; fall back to DB query.
  const lastPre = preReadings.length ? preReadings.at(-1) : null;
  const initialPrecipTotal = lastPre?.precipTotal != null
    ? lastPre.precipTotal
    : await fetchPrecipTotalBefore(extStart, extYear);

  return { readings, initialPrecipTotal };
}

export async function fetchYearReadings(year) {
  const { start, end } = yearRange(year);
  return fetchReadingsRange(start, end, year);
}

export async function fetchRecentReadings(limit = 72) {
  const q = [
    'select B,C,O,M,L,S,T,U,V,W,K,G,Q',
    'order by B desc',
    `limit ${limit}`,
  ].join(' ');
  const rows = await fetchGviz({ gid: SHEET.dataGid, query: q });
  return rows
    .map(normalizeReading)
    .filter((r) => r.time)
    .sort((a, b) => a.time - b.time);
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
    const found = Object.keys(row).find((key) => key.trim().toLowerCase() === k.toLowerCase());
    if (found != null && row[found] !== '') return row[found];
  }
  return null;
}

function normalizeReading(row) {
  // Named-column sheets: Date/Obstimeutc; fallback to col-ID sheets (B = Obstimeutc)
  let time = null;
  if (row.Date instanceof Date) {
    time = row.Date;
  } else if (row.B instanceof Date) {
    time = row.B;
  } else {
    const raw = pick(row, 'Obstimeutc');
    if (raw) time = new Date(raw);
  }

  return {
    time,
    // Named cols first, then col-ID fallbacks (O=Temp, M=Humidity, L=Winddir, S=Windspeed,
    // T=Windgust, U=Pressure, V=Preciprate, W=DailyRain, K=UV, G=Solar, Q=Preciptotal)
    temp:        num(pick(row, 'Temp')          ?? row.O),
    humidity:    num(pick(row, 'Humidity')       ?? row.M),
    windDir:     num(pick(row, 'Winddir')        ?? row.L),
    windSpeed:   num(pick(row, 'Windspeed')      ?? row.S),
    windGust:    num(pick(row, 'Windgust')       ?? row.T),
    pressure:    num(pick(row, 'Pressure')       ?? row.U),
    precipRate:  num(pick(row, 'Preciprate')     ?? row.V),
    precipTotal: num(pick(row, 'Preciptotal')    ?? row.Q),
    uv:          num(pick(row, 'Uv')             ?? row.K),
    solar:       num(pick(row, 'Solarradiation') ?? row.G),
    dewpt:       num(pick(row, 'Dewpt')),
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Povzetek s lista „t TEMPERATURE“ */
export async function fetchSummary() {
  const rows = await fetchGviz({ gid: SHEET.summaryGid });
  const map = {};
  for (const row of rows) {
    const key = String(row['t TEMPERATURE'] || '').trim();
    if (!key) continue;
    map[key] = {
      value: num(row['t1']),
      at: row['t2'] instanceof Date ? row['t2'] : null,
    };
  }
  return {
    current: map.T?.value ?? null,
    min: map.Tmin?.value ?? null,
    max: map.Tmax?.value ?? null,
  };
}

export async function loadWeatherBundle() {
  const [readings, summary] = await Promise.all([
    fetchRecentReadings(168),
    fetchSummary().catch(() => ({})),
  ]);
  const latest = readings[readings.length - 1] || null;
  return { readings, latest, summary, fetchedAt: new Date() };
}

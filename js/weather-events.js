/**
 * Kratka časovnica dneva iz postajnih meritev (+ opcijsko urna napoved vetra).
 */
import { RAIN_MM, GUST_MS } from './weather-thresholds.js';

const TZ = 'Europe/Ljubljana';

function fmtHour(d) {
  return d.toLocaleTimeString('sl-SI', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function localDayKey(d) {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

/**
 * @param {Array} readings – meritve (danes)
 * @param {Array} [windFc] – Open-Meteo urni veter (km/h), opcijsko
 * @returns {{ time: string, text: string }[]}
 */
export function buildDayTimeline(readings, windFc = null) {
  const events = [];
  const today = localDayKey(new Date());
  const todayR = (readings ?? []).filter((r) => r.time && localDayKey(r.time) === today);
  if (todayR.length < 3 && !(windFc?.length)) return [];

  let minT = null; let minAt = null;
  let maxT = null; let maxAt = null;
  let maxGust = null; let gustAt = null;
  let firstRain = null;

  for (const r of todayR) {
    if (r.temp != null) {
      if (minT == null || r.temp < minT) { minT = r.temp; minAt = r.time; }
      if (maxT == null || r.temp > maxT) { maxT = r.temp; maxAt = r.time; }
    }
    if (r.windGust != null && (maxGust == null || r.windGust > maxGust)) {
      maxGust = r.windGust;
      gustAt = r.time;
    }
    if (!firstRain && (r.precipRate ?? 0) > 0.3) firstRain = r.time;
  }

  if (maxAt && maxT != null) {
    events.push({
      sort: maxAt.getTime(),
      time: fmtHour(maxAt),
      text: `najtoplejši del dneva (~${maxT.toFixed(1)} °C)`,
      score: 50,
    });
  }
  if (minAt && minT != null && minAt.getTime() !== maxAt?.getTime()) {
    // jutranji min je bolj smiseln če je pred poldnevom
    const h = Number(minAt.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }));
    if (h < 12) {
      events.push({
        sort: minAt.getTime(),
        time: fmtHour(minAt),
        text: `najhladneje (~${minT.toFixed(1)} °C)`,
        score: 45,
      });
    }
  }
  if (gustAt && maxGust != null && maxGust >= GUST_MS.moderate) {
    events.push({
      sort: gustAt.getTime(),
      time: fmtHour(gustAt),
      text: `najmočnejši sunki (~${Math.round(maxGust * 3.6)} km/h)`,
      score: 70,
    });
  }
  if (firstRain) {
    events.push({
      sort: firstRain.getTime(),
      time: fmtHour(firstRain),
      text: 'začetek padavin',
      score: 65,
    });
  }

  // Napoved: vrh sunkov danes (km/h)
  if (windFc?.length) {
    const todayFc = windFc.filter((h) => h.time && localDayKey(h.time) === today && h.gust != null);
    if (todayFc.length) {
      let peak = todayFc[0];
      for (const h of todayFc) {
        if ((h.gust ?? 0) > (peak.gust ?? 0)) peak = h;
      }
      if (peak.gust >= 35) {
        // ne podvoji če je že podoben čas iz meritev
        const already = events.some((e) => Math.abs(e.sort - peak.time.getTime()) < 90 * 60_000 && /sunk/.test(e.text));
        if (!already) {
          events.push({
            sort: peak.time.getTime(),
            time: fmtHour(peak.time),
            text: `pričakovani vrh sunkov (~${Math.round(peak.gust)} km/h)`,
            score: 75,
          });
        }
      }
      // okrepitev: ko sunki presežejo 40 km/h
      const ramp = todayFc.find((h) => (h.gust ?? 0) >= 40 && h.time >= new Date());
      if (ramp) {
        events.push({
          sort: ramp.time.getTime(),
          time: fmtHour(ramp.time),
          text: 'okrepitev vetra',
          score: 72,
        });
      }
    }
  }

  // Dedup by hour + keep highest score
  const byHour = new Map();
  for (const e of events) {
    const key = e.time;
    const prev = byHour.get(key);
    if (!prev || e.score > prev.score) byHour.set(key, e);
  }

  return [...byHour.values()]
    .sort((a, b) => a.sort - b.sort || b.score - a.score)
    .slice(0, 5)
    .map(({ time, text }) => ({ time, text }));
}

/**
 * Kratek opis padavin za naslednje ure (iz Open-Meteo urnih, če na voljo).
 * @param {Array<{time:Date, precip?:number, precipProb?:number}>} hourly
 */
export function rainOutlook(hourly) {
  if (!hourly?.length) return null;
  const now = Date.now();
  const next6 = hourly.filter((h) => {
    const t = h.time?.getTime?.() ?? 0;
    return t >= now && t <= now + 6 * 3600_000;
  });
  if (!next6.length) return null;

  const sum = next6.reduce((s, h) => s + (h.precip ?? 0), 0);
  const maxProb = Math.max(...next6.map((h) => h.precipProb ?? 0));
  let peak = next6[0];
  for (const h of next6) {
    const score = (h.precip ?? 0) * 10 + (h.precipProb ?? 0);
    const best = (peak.precip ?? 0) * 10 + (peak.precipProb ?? 0);
    if (score > best) peak = h;
  }

  if (sum < RAIN_MM.trace && maxProb < 30) {
    return 'Naslednjih 6 ur brez omembe vrednih padavin.';
  }
  if (sum >= RAIN_MM.notable) {
    return `V naslednjih 6 urah ~${sum < 1 ? sum.toFixed(1) : Math.round(sum)} mm · vrh okoli ${fmtHour(peak.time)}.`;
  }
  if (maxProb >= 40) {
    return `Največja verjetnost dežja okoli ${fmtHour(peak.time)} (~${Math.round(maxProb)} %).`;
  }
  return 'Možne so kratkotrajne / rahle padavine.';
}

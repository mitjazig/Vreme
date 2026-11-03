import { STATION_FRESHNESS_MIN } from './weather-thresholds.js';

/**
 * @param {Date|string|number|null} obsTime – čas zadnje meritve
 * @param {Date} [now]
 * @returns {{ level: 'fresh'|'stale'|'offline'|'unknown', minutes: number|null, label: string, detail: string, cls: string }}
 */
export function getStationStatus(obsTime, now = new Date()) {
  if (obsTime == null) {
    return {
      level: 'unknown',
      minutes: null,
      label: 'Ni časovnega žiga',
      detail: 'Podatek o času meritve manjka.',
      cls: 'station-status--unknown',
    };
  }
  const t = obsTime instanceof Date ? obsTime : new Date(obsTime);
  if (Number.isNaN(t.getTime())) {
    return {
      level: 'unknown',
      minutes: null,
      label: 'Neveljaven čas',
      detail: 'Čas meritve ni berljiv.',
      cls: 'station-status--unknown',
    };
  }

  const minutes = Math.max(0, Math.round((now.getTime() - t.getTime()) / 60_000));
  const ago =
    minutes < 1 ? 'pravkar'
      : minutes === 1 ? 'pred 1 min'
        : minutes < 60 ? `pred ${minutes} min`
          : minutes < 120 ? 'pred ~1 h'
            : `pred ${Math.round(minutes / 60)} h`;

  if (minutes <= STATION_FRESHNESS_MIN.fresh) {
    return {
      level: 'fresh',
      minutes,
      label: 'Postaja online',
      detail: `Posodobljeno ${ago}`,
      cls: 'station-status--fresh',
    };
  }
  if (minutes <= STATION_FRESHNESS_MIN.stale) {
    return {
      level: 'stale',
      minutes,
      label: 'Podatki zastareli',
      detail: `Zadnja meritev ${ago}`,
      cls: 'station-status--stale',
    };
  }
  return {
    level: 'offline',
    minutes,
    label: 'Postaja verjetno offline',
    detail: `Zadnja meritev ${ago}`,
    cls: 'station-status--offline',
  };
}

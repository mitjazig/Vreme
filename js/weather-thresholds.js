/**
 * Centralni pragovi – enote: m/s (veter postaje), hPa, °C, mm, min.
 * Open-Meteo veter je običajno km/h → pretvori pred primerjavo.
 */

/** Svežina meritev postaje (minute od zadnje meritve) */
export const STATION_FRESHNESS_MIN = {
  fresh: 15,
  stale: 60,
  offline: 180,
};

/** Sunki / intenziteta (m/s) – usklajeno z bora.js */
export const GUST_MS = {
  calm: 5,
  moderate: 10,
  strong: 15,
  severe: 20,
  extreme: 25,
};

/** Padavine (mm) */
export const RAIN_MM = {
  trace: 0.2,
  notable: 1,
  significant: 5,
  heavy: 15,
};

/** Tlak (hPa / 6h) */
export const PRESSURE_TREND_HPA = {
  strongDrop: -4,
  drop: -1.5,
  rise: 1.5,
  strongRise: 4,
};

/** Rosišče (°C) – udobje */
export const DEWPOINT_C = {
  dry: 10,
  pleasant: 16,
  humid: 20,
  sticky: 24,
};

/** Anomalija temperature (°C) */
export const ANOMALY_C = {
  notable: 2.5,
  strong: 4,
};

/** UV */
export const UV = {
  moderate: 3,
  high: 6,
  veryHigh: 8,
};

export function kmhToMs(kmh) {
  return kmh == null ? null : kmh / 3.6;
}

export function msToKmh(ms) {
  return ms == null ? null : ms * 3.6;
}

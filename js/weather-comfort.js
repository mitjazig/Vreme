import { DEWPOINT_C } from './weather-thresholds.js';

/**
 * Magnus / August–Roche–Magnus približek rosišča (°C).
 * T °C, RH 0–100 %.
 */
export function dewPointC(tempC, rh) {
  if (tempC == null || rh == null || rh <= 0) return null;
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(Math.max(0.01, Math.min(100, rh)) / 100) + (a * tempC) / (b + tempC);
  return (b * gamma) / (a - gamma);
}

/**
 * @returns {{ dew: number, label: string, cls: string }|null}
 */
export function humidityComfort(tempC, rh) {
  const dew = dewPointC(tempC, rh);
  if (dew == null || Number.isNaN(dew)) return null;
  let label = 'soparno';
  let cls = 'comfort--sticky';
  if (dew < DEWPOINT_C.dry) { label = 'suho'; cls = 'comfort--dry'; }
  else if (dew < DEWPOINT_C.pleasant) { label = 'prijetno'; cls = 'comfort--ok'; }
  else if (dew < DEWPOINT_C.humid) { label = 'vlažno'; cls = 'comfort--humid'; }
  else if (dew < DEWPOINT_C.sticky) { label = 'zelo vlažno'; cls = 'comfort--very'; }
  return { dew, label, cls };
}

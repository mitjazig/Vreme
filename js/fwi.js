/**
 * Canadian Forest Fire Weather Index (FWI) – Van Wagner / Forestry Canada.
 * Potrebuje dnevne vrednosti okoli poldneva: T (°C), RH (%), veter (km/h), padavine 24h (mm).
 */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function calcFfmc(temp, rh, wind, rain, ffmcPrev) {
  rh = clamp(rh, 0, 100);
  let mo = 147.2 * (101 - ffmcPrev) / (59.5 + ffmcPrev);

  if (rain > 0.5) {
    const rf = rain - 0.5;
    const mr = mo + 42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf));
    mo = mo > 150 ? mr + 0.0015 * (mo - 150) ** 2 * Math.sqrt(rf) : mr;
    mo = Math.min(mo, 250);
  }

  const ed = 0.942 * rh ** 0.679 + 11 * Math.exp((rh - 100) / 10)
    + 0.18 * (21.1 - temp) * (1 - Math.exp(-0.115 * rh));

  let m;
  if (mo > ed) {
    const ko = 0.424 * (1 - (rh / 100) ** 1.7) + 0.0694 * Math.sqrt(wind) * (1 - (rh / 100) ** 8);
    const kd = ko * 0.581 * Math.exp(0.0365 * temp);
    m = ed + (mo - ed) * 10 ** (-kd);
  } else {
    const ew = 0.618 * rh ** 0.753 + 10 * Math.exp((rh - 100) / 10)
      + 0.18 * (21.1 - temp) * (1 - Math.exp(-0.115 * rh));
    if (mo < ew) {
      const kh = 0.424 * (1 - ((100 - rh) / 100) ** 1.7)
        + 0.0694 * Math.sqrt(wind) * (1 - ((100 - rh) / 100) ** 8);
      const kw = kh * 0.581 * Math.exp(0.0365 * temp);
      m = ew - (ew - mo) * 10 ** (-kw);
    } else {
      m = mo;
    }
  }

  return clamp(59.5 * (250 - m) / (147.2 + m), 0, 101);
}

function calcDmc(temp, rh, rain, month, dmcPrev) {
  rh = clamp(rh, 0, 100);
  temp = Math.max(-1.1, temp);
  const ell = [6.5, 7.5, 9, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8, 7, 6][month];

  let dmc = dmcPrev;
  if (rain > 1.5) {
    const re = 0.92 * rain - 1.27;
    const mo = 20 + Math.exp(5.6348 - dmc / 43.43);
    let b;
    if (dmc <= 33) b = 100 / (0.5 + 0.3 * dmc);
    else if (dmc <= 65) b = 14 - 1.3 * Math.log(dmc);
    else b = 6.2 * Math.log(dmc) - 17.2;
    const mr = mo + 1000 * re / (48.77 + b * re);
    dmc = Math.max(0, 43.43 * (5.6348 - Math.log(mr - 20)));
  }

  if (temp > -1.1) {
    const k = 1.894 * (temp + 1.1) * (100 - rh) * ell * 1e-4;
    dmc += k;
  }
  return Math.max(0, dmc);
}

function calcDc(temp, rain, month, dcPrev) {
  temp = Math.max(-2.8, temp);
  const fl = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5, 2.4, 0.4, -1.6, -1.6][month];

  let dc = dcPrev;
  if (rain > 2.8) {
    const rd = 0.83 * rain - 1.27;
    const qo = 800 * Math.exp(-dc / 400);
    const qr = qo + 3.937 * rd;
    dc = Math.max(0, 400 * Math.log(800 / qr));
  }

  const v = Math.max(0, 0.36 * (temp + 2.8) + fl);
  return dc + 0.5 * v;
}

function calcIsi(wind, ffmc) {
  const mo = 147.2 * (101 - ffmc) / (59.5 + ffmc);
  const ff = 19.115 * Math.exp(mo * -0.1386) * (1 + mo ** 5.31 / 4.93e7);
  return ff * Math.exp(0.05039 * wind);
}

function calcBui(dmc, dc) {
  if (dmc === 0 && dc === 0) return 0;
  let bui;
  if (dmc <= 0.4 * dc) {
    bui = 0.8 * dc * dmc / (dmc + 0.4 * dc);
  } else {
    bui = dmc - (1 - 0.8 * dc / (dmc + 0.4 * dc)) * (0.92 + (0.0114 * dmc) ** 1.7);
  }
  return Math.max(0, bui);
}

function calcFwi(isi, bui) {
  let fD;
  if (bui <= 80) fD = 0.626 * bui ** 0.809 + 2;
  else fD = 1000 / (25 + 108.64 * Math.exp(-0.023 * bui));
  const b = 0.1 * isi * fD;
  if (b <= 1) return b;
  return Math.exp(2.72 * (0.434 * Math.log(b)) ** 0.647);
}

/**
 * @param {Array<{temp:number, rh:number, wind:number, rain:number, date:Date}>} days
 *   wind v km/h, rain 24h mm, temp °C, rh %
 * @returns {Array<{date:Date, fwi:number, ffmc:number, dmc:number, dc:number, isi:number, bui:number}>}
 */
export function computeFwiSeries(days) {
  let ffmc = 85;
  let dmc = 6;
  let dc = 15;
  const out = [];

  for (const day of days) {
    const month = day.date.getMonth();
    ffmc = calcFfmc(day.temp, day.rh, day.wind, day.rain, ffmc);
    dmc = calcDmc(day.temp, day.rh, day.rain, month, dmc);
    dc = calcDc(day.temp, day.rain, month, dc);
    const isi = calcIsi(day.wind, ffmc);
    const bui = calcBui(dmc, dc);
    const fwi = calcFwi(isi, bui);
    out.push({
      date: day.date,
      fwi: Number.isFinite(fwi) ? +fwi.toFixed(1) : null,
      ffmc: +ffmc.toFixed(1),
      dmc: +dmc.toFixed(1),
      dc: +dc.toFixed(1),
      isi: +isi.toFixed(1),
      bui: +bui.toFixed(1),
    });
  }
  return out;
}

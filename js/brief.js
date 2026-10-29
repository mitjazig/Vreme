/**
 * Dnevni brief – 3 kratki stavki iz postaje (in opcijsko snega).
 */

function rainTodayMm(readings) {
  if (!readings?.length) return 0;
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' });
  const today = fmt.format(new Date());
  let max = 0;
  for (const r of readings) {
    if (!r.time || r.precipTotal == null) continue;
    if (fmt.format(r.time) !== today) continue;
    if (r.precipTotal > max) max = r.precipTotal;
  }
  return max;
}

function tipFor({ latest, bora, rainMm, summary }) {
  const t = latest?.temp;
  const gustKmh = latest?.windGust != null ? latest.windGust * 3.6 : 0;
  const raining = (latest?.precipRate ?? 0) > 0.2;

  if (bora?.type === 'burja' && bora.score >= 3) {
    return 'Burja piha – utrjuje stvari na prostem, na grebenih pazite na sunke.';
  }
  if (bora?.type === 'jugo' && bora.score >= 3) {
    return 'Jugo prinaša vlažen veter – pričakujte meglice in morebiten dež ob obali.';
  }
  if (raining) {
    return 'Trenutno dežuje – idealno za gobarje čez nekaj dni, danes rajši v zavetje.';
  }
  if (rainMm >= 5) {
    return `Danes že ${rainMm.toFixed(0)} mm padavin – tla so mokra, zvečer lahko spolzko.`;
  }
  if (t != null && t <= 1) {
    return 'Temperatura okoli ničle – možna poledica na cesti in v senci.';
  }
  if (t != null && t >= 28 && gustKmh < 20) {
    return 'Vroče in mirno – dober dan za žar, pazite na UV in vodo.';
  }
  if (t != null && t >= 18 && t <= 26 && rainMm < 1 && gustKmh < 25) {
    return 'Prijeten dan na prostem – sprehod ali delo na vrtu brez skrbi.';
  }
  if (gustKmh >= 50) {
    return `Močni sunki (~${Math.round(gustKmh)} km/h) – zavarujte senčnike in lažje predmete.`;
  }
  if (summary?.max != null && summary?.min != null && summary.max - summary.min >= 12) {
    return 'Velika dnevna nihanja temperature – zjutraj hladno, popoldne toplo; oblecite se plastno.';
  }
  if (t != null && t < 10) {
    return 'Hladno za to letni čas – jakna priročna, zlasti proti večeru.';
  }
  return 'Stabilno vreme – preverite napoved, če načrtujete daljši izlet.';
}

/**
 * @returns {{ lines: string[], meta: string }}
 */
export function buildDayBrief({ latest, summary, readings, bora }) {
  if (latest?.temp == null) {
    return { lines: ['Ni dovolj podatkov za dnevni brief.'], meta: '' };
  }

  const t = latest.temp;
  const humid = latest.humidity;
  const windKmh = latest.windSpeed != null ? latest.windSpeed * 3.6 : null;
  const gustKmh = latest.windGust != null ? latest.windGust * 3.6 : null;
  const rainMm = rainTodayMm(readings);

  const windPart = windKmh != null
    ? (gustKmh != null && gustKmh > windKmh + 5
      ? `veter ${Math.round(windKmh)} km/h (sunki ${Math.round(gustKmh)})`
      : `veter ${Math.round(windKmh)} km/h`)
    : null;

  const line1Parts = [];
  if (t != null) line1Parts.push(`Zdaj ${t.toFixed(1)} °C`);
  if (humid != null) line1Parts.push(`vlaga ${Math.round(humid)} %`);
  if (windPart) line1Parts.push(windPart);
  if (bora?.type === 'burja' || bora?.type === 'jugo') {
    line1Parts.push(bora.title || bora.type);
  }
  const line1 = line1Parts.length
    ? `${line1Parts.join(', ')}.`
    : 'Trenutni podatki postaje niso popolni.';

  const min = summary?.min;
  const max = summary?.max;
  let line2;
  if (min != null && max != null) {
    const rainStr = rainMm > 0.05
      ? ` Padavin danes ${rainMm < 1 ? rainMm.toFixed(1) : Math.round(rainMm)} mm.`
      : ' Brez padavin do zdaj.';
    line2 = `Danes od ${min.toFixed(1)} °C do ${max.toFixed(1)} °C.${rainStr}`;
  } else if (rainMm > 0.05) {
    line2 = `Danes do zdaj ${rainMm < 1 ? rainMm.toFixed(1) : Math.round(rainMm)} mm padavin.`;
  } else {
    line2 = 'Dnevni min/max še nista zanesljiva (premalo meritev).';
  }

  const line3 = tipFor({ latest, bora, rainMm, summary });

  return {
    lines: [line1, line2, line3],
    meta: 'IKOPER43 · samodejni brief',
  };
}

/**
 * agro.js – Lunarni kmetijski nasvet in setveni koledar
 * Postaja IKOPER43 · Rakitovec / Kras
 *
 * Biodinamični tip dneva temelji na položaju lune v zodiaku (siderično):
 * Oven/Lev/Strelec → Sadni dan
 * Bik/Devica/Kozorog → Koreninski dan
 * Dvojček/Tehtnica/Vodnar → Cvetni dan
 * Rak/Škorpijon/Ribi → Listni dan
 *
 * Referenca za siderično dolžino lune:
 * JDE 2451545.0 (J2000.0) → lunina siderična dolžina ≈ 218.3° (Škorpijon)
 * Siderični mesec: 27.32166 dni
 */

// Siderični mesec v dnevih
const SIDEREAL_MONTH = 27.32166;
// Lunina siderična dolžina ob J2000.0 (1. jan 2000 12:00 UTC)
const MOON_L0 = 218.3160; // °
const J2000   = Date.UTC(2000, 0, 1, 12, 0, 0);

const ZODIAC = [
  { name: 'Oven',       type: 'fruit',  emoji: '♈' },
  { name: 'Bik',        type: 'root',   emoji: '♉' },
  { name: 'Dvojček',    type: 'flower', emoji: '♊' },
  { name: 'Rak',        type: 'leaf',   emoji: '♋' },
  { name: 'Lev',        type: 'fruit',  emoji: '♌' },
  { name: 'Devica',     type: 'root',   emoji: '♍' },
  { name: 'Tehtnica',   type: 'flower', emoji: '♎' },
  { name: 'Škorpijon',  type: 'leaf',   emoji: '♏' },
  { name: 'Strelec',    type: 'fruit',  emoji: '♐' },
  { name: 'Kozorog',    type: 'root',   emoji: '♑' },
  { name: 'Vodnar',     type: 'flower', emoji: '♒' },
  { name: 'Ribi',       type: 'leaf',   emoji: '♓' },
];

const TYPE_INFO = {
  fruit:  { sl: 'Sadni dan',      emoji: '🍎', color: '#fb923c',
    tip: 'Idealno za žetev, obiranje sadja in zelenjave z zemeljske površine. Primerno za konzerviranje in sušenje.' },
  root:   { sl: 'Koreninski dan', emoji: '🥕', color: '#a78bfa',
    tip: 'Priporočljivo za sajenje in nego korenaste zelenjave (krompir, korenje, pesa). Odličen čas za žaganje in cepljenje drv — drva bodo trša in bodo manj gnila.' },
  flower: { sl: 'Cvetni dan',     emoji: '🌸', color: '#f472b6',
    tip: 'Primeren čas za cvetje in aromatične rastline. Med in cvetni prah sta bolj aromatična. Primerno za rezanje cvetja za šopke.' },
  leaf:   { sl: 'Listni dan',     emoji: '🥬', color: '#4ade80',
    tip: 'Ugoden za sajenje solate, zelja, špinače in druge listnate zelenjave. Dobro zalivajte — rastline bolje vpijajo vlago.' },
};

/**
 * Izračuna biodinamični tip dneva in lunarni nasvet.
 * @param {Date} date
 * @param {{ phase: number, illum: number, name: string, emoji: string }} moon – iz moonPhase()
 */
export function moonDayType(date = new Date(), moon = null) {
  // Siderična dolžina lune
  const daysSinceJ2000 = (date.getTime() - J2000) / 86_400_000;
  const lon = ((MOON_L0 + (daysSinceJ2000 / SIDEREAL_MONTH) * 360) % 360 + 360) % 360;
  const signIdx = Math.floor(lon / 30);
  const zodiac  = ZODIAC[signIdx];
  const info    = TYPE_INFO[zodiac.type];

  // Lunini nasveti glede na fazo (synodic)
  const phase = moon?.phase ?? 0;
  let phaseAdvice = '';
  if (phase < 1.85) {
    phaseAdvice = 'Mlaj: čas za počitek tal in načrtovanje. Izogibajte se sejanju in sajenju.';
  } else if (phase < 7.38) {
    phaseAdvice = 'Naraščajoči srp: luna nabira moč. Sejte hitro rastoče rastline in listnato zelenjavo.';
  } else if (phase < 9.22) {
    phaseAdvice = 'Prva četrtina: dobro za sajenje nadzemnih rastlin — paradižnik, bučke, fižol.';
  } else if (phase < 14.75) {
    phaseAdvice = 'Naraščajoč polmesec: odlično za sajenje vseh rastlin, škropljenje in gnojenje.';
  } else if (phase < 16.61) {
    phaseAdvice = 'Polna luna: žetev, obiranje in konzerviranje. Rastline so polne sokov. Izogibajte se sajenju.';
  } else if (phase < 22.15) {
    phaseAdvice = 'Pojemajoč polmesec: sajenje korenaste zelenjave, kompostiranje, okopavanje.';
  } else if (phase < 23.99) {
    phaseAdvice = 'Zadnja četrtina: idealen čas za rez dreves, žaganje drv in pletje plevelov.';
  } else {
    phaseAdvice = 'Pojemajoči srp: gnojenje, pripravljanje tal, rez. Drva žagana zdaj bodo suha in kakovostna.';
  }

  // Nasvet za žaganje drv
  const goodForWood = phase > 22 || phase < 1.85;
  let woodTip, woodNextDays;
  if (goodForWood) {
    woodTip = '🪵 Odličen čas za žaganje in cepljenje drv — luna je v pojemanju, les bo trši in se bo manj krivil.';
    woodNextDays = 0;
  } else {
    // Koliko dni do naslednje dobre faze (zadnja četrtina = 22 dni)
    woodNextDays = phase < 22 ? Math.ceil(22 - phase) : Math.ceil(SIDEREAL_MONTH - phase + 22);
    woodTip = null;
  }

  return { zodiac, info, phaseAdvice, woodTip, woodNextDays, lon: lon.toFixed(1) };
}

// ——— Setveni koledar po mesecih —————————————————————————————————————————
// Prilagojen za Kras / Primorska (nadmorska višina ~380 m, USDA cona 8a)

const SOWING_CALENDAR = {
  1: [
    { crop: 'Česen',        icon: '🧄', action: 'Oskrba, gnojenje' },
    { crop: 'Zimska solata', icon: '🥗', action: 'Zaščita pred zmrzaljo' },
    { crop: 'Načrtovanje',  icon: '📋', action: 'Naroči semena za pomlad' },
    { crop: 'Drva',         icon: '🪵', action: 'Žagaj in cepaj pri pojemajoči luni' },
  ],
  2: [
    { crop: 'Paradižnik',   icon: '🍅', action: 'Sej v toploto (v zaprtih prostorih)' },
    { crop: 'Paprika',      icon: '🌶️', action: 'Sej v toploto — kali počasi' },
    { crop: 'Zelena',       icon: '🌿', action: 'Presaditev zimske solate' },
    { crop: 'Drva',         icon: '🪵', action: 'Zadnji mesec za kakovostno žaganje' },
  ],
  3: [
    { crop: 'Krompir',      icon: '🥔', action: 'Pripravi gomolji za sajenje' },
    { crop: 'Korenje',      icon: '🥕', action: 'Sej direktno po 15. marca' },
    { crop: 'Čebula',       icon: '🧅', action: 'Presadi sadike ali sadi čebulice' },
    { crop: 'Špinača',      icon: '🥬', action: 'Sej direktno — mraz ne škodi' },
    { crop: 'Grah',         icon: '🟢', action: 'Sej ko tla dosežejo 5°C' },
  ],
  4: [
    { crop: 'Krompir',      icon: '🥔', action: 'Sadi po Jurjevem (23. apr.)' },
    { crop: 'Solata',       icon: '🥗', action: 'Presadi sadike na prosto' },
    { crop: 'Redkvica',     icon: '🔴', action: 'Sej direktno, hitro dozori' },
    { crop: 'Bučke',        icon: '🥒', action: 'Sej v lonce v toploti' },
    { crop: 'Drevesa',      icon: '🌳', action: 'Rez sadnega drevja do cveta' },
  ],
  5: [
    { crop: 'Paradižnik',   icon: '🍅', action: 'Presadi na prosto po 15. maja (ledeni možje!)' },
    { crop: 'Paprika',      icon: '🌶️', action: 'Presadi na prosto po 15. maja' },
    { crop: 'Bučke',        icon: '🥒', action: 'Presadi sadike na prosto' },
    { crop: 'Fižol',        icon: '🟤', action: 'Sej direktno — mraz mu škodi' },
    { crop: 'Kumare',       icon: '🥒', action: 'Sej direktno ali presadi sadike' },
  ],
  6: [
    { crop: 'Fižol',        icon: '🟤', action: 'Drugi posev za jesen' },
    { crop: 'Korenje',      icon: '🥕', action: 'Drugi posev — jesenski pridelek' },
    { crop: 'Zelje',        icon: '🥬', action: 'Sej sadike za jesensko zelje' },
    { crop: 'Jagode',       icon: '🍓', action: 'Presadi stolone po obiranju' },
    { crop: 'Zelišča',      icon: '🌿', action: 'Žetev in sušenje pred cvetenjem' },
  ],
  7: [
    { crop: 'Solata',       icon: '🥗', action: 'Sej za jesenski pridelek' },
    { crop: 'Redkvica',     icon: '🔴', action: 'Jesenski posev — hitro raste' },
    { crop: 'Špinača',      icon: '🥬', action: 'Sej od konca julija za jesen' },
    { crop: 'Zelje',        icon: '🥬', action: 'Presadi sadike jesenskega zelja' },
    { crop: 'Paradižnik',   icon: '🍅', action: 'Prirezuj, da dozori pred jesenjo' },
  ],
  8: [
    { crop: 'Česen',        icon: '🧄', action: 'Sadi od konca avgusta do oktobra' },
    { crop: 'Solata',       icon: '🥗', action: 'Sej za jesenski pridelek' },
    { crop: 'Špinača',      icon: '🥬', action: 'Sej za jesenski pridelek' },
    { crop: 'Zimska čebula', icon: '🧅', action: 'Sadi čebulice za prezimitev' },
    { crop: 'Jagode',       icon: '🍓', action: 'Presajanje stolonov' },
  ],
  9: [
    { crop: 'Česen',        icon: '🧄', action: 'Idealen čas za sajenje' },
    { crop: 'Čebulice',     icon: '🧅', action: 'Sadi tulipane, narcise za pomlad' },
    { crop: 'Zimska solata', icon: '🥗', action: 'Sej sorte odporne na mraz' },
    { crop: 'Drevesa',      icon: '🌳', action: 'Sajenje sadnih dreves po padcu listja' },
    { crop: 'Kompost',      icon: '♻️', action: 'Pripravi kompost iz jesenskih ostankov' },
  ],
  10: [
    { crop: 'Česen',        icon: '🧄', action: 'Zadnji rok za sajenje' },
    { crop: 'Čebulice',     icon: '🧅', action: 'Sadi spomladanske čebulice' },
    { crop: 'Drevesa',      icon: '🌳', action: 'Sajenje in presajanje sadnih dreves' },
    { crop: 'Drva',         icon: '🪵', action: 'Začetek sezone žaganja pri pojemajoči luni' },
    { crop: 'Tla',          icon: '🌱', action: 'Pognoji in pripravi tla za prihodnje leto' },
  ],
  11: [
    { crop: 'Rez dreves',   icon: '✂️', action: 'Rez jablan in hrušk po odpadlih listih' },
    { crop: 'Drva',         icon: '🪵', action: 'Žagaj in cepaj v pojemajoči fazi' },
    { crop: 'Tla',          icon: '🌱', action: 'Globoko preoraj in gnoji' },
    { crop: 'Zaščita',      icon: '🧥', action: 'Zaščiti občutljive rastline pred zmrzaljo' },
  ],
  12: [
    { crop: 'Rez trte',     icon: '🍇', action: 'Rez vinske trte po mrazu' },
    { crop: 'Rez dreves',   icon: '✂️', action: 'Rez sadnega drevja med mirovanjem' },
    { crop: 'Drva',         icon: '🪵', action: 'Idealen mesec za žaganje drv' },
    { crop: 'Načrtovanje',  icon: '📋', action: 'Pripravi kolobar za prihodnje leto' },
  ],
};

/**
 * Vrne setveni koledar za dani mesec (1–12).
 */
export function getSowingCalendar(month) {
  return SOWING_CALENDAR[month] ?? [];
}

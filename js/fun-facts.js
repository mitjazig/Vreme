/**
 * fun-facts.js – Vremenske zanimivosti za IKOPER43 · Rakitovec
 *
 * Tri vrste dejstev:
 *  1. Kuriozitete o Krasu, Jadranu in vremenskih pojavih (rotirajo po dnevu leta)
 *  2. Dinamična dejstva izračunana iz trenutnih meritev
 *  3. Astronomska/sezonska dejstva (iz sunriseSunset + moonPhase)
 */

import { sunriseSunset, moonPhase, STATION_LAT, STATION_LON } from './astro.js';

// ——— 1. Kuriozitete (rotirajo po dnevu leta) ————————————————————————————

const TRIVIA = [
  'Beseda "kras" (angleško karst) je prišla v svetovne jezike iz slovenskega Krasa — tako je Rakitovec dal ime vsem kraški pokrajinam na svetu.',
  'Burja je dobila ime po Boreasu, grškem bogu severnega vetra. Na Krasu lahko doseže hitrosti nad 200 km/h — med najmočnejšimi vetrovi v Evropi.',
  'Burja je katabatičen veter: hladen zrak s Panonske nižine se prelije čez Alpe in Dinaride ter "pade" proti Jadranu, pospeši se ob pobočjih.',
  'Koper je bil do 18. stoletja otoček — z obalo so ga povezali šele leta 1825 z zasipavanjem morskega rokava.',
  'Jadransko morje je plitvo: povprečna globina je le 173 m, na severnem delu (Tržaški zaliv) pa le 25–35 m.',
  'Tržaški zaliv je eden redkih predelov Mediterana, kjer morje pozimi delno zmrzne — zadnjič resneje leta 2012.',
  'Jugo (scirocco) prinaša topel vlažen zrak iz Sahare. Včasih prinese s seboj saharskipesek, ki obarva dež rjavo.',
  'Koper dobi povprečno ~2300 ur sonca letno — več kot Milano (1900 h) ali Barcelona (2500 h). Med najbolj sončnimi mesti v Sloveniji.',
  'Temperatura pada za ~6,5°C na vsakih 1000 m višine. Rakitovec leži na ~380 m — to pomeni, da je tu povprečno ~2,5°C hladnejše kot ob morju.',
  'Megla v koprski kotlini ob jasnem jutru na Krasu ni slabo vreme — pomeni temperaturno inverzijo. Na Krasu je takrat toplejše kot spodaj.',
  'Povprečna letna količina padavin na Krasu je 1200–1500 mm — večino pade jeseni in spomladi, poleti je relativno suho.',
  'Strela je 5× bolj vroča od površine Sonca: doseže ~30.000°C. Kanal strele je širok le 2–3 cm.',
  'Povprečna strela traja le 0,2 sekunde, a sprosti dovolj energije da bi 100W žarnica gorela 3 mesece.',
  'Vsako sekundo na Zemlji udari povprečno ~100 strel — skupno ~8 milijonov na dan.',
  'Rosišče nad 20°C pomeni tropsko vlažnost — zrak se zdi "gost" ker kondenzacija poteka že ob manjšem ohlajanju.',
  'Oblaki tipa cumulonimbus (nevihta) segajo do 15 km višine — seže v stratosfero in "pritisne" na tropopavzo.',
  'Toča nastane ko ledene kroglice v nevihtnem oblaku večkrat potujejo gor in dol. Večja nevihta = daljši čas rasti = večja toča.',
  'Povprečna hitrost dežne kapljice je 9 m/s. Kapljica pade z 2000 m v ~4 minutah.',
  'Standardni atmosferski tlak na morski gladini je 1013,25 hPa — to je vrednost "normalnega" vremena.',
  'Rekordno nizek tlak v Evropi je bil izmerjen med neurjem Lothar (1999): 954 hPa. Rekordno visok: 1063 hPa (Sibirija, 1968).',
  'Sonce oddaja na vrhu ozračja 1361 W/m². Sončna elektrarna v Kopru realno dobi ~1000 W/m² ob jasnem poletnem dnevu.',
  'Jadransko morje se poleti ogreje hitreje kot Atlantik — ker je plitvo, zaprto in ima malo tokov.',
  'Temperatura Jadrana poleti v Tržaškem zalivu doseže 28°C, pozimi pade na 7–8°C — razlika 20°C čez leto.',
  'UV indeks 6–7 zahteva zaščito po 20 minutah, indeks 8–10 po 15 minutah, nad 11 pa že po 10 minutah.',
  'Rdeč zahod sonca (jasno nebo na zahodu) napoveduje lepo vreme naslednji dan — staro vremensko pravilo ki pogosto drži.',
  'Rdeče jutro (rdeč vzhod) pa napoveduje slabo vreme — oblaki na zahodu odbijajo sončno svetlobo.',
  '"Sv. Medard deževen — štirideset dni deževen" (8. junij) je staro slovensko vremensko izročilo — meteorologi pravijo da drži ~50% časa.',
  'Temperaturni rekord za Slovenijo je 41,0°C (Črnomelj, 2019). Rekordni mraz: −34,5°C (Bilje pri Novi Gorici, 1929).',
  'Na Krasu so požari pozimi (ob burji) prav tako nevarni kot poleti — suhi veter in nizka vlažnost naredita pokrajino vnetljivo.',
  'Sezonski povprečki se v zadnjih 50 letih dvigujejo: zadnje poletje 2024 je bilo najtoplejše v instrumentalni zgodovini meritev za Evropo.',
  'Jadran se je v zadnjih 50 letih segrel za ~1,5°C — kar vpliva na intenzivnost neviht in moč juga.',
];

// ——— 2. Datumski vremenski pregovori ————————————————————————————————————
// Format: [mesec, dan, pregovor]
const DATE_PROVERBS = [
  [1,  1,  'Kakršno vreme je na Novo leto, takšno bo celo leto — staro slovensko izročilo.'],
  [1,  6,  'Na sv. Tri kralje (6. jan.) gre burja na počitnice ali pa pride z vso silo — vmesnega ni.'],
  [1, 20,  'Sv. Fabijan in Sebastijan (20. jan.): "Kdor na Fabijana seje, do sv. Jurija žanje."'],
  [2,  2,  'Svečnica (2. feb.): "Kadar Svečnica sveti, zima se podi; kadar Svečnica joče, zima se noče." — Če je jasno, zima traja dlje.'],
  [2, 14,  'Sv. Valentin (14. feb.): po starem slovenskem izročilu začnejo ptice iskati par — znak da je najhujši del zime mimo.'],
  [2, 24,  'Sv. Matija (24. feb.): "Sv. Matija led razbija ali pa ga naredi." — Na ta dan se vreme odloči za ali proti pomladi.'],
  [3, 12,  '"Gregorjevo (12. mar.) — dan in noč enako." Blizu spomladanskega ekvinokcija, ko je dan enako dolg kot noč.'],
  [3, 19,  'Sv. Jožef (19. mar.): "Kadar sv. Jožef v rokavicah hodi, pomlad po snegu prihodi."'],
  [4,  1,  '"April, april, dela kar mu je drago" — aprilsko vreme je pri nas znano po hitrih preobratih med soncem, točo in snegom.'],
  [4, 23,  'Sv. Jurij (23. apr.): "Na sv. Jurija trava raste čez kopita." Jurjevo je mejnik pomladi — po njem naj bi bila paša že mogoča.'],
  [5,  1,  'Prvomajska rosa: "Kdor se umije z majsko roso, bo zdrav celo leto." — Staro kmečko izročilo s Krasa.'],
  [5, 12,  '"Ledeni možje" (12.–14. maj — sv. Pankracij, Servacij, Bonifacij): zadnji nevarni dnevi za pozebo. Vrtičkarji počakajo z sajenjem.'],
  [5, 15,  'Sv. Zofija (15. maj) — "Hladna Zofija" zaključi ledene može. Po njej so jutranje pozebe redke.'],
  [6,  8,  'Sv. Medard (8. jun.): "Sv. Medard deževen — štirideset dni deževen." Meteorologi pravijo: drži ~50% časa.'],
  [6, 21,  'Poletni solsticij — najdaljši dan leta. Na Krasu pravijo: "Po sv. Ivanu (24. jun.) dnevi krajšajo, burja pa se krepi."'],
  [7, 25,  'Sv. Jakob (25. jul.): "Po sv. Jakobu sonce nazaj korako." Dan se opazno krajša, poletje je v vrhuncu.'],
  [8, 10,  'Sv. Lovrenc (10. avg.): "Sv. Lovrenc rose meče." Prve jutranje rose naznanjajo konec poletja.'],
  [8, 15,  'Velika Mašnjica (15. avg.): "Po Veliki Mašnjici bele nogavice." Na Krasu to pomeni prve megle v dolinah zjutraj.'],
  [8, 24,  'Sv. Bart (24. avg.): "Sv. Bart kožuh part." Po njem so noči hladnejše, jesenska burja se zbuja.'],
  [9,  1,  '"September — vreme se obrne." Jadransko morje je najtoplejše, a nevihte postajajo pogostejše in intenzivnejše.'],
  [9, 29,  'Sv. Mihael (29. sep.): "Po Mihaelu zima kaplje z neba." Jesenski deževni čas se začenja.'],
  [10, 18, 'Sv. Luka (18. okt.): "Sv. Luka belo kapo puka." Na ta dan se prvič pojavi sneg na Snežniku in Nanosu.'],
  [10, 28, 'Sv. Simon in Juda (28. okt.): "Simon in Juda — v hišo buda." Čas za zatesnitev oken pred burjo.'],
  [11, 11, 'Sv. Martin (11. nov.): "Sv. Martin pride na belem konju." Pogosto prvi sneg ali slana. In seveda — mošt postane vino!'],
  [11, 25, 'Sv. Katarina (25. nov.): "Sv. Katarina sneg belina." Na ta dan je sneg na Krasu pogost gost.'],
  [12,  4, 'Sv. Barbara (4. dec.): "Sv. Barbara prinaša zimo na bara." Ker iz veje češnje odrezano vejico damo v vodo — če procveti do Božiča, bo dobra letina.'],
  [12, 13, 'Sv. Lucija (13. dec.): "Sv. Lucija — noč je daljša od dneva." Blizu zimskega solsticija, ko je dan najkrajši.'],
  [12, 21, 'Zimski solsticij — najkrajši dan leta. "Po sv. Tomažu (21. dec.) dan za kokošji korak." Dnevi se počasi začnejo daljšati.'],
  [12, 25, '"Jasno na Božič — hladen januar." Anticiklon ob Božiču pogosto napoveduje mrzlo novo leto na Krasu.'],
  [12, 31, '"Kakršno vreme zadnji dan leta, takšno bo vse naslednje leto." — Staro slovensko vremensko izročilo za silvestrov dan.'],
];

/**
 * Vrne pregovor za današnji datum ali null.
 */
function todayProverb() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const found = DATE_PROVERBS.find(([pm, pd]) => pm === m && pd === d);
  return found ? found[2] : null;
}

// ——— 3. Dinamična dejstva iz meritev ——————————————————————————————————

/**
 * Vrne 0–2 dinamična dejstva glede na trenutne meritve.
 * @param {{ temp, humidity, pressure, windDir, windSpeed, windGust, solar, precipRate }} latest
 */
function dynamicFacts(latest) {
  if (!latest) return [];
  const facts = [];
  const { temp, humidity, pressure, windDir, windGust, solar, precipRate } = latest;

  // Rosišče
  if (temp != null && humidity != null && humidity > 0) {
    const dp = temp - (100 - humidity) / 5;
    if (dp > 20) {
      facts.push(`Točka rosišča je danes ${dp.toFixed(1)}°C — tropska vlažnost. Zrak vsebuje toliko vlage, da se kondenzacija začne že ob minimalnem ohlajanju.`);
    } else if (dp > 15) {
      facts.push(`Točka rosišča je ${dp.toFixed(1)}°C. Ko se bo temperatura spustila na to vrednost, bo nastala rosa ali megla.`);
    } else if (dp < 0) {
      facts.push(`Točka rosišča je ${dp.toFixed(1)}°C — zrak je zelo suh. Vlažnost kože in sluznic se pri tem hitreje izgublja.`);
    }
  }

  // Tlak
  if (pressure != null) {
    if (pressure > 1025) {
      facts.push(`Tlak ${pressure.toFixed(0)} hPa kaže na močan anticiklon — stabilno, jasno vreme. Nad 1020 hPa je "lepo vreme" v večini primerov.`);
    } else if (pressure < 995) {
      facts.push(`Tlak ${pressure.toFixed(0)} hPa je nizek — ciklon prinaša slabo vreme. Vsak padec za 1 hPa/uro je opozorilni znak za nevihto.`);
    } else {
      facts.push(`Tlak ${pressure.toFixed(0)} hPa je blizu normale (1013 hPa) — prehodno vreme brez izrazitih sistemov.`);
    }
  }

  // Sončno obsevanje
  if (solar != null && solar > 800) {
    facts.push(`Sončno obsevanje ${solar.toFixed(0)} W/m² — to je ${(solar / 1361 * 100).toFixed(0)}% sončne konstante. Pri taki intenziteti sonce segreje temno površino za ~30°C v minuti.`);
  }

  // Burja indikator
  if (windDir != null && windGust != null) {
    const isBora = windDir >= 0 && windDir <= 70;
    if (isBora && windGust > 8) {
      const bfStr = windGust < 10 ? 'šibka' : windGust < 15 ? 'zmerna' : windGust < 20 ? 'močna' : 'orkanska';
      facts.push(`Veter piha iz smeri ${windDir.toFixed(0)}° s sunki ${windGust.toFixed(1)} m/s — to je ${bfStr} burja. Burja nastane ko hladni zrak s Panonske nižine preteče čez Kras proti toplemu Jadranu.`);
    }
  }

  // Dež
  if (precipRate != null && precipRate > 5) {
    facts.push(`Intenziteta dežja ${precipRate.toFixed(1)} mm/h je ${precipRate > 15 ? 'močna ploha' : 'zmeren dež'}. Oblak ki povzroča takšen dež vsebuje do milijon ton vode.`);
  }

  // Vrni max 1 dinamično dejstvo
  return facts.slice(0, 1);
}

// ——— 3. Astronomska / sezonska dejstva ——————————————————————————————————

function astronomicalFact() {
  const now    = new Date();
  const sun    = sunriseSunset(now);
  const moon   = moonPhase(now);
  const facts  = [];

  if (sun) {
    const dayH = Math.floor(sun.dayMinutes / 60);
    const dayM = sun.dayMinutes % 60;

    // Solsticij / ekvinokcij
    const month = now.getMonth() + 1;
    const day   = now.getDate();

    // Poletni solsticij ~21. junija
    const daysToSummerSol = daysBetween(now, new Date(now.getFullYear(), 5, 21));
    if (Math.abs(daysToSummerSol) <= 3) {
      facts.push(`${daysToSummerSol === 0 ? 'Danes je' : daysToSummerSol > 0 ? `Čez ${daysToSummerSol} dni bo` : `Pred ${-daysToSummerSol} dnevi je bil`} poletni solsticij — najdaljši dan leta. Dan traja danes ${dayH}h ${dayM}min.`);
    }
    // Zimski solsticij ~21. decembra
    const daysToWinterSol = daysBetween(now, new Date(now.getFullYear(), 11, 21));
    if (Math.abs(daysToWinterSol) <= 3) {
      facts.push(`${daysToWinterSol === 0 ? 'Danes je' : daysToWinterSol > 0 ? `Čez ${daysToWinterSol} dni bo` : `Pred ${-daysToWinterSol} dnevi je bil`} zimski solsticij — najkrajši dan leta (${dayH}h ${dayM}min).`);
    }

    // Dolžina dneva
    if (sun.dayMinutes > 14 * 60) {
      facts.push(`Dan danes traja ${dayH}h ${dayM}min — eden najdaljših dni v letu. Sonce vzide ob ${fmtTime(sun.sunrise)} in zaide ob ${fmtTime(sun.sunset)}.`);
    } else if (sun.dayMinutes < 9 * 60) {
      facts.push(`Dan danes traja le ${dayH}h ${dayM}min — blizu najkrajšega dne. Do solsticija sonce vsak dan vzide malo pozneje.`);
    }
  }

  // Luna
  if (moon.daysToFull < 2) {
    facts.push(`${moon.daysToFull < 0.5 ? 'Danes je' : 'Kmalu bo'} polna luna (${moon.illum}% osvetljenosti). Polna luna povzroči "pomladne plime" — morje se dvigne višje kot ob četrtinah.`);
  } else if (moon.daysToNew < 2) {
    facts.push(`Bliža se mlaj — luna je skoraj nevidna (${moon.illum}% osvetljenosti). Mlaj prav tako povzroči višje plime kot ob četrtinah.`);
  }

  return facts[0] ?? null;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86_400_000);
}

function fmtTime(d) {
  return d?.toLocaleTimeString('sl-SI', {
    timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit',
  }) ?? '—';
}

// ——— Glavni export —————————————————————————————————————————————————————

/**
 * Vrne 1–2 dejstvi za danes.
 * @param {object|null} latest – trenutne meritve iz stations.js
 * @returns {{ primary: string, secondary: string|null }}
 */
export function getDayFacts(latest = null) {
  const now     = new Date();
  const dayOfYr = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86_400_000);

  // Na pravi datum pokaži pregovor kot primarno
  const proverb = todayProverb();
  const trivia  = TRIVIA[dayOfYr % TRIVIA.length];
  const primary = proverb ?? trivia;

  // Astronomsko ali dinamično dejstvo za sekundarno
  const astro    = astronomicalFact();
  const dynamic  = dynamicFacts(latest);
  // Če je danes pregovor, dodaj še trivia kot sekundarno
  const secondary = proverb ? trivia : (astro ?? dynamic[0] ?? null);

  return { primary, secondary };
}

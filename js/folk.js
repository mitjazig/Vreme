/**
 * Ljudski reki in »na današnji dan« – slovensko vremensko izročilo
 * (Kras / Primorska kjer je smiselno).
 */

/** [mesec, dan, rek, ime dneva] */
const DATE_SAYINGS = [
  [1, 1, 'Kakršno vreme je na Novo leto, takšno bo celo leto.', 'Novo leto'],
  [1, 6, 'Na sv. Tri kralje gre burja na počitnice ali pa pride z vso silo — vmesnega ni.', 'Sv. Tri kralje'],
  [1, 17, 'Sv. Anton: če z dežjem pride, še dolgo dežuje.', 'Sv. Anton'],
  [1, 20, 'Kdor na Fabijana seje, do sv. Jurija žanje.', 'Sv. Fabijan'],
  [1, 25, 'Na Pavla dan: če je oblačen, bo trebuh večkrat lačen.', 'Sv. Pavel'],
  [2, 2, 'Kadar Svečnica sveti, zima se podi; kadar Svečnica joče, zima se noče.', 'Svečnica'],
  [2, 14, 'Na Valentina začnejo ptice iskati par — znak, da je najhujši del zime mimo.', 'Sv. Valentin'],
  [2, 24, 'Sv. Matija led razbija ali pa ga naredi.', 'Sv. Matija'],
  [3, 12, 'Gregorjevo — dan in noč enako.', 'Gregorjevo'],
  [3, 19, 'Kadar sv. Jožef v rokavicah hodi, pomlad po snegu prihodi.', 'Sv. Jožef'],
  [3, 21, 'Če marec suši, april joče; če marec joče, april se smeje.', 'Pomlad'],
  [4, 1, 'April, april, dela kar mu je drago.', '1. april'],
  [4, 23, 'Na sv. Jurija trava raste čez kopita.', 'Sv. Jurij'],
  [4, 25, 'Sv. Marko: če dežuje, bodo žita dobra.', 'Sv. Marko'],
  [5, 1, 'Kdor se umije z majsko roso, bo zdrav celo leto.', '1. maj'],
  [5, 12, 'Ledeni možje (Pankracij): če prej slane ni bilo, tudi pozneje ne bo mrzlo.', 'Ledeni možje'],
  [5, 13, 'Servacij: če je pred njim poletje, mraz rad pritiska na cvetje.', 'Sv. Servacij'],
  [5, 14, 'Bonifacij zaključi ledene može — še en dan previdnosti za vrt.', 'Sv. Bonifacij'],
  [5, 15, 'Hladna Zofija zaključi ledene može. Po njej so jutranje pozebe redke.', 'Sv. Zofija'],
  [6, 8, 'Sv. Medard deževen — štirideset dni deževen.', 'Sv. Medard'],
  [6, 21, 'Po sv. Ivanu dnevi krajšajo, burja pa se krepi.', 'Poletni solsticij'],
  [6, 24, 'Na kresi se dan obesi — noči postajajo daljše.', 'Kres'],
  [7, 15, 'Sv. Margareta: če dežuje, bodo orehi debeli.', 'Sv. Margareta'],
  [7, 25, 'Po sv. Jakobu sonce nazaj korako.', 'Sv. Jakob'],
  [8, 10, 'Sv. Lovrenc rose meče — prve jutranje rose.', 'Sv. Lovrenc'],
  [8, 15, 'Po Veliki Mašnjici bele nogavice — prve megle v dolinah.', 'Velika maša'],
  [8, 24, 'Sv. Bart kožuh part — noči so hladnejše.', 'Sv. Bart'],
  [9, 1, 'September — vreme se obrne; Jadran je še topel, nevihte pa močnejše.', '1. september'],
  [9, 8, 'Marijino ime: če lepo, še dolgo lepa jesen.', 'Marijino ime'],
  [9, 21, 'Sv. Matevž: če dežuje, bo jesen mokra.', 'Sv. Matevž'],
  [9, 29, 'Po Mihaelu zima kaplje z neba.', 'Sv. Mihael'],
  [10, 4, 'Sv. Frančišek: če lepo, še dolga jesen.', 'Sv. Frančišek'],
  [10, 16, 'Če je Gal suhoparen, oznanjuje, da ob letu suša pripotuje.', 'Sv. Gal'],
  [10, 18, 'Sv. Luka belo kapo puka — sneg na Snežniku in Nanosu.', 'Sv. Luka'],
  [10, 21, 'Kakršno vreme Urša prinese, tako se rada jesen in zima obnese.', 'Sv. Uršula'],
  [10, 28, 'Simon in Juda — v hišo buda. Čas za zatesnitev oken pred burjo.', 'Simon in Juda'],
  [10, 31, 'Ob koncu vinotoka: če mraz in burja brije, prosinca in svečana sonce sije.', 'Dan reformacije'],
  [11, 1, 'Vse svete: če dežuje, bo zima mila; če jasno, mraz trd.', 'Vsi sveti'],
  [11, 11, 'Sv. Martin pride na belem konju — pogosto prvi sneg ali slana.', 'Sv. Martin'],
  [11, 25, 'Sv. Katarina sneg belina.', 'Sv. Katarina'],
  [11, 30, 'Sv. Andrej: če dežuje, bo zima mokra.', 'Sv. Andrej'],
  [12, 4, 'Sv. Barbara prinaša zimo na bara.', 'Sv. Barbara'],
  [12, 6, 'Sv. Nikolaj: če sneži, bo zima bela.', 'Sv. Miklavž'],
  [12, 13, 'Sv. Lucija — noč je daljša od dneva.', 'Sv. Lucija'],
  [12, 21, 'Po sv. Tomažu dan za kokošji korak — dnevi se počasi daljšajo.', 'Zimski solsticij'],
  [12, 25, 'Jasno na Božič — hladen januar.', 'Božič'],
  [12, 26, 'Štefanovo: če jasno, bo zima trda.', 'Štefanovo'],
  [12, 31, 'Kakršno vreme zadnji dan leta, takšno bo vse naslednje leto.', 'Silvestrovo'],
];

/** Mesečni reki (rezerva, če ni dneva) */
const MONTH_SAYINGS = {
  1: [
    'Prosinec mili, bog se usmili.',
    'Če prosinca ne sneži, rad sušec to nadomesti.',
    'Januarja mraz, burja in jasno nebo — tipična zima na Krasu.',
  ],
  2: [
    'Sušec: če se da orati, bo treba aprila jokati.',
    'Če sušca grmi, dobra letina prihiti.',
    'Februar lomi zimo — ali pa jo še okrepi.',
  ],
  3: [
    'Če v marcu letajo mušice, v aprilu vzemi rokavice.',
    'Marec suh, april moker — ali obratno, tako je.',
    'Po Gregorju od vsakega vetra sneg kopni.',
  ],
  4: [
    'April se menja kot dlan — sonce, toča, potem spet jasno.',
    'Apričevo deževje napolni vodnjake.',
    'Kdor aprila seje, maja žanje — če vreme pusti.',
  ],
  5: [
    'Majska pozeba je hujša od zimske — cvetje jo čuti.',
    'Po ledenih možeh šele varno sajenje na prostem.',
    'Majski dež napolni sode.',
  ],
  6: [
    'Junij vroče, žito bo peče.',
    'Če junija grmi, bodo žita dobra.',
    'Po kresi se dan skrajša, noči pa ohladijo.',
  ],
  7: [
    'Julij peče — burja pa hladi Kras.',
    'Sušni julij napoveduje bogato jesen vino.',
    'Nevihte julija so kratke, a ostre.',
  ],
  8: [
    'Če se avgusta po gorah kadi, kupi si kožuh za zimske dni.',
    'Avgusta se noči ohladijo, rosa je gostejša.',
    'Topla jesen se rodi že v avgustu.',
  ],
  9: [
    'Topla jesen oznanjuje, da se zima težko odmikuje.',
    'September — babje poletje ali prvi jesenski dež.',
    'Če hrast še listje obdrži, bo mraz vse zimske dni.',
  ],
  10: [
    'Če vinotoka mraz in burja brije, prosinca in svečana sonce sije.',
    'Vinotoka če zmrzuje, pa prosinca odjenjuje.',
    'V oktobru burja, mraz — januarja sončen čas.',
    'Vreme vinotoka je aprilu za poroka.',
    'Vinotoka deževanje, grudna vetrov divjanje.',
  ],
  11: [
    'November — megla, burja ali prvi sneg.',
    'Če listje dolgo visi, bo zima mila.',
    'Martinsko vreme pogosto prinese belino.',
  ],
  12: [
    'Če se zgodaj selijo ptiči, bo huda zima o božiči.',
    'Dosti snega, dosti sena.',
    'Jasno božično nebo — mraz v novo leto.',
  ],
};

/**
 * Zgodovinski / koledarski zapisi za dan (vreme, Kras, SI).
 * [mesec, dan, besedilo]
 */
const ON_THIS_DAY = [
  [1, 1, 'Novo leto: v pratikah so kmetje že stoletja gledali vreme prvega dne kot znamenje za celo leto.'],
  [1, 6, 'Sv. Tri kralje: na Primorskem pogosto zamenja vremenski režim — burja ali jugo.'],
  [2, 2, 'Svečnica je bila mejnik zime: kmečki koledarji so po jasnosti dneva sklepali, kako dolga bo zima.'],
  [3, 21, 'Okoli spomladanskega enakonočja se dan in noč izenačita — stari koledarji so to povezovali z Gregorjevim.'],
  [4, 23, 'Jurjevo: v ljudskem koledarju začetek prave pomladi in paše; vreme na Jurija je bilo znamenje za rast.'],
  [5, 12, 'Ledeni možje (12.–14. maj): v vinogradih so nekoč kurili proti pozebi — še danes jih vrtičkarji upoštevajo.'],
  [5, 15, 'Po Zofiji so v izročilu jutranje pozebe redkejše — sajenje toploljubnih rastlin je varnejše.'],
  [6, 8, 'Medardovo vreme so stoletja uporabljali kot »statistiko« za naslednje tedne dežja (~polovična zanesljivost).'],
  [6, 21, 'Poletni solsticij: najdaljši dan; na Krasu se potem noči počasi daljšajo, burja pa pogosteje ohlaja.'],
  [8, 15, 'Velika maša: ljudsko znamenje prvih jesenskih meglic v dolinah, tudi ob še toplem dnevu.'],
  [9, 29, 'Mihaelovo: v pratikah začetek jesenskega deževnega časa in krajšanja dneva.'],
  [10, 4, 'Začetek oktobra: vinotoč — čas trgatve; vreme odloča o kakovosti vina na Krasu in Vipavskem.'],
  [10, 16, 'Sv. Gal: v starih pregovornikih povezan z znamenjem suše ali vlage za prihodnje leto.'],
  [10, 18, 'Sv. Luka: na Snežniku in Nanosu se pogosto pojavi prva belina — mejnik jeseni v visokogorju.'],
  [10, 21, 'Uršula: v slovenskih pregovorih močan znak za celotno jesen in zimo.'],
  [10, 28, 'Simon in Juda: v izročilu čas, ko se hiša »zapre« pred burjo in jesenskim mrazom.'],
  [10, 29, 'Konec oktobra: vinotok se izteka; v ljudskem koledarju se že meri zima — burja, megla ali prvi sneg v gorah.'],
  [10, 31, 'Pred vsemi svetimi: stari rek o burji v vinotoku in milejšem prosincu / svečanu.'],
  [11, 1, 'Vsi sveti: vreme tega dne so povezovali z milino ali trdoto zime.'],
  [11, 11, 'Martinovo: »beli konj« — prvi sneg/slana; hkrati blagoslov vina (mošt postane vino).'],
  [12, 13, 'Lucija blizu najkrajših dni — v ljudskem izročilu noč, ki »vlada« dnevu.'],
  [12, 21, 'Zimski solsticij: po Tomažu se dan za »kokošji korak« daljša — znamenje, da se zima obrača.'],
  [12, 25, 'Božič: jasno nebo so pogosto brali kot znamenje hladnega januarja.'],
];

/** Sezonski zgodovinski odstavki po desetdnevju meseca (rezerva) */
const DECADE_HISTORY = {
  1: ['V januarju so na Krasu burja in jasne noči pogosto prinesle najnižje temperature leta.', 'Zimski anticikloni so v preteklosti večkrat prinesli inverzijo: megla v Kopru, sonce na Rakitovcu.'],
  2: ['Februar lomi zimo — v arhivih so tako mile kot ostre svečane, odvisno od leta.', 'Sušec je bil za kmete mesec priprav na pomlad in opazovanja prvih znakov vegetacije.'],
  3: ['Marec prinese prve tople jugo dneve, a tudi pozne snežne epizode v notranjosti.', 'Spomladanski prehodi front so na Primorskem znani po hitri menjavi burje in juga.'],
  4: ['Aprilsko vreme je v slovenskih pratikah sinonim za nestabilnost — sonce, ploha, spet jasno.', 'Na Krasu april pogosto že omogoči delo na prostem, a noči so lahko še hladne.'],
  5: ['Maj je mesec pozeb in cvetenja — ljudski koledar z ledenimi možmi je bil praksa vinogradnikov.', 'Po sredini maja se v arhivih pogosteje začnejo prve poletne nevihte.'],
  6: ['Junij: dolgi dnevi, prve vročinske epizode in Medardovo »deževno znamenje«.', 'Ob jadranski obali junij že vabi k kopanju, na Rakitovcu pa so noči še sveže.'],
  7: ['Julijske vročine so v zadnjih desetletjih pogostejše; burja pa še vedno ohladi Kras.', 'Nevihte s točo so poleti na Primorskem lokalne, a lahko hude.'],
  8: ['Avgusta se Jadran ohlaja počasneje kot zrak — topla jesen se rodi iz toplega morja.', 'Po Veliki maši ljudsko izročilo že išče prve megle in hladnejše noči.'],
  9: ['September: babje poletje ali prvi jesenski cikloni — trgatev je odvisna od vremena.', 'Mihaelovo je v pratikah mejnik jesenskega deževja.'],
  10: ['Oktober (vinotok) je na Krasu čas burje, trgatve in prvih snežnih kap na Nanosu.', 'V pregovornikih oktober napoveduje januar — mraz in burja zdaj, milejše pozneje (ali obratno).', 'Zgodovina meritev kaže, da so oktobrski deževni dnevi pogosto bogati s padavinami.'],
  11: ['November prinese meglice, prvi sneg v gorah in Martinovo belino.', 'Burja v novembru je bila nekoč znak, da je treba zavarovati hišo in živino.'],
  12: ['December: najkrajši dnevi, Božič kot vremensko znamenje za januar.', 'Zimski solsticij so v ljudskem koledarju slavili kot obračanje sonca.'],
};

function md(date = new Date()) {
  return { m: date.getMonth() + 1, d: date.getDate() };
}

/**
 * Ljudski rek za dan: najprej točen dan, sicer mesec.
 * @returns {{ text: string, label: string, kind: 'dan'|'mesec', name: string|null }}
 */
export function getFolkSaying(date = new Date()) {
  const { m, d } = md(date);
  const exact = DATE_SAYINGS.find(([pm, pd]) => pm === m && pd === d);
  if (exact) {
    return { text: exact[2], label: 'Ljudski rek dneva', kind: 'dan', name: exact[3] };
  }
  // najbližji ±2 dni
  for (const delta of [1, -1, 2, -2]) {
    const near = DATE_SAYINGS.find(([pm, pd]) => pm === m && pd === d + delta);
    if (near) {
      return {
        text: near[2],
        label: `Rek okoli ${near[3]}`,
        kind: 'dan',
        name: near[3],
      };
    }
  }
  const list = MONTH_SAYINGS[m] ?? ['Vreme dela po svoje — ljudje pa so ga stoletja brali iz znakov.'];
  const text = list[(d - 1) % list.length];
  const monthName = date.toLocaleDateString('sl-SI', { month: 'long' });
  return {
    text,
    label: `Ljudski rek · ${monthName}`,
    kind: 'mesec',
    name: null,
  };
}

/**
 * Kratka zgodovinska nota za današnji koledarski dan.
 */
export function getOnThisDayNote(date = new Date()) {
  const { m, d } = md(date);
  const exact = ON_THIS_DAY.find(([pm, pd]) => pm === m && pd === d);
  if (exact) return exact[2];
  for (const delta of [1, -1]) {
    const near = ON_THIS_DAY.find(([pm, pd]) => pm === m && pd === d + delta);
    if (near) return near[2];
  }
  const decade = DECADE_HISTORY[m] ?? [];
  if (!decade.length) return null;
  return decade[(d - 1) % decade.length];
}

/** Združi podatek za UI */
export function getFolkAndHistory(date = new Date()) {
  return {
    saying: getFolkSaying(date),
    history: getOnThisDayNote(date),
  };
}

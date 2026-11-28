// HR-analytics in rapporten, exports en bij een meelezer (BOUWPLAN §3.6, B17). Zuivere module: de Worker gebruikt
// hem ook (controleerKerncijfers bij PUT /feiten, kerncijfersVoorKijker bij de deellink). Importeert alleen privacy.js
// en opmaak.js, nooit rapport-feiten.js (geen kringverwijzing).
//
// - kerncijfersVoorKijker: wat een meelezer van de kerncijfers mag zien (zonder tussenstand niets van een vragenlijst
//   die op de peildatum openstond, behalve het aantal ingevulde vragenlijsten; personeelscijfers alleen als het
//   hoofdstuk HR-kengetallen aanstaat);
// - controleerKerncijfers: tweede controle op de server (geen getoond aantal van 1 tot 4, geen getal in een verborgen
//   cel, geen verzuim van een groep onder de 10, geen onbekende onderdelen). Dit is een vangnet, geen garantie: het
//   aanvullend verbergen zelf zit in privacy.js en is daar getest (K P11);
// - kerncijferBlokken / kerncijferFiguren / kerncijferBladen / kerncijferTekst: de kerncijfers als rapportblokken
//   (met figuren), als Excel-bladen en als platte tekst. Een verborgen getal is overal "×" (B29).

import { DREMPEL, VERBORGEN, VERBORGEN_UITLEG, LABEL_OVERIG } from './privacy.js';
import { nlGetal, nlProcent, metTeken, pTekst, nlDatum } from './opmaak.js';

/** De onderdelen van Kerncijfers v1 (andere onderdelen weigert de server). */
export const ONDERDELEN = ['versie', 'peildatum', 'drempel', 'onderzoek', 'lijst', 'deelname', 'kenmerken', 'scores', 'groepen',
  'drijvers', 'signalen', 'verloop', 'kwaliteit', 'benchmarks', 'eigen_cijfers', 'personeel'];
/** Zoveel medewerkers moet een groep minstens hebben voor verzuimcijfers (zoals personeel-regels.js MIN_VERZUIM). */
export const MIN_VERZUIM = 10;
const GEZONDHEID = ['verzuim_pct', 'meldingsfrequentie', 'gem_duur_per_melding', 'nulverzuim_pct'];
// Aantallen van personen: getoond alleen 0 of minstens d.
const AANTALLEN = new Set(['n', 'medewerkers', 'populatie', 'aantal', 'n_beantwoord', 'n_lijst', 'rechte_lijn', 'antwoorden']);
// Getallen die ook in een verborgen onderdeel mogen staan (namen en kenmerken van het onderdeel zelf, geen uitkomsten).
// n_lijst: het aantal respondenten van de vragenlijst (staat ook bij een verborgen vraag; wordt wel als aantal gecontroleerd).
const SLEUTELGETALLEN = new Set(['id', 'vraag_id', 'thema_id', 'meetmoment_id', 'stam', 'aantal_vragen', 'drempel', 'versie', 'grens', 'rechte_lijn_min', 'aantal_schaalvragen', 'uren_per_fte', 'n_lijst']);

const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// ---------- Meelezer ----------

/**
 * De kerncijfers voor een meelezer (B17/B8). Zonder tussenstand verdwijnt alles wat uit een vragenlijst komt die op de
 * peildatum openstond, behalve het aantal ingevulde vragenlijsten. Zonder metPersoneel verdwijnen de personeelscijfers
 * (en de benchmarks die erop rusten). Geeft een nieuw object; k blijft zoals het was.
 */
export function kerncijfersVoorKijker(k, { tussenstand = false, metPersoneel = false } = {}) {
  const uit = JSON.parse(JSON.stringify(k));
  const open = !tussenstand && uit.lijst?.status === 'open';
  if (!tussenstand) {
    for (const l of uit.deelname?.lijsten || []) {
      if (l.status !== 'open') continue;
      l.respons_pct = null;
      l.foutmarge_pp = null;
      l.controleer_aantallen = false;
    }
  }
  if (open) {
    const l = uit.lijst;
    uit.lijst = { id: l.id, titel: l.titel, meetmoment_naam: l.meetmoment_naam, status: l.status, n: l.n, uitgenodigd: null, respons_pct: null, foutmarge_pp: null, van: null, tot: null, verborgen: l.verborgen, open: true };
    uit.deelname.per_dag = [];
    uit.deelname.per_dag_samengevoegd = false;
    uit.kenmerken = [];
    uit.scores = { themas: [], enps: null, cijfers: [], sterkst: [], zwakst: [] };
    uit.groepen = [];
    uit.drijvers = null;
    uit.signalen = [];
    uit.kwaliteit = null;
  }
  if (uit.verloop && !tussenstand) {
    const openMm = new Set((uit.verloop.respons || []).filter((p) => p.open).map((p) => p.meetmoment_id));
    for (const t of uit.verloop.themas || []) {
      t.punten = t.punten.map((p) => (p.open ? { meetmoment_id: p.meetmoment_id, gemiddelde: null, n: null, open: true } : p));
    }
    uit.verloop.enps = (uit.verloop.enps || []).map((p) => (p.open ? { meetmoment_id: p.meetmoment_id, score: null, n: null, open: true } : p));
    uit.verloop.respons = (uit.verloop.respons || []).map((p) => (p.open ? { ...p, respons_pct: null } : p));
    uit.verloop.toetsen = (uit.verloop.toetsen || []).filter((t) => !t.open && !openMm.has(t.van?.meetmoment_id) && !openMm.has(t.naar?.meetmoment_id));
  }
  if (!metPersoneel) uit.personeel = null;
  uit.benchmarks = (uit.benchmarks || []).map((b) => {
    const vanPersoneel = b.sleutel === 'verzuim_pct' || b.sleutel === 'verloop_pct';
    const vanLijst = !vanPersoneel;
    if ((vanPersoneel && !metPersoneel) || (vanLijst && open)) return { ...b, eigen_waarde: null };
    return b;
  });
  return uit;
}

// ---------- Controle op de server ----------

/**
 * Tweede controle (vangnet) op kerncijfers die in een rapport worden vastgelegd. Gooit Error(tekst) als:
 * - er onbekende onderdelen zijn, of de vorm niet klopt;
 * - een getoond aantal (n, medewerkers, populatie, aantal …) tussen 0 en d ligt (behalve de verdeling van een
 *   rapportcijfer: een mening, zoals op het dashboard);
 * - een verborgen onderdeel toch een getal bevat;
 * - verzuimcijfers getoond worden van een groep met minder dan 10 medewerkers.
 */
export function controleerKerncijfers(k, d = DREMPEL) {
  const fout = (m) => { throw new Error(`De kerncijfers zijn niet veilig: ${m}`); };
  if (!isObject(k)) fout('geen kerncijfers.');
  for (const sleutel of Object.keys(k)) if (!ONDERDELEN.includes(sleutel)) fout(`onbekend onderdeel "${sleutel}".`);
  if (k.versie !== 1) fout('onbekende versie.');
  if (eindig(k.drempel) && k.drempel < d) fout('de drempel is te laag.');
  const loop = (x, pad, verborgen) => {
    if (Array.isArray(x)) {
      if (x.length > 2000) fout(`te lange lijst bij ${pad}.`);
      x.forEach((y, i) => loop(y, `${pad}[${i}]`, verborgen));
      return;
    }
    if (!isObject(x)) return;
    const hier = verborgen || x.verborgen === true;
    for (const [s, w] of Object.entries(x)) {
      const p = `${pad}.${s}`;
      if (eindig(w)) {
        if (hier && !SLEUTELGETALLEN.has(s)) fout(`een verborgen onderdeel bevat een getal (${p}).`);
        const meningsverdeling = /\.scores\.cijfers\[\d+\]\.verdeling\[\d+\]$/.test(pad);
        if (AANTALLEN.has(s) && !meningsverdeling && w > 0 && w < d) fout(`een aantal onder de ${d} is zichtbaar (${p} = ${w}).`);
      } else if (w !== null && typeof w === 'object') loop(w, p, hier);
    }
  };
  loop(k, 'kerncijfers', false);
  // Verzuim per groep en voor de organisatie alleen bij minstens 10 medewerkers.
  const p = k.personeel;
  if (p) {
    if (!isObject(p)) fout('personeel heeft een ongeldige vorm.');
    const gezond = (rij, wat) => {
      if (!GEZONDHEID.some((g) => eindig(rij?.[g]))) return;
      if (!(eindig(rij.medewerkers) && rij.medewerkers >= MIN_VERZUIM)) fout(`verzuim van ${wat} met minder dan ${MIN_VERZUIM} medewerkers.`);
    };
    gezond(p.totaal, 'de organisatie');
    for (const g of p.per_groep || []) for (const r of g.rijen || []) gezond(r, `de groep "${r.label}"`);
  }
  return true;
}

// ---------- Teksten ----------

const VERBORGEN_ZIN = `${VERBORGEN} = niet getoond: minder dan ${DREMPEL} respondenten, of verborgen zodat een klein aantal niet terug te rekenen is.`;
if (VERBORGEN_ZIN !== VERBORGEN_UITLEG) throw new Error('VERBORGEN_UITLEG veranderd: pas hr-rapport.js aan.');

const getal = (x, dec = 1) => (eindig(x) ? nlGetal(x, dec) : VERBORGEN);
const procent = (x) => (eindig(x) ? nlProcent(x) : VERBORGEN);
const aantal = (x) => (eindig(x) ? nlGetal(x, 0) : VERBORGEN);
const score = (x) => (eindig(x) ? metTeken(Math.round(x), 0) : VERBORGEN);
const NAAR = {
  afdeling: 'afdeling', leeftijd: 'leeftijd', geslacht: 'geslacht', diensttijd: 'diensttijd', contract: 'soort dienstverband',
  uren: 'arbeidsuren', functieniveau: 'functieniveau', leidinggevend: 'leidinggeven', locatie: 'locatie', opleiding: 'opleidingsniveau',
};

/** "Bij 62 van de 130 medewerkers is de foutmarge ongeveer ±9 procentpunt (95%)." */
export function foutmargeZin(n, N, marge) {
  if (!eindig(marge) || !eindig(n) || !eindig(N)) return null;
  return `Bij ${aantal(n)} van de ${aantal(N)} medewerkers is de foutmarge ongeveer ±${Math.round(marge)} procentpunt (95%).`;
}
export const FOUTMARGE_UITLEG = 'Dit gaat uit van toeval; als vooral tevreden of juist ontevreden mensen meededen, zegt de foutmarge daar niets over.';
export const SAMENHANG_UITLEG = (uitkomst) => `Samenhang is geen oorzaak. Een sterke samenhang betekent dat mensen die dit thema hoog scoren, ook ${uitkomst} hoger scoren.`;
/** De uitkomst van "Wat hangt samen met …?" kort, voor een kop: "de eNPS", "het rapportcijfer", het thema of de vraag. */
export function uitkomstKort(u) {
  if (u?.soort === 'cijfer_nps') return 'de eNPS';
  if (u?.soort === 'cijfer_rapport') return 'het rapportcijfer';
  const naam = String(u?.naam ?? '');
  if (u?.soort === 'thema') return `het thema "${naam}"`;
  return `"${naam.length > 60 ? `${naam.slice(0, 59)}…` : naam}"`;
}
export const ENPS_UITLEG = 'Een eNPS loopt van −100 tot +100. Promotors gaven een 9 of 10, criticasters 0 tot en met 6.';
export const TER_VERGELIJKING = 'Ter vergelijking';
export const VERZUIM_VERBORGEN = 'Verzuim van deze groep niet getoond: te klein, of het cijfer zou vooral over één persoon gaan.';
/** Uitleg bij × in personeelscijfers (aantallen medewerkers in plaats van respondenten). */
export const PERSONEEL_VERBORGEN = `${VERBORGEN} = niet getoond: minder dan ${DREMPEL} medewerkers (bij verzuim: minder dan 10), of verborgen zodat een klein aantal niet terug te rekenen is.`;
export const DAGEN_UITLEG = 'Verzuim in kalenderdagen, gewogen naar de deeltijdfactor; de dagen zijn gebruikt zoals ze in het bestand stonden.';
/** De vraag bij het inlezen (K S4) en wat er bij het verzuim staat, per antwoord. */
export const ZWANGERSCHAP_VRAAG = 'Tellen zwangerschapsverlof en bevallingsverlof mee? Volgens de gangbare norm niet.';
export const ZWANGERSCHAPSVERLOF = {
  telt_niet: 'Zwangerschaps- en bevallingsverlof tellen niet mee (de gangbare norm).',
  telt_mee: 'Zwangerschaps- en bevallingsverlof tellen mee in het verzuim; volgens de gangbare norm horen ze er niet bij.',
  onbekend: 'Niet bekend of zwangerschaps- en bevallingsverlof meetellen; volgens de gangbare norm horen ze er niet bij.',
};

/**
 * De zinnen bij de representativiteit (K S13): het oordeel, en bij een afwijking per groep met minstens 5 procentpunt
 * verschil of die onder- of oververtegenwoordigd is.
 */
export function representativiteitZinnen(km) {
  const r = km?.representativiteit;
  if (!r) return [];
  const naar = NAAR[km.kenmerk] || `"${km.tekst}"`;
  const uit = [];
  if (r.oordeel === 'geen_aanwijzing') {
    uit.push(`Er is geen duidelijke aanwijzing dat de respondenten naar ${naar} afwijken van de organisatie (chi-kwadraattoets, ${pTekst(r.p)}). Bij weinig respondenten zegt dat weinig.`);
  } else if (r.oordeel === 'wijkt_af') {
    uit.push(`Naar ${naar} wijkt de groep respondenten af van de organisatie (chi-kwadraattoets, ${pTekst(r.p)}).`);
    for (const a of r.verschillen.filter((v) => Math.abs(v.verschil_pp) >= 5)) {
      uit.push(`${a.label} is ${a.verschil_pp < 0 ? 'ondervertegenwoordigd' : 'oververtegenwoordigd'}: ${nlProcent(a.pct_respondenten)} van de respondenten tegen ${nlProcent(a.pct_medewerkers)} van de medewerkers.`);
    }
  } else {
    uit.push(r.reden === 'klein'
      ? `Naar ${naar} is niet getoetst of de respondenten op de organisatie lijken: daarvoor zijn de groepen te klein.`
      : `Naar ${naar} is niet getoetst of de respondenten op de organisatie lijken: daarvoor zijn er te weinig groepen met een bekend aantal medewerkers.`);
  }
  // Eén zin voor onbekend en verborgen: anders zou je zien welk aantal medewerkers te klein is om te tonen.
  if (r.niet_vergeleken?.length) uit.push(`${r.niet_vergeleken.join(', ')}: niet vergeleken (aantal medewerkers onbekend of te klein om te tonen).`);
  return uit;
}

/** Uitleg onder de tabel "Wie deden mee" als er met de organisatie wordt vergeleken. */
export const VERGELIJK_UITLEG = 'De percentages gaan over de groepen die met de organisatie vergeleken worden. Wie de vraag niet invulde of "Dat zeg ik liever niet" koos, telt daarbij niet mee. Het verschil is het percentage respondenten min het percentage medewerkers, in procentpunten.';
export const NIET_INGEVULD_UITLEG = 'Ook wie deze vraag niet invulde, telt mee bij de groepen die niet apart getoond zijn.';

/**
 * De tabel "Wie deden mee" van één achtergrondvraag, voor het scherm, Word en Excel (overal dezelfde getallen).
 * Zonder aantallen medewerkers: Groep, Respondenten, % (van alle respondenten, zoals op het dashboard).
 * Met een vergelijking: de percentages gaan over de groepen die vergeleken worden (zonder "Niet ingevuld", "Dat zeg
 * ik liever niet" en groepen zonder getoond aantal medewerkers); het verschil is het verschil van de twee afgeronde
 * percentages, zodat de getallen in de tabel kloppen. Een verborgen aantal is ×.
 * @returns {{ metOrganisatie, kop: string[], rijen: { cellen: string[], getallen: (number|string|null)[], vergeleken }[], noten: string[] }}
 */
export function samenstellingTabel(km) {
  const metOrg = !!km?.representativiteit;
  const naamVan = (g) => (g.samengevoegd ? `${LABEL_OVERIG} (${g.labels_samengevoegd.join(', ')})` : g.label);
  const rijen = (km?.groepen || []).map((g) => {
    const naam = naamVan(g);
    if (!metOrg) return { vergeleken: false, cellen: [naam, aantal(g.n), procent(g.pct)], getallen: [naam, g.n ?? VERBORGEN, eindig(g.pct) ? Math.round(g.pct) : VERBORGEN] };
    const vergeleken = g.populatie !== null && !g.niet_ingevuld && eindig(g.pct_vergelijk) && eindig(g.populatie_pct_vergelijk);
    const pR = vergeleken ? Math.round(g.pct_vergelijk) : null;
    const pM = vergeleken ? Math.round(g.populatie_pct_vergelijk) : null;
    const org = g.niet_ingevuld || g.liever_niet ? '–' : g.populatie_verborgen ? VERBORGEN : g.populatie === null ? 'onbekend' : aantal(g.populatie);
    const orgPct = vergeleken ? nlProcent(pM) : g.populatie_verborgen ? VERBORGEN : '–';
    return {
      vergeleken,
      cellen: [naam, aantal(g.n), vergeleken ? nlProcent(pR) : '–', org, orgPct, vergeleken ? metTeken(pR - pM, 0) : '–'],
      getallen: [naam, g.n ?? VERBORGEN, vergeleken ? pR : '', g.niet_ingevuld || g.liever_niet ? '' : g.populatie_verborgen ? VERBORGEN : g.populatie ?? '', vergeleken ? pM : g.populatie_verborgen ? VERBORGEN : '', vergeleken ? pR - pM : ''],
    };
  });
  if (km?.verborgen_rest) {
    const naam = `Niet apart getoond (${km.verborgen_rest.labels.join(', ')})`;
    rijen.push(metOrg
      ? { vergeleken: false, cellen: [naam, VERBORGEN, '–', VERBORGEN, VERBORGEN, '–'], getallen: [naam, VERBORGEN, '', VERBORGEN, VERBORGEN, ''] }
      : { vergeleken: false, cellen: [naam, VERBORGEN, VERBORGEN], getallen: [naam, VERBORGEN, VERBORGEN] });
  }
  const noten = [];
  if (metOrg) noten.push(VERGELIJK_UITLEG);
  if ((km?.groepen || []).some((g) => g.samengevoegd && g.ook_niet_ingevuld) || km?.verborgen_rest?.ook_niet_ingevuld) noten.push(NIET_INGEVULD_UITLEG);
  if (rijen.some((r) => r.cellen.includes(VERBORGEN))) noten.push(VERBORGEN_UITLEG);
  return {
    metOrganisatie: metOrg,
    kop: metOrg ? ['Groep', 'Respondenten', '% respondenten', 'Medewerkers', '% medewerkers', 'Verschil (procentpunt)'] : ['Groep', 'Respondenten', '%'],
    rijen,
    noten,
  };
}

/** "De eNPS is +20 (9 promotors, 6 passieven en 5 criticasters van 20 respondenten). Het 95%-interval loopt van −16 tot +56." */
export function enpsZin(e) {
  if (!e || e.verborgen || !eindig(e.score)) return null;
  return `De eNPS is ${score(e.score)} (${e.promotors} promotors, ${e.passief} ${e.passief === 1 ? 'passieve' : 'passieven'} en ${e.criticasters} criticasters van ${e.n} respondenten). Het 95%-interval loopt van ${score(e.ci_laag)} tot ${score(e.ci_hoog)}.`;
}
function cijferZin(c) {
  if (!c || c.verborgen || !eindig(c.gemiddelde)) return null;
  const ci = eindig(c.ci_laag) ? ` (95%-interval ${getal(c.ci_laag)} tot ${getal(c.ci_hoog)})` : '';
  const onv = eindig(c.pct_onvoldoende) ? ` ${nlProcent(c.pct_onvoldoende)} gaf een onvoldoende (5 of lager).` : '';
  return `"${c.tekst}": gemiddeld een ${getal(c.gemiddelde)}${ci}, van ${c.n} respondenten.${onv}`;
}
/** De zin bij een signaal (Overzicht, rapport, Excel en platte tekst). */
export function signaalZin(s) {
  if (s.regel === 'enps_negatief') return `De eNPS is negatief (${score(s.waarde)}): er zijn meer criticasters dan promotors.`;
  if (s.regel === 'cijfer_onvoldoende') return `Het gemiddelde rapportcijfer is een onvoldoende (${getal(s.waarde)}).`;
  const welke = s.ongunstig?.length ? ` (${s.ongunstig.join(' of ')})` : '';
  return `${nlProcent(s.waarde)} scoort ongunstig${welke} op "${String(s.tekst).replace(/\.$/, '')}". Dat is boven de signaalgrens van ${nlProcent(s.grens)} die voor dit onderzoek is ingesteld.`;
}
const KWADRANT = {
  vasthouden: 'Sterk punt – vasthouden', verbeteren: 'Verbeterpunt – hier liggen kansen', goed_genoeg: 'Minder belangrijk – goed genoeg', later: 'Minder belangrijk – later',
};
function drijverZin(dr) {
  if (!dr) return null;
  const sterk = dr.rijen.filter((r) => eindig(r.r) && r.p < 0.05).slice(0, 2);
  const uitkomst = `"${dr.uitkomst.naam}"`;
  if (!sterk.length) return `Geen thema hangt duidelijk samen met ${uitkomst}. ${SAMENHANG_UITLEG(uitkomst)}`;
  const delen = sterk.map((r) => `${r.naam} (r = ${nlGetal(r.r, 2)})`);
  return `Het sterkst samen met ${uitkomst} ${sterk.length > 1 ? 'hangen' : 'hangt'} ${delen.join(' en ')}. Samenhang is geen oorzaak.`;
}
/** Benchmarks van het personeelsbestand (in het hoofdstuk HR-kengetallen); de andere staan bij de kerncijfers. */
export const isPersoneelBenchmark = (b) => b?.sleutel === 'verzuim_pct' || b?.sleutel === 'verloop_pct';
/** Waarbij een benchmark hoort: "Respons", "eNPS", een thema of een vraag (met de eigen waarde). */
export function benchmarkNaam(b, k) {
  const eigen = (w, f) => (eindig(w) ? ` (hier ${f(w)})` : '');
  if (b.sleutel === 'respons_pct') return `Respons${eigen(b.eigen_waarde, nlProcent)}`;
  if (b.sleutel === 'enps') return `eNPS${eigen(b.eigen_waarde, score)}`;
  if (b.sleutel === 'verzuim_pct') return `Verzuim${eigen(b.eigen_waarde, (x) => `${nlGetal(x, 1)}%`)}`;
  if (b.sleutel === 'verloop_pct') return `Verloop${eigen(b.eigen_waarde, nlProcent)}`;
  const [soort, id] = String(b.sleutel).split(':');
  if (soort === 't') return `${k?.scores?.themas?.find((t) => t.thema_id === Number(id))?.naam || 'Thema'}${eigen(b.eigen_waarde, (x) => nlGetal(x, 1))}`;
  return `Vraag${eigen(b.eigen_waarde, (x) => nlGetal(x, 1))}`;
}
/** Een benchmark: "Ter vergelijking: 5,0% (CBS, 2025)". bronKort: de korte bronvermelding ("(CBS, 2025)") of ''. */
export function benchmarkZin(b, bronKort = '') {
  const eenheid = b.sleutel === 'enps' ? 'score' : /_pct$/.test(b.sleutel) ? '%' : 'gem';
  const w = eenheid === 'score' ? score(b.waarde) : eenheid === '%' ? `${nlGetal(b.waarde, 1)}%` : getal(b.waarde);
  return `${TER_VERGELIJKING}: ${w}${bronKort ? ` ${bronKort}` : ''}${b.omschrijving ? ` – ${b.omschrijving}` : ''}`;
}

// ---------- Figuren ----------

const fig = (id, vorm, titel, alt, velden) => ({ soort: 'figuur', id, vorm, titel, bijschrift: titel, alt, ...velden });
const metKruis = (w, f) => (eindig(w) ? f(w) : 'niet getoond');

/** De standaardfiguren (B27) voor zover de gegevens er zijn; alleen uit afgeschermde cijfers. */
export function kerncijferFiguren(k) {
  const uit = [];
  // 1. Respons per groep (eerste achtergrondvraag met bekende aantallen medewerkers).
  const km = (k.kenmerken || []).find((x) => x.groepen.some((g) => eindig(g.respons_pct)));
  if (km) {
    const gs = km.groepen.filter((g) => !g.niet_ingevuld && (g.populatie !== null || g.populatie_verborgen));
    const alt = `Respons per ${(km.kenmerk_naam || 'groep').toLowerCase()}: ${gs.map((g) => `${g.label} ${g.controleer_aantallen ? 'meer respondenten dan medewerkers' : metKruis(g.respons_pct, nlProcent)}`).join(', ')}.`;
    const controleer = gs.filter((g) => g.controleer_aantallen).map((g) => g.label);
    uit.push(fig(`respons-${km.vraag_id}`, 'staaf', `Respons per ${(km.kenmerk_naam || 'groep').toLowerCase()}`, alt, {
      eenheid: '%', schaal: { min: 0, max: 100 }, categorieen: gs.map((g) => g.label), reeksen: [{ label: 'Respons', waarden: gs.map((g) => (eindig(g.respons_pct) ? g.respons_pct : null)) }],
      ...(controleer.length ? { noot: `${controleer.join(', ')}: meer respondenten dan medewerkers; controleer de aantallen.` } : {}),
    }));
  }
  // 2. Thema's: % gunstig, neutraal en ongunstig.
  const themas = k.scores?.themas || [];
  if (themas.length) {
    const alt = `Thema's: ${themas.map((t) => (t.verborgen ? `${t.naam} niet getoond` : `${t.naam} ${nlProcent(t.pct_gunstig)} gunstig, ${nlProcent(t.pct_ongunstig)} ongunstig`)).join('; ')}.`;
    uit.push(fig('themas', 'gestapeld', "Thema's: gunstig, neutraal en ongunstig", alt, {
      eenheid: '%', schaal: { min: 0, max: 100 }, categorieen: themas.map((t) => t.naam),
      reeksen: [
        { label: 'Gunstig (4–5)', kleur: 'gunstig', waarden: themas.map((t) => (t.verborgen ? null : t.pct_gunstig)) },
        { label: 'Neutraal (3)', kleur: 'neutraal', waarden: themas.map((t) => (t.verborgen ? null : t.pct_neutraal)) },
        { label: 'Ongunstig (1–2)', kleur: 'ongunstig', waarden: themas.map((t) => (t.verborgen ? null : t.pct_ongunstig)) },
      ],
    }));
  }
  // 3. eNPS-verdeling.
  const e = k.scores?.enps;
  if (e && !e.verborgen && eindig(e.score)) {
    uit.push(fig('enps', 'gestapeld', `eNPS: ${score(e.score)}`, `eNPS ${score(e.score)}: ${nlProcent(e.pct_promotors)} promotors, ${nlProcent(e.pct_passief)} passief en ${nlProcent(e.pct_criticasters)} criticasters.`, {
      eenheid: '%', schaal: { min: 0, max: 100 }, categorieen: [`eNPS ${score(e.score)}`],
      reeksen: [
        { label: 'Promotors (9–10)', kleur: 'gunstig', waarden: [e.pct_promotors] },
        { label: 'Passief (7–8)', kleur: 'neutraal', waarden: [e.pct_passief] },
        { label: 'Criticasters (0–6)', kleur: 'ongunstig', waarden: [e.pct_criticasters] },
      ],
    }));
  }
  // 4. Verloop van de thema's over de meetmomenten.
  const v = k.verloop;
  if (v && v.themas?.length && v.meetmomenten?.length >= 2) {
    const reeksen = v.themas.slice(0, 6).map((t) => ({ label: t.naam, waarden: v.meetmomenten.map((m) => t.punten.find((p) => p.meetmoment_id === m.id)?.gemiddelde ?? null) }));
    const alt = `Verloop van de thema's: ${reeksen.map((r) => `${r.label} ${r.waarden.map((w) => metKruis(w, (x) => nlGetal(x, 1))).join(', ')}`).join('; ')}.`;
    uit.push(fig('verloop', 'lijn', "Verloop van de thema's", alt, { eenheid: 'gem', schaal: { min: 1, max: 5 }, categorieen: v.meetmomenten.map((m) => m.naam), reeksen }));
  }
  // 5. Samenstelling tegenover de organisatie.
  const kv = (k.kenmerken || []).find((x) => x.representativiteit && x.representativiteit.verschillen?.length);
  if (kv) {
    const vs = kv.representativiteit.verschillen;
    const alt = `Samenstelling naar ${(kv.kenmerk_naam || 'groep').toLowerCase()}: ${vs.map((x) => `${x.label} ${nlProcent(x.pct_respondenten)} van de respondenten tegen ${nlProcent(x.pct_medewerkers)} van de medewerkers`).join('; ')}.`;
    uit.push(fig(`samenstelling-${kv.vraag_id}`, 'staaf', `Respondenten en organisatie naar ${(kv.kenmerk_naam || 'groep').toLowerCase()}`, alt, {
      eenheid: '%', schaal: { min: 0, max: 100 }, categorieen: vs.map((x) => x.label),
      reeksen: [{ label: 'Respondenten', waarden: vs.map((x) => x.pct_respondenten) }, { label: 'Organisatie', waarden: vs.map((x) => x.pct_medewerkers) }],
    }));
  }
  // 6. Prioriteitenmatrix (thema's, geen personen).
  const dr = k.drijvers;
  if (dr && dr.kruis && dr.rijen.some((r) => eindig(r.r) && eindig(r.gemiddelde))) {
    const punten = dr.rijen.map((r) => ({ label: r.naam, x: eindig(r.gemiddelde) ? r.gemiddelde : null, y: eindig(r.r) ? r.r : null }));
    const alt = `Prioriteitenmatrix voor "${dr.uitkomst.naam}": ${dr.rijen.filter((r) => eindig(r.r)).map((r) => `${r.naam} gemiddeld ${getal(r.gemiddelde)}, samenhang r = ${nlGetal(r.r, 2)}${r.kwadrant ? ` (${KWADRANT[r.kwadrant].toLowerCase()})` : ''}`).join('; ')}.`;
    uit.push(fig('prioriteiten', 'spreiding', 'Prioriteitenmatrix', alt, {
      eenheid: 'gem', schaal: { min: 1, max: 5 }, schaalY: { min: Math.min(0, ...punten.filter((p) => p.y !== null).map((p) => p.y)), max: 1 },
      categorieen: [], reeksen: [], punten, kruis: dr.kruis,
      kwadrantLabels: [KWADRANT.vasthouden, KWADRANT.verbeteren, KWADRANT.goed_genoeg, KWADRANT.later],
      asLabels: { x: 'Gemiddelde score (1–5)', y: 'Samenhang met de uitkomst (r)' },
      noot: 'Samenhang is geen oorzaak.',
    }));
  }
  // 7. Leeftijdsopbouw van de organisatie (personeelsbestand).
  const leeftijd = k.personeel?.totaal?.leeftijd || [];
  if (leeftijd.some((x) => x.n !== null && x.n > 0)) {
    const alt = `Leeftijdsopbouw: ${leeftijd.map((x) => `${x.label} ${metKruis(x.pct, nlProcent)}`).join(', ')}.`;
    uit.push(fig('leeftijdsopbouw', 'staaf', 'Leeftijdsopbouw van de organisatie', alt, {
      eenheid: '%', schaal: { min: 0, max: 100 }, categorieen: leeftijd.map((x) => x.label), reeksen: [{ label: 'Medewerkers', waarden: leeftijd.map((x) => x.pct) }],
    }));
  }
  return uit;
}

// ---------- Rapportblokken ----------

const kop = (tekst, niveau = 3) => ({ soort: 'kop', niveau, tekst });
const alinea = (tekst) => ({ soort: 'alinea', tekst });
const tabel = (kopRij, rijen, bijschrift = '') => ({ soort: 'tabel', kop: kopRij, rijen, bijschrift });
const lijst = (items) => ({ soort: 'lijst', items });

/** De zinnen over de kwaliteit van de gegevens: het deel beantwoorde vragen en de "rechte lijnen" (K S9). */
export function kwaliteitZinnen(kw) {
  if (!kw) return [];
  const delen = [`Gemiddeld beantwoordde een respondent ${nlProcent(kw.gem_pct_beantwoord)} van de gesloten vragen.`];
  if (kw.aantal_schaalvragen >= kw.rechte_lijn_min) {
    delen.push(eindig(kw.rechte_lijn)
      ? `${kw.rechte_lijn === 0 ? 'Niemand gaf' : `${aantal(kw.rechte_lijn)} ${kw.rechte_lijn === 1 ? 'respondent gaf' : 'respondenten gaven'}`} op alle ${kw.aantal_schaalvragen} schaalvragen hetzelfde antwoord.`
      : `Minder dan 5 respondenten gaven op alle ${kw.aantal_schaalvragen} schaalvragen hetzelfde antwoord.`);
  } else {
    delen.push(`Of iemand overal hetzelfde antwoord gaf, tellen we pas bij minstens ${kw.rechte_lijn_min} schaalvragen; deze vragenlijst heeft er ${kw.aantal_schaalvragen}.`);
  }
  return delen;
}

function deelnameBlokken(k, figuren) {
  const uit = [];
  const ls = k.deelname?.lijsten || [];
  if (ls.length) {
    uit.push(tabel(['Vragenlijst', 'Meetmoment', 'Uitgenodigd', 'Ingevuld', 'Respons', 'Foutmarge'], ls.map((l) => [
      l.titel, l.meetmoment_naam || '–', eindig(l.uitgenodigd) ? aantal(l.uitgenodigd) : '–', l.klein ? VERBORGEN : aantal(l.n),
      l.controleer_aantallen ? 'controleer de aantallen' : eindig(l.respons_pct) ? nlProcent(l.respons_pct) : l.klein ? VERBORGEN : '–',
      eindig(l.foutmarge_pp) ? `±${Math.round(l.foutmarge_pp)} pp` : '–',
    ]), 'Respons per vragenlijst'));
  }
  const dl = ls.find((l) => l.id === k.lijst?.id);
  const zin = dl ? foutmargeZin(dl.n, dl.populatie, dl.foutmarge_pp) : null;
  if (zin) uit.push(alinea(`${zin} ${FOUTMARGE_UITLEG}`));
  for (const km of k.kenmerken || []) {
    uit.push(kop(`Wie deden mee: ${(km.kenmerk_naam || km.tekst).toLowerCase()}`, 3));
    const t = samenstellingTabel(km);
    uit.push(tabel(t.kop, t.rijen.map((r) => r.cellen), km.tekst));
    for (const z of representativiteitZinnen(km)) uit.push(alinea(z));
    if (t.noten.length) uit.push(alinea(`*${t.noten.join(' ')}*`));
  }
  const kw = k.kwaliteit;
  if (kw) uit.push(kop('Kwaliteit van de gegevens', 3), alinea(kwaliteitZinnen(kw).join(' ')));
  for (const f of figuren.filter((x) => x.id.startsWith('respons-') || x.id.startsWith('samenstelling-'))) uit.push(f);
  return uit;
}

function kerncijferBlokkenScores(k, figuren, bronnen = {}) {
  const uit = [];
  const themas = k.scores?.themas || [];
  if (themas.length) {
    uit.push(tabel(['Thema', 'Gemiddelde (1–5)', '% gunstig (4–5)', '% neutraal (3)', '% ongunstig (1–2)', 'Respondenten'], themas.map((t) => [
      t.naam, getal(t.gemiddelde), procent(t.pct_gunstig), procent(t.pct_neutraal), procent(t.pct_ongunstig), aantal(t.n),
    ]), "Thema's"));
    if (themas.some((t) => t.verborgen)) uit.push(alinea(`*${VERBORGEN_UITLEG}*`));
  }
  const f = (id) => figuren.find((x) => x.id === id);
  if (f('themas')) uit.push(f('themas'));
  const ez = enpsZin(k.scores?.enps);
  if (ez) uit.push(alinea(`${ez} ${ENPS_UITLEG}`));
  if (f('enps')) uit.push(f('enps'));
  for (const c of k.scores?.cijfers || []) {
    const z = c.schaal_soort === 'nps' ? enpsZin(c) : cijferZin(c);
    if (z) uit.push(alinea(z));
  }
  if (k.scores?.sterkst?.length) {
    uit.push(kop('Sterkste punten', 3), lijst(k.scores.sterkst.map((x) => `${x.tekst} (${getal(x.gemiddelde)}; ${procent(x.pct_gunstig)} gunstig)`)));
  }
  if (k.scores?.zwakst?.length) {
    uit.push(kop('Zwakste punten', 3), lijst(k.scores.zwakst.map((x) => `${x.tekst} (${getal(x.gemiddelde)}; ${procent(x.pct_gunstig)} gunstig)`)));
  }
  const dr = k.drijvers;
  if (dr) {
    uit.push(kop(`Wat hangt samen met ${uitkomstKort(dr.uitkomst)}?`, 3));
    uit.push(alinea(drijverZin(dr)));
    uit.push(tabel(['Thema', 'Samenhang (r)', '95%-interval', 'Respondenten', 'Gemiddelde', 'Kwadrant'], dr.rijen.map((r) => [
      r.naam,
      r.reden === 'weggevallen' ? 'niet getoond' : eindig(r.r) ? nlGetal(r.r, 2) : '–',
      eindig(r.ci_laag) ? `${nlGetal(r.ci_laag, 2)} tot ${nlGetal(r.ci_hoog, 2)}` : '–',
      eindig(r.n) ? aantal(r.n) : '–', getal(r.gemiddelde),
      r.kwadrant ? KWADRANT[r.kwadrant] : eindig(r.r) ? 'geen duidelijke samenhang' : '–',
    ]), `Samenhang met "${dr.uitkomst.naam}"`));
    if (dr.rijen.some((r) => r.reden === 'weggevallen')) uit.push(alinea('*niet getoond: te weinig volledig ingevulde antwoorden om dit veilig naast het dashboard te tonen*'));
    if (f('prioriteiten')) uit.push(f('prioriteiten'));
  }
  if (k.signalen?.length) uit.push(kop('Signalen', 3), lijst(k.signalen.map(signaalZin)));
  const vergelijk = (k.benchmarks || []).filter((b) => !isPersoneelBenchmark(b));
  if (vergelijk.length) uit.push(kop(TER_VERGELIJKING, 3), lijst(vergelijk.map((b) => `${benchmarkNaam(b, k)}: ${benchmarkZin(b, bronnen[b.citeersleutel] || '')}`)));
  return uit;
}

function groepenBlokken(k) {
  const uit = [];
  for (const g of k.groepen || []) {
    const kolommen = g.kolommen.map((c) => c.label);
    const kopRij = ['', ...kolommen, 'Iedereen'];
    const nRij = ['Aantal respondenten', ...g.kolommen.map((c) => aantal(c.n)), aantal(k.lijst?.n)];
    const rijen = g.rijen.map((r) => [
      r.soort === 'enps' ? `eNPS: ${r.naam}` : r.naam,
      ...r.cellen.map((c) => (r.soort === 'enps' ? score(c) : getal(c))),
      r.soort === 'enps' ? score(r.totaal) : getal(r.totaal),
    ]);
    uit.push(kop(`Per ${(g.kenmerk_naam || g.tekst).toLowerCase()}`, 3));
    uit.push(tabel(kopRij, [nRij, ...rijen], g.tekst));
    const noten = [];
    const samen = g.kolommen.filter((c) => c.samengevoegd && c.labels_samengevoegd.length);
    for (const c of samen) noten.push(`${c.label}: ${c.labels_samengevoegd.join(', ')}.`);
    if (g.kolommen.some((c) => c.verborgen) || g.rijen.some((r) => r.cellen.some((c) => c === null))) noten.push(VERBORGEN_UITLEG);
    if (noten.length) uit.push(alinea(`*${noten.join(' ')}*`));
  }
  return uit;
}

/** De kengetallen van het personeelsbestand: [sleutel, naam, opmaak] (scherm, Word en Excel). */
export const KPI_NAMEN = [
  ['medewerkers', 'Medewerkers op de peildatum', aantal], ['fte', 'Fte', (x) => getal(x)], ['gem_leeftijd', 'Gemiddelde leeftijd', (x) => getal(x)],
  ['pct_55plus', '55 jaar of ouder', procent], ['pct_60plus', '60 jaar of ouder', procent], ['pct_vrouw', 'Vrouw', procent],
  ['gem_diensttijd_jaar', 'Gemiddelde diensttijd (jaar)', (x) => getal(x)], ['pct_deeltijd', 'Deeltijd', procent], ['pct_leidinggevend', 'Leidinggevend', procent],
  ['verzuim_pct', 'Verzuimpercentage', (x) => (eindig(x) ? `${nlGetal(x, 1)}%` : VERBORGEN)], ['meldingsfrequentie', 'Meldingsfrequentie (per medewerker per jaar)', (x) => getal(x, 2)],
  ['gem_duur_per_melding', 'Gemiddelde duur per melding (kalenderdagen, benadering)', (x) => getal(x)], ['nulverzuim_pct', 'Nulverzuim', procent],
  ['verloop_pct', 'Verloop', procent], ['verloop_vrijwillig_pct', 'Vrijwillig verloop (eigen verzoek)', procent], ['instroom_pct', 'Instroom', procent],
  ['pct_eerste_jaar', 'Vertrekkers in hun eerste jaar', procent],
];

function personeelBlokken(k, figuren, bronnen = {}) {
  const p = k.personeel;
  if (!p) return [];
  const uit = [];
  uit.push(alinea(`Uit het personeelsbestand "${p.naam}" (${p.periode.van} tot en met ${p.periode.tot}; peildatum ${nlDatum(p.peildatum)}). Alleen groepscijfers; geen gegevens per medewerker.`));
  const t = p.totaal;
  const rijen = KPI_NAMEN.filter(([s]) => !p.ontbreekt.includes(s)).map(([s, naam, f]) => [naam, f(t[s])]);
  uit.push(tabel(['Kengetal', 'Waarde'], rijen, 'HR-kengetallen van de organisatie'));
  if (rijen.some((r) => r[1] === VERBORGEN)) uit.push(alinea(`*${PERSONEEL_VERBORGEN}*`));
  if (t.verzuim_reden) uit.push(alinea(`*${VERZUIM_VERBORGEN}*`));
  else if (eindig(t.verzuim_pct)) uit.push(alinea(`*${DAGEN_UITLEG}${ZWANGERSCHAPSVERLOF[p.zwangerschapsverlof] ? ` ${ZWANGERSCHAPSVERLOF[p.zwangerschapsverlof]}` : ''}*`));
  for (const b of (k.benchmarks || []).filter(isPersoneelBenchmark)) uit.push(alinea(benchmarkZin(b, bronnen[b.citeersleutel] || '')));
  for (const g of p.per_groep || []) {
    if (!g.rijen.length) continue;
    uit.push(tabel([g.dimensie_naam, 'Medewerkers', 'Fte', 'Gem. leeftijd', '% vrouw', 'Verzuim', 'Meldingsfreq.', 'Verloop'], g.rijen.map((r) => [
      r.label, aantal(r.medewerkers), getal(r.fte), getal(r.gem_leeftijd), procent(r.pct_vrouw),
      eindig(r.verzuim_pct) ? `${nlGetal(r.verzuim_pct, 1)}%` : VERBORGEN, getal(r.meldingsfrequentie, 2), procent(r.verloop_pct),
    ]), `Per ${g.dimensie_naam.toLowerCase()}`));
  }
  if ((p.per_groep || []).some((g) => g.rijen.some((r) => r.verzuim_pct === null))) uit.push(alinea(`*${PERSONEEL_VERBORGEN} ${VERZUIM_VERBORGEN}*`));
  if (p.uitstroom_redenen?.length) {
    uit.push(tabel(['Reden van vertrek', 'Aantal'], p.uitstroom_redenen.map((r) => [r.label, aantal(r.aantal)]), 'Redenen van vertrek (hele organisatie)'));
  }
  const f = figuren.find((x) => x.id === 'leeftijdsopbouw');
  if (f) uit.push(f);
  return uit;
}

/** Per thema: is het verschil tussen het eerste en het laatste meetmoment statistisch significant (zoals het rapport)? */
export function verloopZinnen(v) {
  return (v?.toetsen || []).map((t) => {
    if (t.verborgen) return `${t.thema_naam}: het verschil tussen ${t.van.naam} en ${t.naar.naam} is niet getoond: te weinig volledig ingevulde antwoorden om dit veilig naast het dashboard te tonen.`;
    if (!eindig(t.p)) return `${t.thema_naam}: het verschil tussen ${t.van.naam} en ${t.naar.naam} is niet te toetsen.`;
    const richting = eindig(t.verschil) && t.p < 0.05 ? ` (van ${nlGetal(t.van.gemiddelde, 1)} naar ${nlGetal(t.naar.gemiddelde, 1)})` : '';
    return `${t.thema_naam}: het verschil tussen ${t.van.naam} en ${t.naar.naam} is ${t.p < 0.05 ? 'statistisch significant' : 'niet statistisch significant'}${richting} (${pTekst(t.p)}).`;
  });
}

function verloopBlokken(k, figuren) {
  const v = k.verloop;
  if (!v) return [];
  const uit = [];
  const mm = v.meetmomenten;
  uit.push(tabel(['Thema', ...mm.map((m) => m.naam)], v.themas.map((t) => [t.naam, ...mm.map((m) => getal(t.punten.find((p) => p.meetmoment_id === m.id)?.gemiddelde))]), 'Ontwikkeling per meetmoment'));
  if (v.enps?.length) uit.push(tabel(['eNPS', ...mm.map((m) => m.naam)], [['eNPS', ...mm.map((m) => score(v.enps.find((p) => p.meetmoment_id === m.id)?.score))]]));
  const zinnen = verloopZinnen(v);
  if (zinnen.length) uit.push(lijst(zinnen));
  const f = figuren.find((x) => x.id === 'verloop');
  if (f) uit.push(f);
  return uit;
}

/**
 * De kerncijfers als rapportblokken (kop, alinea, lijst, tabel, figuur). deel: 'deelname' (respons, samenstelling,
 * representativiteit, kwaliteit), 'kerncijfers' (thema's, eNPS, cijfers, sterkst/zwakst, samenhang, signalen),
 * 'groepen' (per groep), 'personeel' (HR-kengetallen) of 'alles' (met koppen, ook ontwikkeling en eigen cijfers).
 * bronnen: { citeersleutel: '(CBS, 2025)' } voor de benchmarks (apaKort uit bibliotheek-regels.js).
 */
export function kerncijferBlokken(k, deel = 'alles', { bronnen = {} } = {}) {
  if (!k) return [];
  const figuren = kerncijferFiguren(k);
  const klein = k.lijst?.verborgen
    ? alinea(`Van "${k.lijst.titel}" zijn minder dan ${k.drempel} vragenlijsten ingevuld. Daarom staan hier geen uitkomsten.`)
    : null;
  if (klein && deel !== 'personeel' && deel !== 'alles') return [klein];
  if (deel === 'deelname') return deelnameBlokken(k, figuren);
  if (deel === 'kerncijfers') return kerncijferBlokkenScores(k, figuren, bronnen);
  if (deel === 'groepen') return groepenBlokken(k);
  if (deel === 'personeel') return personeelBlokken(k, figuren, bronnen);
  const uit = [];
  const sectie = (titel, blokken) => { if (blokken.length) uit.push(kop(titel, 2), ...blokken); };
  if (klein) sectie('Deelname en samenstelling', [klein]);
  else {
    sectie('Deelname en samenstelling', deelnameBlokken(k, figuren));
    sectie('Kernscores', kerncijferBlokkenScores(k, figuren, bronnen));
    sectie("Thema's per groep", groepenBlokken(k));
    sectie('Ontwikkeling', verloopBlokken(k, figuren));
  }
  sectie('Personeelscijfers', personeelBlokken(k, figuren, bronnen));
  if (k.eigen_cijfers?.length) {
    sectie('Eigen cijfers', [tabel(['Cijfer', 'Laatste', 'Datum', 'Vorige'], k.eigen_cijfers.map((c) => [
      c.naam, c.laatste ? `${nlGetal(c.laatste.waarde, Number.isInteger(c.laatste.waarde) ? 0 : 1)}${c.eenheid ? ` ${c.eenheid}` : ''}` : '–',
      c.laatste ? nlDatum(c.laatste.datum) : '–', c.vorige ? nlGetal(c.vorige.waarde, Number.isInteger(c.vorige.waarde) ? 0 : 1) : '–',
    ]))]);
  }
  return uit;
}

// ---------- Excel ----------

const x = (w) => (w === null || w === undefined ? VERBORGEN : w);
const xr = (w, dec = 1) => (eindig(w) ? Math.round(w * 10 ** dec) / 10 ** dec : VERBORGEN);

/**
 * De kerncijfers als Excel-bladen voor maakXlsx (afgeschermd en dus "geschikt om te delen"): verborgen waarden zijn
 * "×", met de uitleg onderaan elk blad. Getallen zijn afgerond zoals op het scherm.
 */
export function kerncijferBladen(k) {
  const uitleg = [[], [VERBORGEN_UITLEG]];
  const bladen = [];
  const ls = k.deelname?.lijsten || [];
  bladen.push({ naam: 'Deelname', rijen: [['Vragenlijst', 'Meetmoment', 'Status', 'Uitgenodigd', 'Ingevuld', 'Respons (%)', 'Foutmarge (procentpunt)'],
    ...ls.map((l) => [l.titel, l.meetmoment_naam || '', l.status, l.uitgenodigd ?? '', l.klein ? VERBORGEN : l.n,
      l.controleer_aantallen ? 'controleer de aantallen' : l.klein ? VERBORGEN : l.respons_pct === null ? '' : xr(l.respons_pct, 0), l.foutmarge_pp === null ? '' : xr(l.foutmarge_pp, 1)]), ...uitleg] });
  // Zelfde getallen als de tabel op het scherm en in Word (samenstellingTabel), plus de respons per groep.
  const samenstelling = [['Vraag', 'Groep', 'Respondenten', '% respondenten', 'Medewerkers', '% medewerkers', 'Verschil (procentpunt)', 'Respons (%)']];
  for (const km of k.kenmerken || []) {
    const t = samenstellingTabel(km);
    t.rijen.forEach((r, i) => {
      const g = km.groepen[i];
      const [naam, n, pR, pop, pM, verschil] = t.metOrganisatie ? r.getallen : [...r.getallen, '', '', ''];
      const respons = !g ? VERBORGEN : g.controleer_aantallen ? 'controleer de aantallen' : g.respons_pct === null ? (g.populatie_verborgen ? VERBORGEN : '') : xr(g.respons_pct, 0);
      samenstelling.push([km.tekst, naam, n, pR, pop, pM, verschil, respons]);
    });
    for (const z of representativiteitZinnen(km)) samenstelling.push([km.tekst, z]);
    for (const z of t.noten.filter((n) => n !== VERBORGEN_UITLEG)) samenstelling.push([km.tekst, z]);
  }
  bladen.push({ naam: 'Samenstelling', rijen: [...samenstelling, ...uitleg] });
  const s = k.scores || {};
  const scores = [['Onderdeel', 'Gemiddelde', '% gunstig', '% neutraal', '% ongunstig', 'Respondenten']];
  for (const t of s.themas || []) scores.push([t.naam, xr(t.gemiddelde), xr(t.pct_gunstig, 0), xr(t.pct_neutraal, 0), xr(t.pct_ongunstig, 0), x(t.n)]);
  if (s.enps) scores.push([`eNPS: ${s.enps.tekst}`, xr(s.enps.score, 0), xr(s.enps.pct_promotors, 0), xr(s.enps.pct_passief, 0), xr(s.enps.pct_criticasters, 0), x(s.enps.n)]);
  for (const c of s.cijfers || []) scores.push([c.tekst, xr(c.gemiddelde), '', '', c.schaal_soort === 'rapport' ? xr(c.pct_onvoldoende, 0) : '', x(c.n)]);
  bladen.push({ naam: 'Scores', rijen: [...scores, ...uitleg] });
  const groepen = [['Indeling', 'Rij', 'Groep', 'Waarde', 'Respondenten in de groep']];
  for (const g of k.groepen || []) {
    for (const r of g.rijen) {
      r.cellen.forEach((c, j) => groepen.push([g.tekst, r.soort === 'enps' ? `eNPS: ${r.naam}` : r.naam, g.kolommen[j].label, r.soort === 'enps' ? xr(c, 0) : xr(c), x(g.kolommen[j].n)]));
      groepen.push([g.tekst, r.soort === 'enps' ? `eNPS: ${r.naam}` : r.naam, 'Iedereen', r.soort === 'enps' ? xr(r.totaal, 0) : xr(r.totaal), x(k.lijst?.n)]);
    }
  }
  bladen.push({ naam: 'Per groep', rijen: [...groepen, ...uitleg] });
  if (k.drijvers) {
    bladen.push({ naam: 'Prioriteiten', rijen: [['Thema', 'Samenhang (r)', 'Interval laag', 'Interval hoog', 'p', 'Respondenten', 'Gemiddelde', 'Kwadrant'],
      ...k.drijvers.rijen.map((r) => [r.naam, r.r === null ? (r.reden === 'weggevallen' ? 'niet getoond' : '') : xr(r.r, 2), r.ci_laag === null ? '' : xr(r.ci_laag, 2), r.ci_hoog === null ? '' : xr(r.ci_hoog, 2), eindig(r.p) ? pTekst(r.p) : '', r.n ?? '', xr(r.gemiddelde), r.kwadrant ? KWADRANT[r.kwadrant] : '']),
      [], [SAMENHANG_UITLEG(`"${k.drijvers.uitkomst.naam}"`)]] });
  }
  bladen.push({ naam: 'Signalen', rijen: [['Signaal'], ...(k.signalen || []).map((z) => [signaalZin(z)])] });
  if (k.verloop) {
    const mm = k.verloop.meetmomenten;
    bladen.push({ naam: 'Verloop', rijen: [['Thema', ...mm.map((m) => m.naam)], ...k.verloop.themas.map((t) => [t.naam, ...mm.map((m) => xr(t.punten.find((p) => p.meetmoment_id === m.id)?.gemiddelde))]), ...uitleg] });
  }
  if (k.kwaliteit) {
    bladen.push({ naam: 'Kwaliteit', rijen: [['Vraag', 'Ingevuld', 'Leeg (%)', 'Weet niet (%)'],
      ...k.kwaliteit.per_vraag.map((q) => [q.tekst, x(q.n_beantwoord), xr(q.pct_leeg, 0), q.pct_weet_niet === null ? (q.verborgen ? VERBORGEN : '') : xr(q.pct_weet_niet, 0)]),
      [], ['Alle schaalvragen hetzelfde beantwoord', k.kwaliteit.aantal_schaalvragen >= k.kwaliteit.rechte_lijn_min ? x(k.kwaliteit.rechte_lijn) : 'niet van toepassing'],
      ['Gemiddeld beantwoord (%)', xr(k.kwaliteit.gem_pct_beantwoord, 0)], ...uitleg] });
  }
  if (k.personeel) {
    const p = k.personeel;
    const rijen = [['Kengetal', 'Waarde'], ...KPI_NAMEN.filter(([sl]) => !p.ontbreekt.includes(sl)).map(([sl, naam]) => [naam, xr(p.totaal[sl], sl === 'meldingsfrequentie' ? 2 : 1)])];
    for (const g of p.per_groep || []) {
      rijen.push([], [g.dimensie_naam, 'Medewerkers', 'Fte', 'Gem. leeftijd', '% vrouw', 'Verzuim (%)', 'Meldingsfrequentie', 'Verloop (%)']);
      for (const r of g.rijen) rijen.push([r.label, x(r.medewerkers), xr(r.fte), xr(r.gem_leeftijd), xr(r.pct_vrouw, 0), xr(r.verzuim_pct), xr(r.meldingsfrequentie, 2), xr(r.verloop_pct, 0)]);
    }
    if (p.uitstroom_redenen?.length) rijen.push([], ['Reden van vertrek', 'Aantal'], ...p.uitstroom_redenen.map((r) => [r.label, x(r.aantal)]));
    bladen.push({ naam: 'Personeel', rijen: [...rijen, [], [PERSONEEL_VERBORGEN], [VERZUIM_VERBORGEN]] });
  }
  if (k.benchmarks?.length) {
    bladen.push({ naam: 'Benchmarks', rijen: [['Kengetal', 'Eigen waarde', 'Ter vergelijking', 'Omschrijving', 'Bron'], ...k.benchmarks.map((b) => [benchmarkNaam({ ...b, eigen_waarde: null }, k), b.eigen_waarde === null ? VERBORGEN : xr(b.eigen_waarde), b.waarde, b.omschrijving, b.citeersleutel ? `[@${b.citeersleutel}]` : ''])] });
  }
  return bladen;
}

// ---------- Platte tekst ("Neem op in stuk") ----------

/** Een korte samenvatting in platte tekst. */
export function kerncijferTekst(k) {
  const r = [];
  const l = k.lijst;
  if (!l) return 'Er zijn nog geen vragenlijsten.';
  r.push(`HR-analytics – ${l.titel}${l.meetmoment_naam ? ` (${l.meetmoment_naam})` : ''}`);
  if (l.verborgen) {
    r.push(`Minder dan ${k.drempel} respondenten: geen uitkomsten.`);
    return r.join('\n');
  }
  r.push(`Ingevuld: ${aantal(l.n)}${eindig(l.respons_pct) ? ` (respons ${nlProcent(l.respons_pct)})` : ''}.`);
  const dl = (k.deelname?.lijsten || []).find((x) => x.id === l.id);
  const fz = dl ? foutmargeZin(dl.n, dl.populatie, dl.foutmarge_pp) : null;
  if (fz) r.push(fz);
  for (const km of k.kenmerken || []) for (const z of representativiteitZinnen(km)) r.push(z);
  const e = enpsZin(k.scores?.enps);
  if (e) r.push(e);
  for (const t of k.scores?.themas || []) r.push(`- ${t.naam}: ${getal(t.gemiddelde)}${t.verborgen ? '' : ` (${nlProcent(t.pct_gunstig)} gunstig)`}`);
  if (k.scores?.sterkst?.length) r.push(`Sterkst: ${k.scores.sterkst.map((x) => `${x.tekst} (${getal(x.gemiddelde)})`).join('; ')}.`);
  if (k.scores?.zwakst?.length) r.push(`Zwakst: ${k.scores.zwakst.map((x) => `${x.tekst} (${getal(x.gemiddelde)})`).join('; ')}.`);
  const dz = drijverZin(k.drijvers);
  if (dz) r.push(dz);
  for (const s of k.signalen || []) r.push(`Signaal: ${signaalZin(s)}`);
  const p = k.personeel?.totaal;
  if (p && !p.verborgen) {
    const delen = [`${aantal(p.medewerkers)} medewerkers`];
    if (eindig(p.verzuim_pct)) delen.push(`verzuim ${nlGetal(p.verzuim_pct, 1)}%`);
    if (eindig(p.verloop_pct)) delen.push(`verloop ${nlProcent(p.verloop_pct)}`);
    r.push(`Personeel: ${delen.join(', ')}.`);
  }
  if (r.some((z) => z.includes(VERBORGEN))) r.push(VERBORGEN_UITLEG);
  return r.join('\n');
}

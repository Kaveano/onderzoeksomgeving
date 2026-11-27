// Bibliotheek: vaste lijsten, APA-verwijzingen (7e editie, Nederlandse schrijfwijze), namen van auteurs en
// citeersleutels. Zuivere module (geen DOM, geen fetch): de Worker, de schermen, het script voor de
// startcollectie en de tests gebruiken dezelfde code (BOUWPLAN §3.9, D3 §2.2–§2.8).
//
// De Nederlandse afspraken staan in OPMAAK (BOUWPLAN B20): '&' in de literatuurlijst en tussen haakjes,
// 'en' in een verwijzing in de lopende zin, een komma voor '&' in de literatuurlijst en het tussenvoegsel
// achter de voorletters ("Vries, M. de"). Het onderzoeksteam bevestigt het tussenvoegsel nog; omzetten is één
// regel ('voor' geeft "De Vries, M.").
//
// Tekst met *sterretjes* is cursief (zoals overal in de rapporten: rapport-weergave.js inline() en maakDocx).

import { nlDatum } from './opmaak.js';

// ---------- Vaste lijsten ----------

export const BRONSOORTEN = {
  artikel: 'Wetenschappelijk artikel',
  rapport: 'Rapport of onderzoek',
  boek: 'Boek',
  hoofdstuk: 'Hoofdstuk in een boek',
  website: 'Webpagina',
  wet: 'Wet of regelgeving',
  richtlijn: 'Richtlijn, norm of handreiking',
  cijfers: 'Cijfers of dataset (bijv. CBS StatLine)',
  proefschrift: 'Proefschrift of scriptie',
  notitie: 'Eigen notitie',
  overig: 'Overig',
};

// Onderwerpen: de 12 standaardsjablonen plus vier vakgebieden. sjablonen = de ids in src/sjablonen*.js.
export const ONDERWERPEN = {
  tevredenheid: { naam: 'Tevredenheid en betrokkenheid', sjablonen: ['medewerkerstevredenheid'] },
  'hr-processen': { naam: 'HR-processen', sjablonen: ['hr-processen'] },
  arbeidsvoorwaarden: { naam: 'Arbeidsvoorwaarden en beloning', sjablonen: ['arbeidsvoorwaarden'] },
  verzuim: { naam: 'Verzuim en vitaliteit', sjablonen: ['verzuim-vitaliteit'] },
  werkdruk: { naam: 'Werkdruk en werkstress', sjablonen: ['werkdruk-werkstress'] },
  leiderschap: { naam: 'Leiderschap en leidinggeven', sjablonen: ['leiderschap'] },
  onboarding: { naam: 'Onboarding', sjablonen: ['onboarding'] },
  vertrek: { naam: 'Vertrek en behoud', sjablonen: ['vertrekonderzoek'] },
  'sociale-veiligheid': { naam: 'Sociale veiligheid, diversiteit en inclusie', sjablonen: ['sociale-veiligheid'] },
  hybride: { naam: 'Hybride werken', sjablonen: ['hybride-werken'] },
  cultuur: { naam: 'Verandering en cultuur', sjablonen: ['verandering-cultuur'] },
  ontwikkeling: { naam: 'Ontwikkeling en loopbaan', sjablonen: ['ontwikkeling-loopbaan'] },
  methode: { naam: 'Onderzoeksmethode en vragenlijsten', sjablonen: [] },
  statistiek: { naam: 'Statistiek en analyse', sjablonen: [] },
  privacy: { naam: 'Privacy, AVG en ethiek', sjablonen: [] },
  'hr-analytics': { naam: 'HR-analytics en kengetallen', sjablonen: [] },
};

export const TALEN = { nl: 'Nederlands', en: 'Engels', de: 'Duits', fr: 'Frans', anders: 'Andere taal' };

export const BETROUWBAARHEID = {
  hoog: { naam: 'Hoog', uitleg: 'Wetenschappelijk getoetst, officiële statistiek of wet- en regelgeving.' },
  redelijk: { naam: 'Redelijk', uitleg: 'Rapport van een bekend instituut, overheid of vakliteratuur.' },
  beperkt: { naam: 'Beperkt', uitleg: 'Mening, blog, commerciële bron of klein onderzoek zonder verantwoording.' },
  onbekend: { naam: 'Nog niet beoordeeld', uitleg: '' },
};
/** Volgorde voor het filter "Betrouwbaarheid minstens". */
export const BETROUWBAARHEID_RANG = { onbekend: 0, beperkt: 1, redelijk: 2, hoog: 3 };

export const MAX_BRONNEN = 1000;
/** Zoveel bronnen per verzoek bij inlezen (de browser splitst een groter bestand). */
export const MAX_PER_REEKS = 100;

/** Grenzen per veld (D3 §2.1): een bron blijft daarmee onder ongeveer 18 KB. */
export const LIMIETEN = {
  titel: 500,
  auteurs: 30,
  achternaam: 100,
  tussenvoegsel: 20,
  voorletters: 30,
  organisatie: 300,
  afkorting: 30,
  url: 1000,
  doi: 200,
  detail: 300,
  redacteuren: 10,
  onderwerpen: 16,
  trefwoorden: 20,
  trefwoord: 60,
  samenvatting: 4000,
  kernpunten: 10,
  kernpunt: 300,
  betrouwbaarheid_toelichting: 500,
  notities: 5000,
  koppeling_notitie: 1000,
};

/** Soort werk bij een proefschrift of scriptie. */
export const SOORT_WERK = ['Proefschrift', 'Masterscriptie', 'Bachelorscriptie'];

/**
 * Velden per soort bron (in details). type: 'tekst' | 'datum' (JJJJ-MM-DD of JJJJ-MM) | 'auteurs' | 'keuze'.
 * 'alle' geldt voor elke soort (alleen gevuld bij de startcollectie).
 */
export const DETAILVELDEN = {
  artikel: [
    { sleutel: 'tijdschrift', label: 'Tijdschrift' },
    { sleutel: 'jaargang', label: 'Jaargang' },
    { sleutel: 'nummer', label: 'Nummer' },
    { sleutel: 'paginas', label: "Pagina's", hulp: 'Bijvoorbeeld 273-285.' },
    { sleutel: 'artikelnummer', label: 'Artikelnummer', hulp: 'Alleen als het tijdschrift geen pagina’s gebruikt, bijvoorbeeld e0123.' },
  ],
  boek: [
    { sleutel: 'uitgever', label: 'Uitgever' },
    { sleutel: 'druk', label: 'Druk (bijv. 3)', hulp: 'Alleen invullen bij een tweede of latere druk.' },
  ],
  hoofdstuk: [
    { sleutel: 'boektitel', label: 'Titel van het boek' },
    { sleutel: 'redacteuren', label: 'Redacteuren', type: 'auteurs' },
    { sleutel: 'paginas', label: "Pagina's", hulp: 'Bijvoorbeeld 45-67.' },
    { sleutel: 'uitgever', label: 'Uitgever' },
  ],
  rapport: [
    { sleutel: 'rapportnummer', label: 'Rapportnummer' },
    { sleutel: 'uitgever', label: 'Uitgever (als die anders is dan de organisatie)' },
  ],
  website: [
    { sleutel: 'sitenaam', label: 'Naam van de website' },
    { sleutel: 'datum', label: 'Datum van de pagina', type: 'datum' },
    { sleutel: 'geraadpleegd', label: 'Geraadpleegd op', type: 'datum' },
  ],
  wet: [
    { sleutel: 'datum', label: 'Datum', type: 'datum' },
    { sleutel: 'geraadpleegd', label: 'Geraadpleegd op', type: 'datum' },
  ],
  richtlijn: [
    { sleutel: 'datum', label: 'Datum', type: 'datum' },
    { sleutel: 'geraadpleegd', label: 'Geraadpleegd op', type: 'datum' },
  ],
  cijfers: [
    { sleutel: 'uitgever', label: 'Uitgever' },
    { sleutel: 'geraadpleegd', label: 'Geraadpleegd op', type: 'datum' },
  ],
  proefschrift: [
    { sleutel: 'instelling', label: 'Universiteit of hogeschool' },
    { sleutel: 'soort_werk', label: 'Soort werk', type: 'keuze', opties: SOORT_WERK },
  ],
  notitie: [],
  overig: [],
  alle: [
    { sleutel: 'gecontroleerd_op', label: 'Gecontroleerd op', type: 'datum' },
    { sleutel: 'gecontroleerd_door', label: 'Gecontroleerd door' },
  ],
};

/** Alle toegestane detailvelden voor een soort (inclusief 'alle'). */
export function detailveldenVan(soort) {
  return [...(DETAILVELDEN[soort] || []), ...DETAILVELDEN.alle];
}

/** Lege bron (de standaardwaarden van de tabel bronnen). */
export function legeBron(soort = 'artikel') {
  return {
    soort, titel: '', auteurs: [], organisatie: '', afkorting: '', jaar: null, taal: 'nl', url: '', doi: '', details: {},
    onderwerpen: [], trefwoorden: [], samenvatting: '', kernpunten: [], betrouwbaarheid: 'onbekend',
    betrouwbaarheid_toelichting: '', notities: '',
  };
}

// ---------- Tekst normaliseren (ook voor het zoeken, zie bibliotheek-zoeken.js) ----------

const BIJZONDER = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ĳ: 'ij', đ: 'd', ł: 'l', þ: 'th', ð: 'd' };
const APOSTROF = /['’‘`´ʼ]/;

/** Eén teken (als code point) genormaliseerd: '' (weg), ' ' (scheiding) of een of meer tekens a-z/0-9. */
function normTeken(teken) {
  const klein = teken.toLowerCase();
  if (APOSTROF.test(klein)) return '';
  let uit = '';
  for (const c of klein) {
    const v = BIJZONDER[c] ?? c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const x of v) uit += /[a-z0-9]/.test(x) ? x : ' ';
  }
  return uit;
}

/**
 * Tekst voor vergelijken en zoeken: kleine letters, zonder accenten (ß → ss, æ → ae, œ → oe, ø → o, ĳ → ij),
 * zonder apostrofs; al het andere dan a-z en 0-9 wordt één spatie.
 * 'Ziekteverzuim & Bevlogenheid — café’s' → 'ziekteverzuim bevlogenheid cafes'
 */
export function normaliseer(tekst) {
  // Hetzelfde als normaliseerMetKaart(tekst).norm (een test bewaakt dat), maar in één keer over de hele tekst: snel.
  return String(tekst ?? '')
    .toLowerCase()
    .replace(/['’‘`´ʼ]/g, '')
    .replace(/[ßæœøĳđłþð]/g, (c) => BIJZONDER[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Als normaliseer, plus kaart: kaart[i] is de plaats in de oorspronkelijke tekst van teken i van norm
 * (voor het markeren van zoektreffers). lengte[i] is het aantal tekens (UTF-16) van dat oorspronkelijke teken.
 */
export function normaliseerMetKaart(tekst) {
  const bron = String(tekst ?? '');
  let norm = '';
  const kaart = [];
  const lengte = [];
  let i = 0;
  for (const teken of bron) {
    // Een los accentteken (zoals de ´ in "e´" als twee tekens) hoort bij de letter ervoor: markering loopt erover door.
    if (/[̀-ͯ]/.test(teken) && norm && norm[norm.length - 1] !== ' ') lengte[lengte.length - 1] += teken.length;
    for (const c of normTeken(teken)) {
      if (c === ' ') {
        if (norm && norm[norm.length - 1] !== ' ') {
          norm += ' ';
          kaart.push(i);
          lengte.push(teken.length);
        }
      } else {
        norm += c;
        kaart.push(i);
        lengte.push(teken.length);
      }
    }
    i += teken.length;
  }
  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    kaart.pop();
    lengte.pop();
  }
  return { norm, kaart, lengte };
}

// ---------- Hulpjes voor tekst ----------

/** Sterretjes (cursief) en dubbele spaties uit een veld halen, zodat de opmaak niet breekt. */
export function zonderSterren(t) {
  return String(t ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

const eindPunt = (t) => (/[.?!]$/.test(t) ? t : `${t}.`);
const hoofdletter = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** 45-67 → 45–67 (een "en dash" tussen paginanummers). */
export function paginaStreep(p) {
  return String(p ?? '').trim().replace(/\s*[-–—]+\s*/g, '–');
}
const isBereik = (p) => /[–-]/.test(String(p));

const DAG_MAAND = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** '2024-03-05' → '5 maart 2024'; '2024-03' → 'maart 2024'; anders ''. */
export function nlDatumKort(iso) {
  const s = String(iso ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return nlDatum(s);
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  return m && DAG_MAAND[Number(m[2]) - 1] ? `${DAG_MAAND[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** Dag en maand voor in de datum van een verwijzing: '2024-03-05' → '5 maart'; '2024-03' → 'maart'. */
function dagMaand(iso) {
  const s = String(iso ?? '');
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m && DAG_MAAND[Number(m[2]) - 1]) return `${Number(m[3])} ${DAG_MAAND[Number(m[2]) - 1]}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  return m && DAG_MAAND[Number(m[2]) - 1] ? DAG_MAAND[Number(m[2]) - 1] : '';
}

// ---------- APA: opmaak ----------

/** Nederlandse APA-afspraken (B20). tussenvoegsel 'achter': "Vries, M. de"; 'voor': "De Vries, M.". */
export const OPMAAK = { amp: { lijst: '&', haakjes: '&', verhalend: 'en' }, kommaVoorAmp: true, tussenvoegsel: 'achter' };

// Soorten waarvan de titel niet cursief is (een artikel en een hoofdstuk zijn deel van iets groters; een wet).
const NIET_CURSIEF = new Set(['artikel', 'hoofdstuk', 'wet']);

const personenVan = (bron) => (Array.isArray(bron?.auteurs) ? bron.auteurs.filter((a) => a && zonderSterren(a.achternaam)) : []);

/** Naam in de literatuurlijst: "Bakker, A. B." · "Vries, M. de" (of "De Vries, M." bij 'voor'). */
function lijstNaam(a) {
  const achternaam = zonderSterren(a.achternaam);
  const tv = zonderSterren(a.tussenvoegsel);
  const vl = zonderSterren(a.voorletters);
  if (tv && OPMAAK.tussenvoegsel === 'voor') return `${hoofdletter(tv)} ${achternaam}${vl ? `, ${vl}` : ''}`;
  return `${achternaam}${vl ? `, ${vl}` : ''}${tv ? `${vl ? ' ' : ', '}${tv}` : ''}`;
}

/** Naam van een redacteur: voorletters, dan tussenvoegsel en achternaam: "C. van den Berg". */
function redacteurNaam(a) {
  return [zonderSterren(a.voorletters), zonderSterren(a.tussenvoegsel), zonderSterren(a.achternaam)].filter(Boolean).join(' ');
}

/** Naam in de lopende tekst: het tussenvoegsel krijgt een hoofdletter ("De Vries"). */
function tekstNaam(a) {
  const tv = zonderSterren(a.tussenvoegsel);
  return tv ? `${hoofdletter(tv)} ${zonderSterren(a.achternaam)}` : zonderSterren(a.achternaam);
}

/** Auteurs in de literatuurlijst: "Bakker, A. B., & Demerouti, E."; 21 of meer: de eerste 19, "…" en de laatste. */
function lijstAuteurs(personen) {
  const namen = personen.map(lijstNaam);
  if (namen.length === 1) return namen[0];
  if (namen.length >= 21) return `${namen.slice(0, 19).join(', ')}, … ${namen[namen.length - 1]}`;
  return `${namen.slice(0, -1).join(', ')}${OPMAAK.kommaVoorAmp ? ',' : ''} ${OPMAAK.amp.lijst} ${namen[namen.length - 1]}`;
}

/** Redacteuren: "B. Kok" · "B. Kok & C. van den Berg" · "A. Ab, B. Bo, & C. Ce". */
function redacteurenTekst(lijst) {
  const namen = lijst.map(redacteurNaam).filter(Boolean);
  if (namen.length <= 1) return namen[0] || '';
  if (namen.length === 2) return `${namen[0]} ${OPMAAK.amp.lijst} ${namen[1]}`;
  return `${namen.slice(0, -1).join(', ')}${OPMAAK.kommaVoorAmp ? ',' : ''} ${OPMAAK.amp.lijst} ${namen[namen.length - 1]}`;
}

/** De titel zoals in de lijst: cursief voor zelfstandige werken (boek, rapport …), anders gewoon. */
function gemarkeerdeTitel(bron, titel = zonderSterren(bron.titel)) {
  if (!titel) return '';
  return NIET_CURSIEF.has(bron.soort) ? titel : `*${titel}*`;
}

/** Wie er als auteur vooraan staat: personen, de organisatie, of (zonder beide) de titel. */
function auteurDeel(bron) {
  const personen = personenVan(bron);
  if (personen.length) {
    const t = lijstAuteurs(personen);
    // Eindigt op een voorletter (met punt) of op een tussenvoegsel: dan geen extra punt (D3 §8.1, geval 4).
    const laatste = personen[personen.length - 1];
    const eindigtOpTussenvoegsel = OPMAAK.tussenvoegsel !== 'voor' && zonderSterren(laatste.tussenvoegsel) && personen.length < 21;
    return { soort: 'personen', tekst: /\.$/.test(t) || eindigtOpTussenvoegsel ? t : `${t}.`, naam: t };
  }
  const org = zonderSterren(bron.organisatie);
  if (org) return { soort: 'organisatie', tekst: eindPunt(org), naam: org };
  const titel = zonderSterren(bron.titel);
  const gemarkeerd = gemarkeerdeTitel(bron, titel);
  return { soort: 'titel', tekst: !titel ? '' : /[.?!]\*?$/.test(gemarkeerd) ? gemarkeerd : `${gemarkeerd}.`, naam: titel };
}

/** De regel met auteurs of organisatie op een kaart (zonder slotpunt). */
export function auteursRegel(bron) {
  const personen = personenVan(bron);
  if (personen.length) return lijstAuteurs(personen);
  return zonderSterren(bron?.organisatie);
}

/** '2024' · 'z.d.' · '2024a' · 'z.d.-a' */
function jaarTekst(bron, suffix = '') {
  if (Number.isInteger(bron?.jaar)) return `${bron.jaar}${suffix}`;
  return suffix ? `z.d.-${suffix}` : 'z.d.';
}

const MET_DATUM = new Set(['website', 'wet', 'richtlijn']);

function datumDeel(bron, suffix) {
  const dm = MET_DATUM.has(bron.soort) && Number.isInteger(bron.jaar) ? dagMaand(bron.details?.datum) : '';
  return `(${jaarTekst(bron, suffix)}${dm ? `, ${dm}` : ''}).`;
}

/** '3' → '(3e dr.)'; andere tekst tussen haakjes zoals gegeven. */
function drukTekst(druk) {
  const d = zonderSterren(druk);
  if (!d) return '';
  const m = /^(\d+)\s*(?:e|de|ste)?\.?\s*(?:dr\.?|druk)?$/i.exec(d);
  return m ? `(${m[1]}e dr.)` : `(${d.replace(/^\((.*)\)$/, '$1')})`;
}

function titelDeel(bron) {
  const d = bron.details || {};
  const extra = [];
  if (bron.soort === 'boek' && d.druk) extra.push(drukTekst(d.druk));
  if (bron.soort === 'rapport' && zonderSterren(d.rapportnummer)) extra.push(`(Rapportnr. ${zonderSterren(d.rapportnummer)})`);
  if (bron.soort === 'cijfers') extra.push('[Dataset]');
  if (bron.soort === 'proefschrift') {
    const werk = zonderSterren(d.soort_werk) || 'Proefschrift';
    const instelling = zonderSterren(d.instelling);
    extra.push(`[${werk}${instelling ? `, ${instelling}` : ''}]`);
  }
  const titel = gemarkeerdeTitel(bron);
  if (!titel) return '';
  if (!extra.length) return /[.?!]\*?$/.test(titel) ? titel : `${titel}.`;
  return `${titel} ${extra.join(' ')}.`;
}

/** 'pp. 45–67' of 'p. 45'. */
function ppTekst(p) {
  const s = paginaStreep(p);
  return isBereik(s) ? `pp. ${s}` : `p. ${s}`;
}

function bronDeel(bron, auteur) {
  const d = bron.details || {};
  const personen = auteur.soort === 'personen';
  const zelfdeAlsAuteur = (t) => normaliseer(t) === normaliseer(auteur.naam);
  const uitgever = (t) => {
    const u = zonderSterren(t);
    return u && !zelfdeAlsAuteur(u) ? eindPunt(u) : '';
  };
  switch (bron.soort) {
    case 'artikel': {
      const tijdschrift = zonderSterren(d.tijdschrift);
      if (!tijdschrift) return '';
      const jg = zonderSterren(d.jaargang);
      const nr = zonderSterren(d.nummer);
      const pag = zonderSterren(d.paginas);
      const art = zonderSterren(d.artikelnummer);
      return `*${tijdschrift}${jg ? `, ${jg}` : ''}*${nr ? `(${nr})` : ''}${pag ? `, ${paginaStreep(pag)}` : art ? `, Artikel ${art}` : ''}.`;
    }
    case 'hoofdstuk': {
      const boektitel = zonderSterren(d.boektitel);
      const red = Array.isArray(d.redacteuren) ? d.redacteuren.filter((a) => a && zonderSterren(a.achternaam)) : [];
      const pag = zonderSterren(d.paginas);
      const delen = [];
      if (boektitel) {
        delen.push(`In ${red.length ? `${redacteurenTekst(red)} (Red.), ` : ''}*${boektitel}*${pag ? ` (${ppTekst(pag)})` : ''}.`);
      }
      const u = uitgever(d.uitgever);
      if (u) delen.push(u);
      return delen.join(' ');
    }
    case 'boek':
      return uitgever(d.uitgever) || (personen ? uitgever(bron.organisatie) : '');
    case 'website':
      return uitgever(d.sitenaam);
    case 'wet':
    case 'proefschrift':
      return '';
    default: // rapport, richtlijn, cijfers, notitie, overig
      return uitgever(d.uitgever) || (personen ? uitgever(bron.organisatie) : '');
  }
}

function vindplaats(bron) {
  const doi = String(bron.doi ?? '').trim();
  if (doi) return `https://doi.org/${doi}`;
  const url = String(bron.url ?? '').trim();
  if (!url) return '';
  const geraadpleegd = nlDatum(bron.details?.geraadpleegd);
  return geraadpleegd ? `Geraadpleegd op ${geraadpleegd}, van ${url}` : url;
}

/**
 * De verwijzing in de literatuurlijst (APA 7, Nederlandse schrijfwijze), met *cursief*.
 * suffix: 'a', 'b' … als dezelfde auteur(s) in hetzelfde jaar vaker voorkomen (zie sorteerLiteratuur).
 */
export function apaVerwijzing(bron, { suffix = '' } = {}) {
  if (!bron) return '';
  const auteur = auteurDeel(bron);
  const delen = [auteur.tekst, datumDeel(bron, suffix)];
  if (auteur.soort !== 'titel') delen.push(titelDeel(bron));
  delen.push(bronDeel(bron, auteur), vindplaats(bron));
  return delen.filter(Boolean).join(' ');
}

// ---------- APA: in de tekst ----------

/** De sleutel waaraan we zien of een bron al eerder genoemd is. */
const sleutelVan = (bron) => String(bron?.citeersleutel ?? bron?.id ?? bron?.titel ?? '');

/** Korte titel voor een bron zonder auteur: de eerste vijf woorden (cursief of tussen aanhalingstekens). */
function korteTitel(bron) {
  const woorden = zonderSterren(bron.titel).split(' ').filter(Boolean);
  const kort = woorden.slice(0, 5).join(' ');
  if (!kort) return '';
  if (bron.soort === 'wet') return kort;
  if (bron.soort === 'artikel' || bron.soort === 'hoofdstuk') return `"${kort}"`;
  return `*${kort}*`;
}

/**
 * Het naamdeel in de tekst. eerste: eerste keer genoemd (dan bij een organisatie met afkorting de volle naam).
 * → { naam, volledig?, afkorting? }
 */
function tekstNamen(bron, { verhalend, eerste }) {
  const personen = personenVan(bron);
  if (personen.length) {
    const amp = verhalend ? OPMAAK.amp.verhalend : OPMAAK.amp.haakjes;
    if (personen.length === 1) return { naam: tekstNaam(personen[0]) };
    if (personen.length === 2) return { naam: `${tekstNaam(personen[0])} ${amp} ${tekstNaam(personen[1])}` };
    return { naam: `${tekstNaam(personen[0])} et al.` };
  }
  const org = zonderSterren(bron.organisatie);
  const afk = zonderSterren(bron.afkorting);
  if (org && afk) return eerste ? { naam: org, volledig: org, afkorting: afk } : { naam: afk };
  if (org) return { naam: org };
  return { naam: korteTitel(bron) || 'Zonder titel' };
}

/** '12' → 'p. 12'; '12-14' → 'pp. 12–14'; andere tekst ('hoofdstuk 3', 'p. 4') blijft zoals hij is. */
export function paginaTekst(pagina) {
  const p = String(pagina ?? '').trim();
  if (!p) return '';
  if (/^\d+[a-z]?$/i.test(p)) return `p. ${p}`;
  if (/^\d+\s*[-–—]\s*\d+$/.test(p)) return `pp. ${paginaStreep(p)}`;
  return p;
}

// Eén vaste sorteerder (localeCompare met opties maakt er elke keer een nieuwe; dat is traag bij veel bronnen).
const SORTEERDER = new Intl.Collator('nl', { sensitivity: 'base' });
const vergelijk = (a, b) => SORTEERDER.compare(a, b);

/**
 * Verwijzing in de tekst voor één of meer bronnen: items = [{ bron, pagina?, suffix? }].
 * Tussen haakjes: "(Bakker & Demerouti, 2017, p. 12; Centraal Bureau voor de Statistiek [CBS], 2024b)";
 * verhalend (in de zin): "Bakker en Demerouti (2017)".
 * eersteKeer: de verzameling citeersleutels die al eerder genoemd zijn. Een bron die er nog niet in staat, wordt
 * als eerste vermelding geschreven (een organisatie met afkorting dan voluit); daarna komt hij erin te staan.
 * Geef dezelfde Set mee voor het hele rapport, in de volgorde van de tekst.
 */
export function apaInTekst(items, { verhalend = false, eersteKeer = new Set() } = {}) {
  const lijst = (Array.isArray(items) ? items : []).filter((i) => i && i.bron);
  const delen = lijst.map((item) => {
    const sleutel = sleutelVan(item.bron);
    const namen = tekstNamen(item.bron, { verhalend, eerste: !eersteKeer.has(sleutel) });
    return { ...namen, jaar: jaarTekst(item.bron, item.suffix || ''), pagina: paginaTekst(item.pagina), sleutel, bron: item.bron };
  });
  for (const d of delen) eersteKeer.add(d.sleutel);
  if (!delen.length) return '';

  if (!verhalend) {
    // Op naam (en daarna jaar; zonder datum eerst), dezelfde naam met meerdere jaren samengevoegd: (Bakker, 2017, 2019).
    const gesorteerd = [...delen].sort((a, b) => vergelijk(a.naam, b.naam)
      || (Number.isInteger(a.bron.jaar) ? a.bron.jaar : -1) - (Number.isInteger(b.bron.jaar) ? b.bron.jaar : -1)
      || vergelijk(a.jaar, b.jaar));
    const groepen = [];
    for (const d of gesorteerd) {
      const naam = d.afkorting ? `${d.volledig} [${d.afkorting}]` : d.naam;
      const jaar = `${d.jaar}${d.pagina ? `, ${d.pagina}` : ''}`;
      const vorige = groepen[groepen.length - 1];
      if (vorige && vorige.naam === naam) vorige.jaren.push(jaar);
      else groepen.push({ naam, jaren: [jaar] });
    }
    return `(${groepen.map((g) => `${g.naam}, ${g.jaren.join(', ')}`).join('; ')})`;
  }

  // In de zin, in de volgorde waarin je ze noemt: "Bakker en Demerouti (2017)", "Centraal Bureau voor de Statistiek (CBS, 2024)".
  const groepen = [];
  for (const d of delen) {
    const jaar = `${d.jaar}${d.pagina ? `, ${d.pagina}` : ''}`;
    const vorige = groepen[groepen.length - 1];
    if (vorige && vorige.naam === d.naam && !d.afkorting && !vorige.afkorting) vorige.jaren.push(jaar);
    else groepen.push({ naam: d.naam, afkorting: d.afkorting, jaren: [jaar] });
  }
  const teksten = groepen.map((g) => `${g.naam} (${g.afkorting ? `${g.afkorting}, ` : ''}${g.jaren.join(', ')})`);
  if (teksten.length === 1) return teksten[0];
  return `${teksten.slice(0, -1).join(', ')} ${OPMAAK.amp.verhalend} ${teksten[teksten.length - 1]}`;
}

/** Korte vorm voor naast een cijfer, zoals een vergelijkingswaarde: "(CBS, 2025)". Altijd de korte naam. */
export function apaKort(bron, { suffix = '' } = {}) {
  if (!bron) return '';
  const namen = tekstNamen(bron, { verhalend: false, eerste: false });
  return `(${namen.naam}, ${jaarTekst(bron, suffix)})`;
}

// ---------- Volgorde van de literatuurlijst ----------

/** Sorteersleutel (APA): achternaam eerste auteur (zonder tussenvoegsel), voorletters, volgende auteurs, jaar (z.d. eerst), titel. */
export function sorteerSleutel(bron) {
  const personen = personenVan(bron);
  const naamVan = (a) => (OPMAAK.tussenvoegsel === 'voor' && a.tussenvoegsel ? `${a.tussenvoegsel} ${a.achternaam}` : a.achternaam);
  const delen = personen.length
    ? personen.map((a) => [naamVan(a), a.voorletters || ''])
    : [[zonderSterren(bron.organisatie) || zonderSterren(bron.titel), '']];
  return { delen, jaar: Number.isInteger(bron.jaar) ? bron.jaar : -1, titel: zonderSterren(bron.titel) };
}

/** Vergelijkt twee bronnen in de volgorde van de literatuurlijst. */
export function vergelijkBronnen(a, b) {
  const x = sorteerSleutel(a);
  const y = sorteerSleutel(b);
  const n = Math.max(x.delen.length, y.delen.length);
  for (let i = 0; i < n; i++) {
    const p = x.delen[i];
    const q = y.delen[i];
    if (!p) return -1; // minder auteurs eerst
    if (!q) return 1;
    const c = vergelijk(p[0], q[0]) || vergelijk(p[1], q[1]);
    if (c) return c;
  }
  return x.jaar - y.jaar || vergelijk(x.titel, y.titel);
}

/**
 * De literatuurlijst in APA-volgorde, met a, b … bij dezelfde naam (zoals in de tekst) en hetzelfde jaar:
 * → [{ bron, suffix }]. Gebruik dezelfde suffixen in de tekst, zodat tekst en lijst altijd kloppen.
 */
export function sorteerLiteratuur(bronnen) {
  const lijst = (Array.isArray(bronnen) ? bronnen : []).filter(Boolean);
  const uniek = [...new Map(lijst.map((b) => [sleutelVan(b), b])).values()];
  const gesorteerd = uniek.sort(vergelijkBronnen);
  const groep = (b) => `${normaliseer(tekstNamen(b, { verhalend: false, eerste: false }).naam)}|${Number.isInteger(b.jaar) ? b.jaar : 'zd'}`;
  const tellers = new Map();
  for (const b of gesorteerd) tellers.set(groep(b), (tellers.get(groep(b)) || 0) + 1);
  const volgnummer = new Map();
  return gesorteerd.map((bron) => {
    const g = groep(bron);
    if (tellers.get(g) < 2) return { bron, suffix: '' };
    const i = volgnummer.get(g) || 0;
    volgnummer.set(g, i + 1);
    return { bron, suffix: String.fromCharCode(97 + Math.min(i, 25)) };
  });
}

// ---------- Citeersleutels ----------

export const CITEERSLEUTEL = /^[a-z][a-z0-9]{1,39}$/;

/**
 * Basis van een citeersleutel: achternaam eerste auteur (zonder tussenvoegsel), anders de afkorting, anders het
 * eerste woord van ten minste 3 letters van de organisatie of de titel; alleen a-z, hooguit 20 letters; dan het
 * jaar of 'zd'. bakker2017 · vries2020 · cbs2024 · arbeidsomstandighede1998.
 */
export function citeersleutelBasis(bron) {
  const letters = (t) => normaliseer(t).replace(/[^a-z]/g, '');
  const eersteWoord = (t) => normaliseer(t).split(' ').map((w) => w.replace(/[^a-z]/g, '')).find((w) => w.length >= 3) || '';
  const personen = personenVan(bron);
  let basis = personen.length ? letters(personen[0].achternaam) : '';
  if (!basis) basis = letters(bron?.afkorting);
  if (!basis) basis = eersteWoord(bron?.organisatie);
  if (!basis) basis = eersteWoord(bron?.titel);
  if (!basis) basis = 'bron';
  return `${basis.slice(0, 20)}${Number.isInteger(bron?.jaar) ? bron.jaar : 'zd'}`;
}

/** Eerste vrije citeersleutel: basis, dan basis + b, c, … (bezet: Set van bestaande sleutels). */
export function vrijeCiteersleutel(basis, bezet) {
  if (!bezet.has(basis)) return basis;
  for (let i = 1; i < 26; i++) {
    const k = `${basis}${String.fromCharCode(97 + i)}`;
    if (!bezet.has(k)) return k;
  }
  for (let n = 2; ; n++) {
    const k = `${basis}z${n}`;
    if (!bezet.has(k)) return k;
  }
}

// ---------- Namen lezen ----------

// Tussenvoegsels, langste eerst (zodat "van der" voor "van" komt).
const TUSSENVOEGSELS = [
  'van den', 'van der', 'van het', "van 't", 'van de', 'in het', "in 't", 'in de', 'uit het', 'uit de', 'op den', 'op het', 'op de',
  'aan den', 'aan het', 'aan de', 'bij de', 'voor de', 'de la', 'van', 'den', 'der', 'het', 'ten', 'ter', 'von', 'de', 'te', "'t",
  'op', "d'", 'du', 'le', 'la', 'zu',
].sort((a, b) => b.length - a.length);

// Woorden waaraan je een organisatie herkent (geen persoon).
const ORG_WOORDEN = new Set([
  'bureau', 'instituut', 'institute', 'ministerie', 'stichting', 'universiteit', 'university', 'hogeschool', 'inspectie', 'raad',
  'centraal', 'centrum', 'center', 'centre', 'vereniging', 'gemeente', 'rijksoverheid', 'rijksinstituut', 'kamer', 'agentschap',
  'autoriteit', 'college', 'fonds', 'platform', 'netwerk', 'organisatie', 'organization', 'organisation', 'association', 'office',
  'council', 'agency', 'commission', 'commissie', 'department', 'foundation', 'society', 'federatie', 'federation', 'bond',
  'tno', 'cbs', 'rivm', 'ser', 'nva', 'scp', 'uwv', 'oecd', 'who', 'nivel', 'cpb', 'eu', 'ilo', 'eurofound', 'nen', 'awvn',
]);

/** "A. B." · "J.-W." · "Th." · "AB" (zoals PubMed): ziet eruit als voorletters. */
const isInitialen = (t) => {
  const s = String(t ?? '').trim();
  return /^(?:[A-ZÀ-Ý](?:h|hr)?\.\s*(?:-\s*)?)+$/.test(s) || /^[A-Z]{1,4}$/.test(s);
};

/** Splitst een tussenvoegsel vooraan af: "van der Berg" → { tussenvoegsel: 'van der', achternaam: 'Berg' }. */
function splitsVoorvoegsel(t) {
  const s = t.trim();
  const klein = s.toLowerCase();
  for (const tv of TUSSENVOEGSELS) {
    if (klein.startsWith(`${tv} `) && s.length > tv.length + 1) return { tussenvoegsel: tv, achternaam: s.slice(tv.length + 1).trim() };
    if (tv === "d'" && klein.startsWith(tv) && s.length > 2) return { tussenvoegsel: tv, achternaam: s.slice(2).trim() };
  }
  return { tussenvoegsel: '', achternaam: s };
}

/** Splitst een tussenvoegsel achteraan af: "J. de" → { rest: 'J.', tussenvoegsel: 'de' }. */
function splitsAchtervoegsel(t) {
  const s = t.trim();
  const klein = s.toLowerCase();
  for (const tv of TUSSENVOEGSELS) {
    if (klein.endsWith(` ${tv}`) && s.length > tv.length + 1) return { rest: s.slice(0, s.length - tv.length - 1).trim(), tussenvoegsel: tv };
  }
  return { rest: s, tussenvoegsel: '' };
}

/**
 * Voorletters: 'Arnold Bernard' → 'A. B.'; 'A.B.' → 'A. B.'; 'Jan-Willem' → 'J.-W.'; 'J.P.M.' → 'J. P. M.';
 * 'AB' (zoals PubMed) → 'A. B.'; 'Th.' blijft 'Th.'.
 */
export function voorletters(t) {
  const s = String(t ?? '').replace(/\.\s*-\s*/g, '-').trim();
  if (!s) return '';
  const uit = [];
  for (const deel of s.replace(/\./g, '. ').split(/\s+/).filter(Boolean)) {
    const metPunt = deel.endsWith('.');
    const kaal = deel.replace(/\.+$/, '');
    if (!kaal) continue;
    if (kaal.includes('-')) {
      const stukken = kaal.split('-').filter(Boolean).map((x) => `${x[0].toUpperCase()}.`);
      if (stukken.length) uit.push(stukken.join('-'));
    } else if (metPunt && /^(?:Th|Chr|Ph|Ch)$/.test(kaal)) {
      uit.push(`${kaal}.`);
    } else if (!metPunt && /^[A-Z]{2,4}$/.test(kaal)) {
      for (const c of kaal) uit.push(`${c}.`);
    } else {
      uit.push(`${kaal[0].toUpperCase()}.`);
    }
  }
  return uit.join(' ');
}

// Samengestelde woorden die op een organisatie wijzen: Kenniscentrum, Planbureau, Adviesraad, Arbodienst …
const ORG_EINDES = ['centrum', 'instituut', 'bureau', 'raad', 'dienst', 'fonds', 'platform', 'netwerk', 'federatie', 'vereniging',
  'stichting', 'ministerie', 'college', 'groep', 'bond', 'unie', 'advies', 'consult', 'academie', 'agentschap', 'autoriteit', 'inspectie'];

const schoonNaam = (t) => String(t ?? '').replace(/\s+/g, ' ').replace(/^[\s;,]+|[\s;,]+$/g, '').trim();
const isOrgWoord = (w) => {
  const n = normaliseer(w);
  return ORG_WOORDEN.has(n) || ORG_EINDES.some((e) => n.length > e.length + 2 && n.endsWith(e));
};

/**
 * Leest één auteur: "Bakker, A. B." · "Bakker, Arnold B." · "de Vries, J." · "Vries, J. de" · "Jan de Vries" ·
 * "van der Berg, K." · "Bakker A.B." → { achternaam, tussenvoegsel, voorletters }. Een organisatie (geen komma
 * en een woord als Bureau of Ministerie, meer dan drie woorden die geen naam vormen, of één woord) →
 * { organisatie }. Lege tekst → null.
 */
export function leesAuteur(tekst) {
  const t = schoonNaam(tekst);
  if (!t) return null;
  const persoon = (achternaam, tussenvoegsel, vl) => ({
    achternaam: schoonNaam(achternaam),
    tussenvoegsel: schoonNaam(tussenvoegsel).toLowerCase(),
    voorletters: voorletters(vl),
  });
  if (t.includes(',')) {
    const komma = t.indexOf(',');
    const voor = t.slice(0, komma);
    const na = t.slice(komma + 1).replace(/,\s*(?:Jr\.?|Sr\.?)$/i, '');
    const v = splitsVoorvoegsel(voor);
    const a = splitsAchtervoegsel(na);
    return persoon(v.achternaam, v.tussenvoegsel || a.tussenvoegsel, a.rest);
  }
  const woorden = t.split(' ');
  // De achternaam na een tussenvoegsel ("Jan de Raad") wijst niet op een organisatie.
  const naTussenvoegsel = (i) => i === woorden.length - 1 && i > 0 && TUSSENVOEGSELS.some((tv) => tv.split(' ').pop() === woorden[i - 1].toLowerCase());
  if (woorden.length === 1 || woorden.some((w, i) => isOrgWoord(w) && !naTussenvoegsel(i)) || /^[A-Z]{2,6}$/.test(t)) return { organisatie: t };
  // Voorletters achteraan: "Bakker A.B." of "de Vries J."
  const laatste = woorden[woorden.length - 1];
  if (woorden.length >= 2 && (/\./.test(laatste) || /^[A-Z]{1,4}$/.test(laatste)) && isInitialen(laatste)) {
    const v = splitsVoorvoegsel(woorden.slice(0, -1).join(' '));
    return persoon(v.achternaam, v.tussenvoegsel, laatste);
  }
  // Voornamen of voorletters, dan eventueel een tussenvoegsel, dan de achternaam: "Jan de Vries", "C. van den Berg".
  const klein = t.toLowerCase();
  for (let i = 1; i < woorden.length - 1; i++) {
    const rest = woorden.slice(i).join(' ').toLowerCase();
    const tv = TUSSENVOEGSELS.find((x) => rest.startsWith(`${x} `));
    if (tv && woorden.slice(0, i).every((w) => /^[A-ZÀ-Ý]/.test(w))) {
      const achternaam = woorden.slice(i).join(' ').slice(tv.length + 1);
      if (/^[A-ZÀ-Ý]/.test(achternaam)) return persoon(achternaam, tv, woorden.slice(0, i).join(' '));
    }
  }
  // Zonder tussenvoegsel: hooguit vier woorden die allemaal met een hoofdletter beginnen ("Arnold B. Bakker").
  if (woorden.length <= 4 && woorden.every((w) => /^[A-ZÀ-Ý]/.test(w)) && !/\s(?:en|and|of|for|voor|van)\s/.test(klein)) {
    return persoon(laatste, '', woorden.slice(0, -1).join(' '));
  }
  return { organisatie: t };
}

/** Een auteur als één tekst (voor RIS en Excel): "Bakker, A. B." · "Vries, M. de". */
export function auteurAlsTekst(a) {
  if (!a) return '';
  return lijstNaam({ achternaam: a.achternaam, tussenvoegsel: a.tussenvoegsel, voorletters: a.voorletters });
}

// ---------- Dubbele bronnen ----------

/** DOI zonder https://doi.org/ of doi:, in kleine letters (om te vergelijken). */
export function kaleDoi(t) {
  return String(t ?? '').trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '').toLowerCase();
}

/**
 * De bestaande bron waarvan deze een dubbele is (dezelfde DOI; anders dezelfde titel en hetzelfde jaar; anders
 * dezelfde citeersleutel), of null.
 */
export function dubbeleVan(bron, bestaande) {
  const doi = kaleDoi(bron?.doi);
  const titelJaar = `${normaliseer(bron?.titel)}|${Number.isInteger(bron?.jaar) ? bron.jaar : ''}`;
  for (const b of bestaande || []) {
    if (doi && kaleDoi(b.doi) === doi) return b;
  }
  if (normaliseer(bron?.titel)) {
    for (const b of bestaande || []) {
      if (`${normaliseer(b.titel)}|${Number.isInteger(b.jaar) ? b.jaar : ''}` === titelJaar) return b;
    }
  }
  if (bron?.citeersleutel) {
    for (const b of bestaande || []) if (b.citeersleutel === bron.citeersleutel) return b;
  }
  return null;
}

// ---------- "Plak een verwijzing": een APA-verwijzing lezen ----------

const MAANDEN_NL = { januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12 };
const MAANDEN_EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/** '5 maart 2024' · 'March 5, 2024' · '2024-03-05' → 'JJJJ-MM-DD' (of 'JJJJ-MM'), anders ''. */
export function leesLosseDatum(tekst, jaar = null) {
  const s = String(tekst ?? '').trim().toLowerCase().replace(/\./g, '');
  const twee = (n) => String(n).padStart(2, '0');
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (m) return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
  m = /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(s);
  if (m && (MAANDEN_NL[m[2]] || MAANDEN_EN[m[2]])) {
    const j = m[3] || jaar;
    return j ? `${j}-${twee(MAANDEN_NL[m[2]] || MAANDEN_EN[m[2]])}-${twee(m[1])}` : '';
  }
  m = /^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(s);
  if (m && (MAANDEN_NL[m[1]] || MAANDEN_EN[m[1]])) {
    const j = m[3] || jaar;
    return j ? `${j}-${twee(MAANDEN_NL[m[1]] || MAANDEN_EN[m[1]])}-${twee(m[2])}` : '';
  }
  m = /^([a-z]+)(?:\s+(\d{4}))?$/.exec(s);
  if (m && (MAANDEN_NL[m[1]] || MAANDEN_EN[m[1]])) {
    const j = m[2] || jaar;
    return j ? `${j}-${twee(MAANDEN_NL[m[1]] || MAANDEN_EN[m[1]])}` : '';
  }
  return '';
}

/** Leest de personen uit "Bakker, A. B., & Demerouti, E." of "Jansen, P., Vries, M. de en Bos, K. L.". */
function leesPersonen(deel) {
  const s = deel
    .replace(/,?\s*(?:…|\.\s?\.\s?\.)\s*/g, ', ')
    .replace(/\s*,?\s*(?:&|\ben\b|\band\b)\s+/g, ', ')
    .replace(/,\s*et al\.?$/i, '');
  const stukken = s.split(/\s*,\s*/).filter(Boolean);
  const uit = [];
  for (let i = 0; i < stukken.length; i++) {
    const naam = stukken[i];
    const volgende = stukken[i + 1] || '';
    const { rest } = splitsAchtervoegsel(volgende);
    if (volgende && isInitialen(rest)) {
      const a = leesAuteur(`${naam}, ${volgende}`);
      if (a && a.achternaam) uit.push(a);
      i++;
    } else {
      const a = leesAuteur(naam);
      if (a && a.achternaam) uit.push(a);
    }
  }
  return uit;
}

/** Splitst "Titel (3e dr.). Rest" in de titel (tot de eerste punt buiten haakjes) en de rest. */
function splitsTitel(t) {
  let diepte = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '(' || c === '[') diepte++;
    else if ((c === ')' || c === ']') && diepte > 0) diepte--;
    else if (diepte === 0 && /[.?!]/.test(c) && (i === t.length - 1 || t[i + 1] === ' ')) {
      return { titel: t.slice(0, c === '.' ? i : i + 1).trim(), rest: t.slice(i + 1).trim() };
    }
  }
  return { titel: t.trim(), rest: '' };
}

const RAPPORTNR = /^(?:rapportnr\.?|rapport\s*nr\.?|rapportnummer|report\s*no\.?|report\s*number|publicatienr\.?)\s*(.+)$/i;
const DRUK = /^(\d+)\s*(?:e|de|ste|nd|rd|th)?\.?\s*(?:dr\.?|druk|ed\.?|edition)$/i;
const SCRIPTIE = /^(proefschrift|doctoral dissertation|dissertation|masterscriptie|master'?s thesis|bachelorscriptie|bachelor'?s thesis|scriptie)(?:\s*,\s*(.+))?$/i;

function soortWerk(t) {
  const s = t.toLowerCase();
  if (s.startsWith('master')) return 'Masterscriptie';
  if (s.startsWith('bachelor')) return 'Bachelorscriptie';
  return 'Proefschrift';
}

const WOORDEN_EN = new Set(['the', 'of', 'and', 'for', 'with', 'a', 'an', 'on', 'to', 'from', 'at', 'by', 'is', 'are', 'how', 'what', 'why', 'work', 'employee', 'employees']);
const WOORDEN_NL = new Set(['de', 'het', 'een', 'van', 'en', 'voor', 'met', 'bij', 'op', 'naar', 'over', 'uit', 'te', 'aan', 'als', 'door', 'werk', 'medewerkers']);

/** Een eenvoudige gok van de taal op grond van de titel: 'en' als er meer Engelse dan Nederlandse woorden in staan. */
export function raadTaal(titel) {
  let en = 0;
  let nl = 0;
  for (const w of normaliseer(titel).split(' ')) {
    if (WOORDEN_EN.has(w)) en++;
    if (WOORDEN_NL.has(w)) nl++;
  }
  return en > nl ? 'en' : 'nl';
}

/** Labels van de velden die je bij een soort bron verwacht (voor "Deze velden zijn niet herkend: …"). */
const VERWACHT = {
  artikel: ['titel', 'auteurs', 'jaar', 'tijdschrift', 'jaargang', 'nummer', 'paginas', 'vindplaats'],
  boek: ['titel', 'auteurs', 'jaar', 'uitgever'],
  hoofdstuk: ['titel', 'auteurs', 'jaar', 'boektitel', 'redacteuren', 'paginas', 'uitgever'],
  rapport: ['titel', 'auteurs', 'jaar', 'vindplaats'],
  website: ['titel', 'jaar', 'vindplaats'],
  wet: ['titel', 'jaar', 'vindplaats'],
  richtlijn: ['titel', 'auteurs', 'jaar', 'vindplaats'],
  cijfers: ['titel', 'auteurs', 'jaar', 'vindplaats'],
  proefschrift: ['titel', 'auteurs', 'jaar', 'instelling'],
  notitie: ['titel'],
  overig: ['titel', 'auteurs', 'jaar'],
};
const VELD_LABELS = {
  soort: 'Soort bron', titel: 'Titel', auteurs: 'Auteurs of organisatie', jaar: 'Jaar', tijdschrift: 'Tijdschrift', jaargang: 'Jaargang',
  nummer: 'Nummer', paginas: "Pagina's", vindplaats: 'DOI of link', uitgever: 'Uitgever', boektitel: 'Titel van het boek',
  redacteuren: 'Redacteuren', instelling: 'Universiteit of hogeschool',
};

/**
 * "Plak een verwijzing": leest een APA-verwijzing (bijvoorbeeld uit Google Scholar, knop "Citeer", APA) en vult
 * zoveel mogelijk velden. → { bron, zeker: [veld], meldingen: [tekst], ontbreekt: [label] }.
 * zeker: de velden die herkend zijn; ontbreekt: de labels van velden die je bij deze soort verwacht maar niet
 * gevonden zijn. Alle velden blijven aanpasbaar; dit is een hulp bij het invullen, geen controle.
 */
export function leesApaVerwijzing(tekst) {
  const bron = { ...legeBron('overig'), taal: '' };
  const zeker = new Set();
  const meldingen = [];
  const details = {};
  let t = String(tekst ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'")
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:\[\d+\]|\d+\.|[-•–])\s+/, '');
  if (!t) return { bron: { ...bron, taal: 'nl' }, zeker: [], meldingen: ['Plak eerst een verwijzing.'], ontbreekt: [] };

  const haalWeg = (m) => {
    t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  };
  // DOI (ook als link)
  let m = /(?:https?:\/\/(?:dx\.)?doi\.org\/|\bdoi:\s*)(10\.\d{4,9}\/\S+)/i.exec(t) || /(?:^|\s)(10\.\d{4,9}\/\S+)\s*$/.exec(t);
  if (m) {
    bron.doi = m[1].replace(/[.,;)\]]+$/, '');
    zeker.add('doi');
    haalWeg(m);
  }
  // "Geraadpleegd op 20 november 2026, van https://…" of "Retrieved March 5, 2024, from https://…"
  m = /(?:Geraadpleegd|Opgehaald|Bezocht|Retrieved)(?:\s+(?:op|on))?\s+(.+?),?\s+(?:van|via|from)\s+(https?:\/\/\S+)/i.exec(t);
  if (m) {
    const g = leesLosseDatum(m[1]);
    if (g) details.geraadpleegd = g;
    bron.url = m[2].replace(/[.,;)\]]+$/, '');
    zeker.add('url');
    haalWeg(m);
  }
  if (!bron.url) {
    const links = [...t.matchAll(/https?:\/\/[^\s<>"]+/gi)];
    if (links.length) {
      const l = links[links.length - 1];
      bron.url = l[0].replace(/[.,;)\]]+$/, '');
      zeker.add('url');
      haalWeg(l);
    }
  }
  t = t.replace(/[\s.]+$/, '');

  // Datum tussen haakjes: (2017) · (2024a) · (2024, 5 maart) · (z.d.) · (n.d.)
  let auteursDeel = '';
  let rest = t;
  let dagMaandTekst = '';
  m = /\(\s*(\d{4})[a-z]?\s*(?:,\s*([^)]{1,40}))?\)\.?/.exec(t);
  const zd = /\(\s*(?:z\.\s?d\.|n\.\s?d\.|s\.\s?d\.)(?:-[a-z])?\s*\)\.?/i.exec(t);
  const datum = m && (!zd || m.index < zd.index) ? m : zd;
  if (datum) {
    auteursDeel = t.slice(0, datum.index).trim();
    rest = t.slice(datum.index + datum[0].length).trim();
    if (datum === m) {
      bron.jaar = Number(m[1]);
      dagMaandTekst = m[2] || '';
    }
    zeker.add('jaar');
  } else {
    const j = /\b(1[89]\d\d|2[01]\d\d)\b/.exec(t);
    if (j) {
      bron.jaar = Number(j[1]);
      meldingen.push('Er staat geen jaartal tussen haakjes; controleer het jaar en de auteurs.');
    }
  }

  // Auteurs: personen ("Achternaam, V.") of een organisatie. Een slotpunt na een organisatie hoort er niet bij.
  if (auteursDeel && !/(?:^|[\s.-])[A-ZÀ-Ý]\.$/.test(auteursDeel)) auteursDeel = auteursDeel.replace(/\.$/, '').trim();
  const zijnPersonen = /,\s*[A-ZÀ-Ý](?:[a-z]{1,2})?\./.test(auteursDeel);
  if (zijnPersonen) {
    bron.auteurs = leesPersonen(auteursDeel);
    if (bron.auteurs.length) zeker.add('auteurs');
    if (/et al\./i.test(auteursDeel)) meldingen.push('De verwijzing noemt niet alle auteurs ("et al."); vul de andere auteurs aan als je ze weet.');
  }

  // Hoofdstuk: "Titel. In B. Kok & C. van den Berg (Red.), Boektitel (pp. 45–67). Uitgever"
  const hoofdstuk = /^(.+?[.?!])\s+In\s+(?:(.+?)\s*\((?:Red|Reds|Ed|Eds|Hrsg)\.\),\s*)?(.+?)(?:\s*\((?:pp?\.|blz\.)\s*([^)]+)\))?(?:\.\s+(.*)|\.?)$/i.exec(rest);
  if (hoofdstuk && (hoofdstuk[2] || hoofdstuk[4])) {
    bron.soort = 'hoofdstuk';
    zeker.add('soort');
    bron.titel = hoofdstuk[1].replace(/\.$/, '').trim();
    if (hoofdstuk[2]) {
      details.redacteuren = hoofdstuk[2].split(/\s*,?\s*(?:&|\ben\b|\band\b)\s*|\s*,\s*/).map(leesAuteur).filter((a) => a && a.achternaam);
      if (details.redacteuren.length) zeker.add('redacteuren');
    }
    details.boektitel = hoofdstuk[3].trim();
    zeker.add('boektitel');
    if (hoofdstuk[4]) {
      details.paginas = paginaStreep(hoofdstuk[4]);
      zeker.add('paginas');
    }
    if (hoofdstuk[5]) {
      details.uitgever = hoofdstuk[5].replace(/\.$/, '').trim();
      zeker.add('uitgever');
    }
  } else {
    const { titel: titelStuk, rest: na } = splitsTitel(rest);
    let titel = titelStuk;
    const info = [];
    for (;;) {
      const haak = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(titel);
      if (!haak || haak.index === 0) break;
      info.unshift(haak[1].trim());
      titel = titel.slice(0, haak.index).trim();
    }
    const naTitel = na.replace(/\.$/, '').trim();
    let soort = null;
    for (const i of info) {
      let x = RAPPORTNR.exec(i);
      if (x) {
        details.rapportnummer = x[1].trim();
        soort = 'rapport';
        zeker.add('rapportnummer');
        continue;
      }
      x = DRUK.exec(i);
      if (x) {
        details.druk = x[1];
        soort = soort || 'boek';
        continue;
      }
      x = SCRIPTIE.exec(i);
      if (x) {
        soort = 'proefschrift';
        details.soort_werk = soortWerk(x[1]);
        if (x[2]) {
          details.instelling = x[2].trim();
          zeker.add('instelling');
        }
        continue;
      }
      if (/^(?:dataset|data set|data)$/i.test(i)) {
        soort = 'cijfers';
        continue;
      }
      titel = `${titel} (${i})`; // onbekend: hoort bij de titel
    }
    // Tijdschrift: "Naam, 22(3), 273–285" · "Naam, 22, Artikel e123" · "Naam, 22(3)"
    const tijdschrift = /^(.+?),\s*(\d+[A-Za-z]?)\s*(?:\(([^)]+)\))?\s*(?:,\s*(?:(?:Artikel|Article|Art\.)\s+)?([A-Za-z]?\d+[A-Za-z]?(?:\s*[-–—]\s*[A-Za-z]?\d+)?))?$/.exec(naTitel);
    if (!soort && tijdschrift) {
      soort = 'artikel';
      details.tijdschrift = tijdschrift[1].trim();
      details.jaargang = tijdschrift[2];
      zeker.add('tijdschrift');
      zeker.add('jaargang');
      if (tijdschrift[3]) {
        details.nummer = tijdschrift[3].trim();
        zeker.add('nummer');
      }
      if (tijdschrift[4]) {
        if (/(?:Artikel|Article|Art\.)\s+\S+$/i.test(naTitel) || /^[A-Za-z]\d/.test(tijdschrift[4])) details.artikelnummer = tijdschrift[4];
        else details.paginas = paginaStreep(tijdschrift[4]);
        zeker.add('paginas');
      }
    }
    if (titel) {
      bron.titel = titel;
      zeker.add('titel');
    }
    if (soort) zeker.add('soort');
    // Zonder personen: een organisatie als auteur, of (als er na de datum geen titel staat) de titel zelf vooraan.
    if (!zijnPersonen && auteursDeel) {
      if (!bron.titel) {
        bron.titel = auteursDeel;
        zeker.add('titel');
      } else {
        bron.organisatie = auteursDeel;
        zeker.add('auteurs');
      }
    }
    const isWet = /wetten\.overheid\.nl|eur-lex\.europa\.eu|officielebekendmakingen\.nl/i.test(bron.url) || (!bron.auteurs.length && !bron.organisatie && /wet(?:boek)?$/i.test(bron.titel));
    if (!soort) {
      if (isWet) soort = 'wet';
      else if (dagMaandTekst && bron.url) soort = 'website';
      else if (bron.auteurs.length && naTitel && !bron.url && !bron.doi) soort = 'boek';
      else if (bron.url || bron.organisatie) soort = 'rapport';
      else soort = 'overig';
      meldingen.push('De soort bron is geraden; controleer hem.');
    }
    if (soort !== 'artikel' && naTitel) {
      if (soort === 'website') details.sitenaam = naTitel;
      else if (soort === 'rapport' && bron.auteurs.length && !bron.organisatie) bron.organisatie = naTitel;
      else if (soort === 'wet') { /* geen uitgever */ } else details.uitgever = naTitel;
      zeker.add('uitgever');
    }
    if (dagMaandTekst && MET_DATUM.has(soort)) {
      const d = leesLosseDatum(dagMaandTekst, bron.jaar);
      if (d) details.datum = d;
    }
    bron.soort = soort;
  }
  bron.details = details;
  bron.taal = raadTaal(bron.titel);
  if (bron.doi && bron.url && /doi\.org/i.test(bron.url)) bron.url = '';
  if (bron.doi || bron.url) zeker.add('vindplaats');

  const gevuld = (veld) => {
    if (veld === 'auteurs') return bron.auteurs.length > 0 || !!bron.organisatie;
    if (veld === 'vindplaats') return !!(bron.doi || bron.url);
    if (veld === 'titel') return !!bron.titel;
    if (veld === 'jaar') return Number.isInteger(bron.jaar);
    if (veld === 'redacteuren') return Array.isArray(details.redacteuren) && details.redacteuren.length > 0;
    return !!details[veld];
  };
  const ontbreekt = (VERWACHT[bron.soort] || []).filter((v) => !gevuld(v)).map((v) => VELD_LABELS[v]);
  return { bron, zeker: [...zeker], meldingen, ontbreekt };
}

// ---------- Startcollectie: een record van het onderzoeksteam omzetten ----------

const SOORT_ALIASSEN = {
  artikel: 'artikel', 'wetenschappelijk artikel': 'artikel', 'journal article': 'artikel', article: 'artikel', tijdschriftartikel: 'artikel',
  'peer-reviewed artikel': 'artikel', 'review': 'artikel', 'systematic review': 'artikel', 'meta-analyse': 'artikel', 'meta-analysis': 'artikel',
  rapport: 'rapport', 'rapport of onderzoek': 'rapport', report: 'rapport', onderzoeksrapport: 'rapport', 'technical report': 'rapport',
  onderzoek: 'rapport', factsheet: 'rapport', monitor: 'rapport', publicatie: 'rapport',
  boek: 'boek', book: 'boek', handboek: 'boek',
  hoofdstuk: 'hoofdstuk', 'hoofdstuk in een boek': 'hoofdstuk', 'book chapter': 'hoofdstuk', chapter: 'hoofdstuk',
  website: 'website', webpagina: 'website', webpage: 'website', 'web page': 'website', web: 'website', blog: 'website',
  wet: 'wet', 'wet of regelgeving': 'wet', wetgeving: 'wet', regelgeving: 'wet', law: 'wet', legislation: 'wet', besluit: 'wet',
  richtlijn: 'richtlijn', 'richtlijn, norm of handreiking': 'richtlijn', guideline: 'richtlijn', norm: 'richtlijn', handreiking: 'richtlijn', standaard: 'richtlijn',
  cijfers: 'cijfers', 'cijfers of dataset': 'cijfers', 'cijfers of dataset (bijv. cbs statline)': 'cijfers', dataset: 'cijfers', statistiek: 'cijfers', data: 'cijfers', statline: 'cijfers',
  proefschrift: 'proefschrift', 'proefschrift of scriptie': 'proefschrift', dissertation: 'proefschrift', thesis: 'proefschrift', scriptie: 'proefschrift',
  notitie: 'notitie', 'eigen notitie': 'notitie',
  overig: 'overig', other: 'overig', anders: 'overig',
};
const TAAL_ALIASSEN = {
  nl: 'nl', dut: 'nl', nld: 'nl', dutch: 'nl', nederlands: 'nl', 'nl-nl': 'nl',
  en: 'en', eng: 'en', english: 'en', engels: 'en', 'en-gb': 'en', 'en-us': 'en',
  de: 'de', ger: 'de', deu: 'de', german: 'de', duits: 'de',
  fr: 'fr', fre: 'fr', fra: 'fr', french: 'fr', frans: 'fr',
};
const BETROUWBAARHEID_ALIASSEN = {
  hoog: 'hoog', high: 'hoog', sterk: 'hoog',
  redelijk: 'redelijk', middel: 'redelijk', medium: 'redelijk', gemiddeld: 'redelijk', matig: 'redelijk', moderate: 'redelijk',
  beperkt: 'beperkt', laag: 'beperkt', low: 'beperkt', zwak: 'beperkt',
  onbekend: 'onbekend', unknown: 'onbekend',
};
const DETAIL_SLEUTELS = ['tijdschrift', 'jaargang', 'nummer', 'paginas', 'artikelnummer', 'uitgever', 'druk', 'boektitel', 'redacteuren',
  'rapportnummer', 'sitenaam', 'datum', 'geraadpleegd', 'instelling', 'soort_werk', 'gecontroleerd_op', 'gecontroleerd_door'];

/** Soort uit een sleutel of label (Nederlands of Engels), of null. */
export function soortUitTekst(t) {
  const s = String(t ?? '').trim().toLowerCase();
  if (Object.hasOwn(BRONSOORTEN, s)) return s;
  return SOORT_ALIASSEN[s] || null;
}

/** Taal uit een sleutel of naam, of null. */
export function taalUitTekst(t) {
  const s = String(t ?? '').trim().toLowerCase();
  if (Object.hasOwn(TALEN, s)) return s;
  return TAAL_ALIASSEN[s] || (s ? 'anders' : null);
}

/** Onderwerp-sleutel uit een sleutel, naam of sjabloon-id, of null. */
export function onderwerpUitTekst(t) {
  const s = String(t ?? '').trim();
  if (Object.hasOwn(ONDERWERPEN, s)) return s;
  const n = normaliseer(s);
  for (const [k, o] of Object.entries(ONDERWERPEN)) {
    if (normaliseer(o.naam) === n || normaliseer(k) === n || o.sjablonen.includes(s)) return k;
  }
  return null;
}

const kort = (t, max) => (t.length > max ? t.slice(0, max) : t);

/**
 * Zet één record van het onderzoeksteam (data/startcollectie.json, BOUWPLAN §3.9) om in de vorm van een bron.
 * → { bron, meldingen, fouten }. fouten (hard: geen titel, geen URL en geen DOI, onbekende soort, geen bekend
 * onderwerp) los je op door het onderzoeksteam te vragen, nooit door iets in te vullen. meldingen zijn zachte
 * waarschuwingen: onbekende onderwerpen naar de trefwoorden, http in plaats van https, ingekorte velden.
 * De echte controle (lengtes, DOI, URL) doet controleerBron in src/lib/bibliotheek.js.
 */
export function normaliseerStartbron(record) {
  const meldingen = [];
  const fouten = [];
  const r = record && typeof record === 'object' ? record : {};
  const tekst = (w) => (w === undefined || w === null ? '' : String(w).replace(/\s+/g, ' ').trim());
  const bron = legeBron('overig');

  bron.titel = tekst(r.titel);
  if (!bron.titel) fouten.push('Geen titel.');

  const soort = soortUitTekst(r.soort);
  if (!soort) fouten.push(`Onbekende soort bron: "${tekst(r.soort)}".`);
  else bron.soort = soort;

  // Auteurs: teksten ("Bakker, A. B.") of objecten in onze vorm. Een organisatie als auteur gaat naar organisatie.
  bron.organisatie = tekst(r.organisatie);
  bron.afkorting = tekst(r.afkorting);
  const auteurs = Array.isArray(r.auteurs) ? r.auteurs : typeof r.auteurs === 'string' ? r.auteurs.split(';') : [];
  for (const a of auteurs) {
    const gelezen = typeof a === 'string' ? leesAuteur(a) : a && typeof a === 'object' && a.achternaam
      ? { achternaam: tekst(a.achternaam), tussenvoegsel: tekst(a.tussenvoegsel).toLowerCase(), voorletters: voorletters(a.voorletters) }
      : null;
    if (!gelezen) continue;
    if (gelezen.organisatie) {
      if (!bron.organisatie) bron.organisatie = gelezen.organisatie;
      else if (normaliseer(gelezen.organisatie) !== normaliseer(bron.organisatie)) meldingen.push(`Auteur "${gelezen.organisatie}" lijkt een organisatie; niet overgenomen.`);
    } else bron.auteurs.push(gelezen);
  }

  if (r.jaar !== undefined && r.jaar !== null && r.jaar !== '') {
    const j = Number(String(r.jaar).trim());
    if (Number.isInteger(j)) bron.jaar = j;
    else if (!/^(?:z\.?\s?d\.?|n\.?\s?d\.?)$/i.test(String(r.jaar).trim())) meldingen.push(`Jaar "${tekst(r.jaar)}" is geen jaartal; zonder datum (z.d.).`);
  }

  const taal = taalUitTekst(r.taal);
  if (taal) bron.taal = taal;
  else {
    bron.taal = raadTaal(bron.titel);
    meldingen.push(`Geen taal opgegeven; geraden: ${TALEN[bron.taal]}.`);
  }

  bron.url = tekst(r.url);
  bron.doi = tekst(r.doi).replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
  if (!bron.url && !bron.doi) fouten.push('Geen URL en geen DOI.');
  if (/^http:\/\//i.test(bron.url)) meldingen.push('De link begint met http:// in plaats van https://.');

  // Onderwerpen: sleutels, namen of sjabloon-ids; onbekende gaan naar de trefwoorden (K S6).
  const trefwoorden = (Array.isArray(r.trefwoorden) ? r.trefwoorden : []).map(tekst).filter(Boolean);
  for (const o of Array.isArray(r.onderwerpen) ? r.onderwerpen : (r.onderwerpen ? [r.onderwerpen] : [])) {
    const k = onderwerpUitTekst(o);
    if (k) {
      if (!bron.onderwerpen.includes(k)) bron.onderwerpen.push(k);
    } else if (tekst(o)) {
      meldingen.push(`Onbekend onderwerp "${tekst(o)}" is als trefwoord overgenomen.`);
      if (!trefwoorden.some((w) => normaliseer(w) === normaliseer(o))) trefwoorden.push(tekst(o));
    }
  }
  if (!bron.onderwerpen.length) fouten.push('Geen onderwerp uit de vaste lijst.');
  if (bron.onderwerpen.length > LIMIETEN.onderwerpen) bron.onderwerpen = bron.onderwerpen.slice(0, LIMIETEN.onderwerpen);
  if (trefwoorden.length > LIMIETEN.trefwoorden) meldingen.push(`Meer dan ${LIMIETEN.trefwoorden} trefwoorden; de rest is weggelaten.`);
  bron.trefwoorden = trefwoorden.slice(0, LIMIETEN.trefwoorden).map((w) => {
    if (w.length > LIMIETEN.trefwoord) meldingen.push(`Trefwoord "${w.slice(0, 30)}…" is ingekort.`);
    return kort(w, LIMIETEN.trefwoord);
  });

  bron.samenvatting = String(r.samenvatting ?? '').trim();
  if (bron.samenvatting.length > LIMIETEN.samenvatting) {
    meldingen.push(`De samenvatting is ingekort tot ${LIMIETEN.samenvatting} tekens.`);
    bron.samenvatting = bron.samenvatting.slice(0, LIMIETEN.samenvatting);
  }
  const kernpunten = (Array.isArray(r.kernpunten) ? r.kernpunten : (r.kernpunten ? [r.kernpunten] : [])).map(tekst).filter(Boolean);
  if (kernpunten.length > LIMIETEN.kernpunten) meldingen.push(`Meer dan ${LIMIETEN.kernpunten} kernpunten; de rest is weggelaten.`);
  bron.kernpunten = kernpunten.slice(0, LIMIETEN.kernpunten).map((k) => {
    if (k.length > LIMIETEN.kernpunt) meldingen.push('Een kernpunt is ingekort.');
    return kort(k, LIMIETEN.kernpunt);
  });

  // Betrouwbaarheid: een sleutel, een object { niveau, toelichting } of een tekst ("Hoog: peer-reviewed").
  const b = r.betrouwbaarheid;
  if (b && typeof b === 'object') {
    bron.betrouwbaarheid = BETROUWBAARHEID_ALIASSEN[tekst(b.niveau).toLowerCase()] || 'onbekend';
    bron.betrouwbaarheid_toelichting = tekst(b.toelichting);
  } else if (typeof b === 'string' && b.trim()) {
    const s = b.trim();
    const eerste = s.split(/[\s:;,.–-]+/)[0].toLowerCase();
    if (BETROUWBAARHEID_ALIASSEN[s.toLowerCase()]) bron.betrouwbaarheid = BETROUWBAARHEID_ALIASSEN[s.toLowerCase()];
    else if (BETROUWBAARHEID_ALIASSEN[eerste]) {
      bron.betrouwbaarheid = BETROUWBAARHEID_ALIASSEN[eerste];
      bron.betrouwbaarheid_toelichting = s.slice(eerste.length).replace(/^[\s:;,.–-]+/, '').trim();
    } else bron.betrouwbaarheid_toelichting = s;
  }
  if (r.betrouwbaarheid_toelichting) bron.betrouwbaarheid_toelichting = tekst(r.betrouwbaarheid_toelichting);
  if (bron.betrouwbaarheid_toelichting.length > LIMIETEN.betrouwbaarheid_toelichting) {
    meldingen.push('De toelichting op de betrouwbaarheid is ingekort.');
    bron.betrouwbaarheid_toelichting = bron.betrouwbaarheid_toelichting.slice(0, LIMIETEN.betrouwbaarheid_toelichting);
  }

  // Details: velden bovenin het record of in r.details; alleen de velden die bij de soort horen.
  const ruw = { ...(r.details && typeof r.details === 'object' ? r.details : {}) };
  for (const k of DETAIL_SLEUTELS) if (r[k] !== undefined && r[k] !== null && r[k] !== '') ruw[k] = r[k];
  if (r.controle && !ruw.gecontroleerd_door) ruw.gecontroleerd_door = r.controle;
  const toegestaan = new Set(detailveldenVan(bron.soort).map((v) => v.sleutel));
  for (const [k, w] of Object.entries(ruw)) {
    if (!toegestaan.has(k)) {
      if (w !== '' && w !== null && w !== undefined) meldingen.push(`Veld "${k}" hoort niet bij de soort "${bron.soort}" en is weggelaten.`);
      continue;
    }
    if (k === 'redacteuren') {
      const lijst = (Array.isArray(w) ? w : [w]).map((x) => (typeof x === 'string' ? leesAuteur(x) : x)).filter((x) => x && x.achternaam);
      if (lijst.length) bron.details.redacteuren = lijst.slice(0, LIMIETEN.redacteuren);
    } else {
      const v = tekst(w);
      if (!v) continue;
      if (v.length > LIMIETEN.detail) meldingen.push(`Veld "${k}" is ingekort.`);
      bron.details[k] = kort(v, LIMIETEN.detail);
    }
  }
  if (bron.details.paginas) bron.details.paginas = paginaStreep(bron.details.paginas);
  return { bron, meldingen, fouten };
}

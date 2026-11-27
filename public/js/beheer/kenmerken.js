// Achtergrondkenmerken van respondenten (afdeling, leeftijd, diensttijd, …).
// Zuivere module (geen DOM, geen fetch): de Worker (GET /instellingen) en de schermen gebruiken dezelfde lijsten.
//
// Een vraag kan een kenmerk krijgen (kolom vragen.kenmerk; '' = geen). Dat mag alleen bij een ja/nee-vraag of
// een meerkeuzevraag met één antwoord, en per vragenlijst hooguit één vraag per kenmerk (behalve 'overig').
// Groepen met minder dan 5 respondenten worden nooit getoond (privacy.js).
//
// Naast de vaste lijsten staan hier drie hulpfuncties (BOUWPLAN §3.3):
// - kenmerkVoorTekst: herkent een bekende achtergrondvraag aan de tekst (sjablonen, inlezen);
// - klasseVan: de klassegrenzen van een antwoordmogelijkheid zoals "35 tot 55 jaar" (eerst opzoeken, dan een patroon);
// - isLieverNiet: is dit het antwoord "Dat zeg ik liever niet"?

/**
 * De kenmerken. rol = de bijbehorende kolom in een personeelsbestand (null: geen);
 * geordend = de groepen hebben een vaste volgorde (van laag naar hoog);
 * klassen = soort klassegrenzen ('jaar', 'duur' of 'uur'); meerdere = mag vaker per vragenlijst voorkomen.
 */
export const KENMERKEN = {
  afdeling: { naam: 'Afdeling', rol: 'afdeling', geordend: false },
  leeftijd: { naam: 'Leeftijd', rol: 'leeftijd', geordend: true, klassen: 'jaar' },
  geslacht: { naam: 'Geslacht', rol: 'geslacht', geordend: false },
  diensttijd: { naam: 'Diensttijd', rol: 'datum_in', geordend: true, klassen: 'duur' },
  contract: { naam: 'Soort dienstverband', rol: 'contract', geordend: false },
  uren: { naam: 'Arbeidsuren', rol: 'uren', geordend: true, klassen: 'uur' },
  functieniveau: { naam: 'Functieniveau', rol: 'functieniveau', geordend: true },
  leidinggevend: { naam: 'Geeft leiding', rol: 'leidinggevend', geordend: false },
  locatie: { naam: 'Locatie', rol: 'locatie', geordend: false },
  opleiding: { naam: 'Opleidingsniveau', rol: 'opleiding', geordend: true },
  overig: { naam: 'Ander kenmerk', rol: null, geordend: false, meerdere: true },
};

/** Antwoord voor wie een achtergrondvraag liever niet beantwoordt (dezelfde zin als in de sjablonen). */
export const LIEVER_NIET = 'Dat zeg ik liever niet';

/** Thema waarin achtergrondvragen komen. */
export const KENMERK_THEMA = 'Achtergrond';

/** Toelichting bij een achtergrondvraag op de vragenlijst. */
export const KENMERK_TOELICHTING = 'Deze vraag gebruiken we alleen om groepen te vergelijken. Groepen met minder dan 5 personen tonen we nooit.';

// Een antwoordmogelijkheid: { label, van?, tot?, eenheid? }.
// Klassegrenzen lopen van 'van' (inbegrepen) tot 'tot' (niet inbegrepen); null = geen grens.
const klasse = (label, van, tot, eenheid) => ({ label, van, tot, eenheid });
const optie = (label) => ({ label });
const LEEFTIJD_GROF = [
  klasse('Jonger dan 35 jaar', null, 35, 'jaar'),
  klasse('35 tot 55 jaar', 35, 55, 'jaar'),
  klasse('55 jaar of ouder', 55, null, 'jaar'),
  optie(LIEVER_NIET),
];
const LEEFTIJD_FIJN = [
  klasse('Jonger dan 25 jaar', null, 25, 'jaar'),
  klasse('25 tot 35 jaar', 25, 35, 'jaar'),
  klasse('35 tot 45 jaar', 35, 45, 'jaar'),
  klasse('45 tot 55 jaar', 45, 55, 'jaar'),
  klasse('55 jaar of ouder', 55, null, 'jaar'),
  optie(LIEVER_NIET),
];

/**
 * Standaard achtergrondvragen (bibliotheek voor "Achtergrondvragen toevoegen").
 * Elke vraag: { type, tekst, opties } (meerkeuze met één antwoord, tenzij type 'janee'). {bedrijf} wordt
 * bij het toevoegen vervangen door de naam van de organisatie. Bij leeftijd zijn er twee varianten:
 * 'grof' (3 groepen, aangeraden bij minder dan 100 medewerkers; dit zijn ook de opties) en 'fijn' (5 groepen).
 */
export const KENMERKVRAGEN = {
  afdeling: {
    type: 'meerkeuze',
    tekst: 'Op welke afdeling werk je?',
    opties: [optie('Afdeling A'), optie('Afdeling B'), optie('Afdeling C')],
  },
  leeftijd: {
    type: 'meerkeuze',
    tekst: 'Wat is je leeftijd?',
    opties: LEEFTIJD_GROF,
    standaard: 'grof',
    varianten: { grof: LEEFTIJD_GROF, fijn: LEEFTIJD_FIJN },
  },
  geslacht: {
    type: 'meerkeuze',
    tekst: 'Wat is je geslacht?',
    opties: [optie('Man'), optie('Vrouw'), optie('Anders'), optie(LIEVER_NIET)],
  },
  diensttijd: {
    type: 'meerkeuze',
    tekst: 'Hoe lang werk je al bij {bedrijf}?',
    opties: [
      klasse('Korter dan 1 jaar', null, 1, 'jaar'),
      klasse('1 tot 5 jaar', 1, 5, 'jaar'),
      klasse('5 tot 10 jaar', 5, 10, 'jaar'),
      klasse('10 jaar of langer', 10, null, 'jaar'),
    ],
  },
  contract: {
    type: 'meerkeuze',
    tekst: 'Wat voor dienstverband heb je?',
    opties: [optie('Vast contract'), optie('Tijdelijk contract'), optie('Uitzendkracht, gedetacheerd of zzp')],
  },
  uren: {
    type: 'meerkeuze',
    tekst: 'Hoeveel uur per week werk je volgens je contract?',
    opties: [
      klasse('Minder dan 20 uur', null, 20, 'uur'),
      klasse('20 tot 35 uur', 20, 35, 'uur'),
      klasse('35 uur of meer', 35, null, 'uur'),
    ],
  },
  functieniveau: {
    type: 'meerkeuze',
    tekst: 'Welke omschrijving past het best bij je functie?',
    opties: [optie('Uitvoerend'), optie('Ondersteunend'), optie('Specialist of adviseur'), optie('Leidinggevende of manager')],
  },
  leidinggevend: {
    type: 'janee',
    tekst: 'Geef je zelf leiding aan een of meer medewerkers?',
    opties: [],
  },
  locatie: {
    type: 'meerkeuze',
    tekst: 'Op welke locatie werk je meestal?',
    opties: [optie('Locatie A'), optie('Locatie B'), optie('Locatie C')],
  },
  opleiding: {
    type: 'meerkeuze',
    tekst: 'Wat is je hoogst afgeronde opleiding?',
    opties: [optie('Basisonderwijs, vmbo of mbo 1'), optie('Havo, vwo of mbo 2 tot 4'), optie('Hbo of wo')],
  },
};

/**
 * Vaste klassegrenzen van bekende antwoordmogelijkheden (BOUWPLAN B12): eerst exact opzoeken op het label,
 * pas daarna een patroon proberen. Bevat de opties van KENMERKVRAGEN en die uit de standaardsjablonen
 * (bijv. de diensttijd in maanden bij onboarding).
 */
export const KLASSEGRENZEN = Object.freeze(Object.fromEntries([
  ...LEEFTIJD_FIJN,
  ...LEEFTIJD_GROF,
  ...KENMERKVRAGEN.diensttijd.opties,
  ...KENMERKVRAGEN.uren.opties,
  klasse('Korter dan 3 maanden', null, 3, 'maand'),
  klasse('3 tot 6 maanden', 3, 6, 'maand'),
  klasse('6 tot 12 maanden', 6, 12, 'maand'),
  klasse('Een jaar of langer', 12, null, 'maand'),
].filter((o) => o.eenheid).map((o) => [o.label, { van: o.van, tot: o.tot, eenheid: o.eenheid }])));

// ---------- Hulpfuncties ----------

/** Tekst zonder accenten en leestekens, in kleine letters (zoals normaal() bij het inlezen). */
function normaal(tekst) {
  return String(tekst ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Als normaal(), maar een komma of punt tussen twee cijfers blijft een decimaalteken: "1,5 jaar" → "1.5 jaar".
 * Een punt voor precies drie cijfers scheidt duizendtallen: "1.000 uur" → "1000 uur".
 */
function normaalMetDecimalen(tekst) {
  return String(tekst ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2').replace(/(\d)[.,](?=\d)/g, '$1~').replace(/[^a-z0-9~]+/g, ' ').trim().replace(/~/g, '.');
}

// Bekende teksten van achtergrondvragen (genormaliseerd). {bedrijf} mag elke naam zijn. Bij de diensttijd (derde
// waarde true) moet na "bij" een organisatie staan, geen afdeling, team of "voorkeur" ("Hoe lang werk je bij voorkeur
// thuis?" is geen diensttijd), en moeten de antwoordmogelijkheden, als die bekend zijn, op duurklassen lijken.
const TEKST_PATRONEN = [
  ['afdeling', /^op welke afdeling (werk|werkte) je$/],
  ['diensttijd', /^hoe lang werk je (?:al )?bij (.+)$/, true],
  ['diensttijd', /^hoe lang heb je bij (.+) gewerkt$/, true],
  ['leidinggevend', /^geef je zelf leiding aan een of meer medewerkers$/],
];
const GEEN_ORGANISATIE = /\b(?:voorkeur|afdeling|team|functie|leidinggevende|manager|locatie|vestiging|project|thuis)\b/;

/** Lijken de antwoordmogelijkheden (teksten of { label }) op duurklassen? Minstens twee in jaren of maanden. */
function lijktOpDuur(opties) {
  const labels = opties.map((o) => (typeof o === 'string' ? o : o?.label));
  return labels.filter((l) => ['jaar', 'maand'].includes(klasseVan(l)?.eenheid)).length >= 2;
}
const TEKST_EXACT = new Map(Object.entries(KENMERKVRAGEN)
  .filter(([, v]) => !v.tekst.includes('{bedrijf}'))
  .map(([sleutel, v]) => [normaal(v.tekst), sleutel]));

/**
 * Het kenmerk van een bekende achtergrondvraag, herkend aan de tekst: de vragen uit "Achtergrondvragen toevoegen"
 * en de achtergrondvragen uit de standaardsjablonen (dezelfde teksten als migratie 0011). Anders ''.
 * opties (optioneel): de antwoordmogelijkheden (teksten of { label }). Geef ze mee als ze bekend zijn: een vraag
 * "Hoe lang werk je al bij …?" is alleen diensttijd als de mogelijkheden op duurklassen lijken.
 * Of de vraag het kenmerk mag hebben (soort vraag, één per vragenlijst), controleert de aanroeper.
 */
export function kenmerkVoorTekst(tekst, opties = null) {
  const t = normaal(tekst);
  if (!t) return '';
  if (TEKST_EXACT.has(t)) return TEKST_EXACT.get(t);
  for (const [sleutel, patroon, duur] of TEKST_PATRONEN) {
    const m = patroon.exec(t);
    if (!m) continue;
    if (duur && (GEEN_ORGANISATIE.test(m[1]) || (Array.isArray(opties) && !lijktOpDuur(opties)))) return '';
    return sleutel;
  }
  return '';
}

/** Mag deze vraag een kenmerk hebben? Alleen een ja/nee-vraag of een meerkeuzevraag met één antwoord. */
export function magKenmerk(q) {
  return !!q && (q.type === 'janee' || (q.type === 'meerkeuze' && !q.meerdere_antwoorden && !q.meerdere));
}

const KLASSEN_NORMAAL = new Map(Object.entries(KLASSEGRENZEN).map(([label, k]) => [normaal(label), k]));
const EENHEID = { jaar: 'jaar', jaren: 'jaar', maand: 'maand', maanden: 'maand', uur: 'uur', uren: 'uur' };
const GETAL = '(\\d+(?:\\.\\d+)?|een)';
const EENHEDEN = '(jaar|jaren|maand|maanden|uur|uren)';
const getal = (t) => (t === 'een' ? 1 : Number(t));
/** Bovengrens inbegrepen ("t/m 34"): bij hele getallen is de grens 35 (niet inbegrepen); anders geen klasse. */
const totNa = (t) => (Number.isInteger(getal(t)) ? getal(t) + 1 : NaN);
const KLASSE_PATRONEN = [
  // Jonger dan 35 jaar, Korter dan 3 maanden, Minder dan 20 uur → tot X
  [new RegExp(`^(?:jonger|korter|minder) dan ${GETAL} ${EENHEDEN}$`), (m) => ({ van: null, tot: getal(m[1]), eenheid: EENHEID[m[2]] })],
  // 35 tot 55 jaar, 1 tot 5 jaar, 20 tot 35 uur → van X tot Y (Y niet inbegrepen, zoals "55 jaar of ouder" bij 55 begint)
  [new RegExp(`^${GETAL} tot ${GETAL} ${EENHEDEN}$`), (m) => ({ van: getal(m[1]), tot: getal(m[2]), eenheid: EENHEID[m[3]] })],
  // 25 tot en met 34 jaar, 25 t/m 34 jaar → van 25 tot 35 (34 is inbegrepen)
  [new RegExp(`^${GETAL} (?:tot en met|t m) ${GETAL} ${EENHEDEN}$`), (m) => ({ van: getal(m[1]), tot: totNa(m[2]), eenheid: EENHEID[m[3]] })],
  // Met een streepje ("18-24 jaar", "25-35 jaar") is niet te zeggen of de bovengrens erbij hoort: geen klasse.
  // Een jaar of langer = 12 maanden of langer
  [/^een jaar of langer$/, () => ({ van: 12, tot: null, eenheid: 'maand' })],
  // 55 jaar of ouder, 10 jaar of langer, 35 uur of meer → vanaf X
  [new RegExp(`^${GETAL} ${EENHEDEN} (?:of|en) (?:ouder|langer|meer)$`), (m) => ({ van: getal(m[1]), tot: null, eenheid: EENHEID[m[2]] })],
  // Ouder dan 55 jaar, Langer dan 10 jaar, Meer dan 35 uur → vanaf X
  [new RegExp(`^(?:ouder|langer|meer) dan ${GETAL} ${EENHEDEN}$`), (m) => ({ van: getal(m[1]), tot: null, eenheid: EENHEID[m[2]] })],
];

/**
 * Klassegrenzen van een antwoordmogelijkheid (BOUWPLAN B12): { van, tot, eenheid: 'jaar'|'maand'|'uur' }, met
 * van inbegrepen en tot niet inbegrepen (null = geen grens). Eerst exact opzoeken in de vaste tabel
 * KLASSEGRENZEN, daarna een paar vaste patronen ("Jonger dan X jaar", "X tot Y jaar", "X jaar of ouder", …).
 * "X tot en met Y" en "X t/m Y" nemen Y mee (tot = Y + 1, alleen bij hele getallen). Een streepje ("18-24 jaar")
 * geeft geen klasse: daar is niet te zien of 24 erbij hoort, en een verkeerde klasse geeft ongemerkt een verkeerde
 * respons per groep (K S7). Een decimaal mag ("Korter dan 1,5 jaar").
 * null als het label geen klasse is (bijvoorbeeld "Dat zeg ik liever niet"); dan koppel je het met de hand.
 */
export function klasseVan(label) {
  const t = normaal(label);
  if (!t) return null;
  const vast = KLASSEN_NORMAAL.get(t);
  if (vast) return { ...vast };
  const tk = normaalMetDecimalen(label);
  for (const [patroon, maak] of KLASSE_PATRONEN) {
    const m = patroon.exec(tk);
    if (!m) continue;
    const k = maak(m);
    if ((k.van === null || Number.isFinite(k.van)) && (k.tot === null || Number.isFinite(k.tot)) && (k.van === null || k.tot === null || k.van < k.tot)) return k;
  }
  return null;
}

const LIEVER_NIET_TEKSTEN = new Set(['dat zeg ik liever niet', 'zeg ik liever niet', 'liever niet', 'wil ik liever niet zeggen',
  'dat wil ik liever niet zeggen', 'zeg ik niet', 'wil ik niet zeggen']);

/** Is dit het antwoord "Dat zeg ik liever niet" (ook in een iets andere schrijfwijze)? */
export function isLieverNiet(label) {
  return LIEVER_NIET_TEKSTEN.has(normaal(label));
}

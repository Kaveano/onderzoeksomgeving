// Achtergrondkenmerken van respondenten (afdeling, leeftijd, diensttijd, …).
// Zuivere module (geen DOM, geen fetch): de Worker (GET /instellingen) en de schermen gebruiken dezelfde lijsten.
//
// Een vraag kan een kenmerk krijgen (kolom vragen.kenmerk; '' = geen). Dat mag alleen bij een ja/nee-vraag of
// een meerkeuzevraag met één antwoord, en per vragenlijst hooguit één vraag per kenmerk (behalve 'overig').
// Groepen met minder dan 5 respondenten worden nooit getoond (privacy.js).
//
// In deze module staan alleen vaste lijsten. De functies kenmerkVoorTekst, klasseVan en isLieverNiet
// komen er later bij (BOUWPLAN §3.3, pakket P2).

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

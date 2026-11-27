// Gedeelde, verzonnen gegevens voor de werkbanktests (geen testbestand zelf: npm test pakt alleen *.test.mjs).
// maakExport() geeft een export zoals gegevens.js die levert: twee gekoppelde vragenlijsten (nulmeting en
// vervolgmeting, met een hernoemde en een nieuwe antwoordmogelijkheid, meerdere antwoorden, weet niet, een
// thema en een meetpunt, cijfervragen 0–10 en 1–10, een open vraag en een onbekend vraagtype) en een kleine
// vragenlijst met 3 antwoorden (regel R0).

import { CIJFERSCHALEN, SCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';

/** Vaste reeks "willekeurige" getallen. */
export function lcg(zaad) {
  let s = zaad >>> 0;
  const volgende = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return { getal: volgende, geheel: (max) => Math.floor(volgende() * (max + 1)), kies: (lijst) => lijst[Math.floor(volgende() * lijst.length)] };
}

const opties = (lijst) => JSON.stringify(lijst.map(([id, label]) => ({ id, label })));

function vraag(id, vragenlijst_id, velden) {
  return {
    id, vragenlijst_id, thema_id: 10, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${id}`, toelichting: '', opties: '[]',
    schaal_soort: 'eens', meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: id, kenmerk: '',
    ...velden,
  };
}

/**
 * opties: { zaad, nA, nB, nKlein, metKenmerk (vragen.kenmerk aanwezig), afdelingen: gewichten }.
 */
export function maakExport({ zaad = 20261127, nA = 60, nB = 45, nKlein = 3, metKenmerk = true } = {}) {
  const r = lcg(zaad);
  const k = (sleutel) => (metKenmerk ? sleutel : undefined);
  const vragen = [
    vraag(1000, 100, { type: 'meerkeuze', thema_id: 12, tekst: 'Op welke afdeling werk je?', opties: opties([['oa', 'Kantoor'], ['ob', 'Productie'], ['oc', 'Verkoop']]), uitsplitsen: 1, kenmerk: k('afdeling') }),
    vraag(1001, 100, { type: 'meerkeuze', thema_id: 12, tekst: 'Wat is je leeftijd?', opties: opties([['o1', 'Jonger dan 35 jaar'], ['o2', '35 tot 55 jaar'], ['o3', '55 jaar of ouder']]), kenmerk: k('leeftijd') }),
    vraag(1002, 100, { thema_id: 10, meetpunt_id: 20, tekst: 'Ik heb genoeg tijd voor mijn werk.', weet_niet: 1 }),
    vraag(1003, 100, { thema_id: 10, tekst: 'Het werktempo is goed te doen.' }),
    vraag(1012, 100, { thema_id: 10, tekst: 'Ik kan pauze nemen wanneer ik dat nodig heb.' }),
    vraag(1004, 100, { thema_id: 11, tekst: 'Mijn leidinggevende geeft goede feedback.' }),
    vraag(1013, 100, { thema_id: 11, tekst: 'Mijn leidinggevende luistert naar mij.' }),
    vraag(1005, 100, { type: 'janee', thema_id: 11, tekst: 'Denk je erover om te vertrekken?' }),
    vraag(1006, 100, { type: 'meerkeuze', thema_id: 11, tekst: 'Waar werk je?', meerdere_antwoorden: 1, opties: opties([['m1', 'Thuis'], ['m2', 'Kantoor'], ['m3', 'Onderweg']]) }),
    vraag(1007, 100, { type: 'open', thema_id: 11, tekst: 'Wat kan beter?' }),
    vraag(1008, 100, { type: 'cijfer', thema_id: 11, schaal_soort: 'nps', tekst: 'Zou je ons aanbevelen?', weet_niet: 1 }),
    vraag(1009, 100, { type: 'cijfer', thema_id: 11, schaal_soort: 'rapport', tekst: 'Welk rapportcijfer geef je?' }),
    vraag(1010, 100, { type: 'raar', thema_id: 11, tekst: 'Een vraag van een onbekend type' }),
    // Vervolgmeting: kopie met dezelfde stam (bron_vraag_id), hernoemde optie, nieuwe optie, geen leeftijdsvraag.
    vraag(1100, 101, { type: 'meerkeuze', thema_id: 12, tekst: 'Op welke afdeling werk je?', bron_vraag_id: 1000, opties: opties([['oa', 'Kantoor en staf'], ['ob', 'Productie'], ['oc', 'Verkoop'], ['od', 'Service']]), uitsplitsen: 1, kenmerk: k('afdeling') }),
    vraag(1102, 101, { thema_id: 10, meetpunt_id: 20, tekst: 'Ik heb genoeg tijd voor mijn werk.', weet_niet: 1, bron_vraag_id: 1002 }),
    vraag(1103, 101, { thema_id: 10, tekst: 'Het werktempo is goed te doen.', bron_vraag_id: 1003 }),
    vraag(1104, 101, { thema_id: 11, tekst: 'Mijn leidinggevende geeft goede feedback.', bron_vraag_id: 1004 }),
    vraag(1105, 101, { type: 'janee', thema_id: 11, tekst: 'Denk je erover om te vertrekken?', bron_vraag_id: 1005 }),
    vraag(1106, 101, { type: 'meerkeuze', thema_id: 11, tekst: 'Waar werk je?', meerdere_antwoorden: 1, bron_vraag_id: 1006, opties: opties([['m1', 'Thuis'], ['m2', 'Kantoor'], ['m4', 'Onderweg']]) }),
    vraag(1107, 101, { type: 'open', thema_id: 11, tekst: 'Wat kan beter?', bron_vraag_id: 1007 }),
    vraag(1108, 101, { type: 'cijfer', thema_id: 11, schaal_soort: 'nps', tekst: 'Zou je ons aanbevelen?', weet_niet: 1, bron_vraag_id: 1008 }),
    // Kleine vragenlijst (3 antwoorden): doet niet mee (R0), maar telt wel mee voor de namen.
    vraag(1200, 102, { thema_id: 10, tekst: 'Een losse vraag in een kleine lijst.' }),
  ];
  if (!metKenmerk) for (const q of vragen) delete q.kenmerk;

  const inzendingen = [];
  let id = 1;
  const schaal = (p = 0.04, wn = false) => (r.getal() < p ? undefined : wn && r.getal() < 0.08 ? 'weet_niet' : 1 + r.geheel(4));
  const afdelingen = [['oa', 0.4], ['ob', 0.35], ['oc', 0.25]];
  const kiesAfd = (extra) => {
    const x = r.getal();
    if (extra && x > 0.9) return 'od';
    let t = 0;
    for (const [o, w] of afdelingen) {
      t += w * (extra ? 0.9 : 1);
      if (x < t) return o;
    }
    return 'oc';
  };
  const datum = (i) => `2026-${String(9 + (i % 3)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`;
  for (let i = 0; i < nA; i++) {
    const a = {};
    if (r.getal() > 0.03) a[1000] = kiesAfd(false);
    if (r.getal() > 0.05) a[1001] = r.kies(['o1', 'o2', 'o2', 'o3']);
    for (const q of [1002, 1003, 1012, 1004, 1013]) {
      const w = schaal(0.05, q === 1002);
      if (w !== undefined) a[q] = w;
    }
    if (r.getal() > 0.05) a[1005] = r.getal() < 0.35 ? 'ja' : 'nee';
    if (r.getal() > 0.1) a[1006] = ['m1', 'm2', 'm3'].filter(() => r.getal() < 0.5);
    if (r.getal() < 0.5) a[1007] = r.kies(['Meer overleg', 'Minder werkdruk', 'Betere roosters']);
    if (r.getal() > 0.05) a[1008] = r.getal() < 0.06 ? 'weet_niet' : r.geheel(10);
    if (r.getal() > 0.05) a[1009] = 1 + r.geheel(9);
    a[1010] = 'iets';
    inzendingen.push({ id: id++ * 7919, vragenlijst_id: 100, datum: datum(i), antwoorden: a });
  }
  for (let i = 0; i < nB; i++) {
    const a = {};
    if (r.getal() > 0.03) a[1100] = kiesAfd(true);
    for (const q of [1102, 1103, 1104]) {
      const w = schaal(0.05, q === 1102);
      if (w !== undefined) a[q] = w;
    }
    if (r.getal() > 0.05) a[1105] = r.getal() < 0.3 ? 'ja' : 'nee';
    if (r.getal() > 0.1) a[1106] = ['m1', 'm2', 'm4'].filter(() => r.getal() < 0.5);
    if (r.getal() < 0.5) a[1107] = r.kies(['Meer overleg', 'Minder werkdruk']);
    if (r.getal() > 0.05) a[1108] = r.geheel(10);
    inzendingen.push({ id: id++ * 7919, vragenlijst_id: 101, datum: datum(i), antwoorden: a });
  }
  for (let i = 0; i < nKlein; i++) inzendingen.push({ id: id++ * 7919, vragenlijst_id: 102, datum: '2026-10-01', antwoorden: { 1200: 1 + r.geheel(4) } });
  // Zoals export/data: gesorteerd op vragenlijst, datum en id.
  inzendingen.sort((a, b) => a.vragenlijst_id - b.vragenlijst_id || (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id));

  return {
    export: { versie: 1, datum: '2026-11-27' },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN, vraagtypen: {} },
    onderzoek: { id: 1, titel: 'Medewerkersonderzoek', bedrijfsnaam: 'Voorbeeld BV', status: 'actief' },
    themas: [{ id: 10, naam: 'Werkdruk', volgorde: 1 }, { id: 11, naam: 'Leiding', volgorde: 2 }, { id: 12, naam: 'Achtergrond', volgorde: 3 }],
    meetpunten: [{ id: 20, thema_id: 10, naam: 'Tijd', volgorde: 1 }],
    meetmomenten: [{ id: 30, naam: 'Nulmeting', volgorde: 1 }, { id: 31, naam: 'Vervolgmeting', volgorde: 2 }],
    vragenlijsten: [
      { id: 100, titel: 'Medewerkersonderzoek', meetmoment_id: 30, status: 'gesloten' },
      { id: 101, titel: 'Medewerkersonderzoek – vervolg', meetmoment_id: 31, status: 'open' },
      { id: 102, titel: 'Kleine lijst', meetmoment_id: null, status: 'gesloten' },
    ],
    vragen,
    inzendingen,
    eigen_invoer: [], stukken: [], acties: [], rapporten: [],
    werkbank_definities: [], werkbank_analyses: [],
    codes: [], coderingen: [], citaten: [], bronnen_gekoppeld: [],
    hr_instellingen: {}, personeelscijfers: [],
  };
}

/** Een eigen dataset (zoals GET /datasets/:id): kolommen en rijen. */
export function maakBestand({ zaad = 7, n = 80 } = {}) {
  const r = lcg(zaad);
  const rijen = [];
  for (let i = 0; i < n; i++) {
    rijen.push([
      r.kies(['Noord', 'Zuid', 'Oost', 'West']),
      20 + r.geheel(45),
      r.getal() < 0.1 ? null : Math.round(r.getal() * 4000) / 100,
      1 + r.geheel(3),
      r.getal() < 0.05 ? 999 : r.geheel(30),
      `opmerking ${i}`,
    ]);
  }
  return { id: 5, naam: 'Opleidingsuren 2025', kolommen: ['Regio', 'Leeftijd', 'Uren', 'Functiegroep', 'Verzuimdagen', 'Toelichting'], rijen };
}

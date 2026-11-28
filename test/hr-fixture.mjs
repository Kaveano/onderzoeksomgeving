// Gegevens voor de tests van HR-analytics (geen testbestand zelf): een export zoals gegevens.js die geeft, met
// vaste "willekeurige" antwoorden (LCG), achtergrondvragen, schaalvragen in thema's, een eNPS- en een rapportcijfer.
import { SCHALEN, CIJFERSCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';

export function lcg(zaad) {
  let s = zaad >>> 0;
  const getal = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return { getal, geheel: (max) => Math.floor(getal() * (max + 1)) };
}

const opties = (labels) => JSON.stringify(labels.map((l, i) => ({ id: `o${i + 1}`, label: l })));
let vraagNr = 0;
/** Een rij uit de tabel vragen. */
export function vraag(velden) {
  vraagNr++;
  return {
    id: velden.id ?? 1000 + vraagNr, vragenlijst_id: 1, thema_id: 1, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${vraagNr}`,
    toelichting: '', opties: '[]', schaal_soort: 'eens', meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0,
    bron_vraag_id: null, volgorde: vraagNr, kenmerk: '', ...velden,
    ...(Array.isArray(velden.opties) ? { opties: opties(velden.opties) } : {}),
  };
}

/** Een export: { onderzoek, lijsten, themas, meetpunten, meetmomenten, vragenlijsten, vragen, inzendingen, … }. */
export function maakExport({ themas, meetmomenten = [], vragenlijsten, vragen, inzendingen, hr_instellingen = {}, personeelscijfers = [], eigen_invoer = [] }) {
  return {
    export: { versie: 1 },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN },
    onderzoek: { id: 1, bedrijfsnaam: 'Voorbeeld BV', titel: 'Medewerkersonderzoek', status: 'actief', onderzoeksvraag: '' },
    themas, meetpunten: [], meetmomenten, vragenlijsten, vragen, eigen_invoer, stukken: [], acties: [], rapporten: [],
    werkbank_definities: [], werkbank_analyses: [], codes: [], coderingen: [], citaten: [], bronnen_gekoppeld: [],
    inzendingen_stand: [], hr_instellingen, personeelscijfers,
    inzendingen: inzendingen.map((i, k) => ({ id: i.id ?? 10_000 + k, ...i })),
  };
}

export const THEMAS = [
  { id: 1, naam: 'Werkdruk', volgorde: 1 }, { id: 2, naam: 'Samenwerking', volgorde: 2 }, { id: 3, naam: 'Leiderschap', volgorde: 3 },
  { id: 4, naam: 'Betrokkenheid', volgorde: 4 }, { id: 9, naam: 'Achtergrond', volgorde: 9 },
];

/**
 * Eén vragenlijst (of meer, als kopie per meetmoment) met n respondenten. afdelingen: het aantal per afdeling (de rest:
 * niet ingevuld). volledig: elke schaalvraag beantwoord (behalve bij de eerste leeg respondenten). Elke respondent heeft een "stemming" die de schaalantwoorden en de cijfers stuurt.
 */
export function standaardExport({ n = 120, zaad = 11, afdelingen = null, metas = 1, status = 'gesloten', uitgenodigd = null, extraVragen = [], hr = {}, personeel = [], leeg = 0, volledig = false } = {}) {
  const r = lcg(zaad);
  const meetmomenten = Array.from({ length: metas }, (_, i) => ({ id: 101 + i, naam: ['Nulmeting', 'Tussenmeting', 'Eindmeting'][i] || `Meting ${i + 1}`, datum: `2026-0${3 + i * 3}-01`, volgorde: i + 1 }));
  const vragenlijsten = [];
  const vragen = [];
  const inzendingen = [];
  const stamVragen = [];
  const basisVragen = () => [
    vraag({ id: 1, thema_id: 9, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['Zorg', 'Staf', 'Facilitair', 'ICT'], uitsplitsen: 1, kenmerk: 'afdeling' }),
    vraag({ id: 2, thema_id: 9, type: 'meerkeuze', tekst: 'Wat is je leeftijd?', opties: ['Jonger dan 35 jaar', '35 tot 55 jaar', '55 jaar of ouder', 'Dat zeg ik liever niet'], uitsplitsen: 1, kenmerk: 'leeftijd' }),
    vraag({ id: 3, thema_id: 9, type: 'janee', tekst: 'Geef je zelf leiding aan een of meer medewerkers?', uitsplitsen: 1, kenmerk: 'leidinggevend' }),
    ...[1, 1, 1, 2, 2, 2, 3, 3, 3, 4].map((t, i) => vraag({ id: 10 + i, thema_id: t, tekst: i === 0 ? 'De hoeveelheid werk is goed te doen binnen mijn werktijd.' : `Stelling ${i + 1} over ${THEMAS.find((x) => x.id === t).naam.toLowerCase()}`, weet_niet: i === 5 ? 1 : 0 })),
    vraag({ id: 30, thema_id: 4, type: 'cijfer', schaal_soort: 'nps', tekst: 'Hoe waarschijnlijk is het dat je Voorbeeld BV als werkgever aanbeveelt aan vrienden of bekenden?' }),
    vraag({ id: 31, thema_id: 4, type: 'cijfer', schaal_soort: 'rapport', tekst: 'Welk rapportcijfer geef je Voorbeeld BV als werkgever?', weet_niet: 1 }),
    vraag({ id: 32, thema_id: 1, type: 'janee', tekst: 'Heb je het afgelopen jaar weleens doorgewerkt terwijl je je eigenlijk te ziek voelde om te werken?' }),
    vraag({ id: 33, thema_id: 2, type: 'open', tekst: 'Wat kan er beter?' }),
    ...extraVragen,
  ];
  for (let m = 0; m < metas; m++) {
    const lijstId = 1 + m;
    vragenlijsten.push({ id: lijstId, titel: `Medewerkersonderzoek${metas > 1 ? ` ${meetmomenten[m].naam}` : ''}`, status: m === metas - 1 ? status : 'gesloten', code: `code-${lijstId}`, meetmoment_id: metas ? meetmomenten[m].id : null, aantal_uitgenodigd: uitgenodigd });
    const basis = basisVragen();
    for (const q of basis) {
      const id = m === 0 ? q.id : q.id + 1000 * m;
      const kopie = { ...q, id, vragenlijst_id: lijstId, bron_vraag_id: m === 0 ? null : q.id };
      vragen.push(kopie);
      if (m === 0) stamVragen.push(kopie);
    }
    const afd = afdelingen || [n * 0.45, n * 0.3, n * 0.15, n * 0.1].map(Math.round);
    const verdeling = [];
    afd.forEach((a, i) => { for (let k = 0; k < a; k++) verdeling.push(`o${i + 1}`); });
    const totaal = Math.max(n, verdeling.length);
    for (let i = 0; i < totaal; i++) {
      const a = {};
      const stem = r.getal() * 2.6 - 1.3 + m * 0.2;
      if (i < verdeling.length) a[id(m, 1)] = verdeling[i];
      if (r.getal() < 0.95) a[id(m, 2)] = `o${1 + r.geheel(3)}`;
      if (r.getal() < 0.9) a[id(m, 3)] = r.getal() < 0.2 ? 'ja' : 'nee';
      const leegHier = i < leeg;
      for (let j = 0; j < 10; j++) {
        if (leegHier && j > 1) continue; // gedeeltelijk ingevuld
        if (j === 5 && r.getal() < 0.08) a[id(m, 15)] = 'weet_niet';
        else if (r.getal() < 0.97 || volledig) a[id(m, 10 + j)] = Math.min(5, Math.max(1, Math.round(3.2 + stem + (r.getal() - 0.5) * 1.6 - (j === 0 ? 0.6 : 0))));
      }
      if (r.getal() < 0.96) a[id(m, 30)] = Math.min(10, Math.max(0, Math.round(7 + stem * 2 + (r.getal() - 0.5) * 3)));
      if (r.getal() < 0.95) a[id(m, 31)] = r.getal() < 0.04 ? 'weet_niet' : Math.min(10, Math.max(1, Math.round(7 + stem * 1.5 + (r.getal() - 0.5) * 2)));
      if (r.getal() < 0.9) a[id(m, 32)] = r.getal() < 0.35 ? 'ja' : 'nee';
      if (r.getal() < 0.3) a[id(m, 33)] = 'Meer tijd voor overleg.';
      inzendingen.push({ vragenlijst_id: lijstId, datum: `2026-${String(3 + m * 3).padStart(2, '0')}-${String(1 + (i % 20)).padStart(2, '0')}`, antwoorden: a });
    }
  }
  inzendingen.sort((x, y) => x.vragenlijst_id - y.vragenlijst_id || x.datum.localeCompare(y.datum));
  return maakExport({ themas: THEMAS, meetmomenten, vragenlijsten, vragen, inzendingen, hr_instellingen: hr, personeelscijfers: personeel });
}
const id = (m, basis) => (m === 0 ? basis : basis + 1000 * m);

/** Een export met precies deze aantallen per antwoordmogelijkheid van één achtergrondvraag (plus niet ingevuld). */
export function kenmerkExport(aantallen, { nietIngevuld = 0, labels = null, populatie = null, kenmerk = 'afdeling' } = {}) {
  const lab = labels || aantallen.map((_, i) => `Groep ${String.fromCharCode(65 + i)}`);
  const vragen = [
    vraag({ id: 1, thema_id: 9, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: lab, uitsplitsen: 1, kenmerk }),
    vraag({ id: 2, thema_id: 1, tekst: 'Stelling' }),
  ];
  const inzendingen = [];
  aantallen.forEach((a, i) => { for (let k = 0; k < a; k++) inzendingen.push({ vragenlijst_id: 1, datum: '2026-10-01', antwoorden: { 1: `o${i + 1}`, 2: 1 + ((k + i) % 5) } }); });
  for (let k = 0; k < nietIngevuld; k++) inzendingen.push({ vragenlijst_id: 1, datum: '2026-10-01', antwoorden: { 2: 3 } });
  const hr = populatie ? { versie: 1, populatie: { 1: Object.fromEntries(populatie.map((p, i) => [`o${i + 1}`, p])) } } : {};
  return maakExport({
    themas: THEMAS, vragenlijsten: [{ id: 1, titel: 'Lijst', status: 'gesloten', code: 'c', meetmoment_id: null, aantal_uitgenodigd: null }],
    vragen, inzendingen, hr_instellingen: hr,
  });
}

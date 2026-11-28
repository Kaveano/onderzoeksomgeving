// Integratiebevindingen over bruikbaarheid (G5–G8):
// - G5: "Alle resultaten" (ook bij een meelezer) gebruikt voor een verborgen cel overal ×, met VERBORGEN_UITLEG; nergens "<5";
// - G6: een RIS-bestand zonder taal (LA) maakt een Engelse bron niet Nederlands: de taal wordt geraden, met een melding;
// - G7: het advies in "Achtergrondvragen toevoegen" telt de achtergrondvragen die er al in staan mee;
// - G8: coderen op een telefoon: het codeboek blijft bij de antwoorden in beeld en de knoppen zijn minstens 44 px hoog.
// Zuiver: geen server nodig. Uitvoeren: node --test test/integratie-gebruik.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dashboardUitRijen } from '../public/js/beheer/dashboard-rekenen.js';
import { kijkerDashboard } from '../src/routes/delen.js';
import { VERBORGEN, VERBORGEN_UITLEG } from '../public/js/beheer/privacy.js';
import { CIJFERSCHALEN } from '../src/lib/schalen.js';
import { uitsplitsingTekst, uitsplitsingIetsVerborgen } from '../public/js/beheer/schermen/dashboard.js';
import { leesRis, naarRis, taalGeradenTekst } from '../public/js/beheer/bibliotheek-bestanden.js';
import { legeBron } from '../public/js/beheer/bibliotheek-regels.js';
import { grootteAdvies, KLEIN_GRENS, KLEIN_MAX } from '../public/js/beheer/schermen/kenmerk-dialoog.js';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');

// ---------- G5: één teken voor een verborgen cel op "Alle resultaten" ----------

/**
 * Eén vragenlijst, uitsplitsen naar afdeling (A 12, B 10, C 8). Thema Werkdruk (2 schaalvragen) en een eNPS-vraag.
 * In groep B beantwoorden maar `npsB` mensen de eNPS-vraag; in groep C slaan `zonderWerkdrukC` mensen Werkdruk over.
 */
function rijenUitsplitsing({ npsB = 3, zonderWerkdrukC = 4 } = {}) {
  const q = (id, type, tekst, extra = {}) => ({
    id, vragenlijst_id: 1, thema_id: 1, meetpunt_id: null, type, tekst, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: id, kenmerk: '', ...extra,
  });
  const vragen = [
    q(1, 'schaal', 'Ik heb genoeg tijd voor mijn werk.'),
    q(2, 'schaal', 'Ik kan mijn werk aan.'),
    q(3, 'cijfer', 'Hoe waarschijnlijk is het dat je ons aanbeveelt?', { schaal_soort: 'nps', thema_id: 2 }),
    q(4, 'meerkeuze', 'Op welke afdeling werk je?', { thema_id: 3, uitsplitsen: 1, kenmerk: 'afdeling', opties: JSON.stringify([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]) }),
  ];
  const inzendingen = [];
  let nr = 0;
  for (const [afd, n] of [['a', 12], ['b', 10], ['c', 8]]) {
    for (let i = 0; i < n; i++, nr++) {
      const a = { 1: 1 + (nr % 5), 2: 1 + ((nr * 3) % 5), 3: nr % 11, 4: afd };
      if (afd === 'b' && i >= npsB) delete a[3];
      if (afd === 'c' && i < zonderWerkdrukC) { delete a[1]; delete a[2]; }
      inzendingen.push({ vragenlijst_id: 1, datum: '2026-10-01', a });
    }
  }
  return {
    onderzoek: { id: 1, bedrijfsnaam: 'X', titel: 'Y', status: 'actief' },
    schalen: { eens: ['Helemaal oneens', 'Oneens', 'Neutraal', 'Eens', 'Helemaal eens'] },
    cijferschalen: CIJFERSCHALEN,
    themas: [{ id: 1, naam: 'Werkdruk' }, { id: 2, naam: 'Betrokkenheid' }, { id: 3, naam: 'Achtergrond' }],
    meetpunten: [],
    meetmomenten: [],
    vragenlijsten: [{ id: 1, titel: 'MTO', status: 'gesloten', code: 'a', meetmoment_id: null, aantal_uitgenodigd: 40 }],
    vragen,
    inzendingen,
    eigen_invoer: [],
  };
}
const MAG_ALLES = { dashboard: true, open_antwoorden: false, tussenstand: false, stukken: [], rapporten: [] };

test('G5: de uitsplitsing legt een verborgen cel uit met VERBORGEN_UITLEG, niet met "<5"', () => {
  const d = dashboardUitRijen(rijenUitsplitsing(), { vragenlijst: 1, uitsplitsen: 4 });
  const u = d.selectie.uitsplitsing;
  assert.equal(u.uitleg_cel, VERBORGEN_UITLEG);
  assert.ok(!/<\s*\d/.test(JSON.stringify(u)), 'geen "<5" in de gegevens van de uitsplitsing');
  // De verborgen cellen bestaan echt (anders bewijst de test niets): eNPS in B en Werkdruk in C.
  const groep = (label) => u.groepen.find((g) => g.label === label);
  assert.equal(groep('B').cijfers.find((c) => c.vraag_id === 3).verborgen, true);
  assert.equal(groep('C').themas.find((t) => t.thema_id === 1).verborgen, true);
  assert.equal(uitsplitsingIetsVerborgen(u), true);
});

test('G5: de kopieertekst van de uitsplitsing gebruikt × en dezelfde uitleg (beheer en meelezer)', () => {
  for (const [wie, d] of [
    ['beheer', dashboardUitRijen(rijenUitsplitsing(), { vragenlijst: 1, uitsplitsen: 4 })],
    ['meelezer', kijkerDashboard(structuredClone(dashboardUitRijen(rijenUitsplitsing(), { vragenlijst: 1, uitsplitsen: 4 })), MAG_ALLES)],
  ]) {
    const tekst = uitsplitsingTekst(d.selectie, 'MTO');
    assert.ok(!/<\s*5|minder dan 5 respondenten\)/.test(tekst), `${wie}: geen "<5" of "(minder dan 5 respondenten)" bij een cel`);
    assert.match(tekst, new RegExp(`- Werkdruk: ${VERBORGEN}`), `${wie}: Werkdruk in C is ×`);
    assert.match(tekst, new RegExp(`- eNPS: .*: ${VERBORGEN}`), `${wie}: eNPS in B is ×`);
    assert.ok(tekst.endsWith(VERBORGEN_UITLEG), `${wie}: de uitleg staat eronder`);
  }
});

test('G5: zonder verborgen cel staat er geen ×-uitleg', () => {
  const d = dashboardUitRijen(rijenUitsplitsing({ npsB: 10, zonderWerkdrukC: 0 }), { vragenlijst: 1, uitsplitsen: 4 });
  assert.equal(uitsplitsingIetsVerborgen(d.selectie.uitsplitsing), false);
  const tekst = uitsplitsingTekst(d.selectie, 'MTO');
  assert.ok(!tekst.includes(VERBORGEN));
  assert.ok(!tekst.includes(VERBORGEN_UITLEG));
  // Een verborgen groep telt wel mee voor de uitleg.
  assert.equal(uitsplitsingIetsVerborgen({ groepen: [{ verborgen: true, themas: [] }] }), true);
});

test('G5: het scherm "Alle resultaten" kent geen "<5" meer; de handleiding ook niet', () => {
  const scherm = lees('../public/js/beheer/schermen/dashboard.js');
  assert.ok(!/`<\$\{/.test(scherm), 'geen `<${drempel}` in dashboard.js');
  assert.ok(!scherm.includes('"<5"') && !scherm.includes("'<5'"), 'geen "<5" in dashboard.js');
  assert.match(scherm, /function groepCel\(w\) \{\n\s+if \(w && w\.verborgen\) return verborgenTd\(\);/, 'een verborgen cel is ×');
  assert.match(scherm, /verborgenTd = \(\) => h\('td', \{ class: 'rechts getal db-cel-verborgen' \}, verborgenCel\(null\)\)/);
  assert.ok(!lees('../docs/handleiding.md').includes('"<5"'), 'de handleiding noemt geen "<5"');
});

// ---------- G6: RIS zonder taal ----------

const EDMONDSON = `TY  - JOUR
AU  - Edmondson, Amy
TI  - Psychological safety and learning behavior in work teams
T2  - Administrative Science Quarterly
PY  - 1999
VL  - 44
IS  - 2
SP  - 350
EP  - 383
DO  - 10.2307/2666999
ER  -
`;

test('G6: een Engelse bron zonder LA wordt Engels; een Nederlandse blijft Nederlands; LA gaat voor', () => {
  const { bronnen, meldingen, taalGeraden } = leesRis(`${EDMONDSON}
TY  - JOUR
AU  - Schaufeli, W. B.
TI  - Burnout
T2  - Journal of Organizational Behavior
PY  - 2004
ER  -

TY  - BOOK
AU  - Jansen, A.
TI  - Werkdruk in de zorg
PY  - 2023
ER  -

TY  - JOUR
AU  - Smit, J.
TI  - Learning in teams
LA  - nl
PY  - 2020
ER  -
`);
  assert.deepEqual(bronnen.map((b) => b.taal), ['en', 'en', 'nl', 'nl']);
  assert.equal(bronnen[1].taal, 'en', 'een titel zonder herkenbare woorden: het tijdschrift beslist');
  assert.equal(bronnen[3].taal, 'nl', 'LA in het bestand gaat altijd voor');
  assert.equal(taalGeraden, 3);
  assert.deepEqual(meldingen, [], 'de meldingen (overgeslagen regels e.d.) blijven zoals ze waren');
  // Vroeger: legeBron gaf altijd 'nl'.
  assert.equal(legeBron('artikel').taal, 'nl');
});

test('G6: een bestand met LA (zoals onze eigen RIS-export) raadt niets', () => {
  const b = { ...legeBron('artikel'), titel: 'Psychological safety', taal: 'nl', jaar: 1999, auteurs: [{ achternaam: 'Edmondson', tussenvoegsel: '', voorletters: 'A.' }] };
  const r = leesRis(naarRis([b]));
  assert.equal(r.taalGeraden, 0);
  assert.equal(r.bronnen[0].taal, 'nl');
});

test('G6: de melding bij het importeren', () => {
  assert.match(taalGeradenTekst(1, 1), /^Bij deze bron stond geen taal in het bestand\./);
  assert.match(taalGeradenTekst(2, 2), /^Bij beide bronnen stond/);
  assert.match(taalGeradenTekst(7, 7), /^Bij alle 7 bronnen stond/);
  assert.match(taalGeradenTekst(2, 5), /^Bij 2 van de 5 bronnen stond/);
  assert.match(taalGeradenTekst(2, 5), /Pas hem dan aan bij de bron\.$/);
  const scherm = lees('../public/js/beheer/schermen/bibliotheek.js');
  assert.match(scherm, /taalGeraden \? melding\(taalGeradenTekst\(taalGeraden, bronnen\.length\)\)/, 'de importdialoog toont de melding');
});

// ---------- G7: het advies telt de achtergrondvragen die er al in staan ----------

test('G7: "Er staan er al 2 in." en een waarschuwing zodra het er samen meer dan twee worden', () => {
  assert.equal(KLEIN_GRENS, 50);
  assert.equal(KLEIN_MAX, 2);
  assert.deepEqual(grootteAdvies({ aanwezig: 0, gekozen: 0 }), { al: null, waarschuwing: null });
  assert.equal(grootteAdvies({ aanwezig: 1 }).al, 'Er staat er al 1 in.');
  assert.equal(grootteAdvies({ aanwezig: 2 }).al, 'Er staan er al 2 in.');
  // De reviewer: al 2 (afdeling en diensttijd), er 2 bij (leeftijd en leidinggevend).
  const klein = grootteAdvies({ aanwezig: 2, gekozen: 2, medewerkers: 30 });
  assert.match(klein.waarschuwing, /^Met deze keuze zijn het 4 achtergrondvragen \(2 die er al in staan en 2 nieuwe\)\./);
  assert.match(klein.waarschuwing, /Je hebt 30 mensen uitgenodigd\./);
  const onbekend = grootteAdvies({ aanwezig: 2, gekozen: 2, medewerkers: null });
  assert.match(onbekend.waarschuwing, /Heeft de organisatie minder dan 50 medewerkers\? Kies er dan hooguit twee/);
  // 50 of meer uitgenodigd (de reviewer had er 120): het advies voor minder dan 50 geldt niet.
  assert.equal(grootteAdvies({ aanwezig: 2, gekozen: 2, medewerkers: 120 }).waarschuwing, null);
  assert.equal(grootteAdvies({ aanwezig: 2, gekozen: 2, medewerkers: 120 }).al, 'Er staan er al 2 in.');
  // Twee in totaal is goed; nog niets gekozen geeft geen waarschuwing (wel de telling).
  assert.equal(grootteAdvies({ aanwezig: 0, gekozen: 2, medewerkers: 20 }).waarschuwing, null);
  assert.equal(grootteAdvies({ aanwezig: 1, gekozen: 1 }).waarschuwing, null);
  assert.equal(grootteAdvies({ aanwezig: 3, gekozen: 0 }).waarschuwing, null);
  assert.match(grootteAdvies({ aanwezig: 0, gekozen: 3 }).waarschuwing, /^Met deze keuze zijn het 3 achtergrondvragen\./);
  assert.match(grootteAdvies({ aanwezig: 1, gekozen: 2, medewerkers: 12 }).waarschuwing, /\(1 die er al in staat en 2 nieuwe\)/);
});

test('G7: beide editors geven het aantal achtergrondvragen door, de vragenlijst ook het aantal uitgenodigden', () => {
  const vl = lees('../public/js/beheer/schermen/vragenlijst-bewerken.js');
  assert.match(vl, /aantalAanwezig: vragen\.filter\(\(q\) => q\.kenmerk \|\| q\.uitsplitsen\)\.length,/);
  assert.match(vl, /medewerkers: vl\.aantal_uitgenodigd \|\| null,/);
  const sj = lees('../public/js/beheer/sjabloon-editor.js');
  assert.match(sj, /aantalAanwezig: model\.vragen\.filter\(\(v\) => v\.kenmerk \|\| v\.uitsplitsen\)\.length,/);
  const dlg = lees('../public/js/beheer/schermen/kenmerk-dialoog.js');
  assert.match(dlg, /vak\.addEventListener\('change', \(\) => tekenAdvies\(\)\)/, 'het advies verandert met de vinkjes');
});

// ---------- G8: coderen op een telefoon ----------

/** De regels van één selector in een stuk CSS: { eigenschap: waarde }. */
function regels(css, selector) {
  const m = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) return null;
  return Object.fromEntries(m[1].split(';').map((r) => r.replace(/\/\*.*?\*\//g, '').trim()).filter(Boolean).map((r) => r.split(':').map((x) => x.trim())));
}

test('G8: codeknoppen zijn minstens 44 px hoog; op een smal scherm plakt het codeboek onder de antwoorden', () => {
  const css = lees('../public/css/scherm-coderen.css');
  assert.equal(regels(css, '.cd-codeknop')['min-height'], '44px');
  assert.equal(regels(css, '.cd-codeboek').top, '72px', 'breed scherm: het codeboek plakt onder de vaste kop, niet erachter');
  const smal = /@media \(max-width: 900px\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(smal, 'er is een blok voor smalle schermen');
  const m = smal[1];
  assert.ok(!/order:\s*-1/.test(m), 'het codeboek staat niet meer boven de antwoorden');
  assert.equal(regels(m, '.cd-indeling').display, 'block', 'geen grid: anders blijft het plakkende codeboek in zijn eigen rastervak');
  const boek = regels(m, '.cd-codeboek');
  assert.equal(boek.position, 'sticky');
  assert.equal(boek.bottom, '0');
  assert.match(boek['max-height'], /dvh/);
  assert.equal(regels(m, '.cd-indeling .knop, .cd-citaten .knop')['min-height'], '44px');
  const kop = regels(m, '.cd-codeboek > summary');
  assert.equal(kop.padding, '10px 0');
  assert.equal(kop['line-height'], '24px', '10 + 24 + 10 = 44 px om op te tikken');
  // In de DOM staat het codeboek na het werkvlak (dus na de antwoorden).
  const scherm = lees('../public/js/beheer/schermen/coderen.js');
  assert.match(scherm, /h\('div', \{ class: 'cd-indeling' \}, werkvlak, codeboekEl\)/);
});

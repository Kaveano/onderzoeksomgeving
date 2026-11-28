// Integratiebevindingen over bruikbaarheid (G5):
// - G5: "Alle resultaten" (ook bij een meelezer) gebruikt voor een verborgen cel overal ×, met VERBORGEN_UITLEG; nergens "<5";
// Zuiver: geen server nodig. Uitvoeren: node --test test/integratie-gebruik.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dashboardUitRijen } from '../public/js/beheer/dashboard-rekenen.js';
import { kijkerDashboard } from '../src/routes/delen.js';
import { VERBORGEN, VERBORGEN_UITLEG } from '../public/js/beheer/privacy.js';
import { CIJFERSCHALEN } from '../src/lib/schalen.js';
import { uitsplitsingTekst, uitsplitsingIetsVerborgen } from '../public/js/beheer/schermen/dashboard.js';

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

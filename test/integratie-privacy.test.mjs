// Integratiebevindingen over privacy tussen schermen (P1–P7, J1, J4, J7): één maskeerregel op elk scherm.
// Per bevinding: de aanval van de reviewer (terugrekenen van een verborgen getal) lukt niet meer, en de getallen
// die het dashboard wel laat zien (groepen van minstens 5), blijven zichtbaar.
// Zuiver: geen server nodig. Uitvoeren: node --test test/integratie-privacy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dashboardUitRijen } from '../public/js/beheer/dashboard-rekenen.js';
import { kijkerDashboard } from '../src/routes/delen.js';

const MAG_ALLES = { dashboard: true, open_antwoorden: false, tussenstand: false, stukken: [], rapporten: [] };

// ---------- P4: verloop van een ja/nee-achtergrondvraag, bekeken vanuit een kopie zonder kenmerk ----------

/** Lijst A (Nulmeting) met de ja/nee-vraag als kenmerk; kopie B (Vervolg) met dezelfde vraag zonder kenmerk en zonder uitsplitsen. */
function rijenKopie([jaA, neeA, leegA], [jaB, neeB], { uitsplitsenA = 0, kenmerkA = 'leidinggevend' } = {}) {
  const q = (id, lijst, bron, extra) => ({
    id, vragenlijst_id: lijst, thema_id: 9, meetpunt_id: null, type: 'janee', tekst: 'Geef je leiding aan anderen?', toelichting: '', opties: '[]',
    schaal_soort: 'eens', meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: bron, volgorde: 1, kenmerk: '', ...extra,
  });
  const inz = [];
  const voeg = (lijst, vraag, ja, nee, leeg = 0) => {
    for (let k = 0; k < ja; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: { [vraag]: 'ja' } });
    for (let k = 0; k < nee; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: { [vraag]: 'nee' } });
    for (let k = 0; k < leeg; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: {} });
  };
  voeg(1, 11, jaA, neeA, leegA);
  voeg(2, 21, jaB, neeB);
  return {
    onderzoek: { id: 1, bedrijfsnaam: 'X', titel: 'Y', status: 'actief' },
    schalen: {},
    themas: [{ id: 9, naam: 'Achtergrond' }],
    meetpunten: [],
    meetmomenten: [{ id: 1, naam: 'Nulmeting', datum: '2025-01-01' }, { id: 2, naam: 'Vervolg', datum: '2026-01-01' }],
    vragenlijsten: [
      { id: 1, titel: 'Nulmeting', status: 'gesloten', code: 'a', meetmoment_id: 1, aantal_uitgenodigd: null },
      { id: 2, titel: 'Vervolg', status: 'gesloten', code: 'b', meetmoment_id: 2, aantal_uitgenodigd: null },
    ],
    vragen: [q(11, 1, null, { kenmerk: kenmerkA, uitsplitsen: uitsplitsenA }), q(21, 2, 11)],
    inzendingen: inz,
    eigen_invoer: [],
  };
}
const kijkVerloop = (rijen, lijst) => kijkerDashboard(structuredClone(dashboardUitRijen(rijen, { vragenlijst: lijst, uitsplitsen: null })), MAG_ALLES)
  .selectie.vragen[0].verloop;

test('P4: het verborgen ja-aantal van lijst A staat niet in het verloop van kopie B zonder kenmerk', () => {
  // Lijst A: ja 3, nee 18, niet ingevuld 2 (n 23). Vroeger gaf ?vragenlijst=B voor Nulmeting percentage_ja 14,29 en n 21:
  // ja = 3 en niet ingevuld = 23 − 21 = 2.
  const rijen = rijenKopie([3, 18, 2], [10, 12]);
  const vanA = kijkVerloop(rijen, 1).find((p) => p.meetmoment_id === 1);
  const vanB = kijkVerloop(rijen, 2).find((p) => p.meetmoment_id === 1);
  assert.equal(vanA.percentage_ja, null);
  assert.equal(vanB.percentage_ja, null, 'vanuit de kopie is het punt ook verborgen');
  assert.equal(vanB.n, null);
  const beheerB = dashboardUitRijen(rijen, { vragenlijst: 2, uitsplitsen: null }).selectie.vragen[0].verloop.find((p) => p.meetmoment_id === 1);
  assert.deepEqual(beheerB, { meetmoment_id: 1, naam: 'Nulmeting', percentage_ja: null, n: null, klein: true, open: false }, 'ook op het beheerscherm');
  // De aanval: ja = percentage × n en niet ingevuld = lijstN − n. Zonder getallen lukt dat niet.
  assert.ok(!JSON.stringify(kijkVerloop(rijen, 2)).includes('14.28'));
  assert.deepEqual(kijkVerloop(rijen, 1), kijkVerloop(rijen, 2), 'vanuit elke vragenlijst hetzelfde verloop');
  // Hetzelfde als lijst A alleen "uitsplitsen" heeft (geen kenmerk).
  const alleenUitsplitsen = rijenKopie([3, 18, 2], [10, 12], { kenmerkA: '', uitsplitsenA: 1 });
  assert.equal(kijkVerloop(alleenUitsplitsen, 2).find((p) => p.meetmoment_id === 1).percentage_ja, null);
});

test('P4: is elke bijdragende lijst veilig, dan blijft het verloop vanuit de kopie zichtbaar', () => {
  const rijen = rijenKopie([5, 18, 0], [10, 12]);
  const punt = kijkVerloop(rijen, 2).find((p) => p.meetmoment_id === 1);
  assert.equal(punt.n, 23);
  assert.equal(Math.round(punt.percentage_ja * 100) / 100, Math.round((5 / 23) * 10000) / 100);
  assert.equal(kijkVerloop(rijen, 2).find((p) => p.meetmoment_id === 2).percentage_ja, Math.round((10 / 22) * 10000) / 100);
  // Zonder kenmerk of uitsplitsen in één van beide lijsten verandert er niets: een gewone ja/nee-vraag toont alles.
  const gewoon = rijenKopie([3, 18, 2], [10, 12], { kenmerkA: '' });
  assert.equal(kijkVerloop(gewoon, 2).find((p) => p.meetmoment_id === 1).n, 21);
});

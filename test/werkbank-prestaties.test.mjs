// Prestaties van de werkbank in Node (BOUWPLAN P4 criterium 4, D2 §13.6). De grenzen zijn ruim (1,5 tot 2 keer
// de doelen in de browser), zodat een trage testmachine niet vals alarm geeft.
// Fase 5 en 6 voegen hier regressie (20 voorspellers < 0,3 s), logistisch (< 0,5 s) en PAF (40 vragen < 1,5 s) toe.
// Uitvoeren: node --test test/werkbank-prestaties.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lcg } from './werkbank-fixture.mjs';
import { maakRekenkern } from '../public/js/beheer/werkbank/rekenkern.js';
import { SCHALEN, CIJFERSCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';

/** 5.000 respondenten × 150 vragen: 140 schaalvragen in 10 thema's, 1 afdeling (10 groepen), 9 andere. */
function grootOnderzoek(n = 5000) {
  const r = lcg(99);
  const themas = Array.from({ length: 10 }, (_, t) => ({ id: 100 + t, naam: `Thema ${t + 1}`, volgorde: t }));
  const afdelingen = Array.from({ length: 10 }, (_, i) => ({ id: `oa${i}`, label: `Afdeling ${i + 1}` }));
  const vragen = [{ id: 1, vragenlijst_id: 1, thema_id: 100, meetpunt_id: null, type: 'meerkeuze', tekst: 'Afdeling', opties: JSON.stringify(afdelingen), schaal_soort: 'eens', meerdere_antwoorden: 0, weet_niet: 0, uitsplitsen: 1, bron_vraag_id: null, volgorde: 0, kenmerk: 'afdeling' }];
  for (let i = 0; i < 140; i++) vragen.push({ id: 10 + i, vragenlijst_id: 1, thema_id: 100 + (i % 10), meetpunt_id: null, type: 'schaal', tekst: `Vraag ${i}`, opties: '[]', schaal_soort: 'eens', meerdere_antwoorden: 0, weet_niet: 1, uitsplitsen: 0, bron_vraag_id: null, volgorde: i + 1, kenmerk: '' });
  for (let i = 0; i < 9; i++) vragen.push({ id: 500 + i, vragenlijst_id: 1, thema_id: 100, meetpunt_id: null, type: i % 3 ? 'janee' : 'cijfer', tekst: `Extra ${i}`, opties: '[]', schaal_soort: i % 3 ? 'eens' : 'nps', meerdere_antwoorden: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: 200 + i, kenmerk: '' });
  const inzendingen = [];
  for (let k = 0; k < n; k++) {
    const a = { 1: afdelingen[k % 10].id };
    const persoon = r.getal() * 2 - 1;
    for (let i = 0; i < 140; i++) {
      const x = r.getal();
      if (x < 0.03) continue;
      a[10 + i] = x < 0.05 ? 'weet_niet' : Math.max(1, Math.min(5, Math.round(3 + persoon + (r.getal() - 0.5) * 2 + (k % 10) * 0.05)));
    }
    for (let i = 0; i < 9; i++) a[500 + i] = i % 3 ? (r.getal() < 0.4 ? 'ja' : 'nee') : r.geheel(10);
    inzendingen.push({ id: k + 1, vragenlijst_id: 1, datum: '2026-10-01', antwoorden: a });
  }
  return {
    export: { versie: 1, datum: '2026-11-27' },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN },
    onderzoek: { id: 1, titel: 'Groot', bedrijfsnaam: 'Groot BV' },
    themas, meetpunten: [], meetmomenten: [],
    vragenlijsten: [{ id: 1, titel: 'Groot onderzoek', meetmoment_id: null, status: 'gesloten' }],
    vragen, inzendingen, werkbank_definities: [], werkbank_analyses: [], codes: [], coderingen: [],
  };
}

const data = grootOnderzoek();
const bron = { soort: 'lijst', id: 1 };
const kern = maakRekenkern();

test('opbouwen: 5.000 respondenten × 150 vragen in minder dan 1,5 seconde', () => {
  const t0 = performance.now();
  const o = kern.laad({ data, bron });
  const ms = performance.now() - t0;
  assert.equal(o.n, 5000);
  assert.ok(o.variabelen.length >= 150);
  assert.ok(ms < 1500, `${Math.round(ms)} ms`);
});

test('correlatie van 40 variabelen (paarsgewijs) in minder dan 1 seconde', async () => {
  const t0 = performance.now();
  const u = await kern.voerUit({ versie: 1, bron, filter: null, procedure: 'correlatie', variabelen: { variabelen: Array.from({ length: 40 }, (_, i) => `v:${10 + i}`) }, opties: {} });
  const ms = performance.now() - t0;
  assert.ok(!u.geweigerd);
  assert.equal(u.toetsen, 780);
  assert.ok(ms < 1000, `${Math.round(ms)} ms`);
});

test('ANOVA met Games-Howell over 10 groepen in minder dan 3 seconden', async () => {
  const t0 = performance.now();
  const u = await kern.voerUit({ versie: 1, bron, filter: null, procedure: 'anova', variabelen: { afhankelijk: ['t:100'], factor: 'v:1' }, opties: { posthoc: 'games-howell' } });
  const ms = performance.now() - t0;
  assert.ok(!u.geweigerd);
  assert.equal(u.onderdelen.find((o) => o.id === 'gh-t:100').rijen.length, 45);
  assert.ok(ms < 3000, `${Math.round(ms)} ms`);
});

test('"Stoppen": een lopende ANOVA stopt met een AbortError en het scherm krijgt tussendoor de beurt', async () => {
  const stop = new AbortController();
  let beurten = 0;
  const klok = setInterval(() => { beurten++; }, 1);
  setTimeout(() => stop.abort(), 30);
  await assert.rejects(
    kern.voerUit({ versie: 1, bron, filter: null, procedure: 'anova', variabelen: { afhankelijk: ['t:101'], factor: 'v:1' }, opties: { posthoc: 'beide' } }, { signaal: stop.signal }),
    (e) => e.name === 'AbortError',
  );
  clearInterval(klok);
  assert.ok(beurten > 0, 'de klok liep tussendoor');
});

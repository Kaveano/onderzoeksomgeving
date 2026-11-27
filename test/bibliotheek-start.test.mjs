// Tests voor de startcollectie van de bibliotheek (BOUWPLAN §4 P7).
// - scripts/startcollectie.mjs: de eigen sleutel van een record, velden die niet gebruikt worden.
// Uitvoeren: node --test test/bibliotheek-start.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { controleerRecords, wijsSleutelsToe, SLEUTEL_PATROON } from '../scripts/startcollectie.mjs';

// ---------- Het script: sleutels (besluit d van het onderzoeksteam) ----------

const record = (titel, extra = {}) => ({
  titel, auteurs: ['Bakker, A. B.'], jaar: 2017, soort: 'wetenschappelijk artikel', taal: 'en', doi: '', url: 'https://example.org/x',
  onderwerpen: ['werkdruk-werkstress'], betrouwbaarheid: 'peer-reviewed', ...extra,
});

test('script: de eigen sleutel van een record wordt de sleutel, als die past en uniek is', () => {
  const { bronnen, fouten, ongebruikt } = controleerRecords([
    record('Eerste artikel', { sleutel: 'bakker-2017-eerste' }),
    record('Tweede artikel', { sleutel: 'dubbel' }),
    record('Derde artikel', { sleutel: 'dubbel' }),
    record('Vierde artikel', { sleutel: 'Met Hoofdletters' }),
    record('Vijfde artikel', { sleutel: 'al-bezet' }),
    record('Zesde artikel'),
    record('Zevende artikel', { sleutel: 'nieuwe-naam', doi: '10.1234/bekend' }),
  ]);
  assert.deepEqual(fouten, []);
  assert.deepEqual([...ongebruikt], [], 'alle velden van deze records worden gelezen');
  const vorige = {
    samengesteld_op: '2026-01-01',
    bronnen: [
      { doi: '', titel_jaar: 'iets anders|2017', sleutel: 'al-bezet', citeersleutel: 'bakker2017', toegevoegd_op: '2026-01-01' },
      { doi: '10.1234/bekend', titel_jaar: 'oude titel|2017', sleutel: 'oude-sleutel', citeersleutel: 'bakker2017b', toegevoegd_op: '2026-01-01' },
    ],
  };
  const { lijst, sleutelbestand } = wijsSleutelsToe(bronnen, vorige, '2026-11-27');
  const op = (titel) => lijst.find((r) => r.bron.titel === titel);
  assert.equal(op('Eerste artikel').sleutel, 'bakker-2017-eerste');
  assert.equal(op('Tweede artikel').sleutel, 'bakker-2017-tweede-artikel', 'twee keer dezelfde sleutel: geen van beide');
  assert.equal(op('Derde artikel').sleutel, 'bakker-2017-derde-artikel');
  assert.equal(op('Vierde artikel').sleutel, 'bakker-2017-vierde-artikel', 'past niet');
  assert.equal(op('Vijfde artikel').sleutel, 'bakker-2017-vijfde-artikel', 'al gebruikt door een andere bron');
  assert.equal(op('Zesde artikel').sleutel, 'bakker-2017-zesde-artikel', 'geen eigen sleutel');
  // Een bron die al in het sleutelbestand staat (zelfde DOI) houdt zijn oude sleutels
  assert.equal(op('Zevende artikel').sleutel, 'oude-sleutel');
  assert.equal(op('Zevende artikel').citeersleutel, 'bakker2017b');
  assert.equal(op('Zevende artikel').toegevoegd_op, '2026-01-01');
  // Nieuwe citeersleutels botsen niet met de bestaande
  const citeer = sleutelbestand.bronnen.map((b) => b.citeersleutel);
  assert.equal(new Set(citeer).size, citeer.length);
  assert.equal(op('Eerste artikel').citeersleutel, 'bakker2017c');
  for (const r of lijst) assert.match(r.sleutel, SLEUTEL_PATROON);
  assert.equal(sleutelbestand.samengesteld_op, '2026-01-01');
});

test('script: velden die niet gebruikt worden, worden één keer geteld', () => {
  const { ongebruikt } = controleerRecords([
    record('A', { relevantie: 'Waarom relevant.', open_access: true }),
    record('B', { relevantie: 'Ook relevant.', open_access: false, iets: 1 }),
  ]);
  assert.deepEqual([...ongebruikt], [['relevantie', 2], ['open_access', 2], ['iets', 1]]);
});

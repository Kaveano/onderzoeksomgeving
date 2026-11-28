// Tests voor codering-regels.js (BOUWPLAN §4 P5, criterium 7; §3.10, PR-19): gemaskeerde aantallen per code,
// alleen vragen met minstens 5 antwoorden, citaten alleen als ze gecontroleerd en voor het rapport gekozen zijn.
// Zuiver: geen server nodig. Uitvoeren: node --test test/codering.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coderingFeiten, telling, codesPerItem, openVragen, isAntwoord, itemSleutel, MAX_CITAAT } from '../public/js/beheer/codering-regels.js';

/** Een klein onderzoek: lijst 1 met open vraag 11 (n antwoorden) en open vraag 12 (4 antwoorden); lijst 2 met vraag 21. */
function onderzoek({ n = 12 } = {}) {
  const inzendingen = [];
  for (let i = 0; i < n; i++) {
    inzendingen.push({ id: 1000 + i, vragenlijst_id: 1, datum: '2026-10-01', antwoorden: { 11: `Antwoord ${i}`, ...(i < 4 ? { 12: `Kort ${i}` } : {}), 13: 4 } });
  }
  inzendingen.push({ id: 2000, vragenlijst_id: 1, datum: '2026-10-02', antwoorden: { 11: '   ', 12: '' } }); // leeg telt niet
  for (let i = 0; i < 6; i++) inzendingen.push({ id: 3000 + i, vragenlijst_id: 2, datum: '2026-10-03', antwoorden: { 21: `Later ${i}` } });
  return {
    vragenlijsten: [{ id: 1, titel: 'Nulmeting' }, { id: 2, titel: 'Vervolg' }],
    vragen: [
      { id: 11, vragenlijst_id: 1, type: 'open', tekst: 'Wat kan beter?', bron_vraag_id: null },
      { id: 12, vragenlijst_id: 1, type: 'open', tekst: 'Nog iets?', bron_vraag_id: null },
      { id: 13, vragenlijst_id: 1, type: 'schaal', tekst: 'Tevreden?', bron_vraag_id: null },
      { id: 21, vragenlijst_id: 2, type: 'open', tekst: 'Wat kan beter?', bron_vraag_id: 11 },
    ],
    inzendingen,
    eigen_invoer: [
      { id: 50, soort: 'interview', titel: 'Interview teamleider', tekst: 'Veel overwerk.' },
      { id: 51, soort: 'observatie', titel: 'Werkoverleg', tekst: 'Korte lijnen.' },
      { id: 52, soort: 'cijfer', titel: 'Verzuim', tekst: '' },
    ],
    codes: [
      { id: 7, naam: 'Werkdruk', volgorde: 1 }, { id: 8, naam: 'Waardering', volgorde: 2 }, { id: 9, naam: 'Planning', volgorde: 3 },
    ],
    coderingen: [],
    citaten: [],
  };
}
const codeer = (data, inzendingId, vraagId, codeIds) => {
  for (const c of codeIds) data.coderingen.push({ id: data.coderingen.length + 1, code_id: c, inzending_id: inzendingId, vraag_id: vraagId, invoer_id: null });
};

test('alleen niet-lege antwoorden tellen mee', () => {
  assert.equal(isAntwoord('ja'), true);
  assert.equal(isAntwoord('  '), false);
  assert.equal(isAntwoord(3), false);
  const v = openVragen(onderzoek());
  assert.deepEqual(v.map((x) => [x.vraag.id, x.items.length]), [[11, 12], [12, 4], [21, 6]]);
  assert.equal(itemSleutel({ inzending_id: 5, vraag_id: 11 }), 'i:5:11');
  assert.equal(itemSleutel({ invoer_id: 50 }), 'v:50');
});

test('criterium 7: aantallen van 1 tot 4 worden ×, met aanvullend verbergen', () => {
  const data = onderzoek();
  // Werkdruk 1, Waardering 5, zonder code 12 − 6 = 6: 1 verborgen, dan eerst "zonder code" erbij (samen 7, twee
  // aantallen). Waardering blijft zichtbaar (5 met en 7 zonder), net als de 0/1-codevariabele in de werkbank (P7).
  codeer(data, 1000, 11, [7]);
  for (let i = 1; i <= 5; i++) codeer(data, 1000 + i, 11, [8]);
  const f = coderingFeiten(data);
  const v = f.vragen.find((x) => x.vraag_id === 11);
  assert.equal(v.n_antwoorden, 12);
  assert.equal(v.lijst_titel, 'Nulmeting');
  assert.deepEqual(v.codes, [
    { code_id: 7, naam: 'Werkdruk', aantal: null, verborgen: true },
    { code_id: 8, naam: 'Waardering', aantal: 5, verborgen: false },
  ]);
  assert.equal(v.geen_code, null);
});

test('verbergReeks: de kleinste zichtbare gaat erbij, Planning (0) staat er niet in', () => {
  const data = onderzoek();
  for (let i = 0; i < 6; i++) codeer(data, 1000 + i, 11, [7]);
  codeer(data, 1006, 11, [8]);
  codeer(data, 1007, 11, [8]);
  const v = coderingFeiten(data).vragen[0];
  // Werkdruk 6, Waardering 2, zonder code 4 → [6, 2, 4]: 2 en 4 verborgen (samen 6 ≥ 5), Werkdruk zichtbaar.
  assert.deepEqual(v.codes, [
    { code_id: 7, naam: 'Werkdruk', aantal: 6, verborgen: false },
    { code_id: 8, naam: 'Waardering', aantal: null, verborgen: true },
  ]);
  assert.equal(v.geen_code, null);
  assert.ok(!JSON.stringify(v).includes('"aantal":2'));
});

test('zonder iets kleins is alles zichtbaar', () => {
  const data = onderzoek({ n: 15 });
  for (let i = 0; i < 5; i++) codeer(data, 1000 + i, 11, [7]);
  for (let i = 5; i < 10; i++) codeer(data, 1000 + i, 11, [8, 9]);
  const v = coderingFeiten(data).vragen[0];
  assert.deepEqual(v.codes.map((c) => c.aantal), [5, 5, 5]);
  assert.equal(v.geen_code, 5);
});

test('criterium 7: een vraag met 4 antwoorden staat niet in de feiten (ook niet met codes)', () => {
  const data = onderzoek();
  for (let i = 0; i < 4; i++) codeer(data, 1000 + i, 12, [7]);
  const f = coderingFeiten(data);
  assert.equal(f.vragen.some((x) => x.vraag_id === 12), false);
  // Een vraag zonder enige code staat er ook niet in.
  assert.equal(f.vragen.length, 0);
});

test('alleen gekozen vragenlijsten; de stam van een gekopieerde vraag', () => {
  const data = onderzoek();
  for (let i = 0; i < 6; i++) codeer(data, 3000 + i, 21, [7]);
  for (let i = 0; i < 6; i++) codeer(data, 1000 + i, 11, [7]);
  assert.deepEqual(coderingFeiten(data).vragen.map((x) => [x.vraag_id, x.stam]), [[11, 11], [21, 11]]);
  assert.deepEqual(coderingFeiten(data, { lijstIds: [2] }).vragen.map((x) => x.vraag_id), [21]);
});

test('interviews: alleen interviews en observaties, ook gemaskeerd', () => {
  const data = onderzoek();
  data.coderingen.push({ id: 900, code_id: 7, inzending_id: null, vraag_id: null, invoer_id: 50 });
  const f = coderingFeiten(data);
  assert.equal(f.interviews.n, 2);
  assert.deepEqual(f.interviews.codes, [{ code_id: 7, naam: 'Werkdruk', aantal: null, verborgen: true }]);
  assert.equal(f.interviews.geen_code, null);
  assert.equal(coderingFeiten(onderzoek()).interviews, null, 'zonder codes bij interviews: null');
});

test('criterium 7 / PR-19: citaten alleen gecontroleerd én in rapport, en bij een vraag met minstens 5 antwoorden', () => {
  const data = onderzoek();
  const c = (id, extra) => ({ id, volgorde: id, code_id: 7, inzending_id: 1000, vraag_id: 11, invoer_id: null, tekst: `Citaat ${id}`, gecontroleerd: 1, in_rapport: 1, ...extra });
  data.citaten = [
    c(1),
    c(2, { gecontroleerd: 0, in_rapport: 1 }), // kan niet via de server, maar ook hier niet in het rapport
    c(3, { in_rapport: 0 }),
    c(4, { inzending_id: 1001, vraag_id: 12 }), // vraag met 4 antwoorden
    c(5, { inzending_id: null, vraag_id: null, invoer_id: 51, code_id: null }),
    c(6, { inzending_id: null, vraag_id: null, invoer_id: 52 }), // geen interview of observatie
    c(7, { inzending_id: 3000, vraag_id: 21, code_id: 9 }),
  ];
  const f = coderingFeiten(data);
  assert.deepEqual(f.citaten, [
    { code_naam: 'Werkdruk', tekst: 'Citaat 1', bron: 'vragenlijst', vraag: 'Wat kan beter?', vraag_id: 11, lijst_id: 1 },
    { code_naam: null, tekst: 'Citaat 5', bron: 'interview', vraag: null, vraag_id: null, lijst_id: null },
    { code_naam: 'Planning', tekst: 'Citaat 7', bron: 'vragenlijst', vraag: 'Wat kan beter?', vraag_id: 21, lijst_id: 2 },
  ]);
  assert.deepEqual(coderingFeiten(data, { lijstIds: [1] }).citaten.map((x) => x.tekst), ['Citaat 1', 'Citaat 5']);
  assert.equal(MAX_CITAAT, 1000);
});

test('PR-13: elk citaat uit een vragenlijst zegt uit welke lijst het komt, ook bij een gekopieerde vraag met dezelfde tekst', () => {
  // Vraag 21 (Vervolg) is een kopie van vraag 11 (Nulmeting): dezelfde tekst. Is de Vervolg op de peildatum nog open,
  // dan moet het rapport voor een meelezer zonder tussenstand precies de citaten uit lijst 2 kunnen weglaten.
  const data = onderzoek();
  const c = (id, extra) => ({ id, volgorde: id, code_id: null, invoer_id: null, tekst: `Citaat ${id}`, gecontroleerd: 1, in_rapport: 1, ...extra });
  data.citaten = [c(1, { inzending_id: 1003, vraag_id: 11 }), c(2, { inzending_id: 3002, vraag_id: 21 }), c(3, { inzending_id: null, vraag_id: null, invoer_id: 50 })];
  const f = coderingFeiten(data);
  assert.equal(f.citaten[0].vraag, f.citaten[1].vraag, 'dezelfde tekst: daaraan herken je de lijst niet');
  assert.deepEqual(f.citaten.map((x) => [x.tekst, x.lijst_id, x.vraag_id]), [['Citaat 1', 1, 11], ['Citaat 2', 2, 21], ['Citaat 3', null, null]]);
  const open = new Set([2]); // zoals P6 bij verbergOpen doet
  assert.deepEqual(f.citaten.filter((x) => x.bron !== 'vragenlijst' || !open.has(x.lijst_id)).map((x) => x.tekst), ['Citaat 1', 'Citaat 3']);
  // Elk citaat uit een vragenlijst heeft een lijst_id (anders kan het rapport het niet weglaten)
  for (const x of f.citaten) if (x.bron === 'vragenlijst') assert.ok(Number.isInteger(x.lijst_id) && Number.isInteger(x.vraag_id));
});

test('telling voor het codeboek op het scherm (met codes die nog niet voorkomen)', () => {
  const perItem = codesPerItem([{ code_id: 7, inzending_id: 1, vraag_id: 11 }, { code_id: 7, inzending_id: 2, vraag_id: 11 }]);
  const items = ['i:1:11', 'i:2:11', 'i:3:11'];
  const codes = [{ id: 7, naam: 'A', volgorde: 1 }, { id: 8, naam: 'B', volgorde: 2 }];
  const t = telling(items, perItem, codes, { metNul: true });
  assert.equal(t.n, 3);
  assert.deepEqual(t.codes.map((c) => c.aantal), [null, null], 'minder dan 5 antwoorden: niets zichtbaar');
  assert.equal(t.iets_verborgen, true);
  assert.deepEqual(telling(items, perItem, codes).codes.map((c) => c.code_id), [7], 'zonder metNul alleen gebruikte codes');
});

// Tests voor de QR-code-maker. De verwachte uitkomsten hieronder zijn eenmalig gecontroleerd
// door de gemaakte codes terug te lezen met een onafhankelijke QR-lezer (OpenCV).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { maakQr, qrAlsSvg } from '../public/js/beheer/qr.js';

const hash = (m) => createHash('sha256').update(m.map((r) => r.map((x) => (x ? 1 : 0)).join('')).join('\n')).digest('hex').slice(0, 16);

const GECONTROLEERD = [
  ['A', 21, 'bc9009ae87ca68f1'],
  ['https://voorbeeld.nl/v/1', 25, '08891595990f0915'],
  ['https://onderzoek.afpartners.nl/v/AbCdEfGhIjKlMnOpQrStUv', 33, 'cf4f4c9b5fd91727'],
  ['Vragenlijst: één, twee, drie – €5', 29, '568687cf4d451a53'],
  ['c'.repeat(122), 45, '748cdf6e18bd4372'],
  ['f'.repeat(213), 57, 'e46b99714740a4bd'],
];

test('QR-codes komen overeen met de gecontroleerde uitkomsten', () => {
  for (const [tekst, n, verwacht] of GECONTROLEERD) {
    const m = maakQr(tekst);
    assert.equal(m.length, n, `afmeting voor ${tekst.slice(0, 30)}`);
    assert.ok(m.every((r) => r.length === n));
    assert.equal(hash(m), verwacht, `inhoud voor ${tekst.slice(0, 30)}`);
  }
});

test('QR-code heeft de vaste herkenningspatronen', () => {
  const m = maakQr('https://voorbeeld.nl/v/1');
  const n = m.length;
  for (const [r0, k0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    // Buitenrand donker, ring licht, kern donker
    for (let i = 0; i < 7; i++) {
      assert.equal(m[r0][k0 + i], true);
      assert.equal(m[r0 + 6][k0 + i], true);
      assert.equal(m[r0 + i][k0], true);
      assert.equal(m[r0 + i][k0 + 6], true);
    }
    assert.equal(m[r0 + 1][k0 + 1], false);
    assert.equal(m[r0 + 3][k0 + 3], true);
  }
  assert.equal(m[n - 8][8], true, 'het vaste donkere blokje');
});

test('te lange tekst wordt geweigerd met een duidelijke melding', () => {
  assert.throws(() => maakQr('g'.repeat(214)), /te lang/);
});

test('QR als svg: zwart op wit met witte rand', () => {
  const m = maakQr('A');
  const svg = qrAlsSvg(m, { blokje: 10 });
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /viewBox="0 0 290 290"/); // (21 + 2 × 4) × 10
  assert.match(svg, /fill="#ffffff"/);
  assert.match(svg, /fill="#000000"/);
  assert.doesNotMatch(svg, /<script|href=/);
});

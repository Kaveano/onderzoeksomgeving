// Automatische test van de gedeelde bouwstenen van de uitbreiding (BOUWPLAN P1, zonder server):
// opmaak.js, kenmerken.js, de vaste lijsten in schalen.js en privacy.js, en schaalScoreTelling.
// Uitvoeren: node --test test/fundament-basis.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as opmaak from '../public/js/beheer/opmaak.js';
import * as feiten from '../public/js/beheer/rapport-feiten.js';
import { KENMERKEN, KENMERKVRAGEN, KLASSEGRENZEN, LIEVER_NIET, KENMERK_THEMA, KENMERK_TOELICHTING } from '../public/js/beheer/kenmerken.js';
import * as privacy from '../public/js/beheer/privacy.js';
import { CIJFERSCHALEN, ENPS, DREMPEL } from '../src/lib/schalen.js';
import { schaalScore, schaalScoreTelling, bouwModel, waardenVan } from '../public/js/beheer/analyse-model.js';

// ---------- opmaak.js: precies dezelfde uitkomst als de functies die eerder in rapport-feiten.js stonden ----------

// Letterlijke kopie van de oude functies (rapport-feiten.js tot en met commit 9c64072), als referentie.
const OUD = (() => {
  const MIN = '−';
  const eindig = (x) => typeof x === 'number' && Number.isFinite(x);
  function nlGetal(x, decimalen = 1) {
    if (!eindig(x)) return '–';
    const t = x.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
    return /^-0(,0+)?$/.test(t) ? t.slice(1) : t.replace(/^-/, MIN);
  }
  function nlProcent(x) {
    return eindig(x) ? `${Math.round(x)}%` : '–';
  }
  function metTeken(x, decimalen = 1) {
    if (!eindig(x)) return '–';
    const afgerond = Number(x.toFixed(decimalen));
    if (afgerond === 0) return nlGetal(0, decimalen);
    return `${afgerond > 0 ? '+' : MIN}${nlGetal(Math.abs(afgerond), decimalen)}`;
  }
  function pTekst(p) {
    if (!eindig(p)) return 'p onbekend';
    return p < 0.001 ? 'p < 0,001' : `p = ${nlGetal(p, 3)}`;
  }
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  function nlDatum(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1] || ''} ${m[1]}`;
  }
  return { nlGetal, nlProcent, metTeken, pTekst, nlDatum };
})();

let zaad = 20261127;
const willekeurig = () => {
  zaad = (zaad * 1664525 + 1013904223) % 4294967296;
  return zaad / 4294967296;
};
const GETALLEN = [
  0, -0, 0.04, -0.04, 0.05, -0.05, 0.049999, 0.5, -0.5, 1, -1, 2.25, -2.25, 3.14159, 12, 1234.5, -1234.5, 1e6, 1e21, -1e21,
  0.0005, 0.000999, 0.001, 0.0010001, 0.036, 0.5, 0.9999, 1e-12, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE,
  Number.NaN, Infinity, -Infinity, null, undefined, '3', '', true, {}, [],
  ...Array.from({ length: 300 }, () => (willekeurig() - 0.5) * 10 ** Math.floor(willekeurig() * 8 - 3)),
];
const DATUMS = ['2026-11-26', '2026-01-01T10:00:00Z', '2026-13-01', '2026-00-05', '2026-1-1', '', null, undefined, 20261126, 'gisteren', '0001-02-03'];

test('opmaak.js geeft precies dezelfde tekst als de oude functies uit rapport-feiten.js', () => {
  for (const x of GETALLEN) {
    for (const d of [undefined, 0, 1, 2, 3]) {
      assert.equal(opmaak.nlGetal(x, d), OUD.nlGetal(x, d), `nlGetal(${String(x)}, ${d})`);
      assert.equal(opmaak.metTeken(x, d), OUD.metTeken(x, d), `metTeken(${String(x)}, ${d})`);
    }
    assert.equal(opmaak.nlProcent(x), OUD.nlProcent(x), `nlProcent(${String(x)})`);
    assert.equal(opmaak.pTekst(x), OUD.pTekst(x), `pTekst(${String(x)})`);
  }
  for (const d of DATUMS) assert.equal(opmaak.nlDatum(d), OUD.nlDatum(d), `nlDatum(${String(d)})`);
  // Een paar vaste voorbeelden.
  assert.equal(opmaak.nlGetal(-0.04), '0,0');
  assert.equal(opmaak.nlGetal(-1234.5), '−1.234,5');
  assert.equal(opmaak.metTeken(0.36), '+0,4');
  assert.equal(opmaak.pTekst(0.036), 'p = 0,036');
  assert.equal(opmaak.pTekst(0.0004), 'p < 0,001');
  assert.equal(opmaak.nlProcent(47.6), '48%');
  assert.equal(opmaak.nlDatum('2026-11-26'), '26 november 2026');
});

test('rapport-feiten.js geeft de opmaak door vanuit opmaak.js (dezelfde functies)', () => {
  for (const naam of ['nlGetal', 'nlProcent', 'metTeken', 'pTekst', 'nlDatum']) {
    assert.equal(typeof opmaak[naam], 'function', naam);
    assert.equal(feiten[naam], opmaak[naam], naam);
  }
});

// ---------- Vaste lijsten ----------

test('schalen.js: cijferschalen, eNPS-grenzen en de drempel uit privacy.js', () => {
  assert.deepEqual(CIJFERSCHALEN, {
    nps: { min: 0, max: 10, laag: 'Zeer onwaarschijnlijk', hoog: 'Zeer waarschijnlijk', naam: 'Aanbevelen (0 tot 10)' },
    rapport: { min: 1, max: 10, laag: 'Zeer slecht', hoog: 'Uitstekend', naam: 'Rapportcijfer (1 tot 10)' },
  });
  assert.deepEqual(ENPS, { promotorVanaf: 9, criticasterTot: 6 });
  assert.equal(DREMPEL, 5);
  assert.equal(DREMPEL, privacy.DREMPEL);
});

test('privacy.js: de drempel kan omhoog, nooit omlaag', () => {
  assert.equal(privacy.VERBORGEN, '×');
  assert.equal(privacy.VERBORGEN_UITLEG, '× = niet getoond: minder dan 5 respondenten, of verborgen zodat een klein aantal niet terug te rekenen is.');
  assert.equal(privacy.LABEL_OVERIG, 'Overige groepen samen');
  assert.equal(privacy.drempelVan(undefined), 5);
  assert.equal(privacy.drempelVan({}), 5);
  assert.equal(privacy.drempelVan({ drempel: 3 }), 5);
  assert.equal(privacy.drempelVan({ drempel: 0 }), 5);
  assert.equal(privacy.drempelVan({ drempel: 'x' }), 5);
  assert.equal(privacy.drempelVan({ drempel: 8 }), 8);
});

test('kenmerken.js: de afgesproken kenmerken met hun naam, rol en volgorde', () => {
  assert.deepEqual(Object.keys(KENMERKEN), [
    'afdeling', 'leeftijd', 'geslacht', 'diensttijd', 'contract', 'uren', 'functieniveau', 'leidinggevend', 'locatie', 'opleiding', 'overig',
  ]);
  const geordend = Object.keys(KENMERKEN).filter((k) => KENMERKEN[k].geordend);
  assert.deepEqual(geordend.sort(), ['diensttijd', 'functieniveau', 'leeftijd', 'opleiding', 'uren']);
  for (const [k, v] of Object.entries(KENMERKEN)) {
    assert.equal(typeof v.naam, 'string', k);
    assert.ok(v.naam.length > 0, k);
    assert.equal(typeof v.geordend, 'boolean', k);
  }
  assert.equal(KENMERKEN.diensttijd.rol, 'datum_in');
  assert.equal(KENMERKEN.overig.rol, null);
  assert.equal(KENMERKEN.overig.meerdere, true);
  assert.equal(LIEVER_NIET, 'Dat zeg ik liever niet');
  assert.equal(KENMERK_THEMA, 'Achtergrond');
  assert.match(KENMERK_TOELICHTING, /minder dan 5 personen/);
});

test('kenmerken.js: standaard achtergrondvragen met klassegrenzen bij elke getalsgroep', () => {
  assert.deepEqual(Object.keys(KENMERKVRAGEN).sort(), Object.keys(KENMERKEN).filter((k) => k !== 'overig').sort());
  for (const [k, v] of Object.entries(KENMERKVRAGEN)) {
    assert.ok(v.type === 'meerkeuze' || v.type === 'janee', k);
    assert.ok(v.tekst.endsWith('?'), k);
    assert.ok(Array.isArray(v.opties), k);
    if (v.type === 'meerkeuze') assert.ok(v.opties.length >= 3, k);
    const labels = v.opties.map((o) => o.label);
    assert.equal(new Set(labels).size, labels.length, `${k}: dubbele opties`);
  }
  // Teksten die al in de sjablonen staan, blijven gelijk (zo worden ze niet dubbel toegevoegd).
  assert.equal(KENMERKVRAGEN.afdeling.tekst, 'Op welke afdeling werk je?');
  assert.equal(KENMERKVRAGEN.diensttijd.tekst, 'Hoe lang werk je al bij {bedrijf}?');
  assert.equal(KENMERKVRAGEN.leidinggevend.tekst, 'Geef je zelf leiding aan een of meer medewerkers?');
  assert.equal(KENMERKVRAGEN.leidinggevend.type, 'janee');
  // Leeftijd: grof (standaard) en fijn.
  assert.equal(KENMERKVRAGEN.leeftijd.standaard, 'grof');
  assert.equal(KENMERKVRAGEN.leeftijd.opties, KENMERKVRAGEN.leeftijd.varianten.grof);
  assert.deepEqual(KENMERKVRAGEN.leeftijd.varianten.grof.map((o) => o.label), ['Jonger dan 35 jaar', '35 tot 55 jaar', '55 jaar of ouder', LIEVER_NIET]);
  assert.equal(KENMERKVRAGEN.leeftijd.varianten.fijn.length, 6);
  // Klassen sluiten zonder gat op elkaar aan: [van, tot), de eerste zonder ondergrens, de laatste zonder bovengrens.
  for (const opties of [KENMERKVRAGEN.leeftijd.varianten.grof, KENMERKVRAGEN.leeftijd.varianten.fijn, KENMERKVRAGEN.diensttijd.opties, KENMERKVRAGEN.uren.opties]) {
    const klassen = opties.filter((o) => o.eenheid);
    assert.equal(klassen[0].van, null);
    assert.equal(klassen[klassen.length - 1].tot, null);
    for (let i = 1; i < klassen.length; i++) assert.equal(klassen[i].van, klassen[i - 1].tot);
    assert.ok(opties.every((o) => o.eenheid || o.label === LIEVER_NIET));
  }
  assert.deepEqual(KLASSEGRENZEN['35 tot 55 jaar'], { van: 35, tot: 55, eenheid: 'jaar' });
  assert.deepEqual(KLASSEGRENZEN['Korter dan 3 maanden'], { van: null, tot: 3, eenheid: 'maand' });
  assert.deepEqual(KLASSEGRENZEN['Een jaar of langer'], { van: 12, tot: null, eenheid: 'maand' });
  assert.deepEqual(KLASSEGRENZEN['35 uur of meer'], { van: 35, tot: null, eenheid: 'uur' });
  assert.equal(KLASSEGRENZEN[LIEVER_NIET], undefined);
  // Alles is gewone JSON (GET /instellingen stuurt het mee).
  assert.deepEqual(JSON.parse(JSON.stringify(KENMERKVRAGEN)).uren, KENMERKVRAGEN.uren);
});

// ---------- schaalScoreTelling (BOUWPLAN B7) ----------

test('schaalScoreTelling: dezelfde scores als schaalScore, plus het aantal weggevallen respondenten', () => {
  const vragen = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const inz = [
    { 1: 4, 2: 5, 3: 3, 4: 4 }, // volledig
    { 1: 2, 2: 3 }, // precies de helft: telt mee
    { 1: 5 }, // minder dan de helft: weggevallen
    { 1: 'weet_niet', 2: 'weet_niet', 3: 4 }, // één geldig antwoord: weggevallen
    {}, // niets ingevuld: niet weggevallen (telt ook op het dashboard niet mee)
    { 1: 'weet_niet', 5: 3 }, // geen geldig antwoord op deze vragen: niet weggevallen
    { 1: 6, 2: 0, 3: 2.5, 4: 2 }, // alleen het antwoord op vraag 4 is geldig (1 tot 5, geheel): weggevallen
  ];
  const uit = schaalScoreTelling(vragen, inz);
  assert.deepEqual(uit.scores, inz.map((a) => schaalScore(vragen, a)));
  assert.deepEqual(uit.scores, [4, 2.5, null, null, null, null, null]);
  assert.equal(uit.weggevallen, 3);
  assert.deepEqual(schaalScoreTelling(vragen, []), { scores: [], weggevallen: 0 });
  assert.deepEqual(schaalScoreTelling([], [{ 1: 3 }]), { scores: [null], weggevallen: 0 });
});

test('schaalScoreTelling geeft voor een thema dezelfde scores als waardenVan', () => {
  const data = {
    themas: [{ id: 7, naam: 'Werkdruk' }],
    vragenlijsten: [{ id: 1, titel: 'Lijst' }],
    vragen: [
      { id: 11, vragenlijst_id: 1, thema_id: 7, type: 'schaal', tekst: 'a' },
      { id: 12, vragenlijst_id: 1, thema_id: 7, type: 'schaal', tekst: 'b' },
      { id: 13, vragenlijst_id: 1, thema_id: 7, type: 'schaal', tekst: 'c' },
      { id: 14, vragenlijst_id: 1, thema_id: 7, type: 'open', tekst: 'd' },
    ],
    inzendingen: [
      { vragenlijst_id: 1, antwoorden: { 11: 4, 12: 4, 13: 2 } },
      { vragenlijst_id: 1, antwoorden: { 11: 5, 14: 'tekst' } },
      { vragenlijst_id: 1, antwoorden: { 12: 3, 13: 3 } },
    ],
  };
  const lijst = bouwModel(data).lijsten[0];
  const schaalvragen = lijst.vragen.filter((q) => q.type === 'schaal');
  const uit = schaalScoreTelling(schaalvragen, lijst.inz);
  assert.deepEqual(uit.scores, waardenVan(lijst, 't:7'));
  assert.equal(uit.weggevallen, 1);
});

// ---------- Momentopname van rapporten met v1-feiten (P1; P6 criterium 1) ----------

test('momentopname: rapportNaarBlokken geeft voor v1-feiten (nieuw en oud) precies de vastgelegde blokken', () => {
  const pad = new URL('./fixtures/rapport-v1-blokken.json', import.meta.url);
  const { gevallen } = JSON.parse(readFileSync(pad, 'utf8'));
  assert.equal(gevallen.length, 3);
  for (const g of gevallen) {
    assert.equal(g.feiten.versie, 1, g.naam);
    const blokken = feiten.rapportNaarBlokken({ titel: g.titel, soort: g.soort, inhoud: g.inhoud, feiten: g.feiten });
    assert.deepEqual(JSON.parse(JSON.stringify(blokken)), g.blokken, g.naam);
  }
  // Oude feiten (zonder beschermd) worden bij het tonen even streng gemaskeerd als nieuwe.
  const tekst = (g) => feiten.blokkenNaarTekst(g.blokken);
  assert.equal((tekst(gevallen[2]).match(/×/g) || []).length, (tekst(gevallen[0]).match(/×/g) || []).length);
});

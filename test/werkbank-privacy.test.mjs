// Privacytests van de werkbank (BOUWPLAN P4 criterium 2 en 6, D2 §13.3): regels A–E en G met concrete scenario's,
// plus B6 (twee waarden), B7 (weggevallen respondenten), B26 (frequenties zonder selectie) en "nooit de datum".
// Uitvoeren: node --test test/werkbank-privacy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lcg, maakExport, maakBestand } from './werkbank-fixture.mjs';
import { beschermIndeling, verbergMet, maskeerMetBuren, controleerOverlap, ordeStatistieken } from '../public/js/beheer/werkbank/privacy-selectie.js';
import { maakRekenkern } from '../public/js/beheer/werkbank/rekenkern.js';
import { uitvoerNaarBlokken, P_FILTER_REST, P_WEGGEVALLEN, P_GEEN_TOETS, P_CEL, P_LOGIT_CEL, P_SAMENGEVOEGD, P_SCHEIDING, P_LIJST_BUUR } from '../public/js/beheer/werkbank/uitvoer-tekst.js';
import { pOverlap } from '../public/js/beheer/werkbank/transformaties.js';
import { analysesVoorRapport, TE_GROOT } from '../public/js/beheer/werkbank/rapport.js';
import { DREMPEL, LABEL_OVERIG, VERBORGEN, VERBORGEN_UITLEG, verbergReeks, maskeerKruistabel } from '../public/js/beheer/privacy.js';
import { TOETS_WEGGEVALLEN } from '../public/js/beheer/rapport-feiten.js';
import { dashboardUitRijen, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';
import { CIJFERSCHALEN, SCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';

const METHODEN = new Set(['welch', 'student', 'levene', 'mannwhitney', 'anova', 'welchanova', 'gameshowell', 'tukey', 'kruskal', 'dunn', 'pearson',
  'spearman', 'holm', 'chi2', 'fisher', 'chi2-aanpassing', 'cronbach', 'regressie', 'logistisch', 'gepaard-t', 'wilcoxon', 'pca', 'paf', 'varimax']);

let volgnr = 0;
/** Een eigen dataset als bron, met definities (selecties, indelingen, eigenschappen) voor dataset 1. */
function bron(kolommen, rijen, definities = []) {
  const kern = maakRekenkern();
  const defs = definities.map((d) => ({ dataset_id: 1, label: d.naam || `def${d.id}`, naam: `def${d.id}`, verwijderd: false, ...d }));
  kern.stel({ data: null, datasets: [{ id: 1, naam: 'Testbestand', kolommen, rijen }], definities: defs });
  return {
    kern,
    run: (procedure, variabelen, { filter = null, opties = {}, streng = false } = {}) => kern.voerUit({ versie: 1, bron: { soort: 'dataset', id: 1 }, filter, procedure, variabelen, opties }, { streng, nu: '2026-11-27' }),
  };
}

const tabellen = (u) => u.onderdelen.filter((o) => o.soort === 'tabel');
const meldingen = (u) => u.onderdelen.filter((o) => o.soort === 'melding').map((o) => o.tekst);
const rijMet = (t, label) => t.rijen.find((r) => r[0].t === label);
const kolom = (t, naam) => t.kop.findIndex((k) => k.tekst === naam);

test('scenario 1: beschermIndeling([12, 3, 8, 6]) → {0}, {2}, {1, 3}; met "Niet ingevuld" als eigen groep zoals het dashboard', () => {
  const b = beschermIndeling([12, 3, 8, 6], ['A', 'B', 'C', 'D']);
  assert.deepEqual(b.groepen.map((g) => g.categorieen), [[0], [2], [1, 3]]);
  assert.equal(b.groepen[2].label, LABEL_OVERIG);
  assert.equal(b.bruikbaar, true);
  assert.equal(b.leegGroep, -1);
  // A 12, B 3, C 8 en 6 die de vraag oversloegen: "Niet ingevuld" (6) gaat met B samen, net als op het dashboard.
  const m = beschermIndeling([12, 3, 8], ['A', 'B', 'C'], 5, { nietIngevuld: 6, achtergrond: true });
  assert.deepEqual(m.groepen.map((g) => [g.labels, g.n]), [[['A'], 12], [['C'], 8], [['B'], 9]]);
  assert.equal(m.leegGroep, 2);
  assert.equal(m.groepen[2].metLeeg, true);
  // "Niet ingevuld" groot genoeg en niet nodig om aan te vullen: apart (doet in de werkbank niet mee).
  const apart = beschermIndeling([12, 6, 8], ['A', 'B', 'C'], 5, { nietIngevuld: 7, achtergrond: true });
  assert.equal(apart.leegApart, true);
  assert.equal(apart.leegGroep, -1);
  assert.deepEqual(apart.groepen.map((g) => g.labels), [['A'], ['B'], ['C']]);
});

test('scenario 2 en 3: één reeks en kruistabellen zoals privacy.js (ook op 200 willekeurige tabellen)', () => {
  assert.deepEqual(verbergMet([12, 3, 0, 7]), [false, true, true, true]);
  assert.deepEqual(verbergMet([20, 6, 8]), [false, false, false]);
  const r = lcg(5);
  for (let i = 0; i < 200; i++) {
    const reeks = Array.from({ length: 2 + r.geheel(5) }, () => (r.getal() < 0.4 ? r.geheel(4) : r.geheel(30)));
    assert.deepEqual(verbergMet(reeks), verbergReeks(reeks));
    const tabel = Array.from({ length: 2 + r.geheel(3) }, () => Array.from({ length: 2 + r.geheel(3) }, () => (r.getal() < 0.3 ? r.geheel(4) : r.geheel(25))));
    assert.deepEqual(maskeerMetBuren(tabel), maskeerKruistabel(tabel));
  }
  assert.deepEqual(maskeerMetBuren([[10, 2], [7, 9]]), maskeerKruistabel([[10, 2], [7, 9]]));
});

// 40 rijen: afdeling A 20 / B 17 / C 3 (C gaat met B samen), een leeftijd en een score.
function afdelingen() {
  const rijen = [];
  for (let i = 0; i < 40; i++) {
    const afd = i < 20 ? 'A' : i < 37 ? 'B' : 'C';
    rijen.push([afd, 20 + i, Math.round((2 + (i % 7) * 0.45) * 100) / 100]);
  }
  return rijen;
}

test('scenario 4: selectie "afdeling is niet A" mag (20 verschil); 3 mensen buiten een leeftijdsselectie niet', async () => {
  const b = bron(['Afdeling', 'Leeftijd', 'Score'], afdelingen(), [
    { id: 1, soort: 'filter', definitie: { voorwaarden: [{ variabele: 'd:0', niet: ['a'] }] } },
    { id: 2, soort: 'filter', definitie: { voorwaarden: [{ variabele: 'd:1', tot: 56 }] } },
  ]);
  const ds = b.kern.dataset({ soort: 'dataset', id: 1 });
  assert.deepEqual(ds.perId.get('d:0').beschermd.groepen.map((g) => g.labels), [['A'], ['B', 'C']]);
  const goed = await b.run('beschrijvend', { variabelen: ['d:2'] }, { filter: 1 });
  assert.ok(!goed.geweigerd, meldingen(goed).join(' '));
  assert.equal(goed.gegevens.n, 20);
  const fout = await b.run('beschrijvend', { variabelen: ['d:2'] }, { filter: 2 });
  assert.equal(fout.geweigerd, true);
  assert.deepEqual(meldingen(fout), [P_FILTER_REST]);
});

test('scenario 5: kruistabel met selectie – cel 7 zonder en 5 met selectie (verschil 2) wordt verborgen, met aanvulling', async () => {
  const rijen = [];
  const voeg = (x, y, inS, uitS) => {
    for (let i = 0; i < inS; i++) rijen.push([x, y, 'in']);
    for (let i = 0; i < uitS; i++) rijen.push([x, y, 'uit']);
  };
  voeg('p', 'j', 5, 2);
  voeg('p', 'n', 10, 10);
  voeg('q', 'j', 8, 7);
  voeg('q', 'n', 15, 10);
  const b = bron(['X', 'Y', 'Z'], rijen, [{ id: 3, soort: 'filter', definitie: { voorwaarden: [{ variabele: 'd:2', is: ['in'] }] } }]);
  const zonder = await b.run('kruistabel', { rij: 'd:0', kolom: 'd:1' }, { opties: { procenten: 'geen' } });
  const kz = tabellen(zonder)[0];
  assert.equal(rijMet(kz, 'p')[1].w, 7);
  assert.ok(!kz.rijen.some((r) => r.some((c) => c.verborgen)));
  const met = await b.run('kruistabel', { rij: 'd:0', kolom: 'd:1' }, { filter: 3, opties: { procenten: 'geen' } });
  const km = tabellen(met)[0];
  assert.equal(rijMet(km, 'p')[1].verborgen, true, 'de cel met verschil 2 is verborgen');
  // Elke lijn met een verborgen cel heeft er minstens twee, samen minstens 5.
  const T = [[5, 10], [8, 15]];
  const V = km.rijen.slice(0, 2).map((r) => r.slice(1, 3).map((c) => !!c.verborgen));
  for (let i = 0; i < 2; i++) {
    const weg = [0, 1].filter((j) => V[i][j]);
    if (weg.length) assert.ok(weg.length >= 2 && weg.reduce((t, j) => t + T[i][j], 0) >= 5);
  }
  for (let j = 0; j < 2; j++) {
    const weg = [0, 1].filter((i) => V[i][j]);
    if (weg.length) assert.ok(weg.length >= 2 && weg.reduce((t, i) => t + T[i][j], 0) >= 5);
  }
  assert.ok(meldingen(met).includes(P_GEEN_TOETS), 'geen toets bij een verborgen cel');
  assert.equal(met.methoden.length, 0);
});

test('scenario 6: indeling [<41, ≥41] naast [<40, ≥40] met 2 mensen van 40 wordt geweigerd ("tussen 40 en 41"), ook na zacht verwijderen', () => {
  const rijen = [];
  for (let i = 0; i < 60; i++) rijen.push([20 + (i % 40) + (i < 2 ? 0 : 0), 'x']);
  // Precies twee mensen van 40 jaar; verder niemand van 40.
  const leeftijden = Array.from({ length: 60 }, (_, i) => (i < 2 ? 40 : i % 2 ? 25 + (i % 15) : 45 + (i % 15)));
  const data = leeftijden.map((l) => [l, 'x']);
  const oud = { id: 10, soort: 'hercoderen', definitie: { variabele: 'd:0', manier: 'grenzen', grenzen: [40], labels: ['jonger dan 40', '40 of ouder'] } };
  const nieuw = { soort: 'hercoderen', naam: 'nieuw', label: 'leeftijd41', definitie: { variabele: 'd:0', manier: 'grenzen', grenzen: [41], labels: ['jonger dan 41', '41 of ouder'] } };
  const b = bron(['Leeftijd', 'Tekst'], data, [oud]);
  b.kern.laad({ data: null, datasets: [{ id: 1, naam: 'T', kolommen: ['Leeftijd', 'Tekst'], rijen: data }], definities: [{ ...oud, dataset_id: 1, naam: 'oud', label: 'Leeftijd in twee groepen', verwijderd: false }], bron: { soort: 'dataset', id: 1 } });
  const c = b.kern.controleerIndeling(nieuw, { soort: 'dataset', id: 1 });
  assert.equal(c.ok, false);
  assert.ok(c.meldingen.includes(pOverlap('Leeftijd in twee groepen', 'tussen 40 en 41')), c.meldingen.join(' | '));
  // Zonder mensen van 40: mag.
  const zonder40 = data.map(([l, t]) => [l === 40 ? 39 : l, t]);
  b.kern.laad({ data: null, datasets: [{ id: 1, naam: 'T', kolommen: ['Leeftijd', 'Tekst'], rijen: zonder40 }], definities: [{ ...oud, dataset_id: 1, naam: 'oud', label: 'Leeftijd in twee groepen', verwijderd: false }], bron: { soort: 'dataset', id: 1 } });
  assert.equal(b.kern.controleerIndeling(nieuw, { soort: 'dataset', id: 1 }).ok, true);
  // Na zacht verwijderen van de eerste telt die nog steeds mee.
  b.kern.laad({ data: null, datasets: [{ id: 1, naam: 'T', kolommen: ['Leeftijd', 'Tekst'], rijen: data }], definities: [{ ...oud, dataset_id: 1, naam: 'oud', label: 'Leeftijd in twee groepen', verwijderd: true }], bron: { soort: 'dataset', id: 1 } });
  assert.equal(b.kern.controleerIndeling(nieuw, { soort: 'dataset', id: 1 }).ok, false);
  // En bij het uitvoeren met beide indelingen: geweigerd.
  const beide = bron(['Leeftijd', 'Score'], data.map(([l], i) => [l, (i % 5) + 0.5]), [oud, { ...nieuw, id: 11 }]);
  return beide.run('pergroep', { afhankelijk: ['d:1'], groep: 'w:11' }).then((u) => {
    assert.equal(u.geweigerd, true);
    assert.match(meldingen(u)[0], /lijkt te veel op/);
  });
  void rijen;
});

test('scenario 7: regressie met een voorspellergroep van 3 in de steekproef → samen met de kleinste andere groep; de kolommen kloppen', async () => {
  // Afdeling A 20, B 15, C 7 (van wie 4 zonder score: in de steekproef 3), D 9. Over de hele bron is C groot genoeg.
  const rijen = [];
  const r = lcg(77);
  const voeg = (afd, n, zonderScore = 0) => {
    for (let i = 0; i < n; i++) rijen.push([afd, Math.round(r.getal() * 500) / 100 + 0.01, i < zonderScore ? null : Math.round((2 + r.getal() * 3) * 100) / 100 + 0.001]);
  };
  voeg('A', 20);
  voeg('B', 15);
  voeg('C', 7, 4);
  voeg('D', 9);
  const b = bron(['Afdeling', 'X', 'Score'], rijen);
  const ds = b.kern.dataset({ soort: 'dataset', id: 1 });
  assert.deepEqual(ds.perId.get('d:0').beschermd.groepen.map((g) => g.labels), [['A'], ['B'], ['C'], ['D']], 'over de hele bron niets samengevoegd');
  const u = await b.run('regressie', { afhankelijk: 'd:2', voorspellers: ['d:1', 'd:0'] });
  assert.ok(!u.geweigerd, meldingen(u).join(' '));
  assert.equal(u.gegevens.n, 47);
  const coef = tabellen(u).find((t) => t.id === 'coef-1');
  assert.deepEqual(coef.rijen.map((x) => x[0].t), ['(Constante)', 'X', 'Afdeling: B', `Afdeling: ${LABEL_OVERIG}`], 'kolommen: X, B en de samengevoegde groep; A is de referentie');
  const groepen = tabellen(u).find((t) => t.id === 'groepen');
  assert.deepEqual(groepen.rijen.map((x) => [x[1].t, x[2].w, x[3].t]), [['A', 20, 'referentiegroep'], ['B', 15, 'apart in het model'], [LABEL_OVERIG, 12, 'apart in het model']]);
  assert.deepEqual(groepen.samenstelling.map((x) => x.labels), [['A'], ['B'], ['C', 'D']]);
  assert.ok(meldingen(u).includes(`Afdeling: ${P_SAMENGEVOEGD(['C', 'D'])}`), meldingen(u).join(' | '));
  assert.ok(u.kleinste_n >= DREMPEL);
  assert.deepEqual(u.methoden, ['regressie']);
  // Met de laatste groep als referentie.
  const laatste = await b.run('regressie', { afhankelijk: 'd:2', voorspellers: ['d:0'] }, { opties: { referentie: 'laatste' } });
  assert.deepEqual(tabellen(laatste).find((t) => t.id === 'coef-1').rijen.map((x) => x[0].t), ['(Constante)', 'Afdeling: A', 'Afdeling: B']);
});

test('scenario 8: logistische regressie met een cel voorspeller × uitkomst van 2 → geweigerd (P_LOGIT_CEL); met 5 of meer mag het', async () => {
  const maak = (jaB) => {
    const rijen = [];
    const r = lcg(8);
    const voeg = (afd, ja, nee) => {
      for (let i = 0; i < ja; i++) rijen.push([afd, 'ja', Math.round(r.getal() * 400) / 100 + 0.01]);
      for (let i = 0; i < nee; i++) rijen.push([afd, 'nee', Math.round(r.getal() * 400) / 100 + 0.01]);
    };
    voeg('A', 8, 12);
    voeg('B', jaB, 25 - jaB);
    return bron(['Afdeling', 'Vertrek', 'Werkdruk'], rijen);
  };
  const fout = await maak(2).run('logistisch', { uitkomst: 'd:1', voorspellers: ['d:2', 'd:0'] }, { opties: { gebeurtenis: 'ja' } });
  assert.equal(fout.geweigerd, true);
  assert.deepEqual(meldingen(fout), [P_LOGIT_CEL('Afdeling', 'ja')]);
  const goed = await maak(7).run('logistisch', { uitkomst: 'd:1', voorspellers: ['d:2', 'd:0'] }, { opties: { gebeurtenis: 'ja' } });
  assert.ok(!goed.geweigerd, meldingen(goed).join(' '));
  assert.deepEqual(goed.methoden, ['logistisch']);
  assert.ok(goed.kleinste_n >= DREMPEL);
  // De classificatietabel is gemaskeerd zoals een kruistabel: geen zichtbare aantallen van 0 tot 4.
  const klas = tabellen(goed).find((t) => t.id === 'classificatie');
  for (const rij of klas.rijen.slice(0, 2)) for (const c of rij.slice(1, 3)) assert.ok(c.verborgen || c.w >= DREMPEL);
  // Een getal met twee waarden als voorspeller telt als indeling: elke waarde × uitkomst minstens 5 (anders geweigerd),
  // en een waarde die bij minder dan 5 mensen voorkomt, laat die voorspeller weg (met een melding).
  const metThuis = (grens) => {
    const k = maakRekenkern();
    k.stel({ data: null, datasets: [{ id: 1, naam: 'T', kolommen: ['Afdeling', 'Vertrek', 'Werkdruk', 'Thuis'], rijen: Array.from({ length: 45 }, (_, i) => [i < 20 ? 'A' : 'B', i < 8 || (i >= 20 && i < 27) ? 'ja' : 'nee', 1 + (i % 7) * 0.37, i < grens ? 1.5 : 2.5]) }], definities: [] });
    return k.voerUit({ versie: 1, bron: { soort: 'dataset', id: 1 }, filter: null, procedure: 'logistisch', variabelen: { uitkomst: 'd:1', voorspellers: ['d:2', 'd:3'] }, opties: {} });
  };
  const zesJa = await metThuis(6); // de 6 mensen met 1,5 hebben allemaal "ja": cel (1,5; nee) = 0
  assert.equal(zesJa.geweigerd, true);
  assert.deepEqual(meldingen(zesJa), [P_LOGIT_CEL('Thuis', 'ja')]);
  const drie = await metThuis(3);
  assert.ok(!drie.geweigerd, meldingen(drie).join(' '));
  assert.ok(meldingen(drie).some((m) => /^“Thuis” heeft maar twee waarden/.test(m)));
  assert.ok(!tabellen(drie).find((t) => t.id === 'coef').rijen.some((r) => r[0].t === 'Thuis'), 'Thuis doet niet mee');
});

test('logistische regressie: (bijna) volledige scheiding wordt geweigerd; de uitkomst moet precies twee groepen hebben', async () => {
  const rijen = Array.from({ length: 40 }, (_, i) => [i < 20 ? 'nee' : 'ja', i + 0.25, ['p', 'q', 'r'][i % 3]]);
  const b = bron(['Vertrek', 'Score', 'Groep'], rijen);
  const u = await b.run('logistisch', { uitkomst: 'd:0', voorspellers: ['d:1'] });
  assert.equal(u.geweigerd, true);
  assert.deepEqual(meldingen(u), [P_SCHEIDING]);
  const drie = await b.run('logistisch', { uitkomst: 'd:2', voorspellers: ['d:1'] });
  assert.equal(drie.geweigerd, true);
  assert.match(meldingen(drie)[0], /precies twee groepen/);
});

test('scenario 9: correlatie met ja/nee waar "ja" 4 keer voorkomt → ×', async () => {
  const rijen = Array.from({ length: 40 }, (_, i) => [i < 4 ? 'ja' : 'nee', 1 + (i % 9) * 0.5, 2 + (i % 7) * 0.3]);
  const b = bron(['Vertrek', 'Score', 'Andere'], rijen);
  const u = await b.run('correlatie', { variabelen: ['d:0', 'd:1', 'd:2'] });
  const t = tabellen(u)[0];
  assert.equal(t.rijen[0][2].verborgen, true, 'ja/nee met 4 × ja');
  assert.ok(Number.isFinite(t.rijen[1][3].w), 'de twee scores wel');
});

test('scenario 10: beschrijvend van 1..20 → minimum* 5 en maximum* 16; bij n = 7 allebei "–"', async () => {
  const b = bron(['x'], Array.from({ length: 20 }, (_, i) => [i + 1 + 0.001 * 0]));
  const ds = b.kern.dataset({ soort: 'dataset', id: 1 });
  assert.equal(ds.perId.get('d:0').soort, 'getal');
  const u = await b.run('beschrijvend', { variabelen: ['d:0'] });
  const t = tabellen(u)[0];
  assert.equal(t.rijen[0][kolom(t, 'Minimum*')].w, 5);
  assert.equal(t.rijen[0][kolom(t, 'Maximum*')].w, 16);
  assert.deepEqual(ordeStatistieken([1, 2, 3, 4, 5, 6, 7]), { minimum: null, maximum: null, mediaan: null, q1: null, q3: null });
  const klein = bron(['x'], Array.from({ length: 7 }, (_, i) => [i * 1.5 + 0.25]));
  const k = tabellen(await klein.run('beschrijvend', { variabelen: ['d:0'] }))[0];
  assert.equal(k.rijen[0][kolom(k, 'Minimum*')].w, null);
  assert.equal(k.rijen[0][kolom(k, 'Maximum*')].w, null);
  assert.equal(k.rijen[0][kolom(k, 'Mediaan')].w, null);
});

test('scenario 11 en B26: verborgen categorie → geen cumulatieve kolom; meningsvraag zonder selectie toont 1–4, een kenmerk niet', async () => {
  const data = maakExport();
  const kern = maakRekenkern();
  kern.stel({ data });
  const spec = (v) => ({ versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'frequenties', variabelen: { variabelen: [v] }, opties: {} });
  // v:1009 (rapportcijfer, een meningsvraag) heeft waarden met 1 tot 4 respondenten.
  const mening = await kern.voerUit(spec('v:1009'));
  const tm = tabellen(mening).find((t) => t.id === 'freq-v:1009');
  const aantallen = tm.rijen.filter((r) => /^\d/.test(r[0].t)).map((r) => r[1]);
  assert.ok(aantallen.some((c) => !c.verborgen && c.w > 0 && c.w < 5), 'B26: kleine aantallen zichtbaar');
  assert.ok(kolom(tm, 'Cumulatief procent') >= 0);
  // Een kenmerk (afdeling in de vervolgmeting: Service is klein) verbergt ze, en dan vervalt de cumulatieve kolom.
  const kenmerk = await kern.voerUit({ ...spec('v:1000'), bron: { soort: 'lijst', id: 101 } });
  const tk = tabellen(kenmerk).find((t) => t.id === 'freq-v:1000');
  assert.ok(tk.rijen.some((r) => r[1].verborgen), 'kenmerk: verborgen cel');
  assert.ok(tk.rijen.every((r) => r[1].verborgen || !(r[1].w > 0 && r[1].w < 5)));
  assert.equal(kolom(tk, 'Cumulatief procent'), -1);
  // Streng (voor een rapport): ook de meningsvraag verbergt ze.
  const streng = await kern.voerUit(spec('v:1009'), { streng: true });
  const ts = tabellen(streng).find((t) => t.id === 'freq-v:1009');
  assert.ok(ts.rijen.every((r) => r[1].verborgen || !(r[1].w > 0 && r[1].w < 5)));
  assert.ok(streng.kleinste_n >= DREMPEL);
});

test('B6: een ja/nee-uitkomst als interval in pergroep, t-toets en ANOVA krijgt de kruistabelregel', async () => {
  // Groep C: 6 keer ja en 0 keer nee (een aandeel van 100% berust op een lege cel). Omdat de totalen van ja en
  // nee elders te zien zijn (frequenties), gaan ook andere groepen weg (aanvullend verbergen, zoals bij
  // maskeerKruistabel): hier blijft alleen D over.
  const rijen = [];
  for (let i = 0; i < 20; i++) rijen.push(['A', i % 3 ? 'ja' : 'nee']);
  for (let i = 0; i < 18; i++) rijen.push(['B', i % 2 ? 'ja' : 'nee']);
  for (let i = 0; i < 6; i++) rijen.push(['C', 'ja']);
  for (let i = 0; i < 22; i++) rijen.push(['D', i < 10 ? 'ja' : 'nee']);
  const b = bron(['Afdeling', 'Vertrek'], rijen, [{ id: 1, soort: 'eigenschappen', naam: '~eigenschappen', definitie: { variabelen: { 'd:1': { meetniveau: 'interval' } } } }]);
  const ds = b.kern.dataset({ soort: 'dataset', id: 1 });
  assert.equal(ds.perId.get('d:1').meetniveau, 'interval');
  const pg = await b.run('pergroep', { afhankelijk: ['d:1'], groep: 'd:0' });
  const t = tabellen(pg)[0];
  assert.deepEqual(t.rijen.map((r) => r[0].t), ['D', 'Totaal'], 'C (en ter bescherming A en B) staan er niet bij');
  assert.ok(meldingen(pg).some((m) => /maar twee waarden/.test(m)));
  const an = await b.run('anova', { afhankelijk: ['d:1'], factor: 'd:0' });
  assert.equal(an.geweigerd, true, 'ANOVA met één groep kan niet');
  // Zonder de lege cel (ook nee in C) mogen alle groepen.
  const b2 = bron(['Afdeling', 'Vertrek'], [...rijen, ...Array.from({ length: 6 }, () => ['C', 'nee'])], [{ id: 1, soort: 'eigenschappen', naam: '~eigenschappen', definitie: { variabelen: { 'd:1': { meetniveau: 'interval' } } } }]);
  assert.deepEqual(tabellen(await b2.run('pergroep', { afhankelijk: ['d:1'], groep: 'd:0' }))[0].rijen.map((r) => r[0].t), ['A', 'B', 'C', 'D', 'Totaal']);
  const tt = await b.run('ttoets', { afhankelijk: ['d:1'], groep: 'd:0' }, { opties: { groepen: ['a', 'c'] } });
  assert.equal(tt.geweigerd, true, 't-toets met C kan niet');
  // Regressie: een B per groep is dan een verschil in percentages; ook daar geldt de kruistabelregel.
  const rg = await b.run('regressie', { afhankelijk: 'd:1', voorspellers: ['d:0'] });
  assert.equal(rg.geweigerd, true, 'regressie met C kan niet');
  assert.match(meldingen(rg)[0], /^Bij “Afdeling” heeft niet elke groep minstens 5 mensen met en 5 mensen zonder/);
  const rg2 = await b2.run('regressie', { afhankelijk: 'd:1', voorspellers: ['d:0'] });
  assert.ok(!rg2.geweigerd, meldingen(rg2).join(' '));
  assert.ok(meldingen(rg2).some((m) => /logistische regressie past meestal beter/.test(m)));
});

test('B7: een themascore met 1 tot 4 weggevallen respondenten is niet te gebruiken', async () => {
  const data = maakExport();
  // Precies 3 respondenten van lijst 100 beantwoorden maar 1 van de 3 werkdrukvragen.
  let gedaan = 0;
  data.inzendingen = data.inzendingen.map((i, k) => {
    if (i.vragenlijst_id !== 100) return i;
    const a = { ...i.antwoorden, 1002: 1 + (k % 5), 1003: 1 + ((k + 2) % 5), 1012: 1 + ((k + 3) % 5) };
    if (gedaan < 3) { delete a[1003]; delete a[1012]; gedaan++; }
    return { ...i, antwoorden: a };
  });
  const kern = maakRekenkern();
  kern.stel({ data });
  const u = await kern.voerUit({ versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'beschrijvend', variabelen: { variabelen: ['t:10'] }, opties: {} });
  assert.equal(u.geweigerd, true);
  assert.match(meldingen(u)[0], /Te weinig|niet getoond|minstens/);
  const b = await kern.voerUit({ versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'beschrijvend', variabelen: { variabelen: ['t:10', 't:11'] }, opties: {} });
  const rij = tabellen(b)[0].rijen.find((r) => r[0].t === 'Werkdruk');
  assert.equal(rij[1].t, P_WEGGEVALLEN);
  assert.equal(P_WEGGEVALLEN, TOETS_WEGGEVALLEN);
  // Met 5 weggevallen mag het weer.
  let n = 0;
  data.inzendingen = data.inzendingen.map((i) => {
    if (i.vragenlijst_id !== 100 || n >= 2) return i;
    const a = { ...i.antwoorden };
    if (a[1003] !== undefined && a[1012] !== undefined) { delete a[1003]; delete a[1012]; n++; }
    return { ...i, antwoorden: a };
  });
  kern.stel({ data });
  const vijf = await kern.voerUit({ versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'beschrijvend', variabelen: { variabelen: ['t:10'] }, opties: {} });
  assert.ok(!vijf.geweigerd, meldingen(vijf).join(' '));
});

test('regel G en PR-12: geen datum, geen volgnummer, geen open antwoorden; × overal hetzelfde', async () => {
  const data = maakExport();
  const kern = maakRekenkern();
  const o = kern.laad({ data, bron: { soort: 'gestapeld', lijsten: 'alle' } });
  assert.ok(!o.variabelen.some((v) => /datum|respondent/i.test(`${v.id} ${v.naam}`)));
  const u = await kern.voerUit({ versie: 1, bron: { soort: 'lijst', id: 101 }, filter: null, procedure: 'frequenties', variabelen: { variabelen: ['v:1000'] }, opties: {} });
  const { blokken } = uitvoerNaarBlokken(u);
  const tekst = JSON.stringify(blokken);
  assert.ok(tekst.includes(VERBORGEN) && tekst.includes(VERBORGEN_UITLEG));
  assert.ok(!/<\s*5|minder dan 5\)/.test(blokken.filter((b) => b.soort === 'tabel').map((b) => JSON.stringify(b.rijen)).join('')), 'geen "<5" in cellen');
  assert.equal(P_CEL, VERBORGEN_UITLEG);
});

test('criterium 6: uitvoerNaarBlokken geeft alleen kop/alinea/lijst/tabel/feiten, kleinste_n ≥ 5 en bekende methoden', async () => {
  const data = maakExport();
  const kern = maakRekenkern();
  kern.stel({ data });
  const bronnen = [{ soort: 'lijst', id: 100 }, { soort: 'gestapeld', lijsten: 'alle' }];
  const specs = [
    ['frequenties', { variabelen: ['v:1000', 'v:1002', 'v:1006', 'v:1009'] }, {}],
    ['beschrijvend', { variabelen: ['t:11', 'v:1002', 'v:1008'] }, {}],
    ['pergroep', { afhankelijk: ['t:11', 'v:1004'], groep: 'v:1000' }, { percentielen: true }],
    ['kruistabel', { rij: 'v:1000', kolom: 'v:1005' }, { verwacht: true, residuen: true }],
    ['aanpassing', { variabele: 'v:1000' }, { verwacht: 'gelijk' }],
    ['ttoets', { afhankelijk: ['t:11'], groep: 'v:1005' }, { groepen: ['ja', 'nee'] }],
    ['anova', { afhankelijk: ['t:11', 'v:1004'], factor: 'v:1000' }, { posthoc: 'beide' }],
    ['correlatie', { variabelen: ['t:11', 'v:1002', 'v:1004', 'v:1008'] }, { methode: 'beide', holm: true }],
    ['betrouwbaarheid', { items: ['v:1002', 'v:1003', 'v:1004'] }, { omscoren: ['v:1004'] }],
  ];
  let getoetst = 0;
  for (const b of bronnen) {
    for (const [procedure, variabelen, opties] of specs) {
      const u = await kern.voerUit({ versie: 1, bron: b, filter: null, procedure, variabelen, opties }, { streng: true });
      if (u.geweigerd) continue;
      const r = uitvoerNaarBlokken(u);
      assert.ok(r.blokken.every((x) => ['kop', 'alinea', 'lijst', 'tabel', 'feiten'].includes(x.soort)), procedure);
      assert.ok(r.kleinste_n === null || r.kleinste_n >= DREMPEL, `${procedure}: kleinste_n ${r.kleinste_n}`);
      assert.ok(r.methoden.every((m) => METHODEN.has(m)), `${procedure}: ${r.methoden}`);
      for (const t of r.blokken.filter((x) => x.soort === 'tabel')) assert.ok(t.kop.length <= 20 && t.rijen.length <= 200);
      getoetst++;
    }
  }
  assert.ok(getoetst >= 14, `${getoetst} uitvoeren getoetst`);
});

test('criterium 6 voor regressie, logistisch, gepaard en factoranalyse: blokken, kleinste_n ≥ 5 en methoden', async () => {
  const data = maakExport({ nA: 160, nB: 90 });
  const kern = maakRekenkern();
  kern.stel({ data });
  const specs = [
    ['regressie', { afhankelijk: 't:11', voorspellers: ['v:1002', 'v:1003', 'v:1000'], blok2: ['v:1001'] }, {}, ['regressie']],
    ['logistisch', { uitkomst: 'v:1005', voorspellers: ['v:1002', 'v:1004'] }, { gebeurtenis: 'ja' }, ['logistisch']],
    ['gepaard', { x: ['v:1002', 'v:1004'], y: ['v:1003', 'v:1013'] }, {}, ['gepaard-t', 'wilcoxon']],
    ['factoranalyse', { items: ['v:1002', 'v:1003', 'v:1012', 'v:1004', 'v:1013'] }, { methode: 'paf', aantal: '2' }, ['paf', 'varimax']],
    ['factoranalyse', { items: ['v:1002', 'v:1003', 'v:1012', 'v:1004', 'v:1013'] }, { methode: 'pca', rotatie: 'geen' }, ['pca']],
  ];
  for (const b of [{ soort: 'lijst', id: 100 }, { soort: 'gestapeld', lijsten: 'alle' }]) {
    for (const [procedure, variabelen, opties, methoden] of specs) {
      if (b.soort === 'gestapeld' && procedure === 'factoranalyse') continue; // 1012 en 1013 staan alleen in lijst 100
      const u = await kern.voerUit({ versie: 1, bron: b, filter: null, procedure, variabelen, opties }, { streng: true });
      assert.ok(!u.geweigerd, `${procedure}: ${meldingen(u).join(' ')}`);
      assert.deepEqual(u.methoden, methoden, procedure);
      const r = uitvoerNaarBlokken(u);
      assert.ok(r.blokken.every((x) => ['kop', 'alinea', 'lijst', 'tabel', 'feiten'].includes(x.soort)), procedure);
      assert.ok(r.kleinste_n >= DREMPEL, `${procedure}: kleinste_n ${r.kleinste_n}`);
      assert.ok(r.methoden.every((m) => METHODEN.has(m)), `${procedure}: ${r.methoden}`);
      assert.ok(r.toetsen >= 1, procedure);
      for (const t of r.blokken.filter((x) => x.soort === 'tabel')) assert.ok(t.kop.length <= 20 && t.rijen.length <= 200);
      // Niets per persoon: geen residuen, kansen of factorscores in de uitvoer.
      assert.ok(!/"kans"|"residu"|factorscore/i.test(JSON.stringify(u.onderdelen)), procedure);
    }
  }
});

test('criterium 7: een bewaarde analyse draait op nieuwe gegevens; een verwijderde variabele geeft een duidelijke melding', async () => {
  const data = maakExport();
  data.werkbank_definities = [
    { id: 5, dataset_id: null, soort: 'bereken', naam: 'leiding', label: 'Leiding (eigen)', definitie: '{"functie":"gemiddelde","variabelen":["v:1004","v:1013"]}', verwijderd_op: null },
    { id: 6, dataset_id: null, soort: 'bereken', naam: 'oud', label: 'Oude werkdrukscore', definitie: '{"functie":"gemiddelde","variabelen":["v:1002","v:1003"]}', verwijderd_op: '2026-11-01 10:00:00' },
  ];
  const analyses = [
    { id: 1, titel: 'Leiding per afdeling', procedure: 'pergroep', spec: JSON.stringify({ versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'pergroep', variabelen: { afhankelijk: ['w:5'], groep: 'v:1000' }, opties: {} }) },
    { id: 2, titel: 'Weg', procedure: 'beschrijvend', spec: { versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'beschrijvend', variabelen: { variabelen: ['w:77'] }, opties: {} } },
    { id: 4, titel: 'Verwijderd', procedure: 'beschrijvend', spec: { versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'beschrijvend', variabelen: { variabelen: ['w:6', 'v:9999'] }, opties: {} } },
  ];
  const eerst = await analysesVoorRapport(data, [], data.werkbank_definities, analyses, { peildatum: '2026-11-27' });
  assert.equal(eerst[0].titel, 'Leiding per afdeling');
  assert.ok(eerst[0].blokken.length > 2);
  assert.equal(eerst[0].open, false);
  assert.ok(eerst[0].kleinste_n >= 5);
  // Nooit een intern nummer (“w:77”, “v:9999”) in de melding: de naam van een (zacht) verwijderde eigen variabele,
  // en anders een algemene zin (D2 §9.1).
  assert.equal(eerst[1].fout, 'Deze analyse gebruikt een variabele die niet meer bestaat (een vraag of eigen variabele die is verwijderd). Pas de analyse aan of verwijder hem.');
  assert.equal(eerst[2].fout, 'Deze analyse gebruikt een variabele die niet meer bestaat: “Oude werkdrukscore”. Pas de analyse aan of verwijder hem.');
  for (const f of eerst) assert.ok(!/[“"](v|w|t|m|d|c):\d/.test(f.fout || ''), f.fout);
  // Nieuwe gegevens: 20 extra antwoorden → andere n.
  const extra = data.inzendingen.filter((i) => i.vragenlijst_id === 100).slice(0, 20).map((i, k) => ({ ...i, id: 999000 + k }));
  data.inzendingen = [...data.inzendingen, ...extra];
  const daarna = await analysesVoorRapport(data, [], data.werkbank_definities, analyses, { peildatum: '2026-11-28' });
  const n = (f) => JSON.stringify(f.blokken).match(/n = (\d+)/)[1];
  assert.notEqual(n(eerst[0]), n(daarna[0]));
  // Een analyse op een open vragenlijst is gemarkeerd.
  const open = await analysesVoorRapport(data, [], [], [{ id: 3, titel: 'Open', procedure: 'frequenties', spec: { versie: 1, bron: { soort: 'lijst', id: 101 }, filter: null, procedure: 'frequenties', variabelen: { variabelen: ['v:1002'] }, opties: {} } }], { peildatum: '2026-11-27' });
  assert.equal(open[0].open, true);
  assert.equal(typeof TE_GROOT, 'string');
});

/** Alle getoonde aantallen van een uitvoer, per sleutel die de samenstelling beschrijft. */
function zichtbareAantallen(u, soort, wat) {
  const uit = new Map();
  for (const t of tabellen(u)) {
    if (soort === 'freq' && t.id.startsWith('freq-')) {
      for (const r of t.rijen) if (!r[1].verborgen && Number.isFinite(r[1].w)) uit.set(`${wat}|${r[0].t}`, r[1].w);
    }
    if (soort === 'pergroep' && t.id.startsWith('pergroep-')) {
      const groepen = t.rijen.filter((r) => r[0].t !== 'Totaal').map((r) => r[0].t);
      for (const r of t.rijen) {
        const sleutel = r[0].t === 'Totaal' ? `totaal|${groepen.join('+')}` : r[0].t;
        if (Number.isFinite(r[1].w)) uit.set(`${wat}|${sleutel}`, r[1].w);
      }
    }
    if (soort === 'beschrijvend' && t.id === 'beschrijvend') {
      for (const r of t.rijen) if (Number.isFinite(r[1]?.w)) uit.set(`${wat}|${r[0].t}`, r[1].w);
    }
    if (soort === 'regressie' && t.id === 'groepen') {
      t.rijen.forEach((r, i) => { if (Number.isFinite(r[2].w)) uit.set(`${wat}|${t.samenstelling[i].labels.join('+')}`, r[2].w); });
    }
    if (soort === 'kruis' && t.id === 'kruistabel') {
      const { rijen, kolommen, procentrijen } = t.samenstelling;
      const rr = t.rijen.filter((_, i) => !procentrijen || i % 2 === 0);
      rr.forEach((r, i) => {
        const rij = i < rijen.length ? rijen[i].join('+') : 'totaal';
        r.slice(1).forEach((c, j) => {
          const kol = j < kolommen.length ? kolommen[j].join('+') : 'totaal';
          if (!c.verborgen && Number.isFinite(c.w)) uit.set(`${wat}|${rij}|${kol}`, c.w);
        });
      });
    }
  }
  return uit;
}

test('scenario 12: "aanvaller" – geneste selecties geven nooit een verschil van 1 tot 4 in een getoond aantal', async () => {
  const r = lcg(2026);
  let vergeleken = 0;
  for (let ronde = 0; ronde < 14; ronde++) {
    const n = 25 + r.geheel(35);
    const rijen = Array.from({ length: n }, () => [
      r.kies(['a1', 'a1', 'a2', 'a3']),
      r.kies(['b1', 'b2', 'b2']),
      r.kies(['s1', 's1', 's2', 's3', 's4']),
      Math.round((1 + r.getal() * 4) * 100) / 100,
    ]);
    // Alle selecties met één voorwaarde op s: elke deelverzameling van de beschermde groepen van s.
    const b0 = bron(['A', 'B', 'S', 'Y'], rijen);
    const ds = b0.kern.dataset({ soort: 'dataset', id: 1 });
    const s = ds.perId.get('d:2');
    const groepen = s.beschermd.groepen.map((g) => g.labels.map((l) => l.toLowerCase()));
    const deelverzamelingen = [];
    for (let m = 1; m < 2 ** groepen.length - 1; m++) deelverzamelingen.push(groepen.filter((_, i) => m & (1 << i)));
    const definities = deelverzamelingen.map((dv, i) => ({ id: 100 + i, soort: 'filter', definitie: { voorwaarden: [{ variabele: 'd:2', is: dv.flat() }] } }));
    const b = bron(['A', 'B', 'S', 'Y'], rijen, definities);
    const uitvoeren = new Map(); // filter-id (of null) → aantallen
    for (const f of [null, ...definities.map((d) => d.id)]) {
      const alle = new Map();
      const u1 = await b.run('frequenties', { variabelen: ['d:0'] }, { filter: f });
      if (!u1.geweigerd) for (const [k, v] of zichtbareAantallen(u1, 'freq', 'fA')) alle.set(k, v);
      const u2 = await b.run('pergroep', { afhankelijk: ['d:3'], groep: 'd:0' }, { filter: f });
      if (!u2.geweigerd) for (const [k, v] of zichtbareAantallen(u2, 'pergroep', 'pg')) alle.set(k, v);
      const u3 = await b.run('kruistabel', { rij: 'd:0', kolom: 'd:1' }, { filter: f, opties: { procenten: 'geen' } });
      if (!u3.geweigerd) for (const [k, v] of zichtbareAantallen(u3, 'kruis', 'kt')) alle.set(k, v);
      const u4 = await b.run('regressie', { afhankelijk: 'd:3', voorspellers: ['d:0'] }, { filter: f });
      if (!u4.geweigerd) for (const [k, v] of zichtbareAantallen(u4, 'regressie', 'rg')) alle.set(k, v);
      // Ook een getal zonder indeling in de analyse: een selectie op S die geen verborgen groep losmaakt, mag (P1).
      const u5 = await b.run('beschrijvend', { variabelen: ['d:3'] }, { filter: f });
      if (!u5.geweigerd) for (const [k, v] of zichtbareAantallen(u5, 'beschrijvend', 'bs')) alle.set(k, v);
      uitvoeren.set(f, alle);
    }
    // Geneste paren: (iedereen, S) en (S met groepen V, S met V zonder één groep).
    const sleutel = (dv) => JSON.stringify(dv);
    const perVerzameling = new Map(deelverzamelingen.map((dv, i) => [sleutel(dv), 100 + i]));
    const paren = [];
    deelverzamelingen.forEach((dv, i) => {
      paren.push([null, 100 + i]);
      if (dv.length >= 2) for (let w = 0; w < dv.length; w++) {
        const kleiner = perVerzameling.get(sleutel(dv.filter((_, k) => k !== w)));
        if (kleiner) paren.push([100 + i, kleiner]);
      }
    });
    for (const [x, y] of paren) {
      const ax = uitvoeren.get(x);
      const ay = uitvoeren.get(y);
      for (const [k, v] of ax) {
        if (!ay.has(k)) continue;
        const verschil = Math.abs(v - ay.get(k));
        assert.ok(verschil === 0 || verschil >= DREMPEL, `ronde ${ronde}: ${k} verschilt ${verschil} tussen selectie ${x} en ${y}`);
        vergeleken++;
      }
    }
  }
  assert.ok(vergeleken > 200, `${vergeleken} vergelijkingen`);
});

test('regel E bij twee selecties op dezelfde variabele: een selectie die een kleine groep afbakent, wordt geweigerd', () => {
  const ind = (groep, n) => ({ naam: `I${n}`, groep: Int32Array.from(groep), groepen: [{ label: 'in', dekking: null }, { label: 'uit', dekking: null }] });
  // P: rijen 0–19 in; Q: rijen 0–22 in → 3 mensen verschil.
  const P = ind(Array.from({ length: 40 }, (_, i) => (i < 20 ? 0 : 1)), 1);
  const Q = ind(Array.from({ length: 40 }, (_, i) => (i < 23 ? 0 : 1)), 2);
  assert.ok(controleerOverlap([P, Q]).length > 0);
  const R = ind(Array.from({ length: 40 }, (_, i) => (i < 30 ? 0 : 1)), 3);
  assert.equal(controleerOverlap([P, R]).length, 0);
});

// ---------- Bevindingen van de review: pariteit met het dashboard, bronnen, sets, scores en datasets ----------

const OPTIES = JSON.stringify(['a', 'b', 'c', 'd'].map((id) => ({ id, label: id.toUpperCase() })));
const SET_OPTIES = JSON.stringify([{ id: 'm1', label: 'Thuis' }, { id: 'm2', label: 'Kantoor' }]);

/**
 * Een export met één of meer gekoppelde vragenlijsten: een achtergrondvraag "Afdeling" (A–D, uitsplitsen), twee
 * schaalvragen van thema Werkdruk (10), een derde schaalvraag (optioneel leeg: B7) en een vraag met meerdere
 * antwoorden. lijsten: [{ id, groepen: [[optie | null (niet ingevuld), aantal, waarde(i) of getal, extra?(i) → object]] }].
 */
function exportMet(lijsten, { definities = [] } = {}) {
  const vragen = [];
  const inzendingen = [];
  let nr = 1;
  const q = (id, lijst, stam, velden) => ({
    id, vragenlijst_id: lijst, thema_id: 10, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${id}`, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: stam, volgorde: id, kenmerk: '', ...velden,
  });
  lijsten.forEach((l, k) => {
    const b = 1000 * (k + 1);
    const stam = (x) => (k === 0 ? null : 1000 + x);
    vragen.push(
      q(b, l.id, stam(0), { type: 'meerkeuze', thema_id: 12, tekst: 'Afdeling', opties: OPTIES, uitsplitsen: 1, kenmerk: 'afdeling' }),
      q(b + 1, l.id, stam(1), {}), q(b + 2, l.id, stam(2), {}), q(b + 3, l.id, stam(3), {}),
      q(b + 4, l.id, stam(4), { type: 'meerkeuze', thema_id: 11, tekst: 'Waar werk je?', meerdere_antwoorden: 1, opties: SET_OPTIES }),
    );
    for (const [optie, aantal, waarde, extra] of l.groepen) {
      for (let i = 0; i < aantal; i++) {
        const w = typeof waarde === 'function' ? waarde(i) : waarde;
        const a = { [b + 1]: w, [b + 2]: w, [b + 3]: w };
        if (optie) a[b] = optie;
        const x = extra ? extra(i) : {};
        if (x.set) a[b + 4] = x.set;
        if (x.onvolledig) { delete a[b + 2]; delete a[b + 3]; }
        inzendingen.push({ id: nr++ * 7919, vragenlijst_id: l.id, datum: '2026-10-01', antwoorden: a });
      }
    }
  });
  return {
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN, vraagtypen: {} },
    onderzoek: { id: 1, titel: 'O', status: 'actief' },
    themas: [{ id: 10, naam: 'Werkdruk', volgorde: 1 }, { id: 11, naam: 'Werkplek', volgorde: 2 }, { id: 12, naam: 'Achtergrond', volgorde: 3 }],
    meetpunten: [], meetmomenten: [],
    vragenlijsten: lijsten.map((l) => ({ id: l.id, titel: l.titel || `Lijst ${l.id}`, meetmoment_id: null, status: 'gesloten' })),
    vragen, inzendingen, eigen_invoer: [],
    werkbank_definities: definities.map((d) => ({ dataset_id: null, label: d.naam, verwijderd_op: null, ...d, definitie: JSON.stringify(d.definitie) })),
    werkbank_analyses: [], codes: [], coderingen: [],
  };
}

const wbSpec = (bron, procedure, variabelen, filter = null) => ({ versie: 1, bron, filter, procedure, variabelen, opties: {} });
const LIJST = { soort: 'lijst', id: 100 };
const gemiddelde = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** De groepen van de uitsplitsing op het dashboard: label, n en het themagemiddelde van Werkdruk. */
function dashboardGroepen(data, lijst, vraag) {
  const u = dashboardUitRijen(rijenUitExport(data), { vragenlijst: lijst, uitsplitsen: vraag }).selectie.uitsplitsing;
  return u.groepen.filter((g) => !g.verborgen).map((g) => ({ label: g.label, n: g.n, m: g.themas.find((t) => t.thema_id === 10)?.gemiddelde ?? null }));
}

/** De rijen van "Gemiddelden per groep" (zonder Totaal): label, n, gemiddelde. */
function pergroepRijen(u) {
  const t = tabellen(u).find((x) => x.id.startsWith('pergroep-'));
  return t ? t.rijen.filter((r) => r[0].t !== 'Totaal').map((r) => ({ label: r[0].t, n: r[1].w, m: r[2].w })) : [];
}

test('bevinding 1: de groepen van de werkbank zijn die van het dashboard, ook met "Niet ingevuld" (geen groep van 3 terug te rekenen)', async () => {
  // A 12, B 3 (iedereen 5), C 8 en 6 die de afdelingsvraag oversloegen.
  const data = exportMet([{ id: 100, groepen: [['a', 12, (i) => 1 + (i % 4)], ['b', 3, 5], ['c', 8, (i) => 1 + (i % 3)], [null, 6, (i) => 2 + (i % 3)]] }]);
  const kern = maakRekenkern();
  kern.stel({ data });
  const u = await kern.voerUit(wbSpec(LIJST, 'pergroep', { afhankelijk: ['t:10'], groep: 'v:1000' }));
  const dash = dashboardGroepen(data, 100, 1000);
  assert.deepEqual(dash.map((g) => [g.label, g.n]), [['A', 12], ['C', 8], [LABEL_OVERIG, 9]]);
  const wb = pergroepRijen(u);
  assert.deepEqual(wb.map((g) => [g.label, g.n]), dash.map((g) => [g.label, g.n]), 'dezelfde groepen en aantallen als het dashboard');
  // Het dashboard rondt gemiddelden af op één decimaal.
  wb.forEach((g, i) => assert.ok(Math.abs(g.m - dash[i].m) <= 0.05 + 1e-9, `${g.label}: zelfde gemiddelde (${g.m} en ${dash[i].m})`));
  // De vaste zin van het dashboard: niet "omdat die groepen minder dan 5 respondenten hebben".
  // Alle opties die niet apart staan, ook D zonder respondenten (zoals het dashboard), maar nooit "Niet ingevuld".
  assert.ok(meldingen(u).includes(P_SAMENGEVOEGD(['B', 'D'], true)), meldingen(u).join(' | '));
  assert.ok(!meldingen(u).some((m) => /omdat (die|deze) groep/.test(m)));
  // Kruistabel, aanpassingstoets en regressie gebruiken dezelfde groepen (ook wie de vraag oversloeg).
  const kt = await kern.voerUit(wbSpec(LIJST, 'aanpassing', { variabele: 'v:1000' }));
  const ta = tabellen(kt).find((t) => t.id === 'aanpassing');
  assert.deepEqual(ta.rijen.filter((r) => r[0].t !== 'Totaal').map((r) => [r[0].t, r[1].w]), [['A', 12], ['C', 8], [LABEL_OVERIG, 9]]);
  const rg = await kern.voerUit(wbSpec(LIJST, 'regressie', { afhankelijk: 't:10', voorspellers: ['v:1000'] }));
  assert.ok(!rg.geweigerd, meldingen(rg).join(' | '));
  assert.deepEqual(tabellen(rg).find((t) => t.id === 'groepen').rijen.map((r) => r[2].w).sort((a, b) => a - b), [8, 9, 12]);
});

test('bevinding 1: pariteit met dashboardUitRijen op willekeurige lijsten met overgeslagen achtergrondvragen', async () => {
  const r = lcg(4242);
  let vergeleken = 0;
  for (let ronde = 0; ronde < 40; ronde++) {
    const aantal = () => (r.getal() < 0.45 ? r.geheel(4) : 5 + r.geheel(15));
    const groepen = [['a', aantal()], ['b', aantal()], ['c', aantal()], ['d', aantal()], [null, r.getal() < 0.5 ? r.geheel(4) : r.geheel(9)]]
      .map(([o, n], k) => [o, n, (i) => 1 + ((i + k) % 4)]);
    const data = exportMet([{ id: 100, groepen }]);
    if (data.inzendingen.length < 5) continue;
    const kern = maakRekenkern();
    kern.stel({ data });
    const ds = kern.dataset(LIJST);
    const v = ds.perId.get('v:1000');
    const dash = dashboardGroepen(data, 100, 1000);
    // Regel A: dezelfde groepen met dezelfde aantallen (zonder een losse groep "Niet ingevuld", die doet niet mee).
    assert.deepEqual(v.beschermd.groepen.map((g) => g.n), dash.filter((g) => g.label !== 'Niet ingevuld').map((g) => g.n), `ronde ${ronde}`);
    const u = await kern.voerUit(wbSpec(LIJST, 'pergroep', { afhankelijk: ['t:10'], groep: 'v:1000' }));
    for (const g of pergroepRijen(u)) {
      const d = dash.find((x) => x.label === g.label);
      assert.ok(d, `ronde ${ronde}: ${g.label} staat ook op het dashboard`);
      assert.equal(g.n, d.n, `ronde ${ronde}: ${g.label}`);
      assert.ok(Math.abs(g.m - d.m) <= 0.05 + 1e-9, `ronde ${ronde}: ${g.label} ${g.m} en ${d.m}`);
      vergeleken++;
    }
  }
  assert.ok(vergeleken > 30, `${vergeleken} groepen vergeleken`);
});

test('bevinding 1: een selectie op een achtergrondvraag telt wie hem oversloeg mee zoals het dashboard; regel E vangt de rest', async () => {
  const definities = [
    { id: 1, soort: 'filter', naam: 'nietA', definitie: { voorwaarden: [{ variabele: 'v:1000', niet: ['a'] }] } },
    { id: 2, soort: 'filter', naam: 'overig', definitie: { voorwaarden: [{ variabele: 'v:1000', is: ['b', 'd'] }] } },
  ];
  // A 12, B 3, C 8, D 4 en 2 zonder afdeling: "Overige groepen samen" = B + D + niet ingevuld = 9.
  const data = exportMet([{ id: 100, groepen: [['a', 12, (i) => 1 + (i % 4)], ['b', 3, 5], ['c', 8, (i) => 1 + (i % 3)], ['d', 4, (i) => 2 + (i % 2)], [null, 2, 1]] }], { definities });
  const kern = maakRekenkern();
  kern.stel({ data });
  // "Afdeling is niet A" = iedereen min A, net als het dashboard (lijst min groep A).
  const nietA = await kern.voerUit(wbSpec(LIJST, 'beschrijvend', { variabelen: ['t:10'] }, 1));
  assert.ok(!nietA.geweigerd, meldingen(nietA).join(' | '));
  assert.equal(nietA.gegevens.n, 29 - 12);
  // De groep "Overige groepen samen" kiezen geeft precies de dashboardgroep (9), niet B + D (7).
  const overig = await kern.voerUit(wbSpec(LIJST, 'beschrijvend', { variabelen: ['t:10'] }, 2));
  assert.ok(!overig.geweigerd, meldingen(overig).join(' | '));
  assert.equal(overig.gegevens.n, 9);
  // Een indeling "A tegenover de rest" laat de 2 zonder afdeling buiten de rest: dat zou hun antwoorden verraden.
  const c = kern.controleerIndeling({ soort: 'hercoderen', naam: 'a_rest', label: 'A of de rest', definitie: { variabele: 'v:1000', manier: 'categorieen', groepen: [{ code: 1, label: 'A', waarden: ['a'] }, { code: 2, label: 'Rest', waarden: ['b', 'c', 'd'] }], rest: 'leeg' } }, LIJST);
  assert.equal(c.ok, false);
  assert.ok(c.meldingen.some((m) => /lijkt te veel op “Afdeling”/.test(m)), c.meldingen.join(' | '));
  // Als getal (beschrijvend) telt "Niet ingevuld" mee als groep: 2 → geweigerd.
  const alsGetal = await kern.voerUit(wbSpec(LIJST, 'beschrijvend', { variabelen: ['v:1000'] }));
  assert.equal(alsGetal.geweigerd, true);
});

test('bevinding 2 en 7: Geldig (n) en het voorbeeld van "Indelen in groepen" verraden geen verborgen aantal', async () => {
  // A 12, B 3, C 8 en 3 zonder antwoord: B en "Geen antwoord" zijn verborgen.
  const data = exportMet([{ id: 100, groepen: [['a', 12, (i) => 1 + (i % 4)], ['b', 3, 5], ['c', 8, (i) => 1 + (i % 3)], [null, 3, 2]] }]);
  const kern = maakRekenkern();
  const o = kern.laad({ data, bron: LIJST });
  const afd = o.variabelen.find((v) => v.id === 'v:1000');
  const freq = await kern.voerUit(wbSpec(LIJST, 'frequenties', { variabelen: ['v:1000'] }));
  const t = tabellen(freq).find((x) => x.id === 'freq-v:1000');
  assert.equal(rijMet(t, 'Totaal geldig')[1].verborgen, true);
  assert.equal(afd.geldig, null, 'Geldig (n) is × zoals “Totaal geldig” in de frequentietabel');
  const dash = dashboardUitRijen(rijenUitExport(data), { vragenlijst: 100 }).selectie.vragen.find((q) => q.vraag_id === 1000 || q.id === 1000);
  assert.equal(dash.n, null, 'ook het dashboard toont geen n');
  // Zonder iets verborgen: Geldig (n) is gelijk aan "Totaal geldig".
  const heel = exportMet([{ id: 100, groepen: [['a', 12, 1], ['b', 6, 2], ['c', 8, 3], [null, 5, 2]] }]);
  const k2 = maakRekenkern();
  const o2 = k2.laad({ data: heel, bron: LIJST });
  const t2 = tabellen(await k2.voerUit(wbSpec(LIJST, 'frequenties', { variabelen: ['v:1000'] }))).find((x) => x.id === 'freq-v:1000');
  assert.equal(o2.variabelen.find((v) => v.id === 'v:1000').geldig, rijMet(t2, 'Totaal geldig')[1].w);
  // Het voorbeeld: elke verborgen groep is ×, nooit "minder dan 5", en zonder regel "Geldig: X van Y".
  const def = { soort: 'hercoderen', naam: 'groep', label: 'Groep', definitie: { variabele: 'v:1000', manier: 'categorieen', groepen: [{ code: 1, label: 'Groep A', waarden: ['a'] }, { code: 2, label: 'Groep B', waarden: ['b'] }, { code: 3, label: 'Groep C', waarden: ['c'] }, { code: 4, label: 'Leeg', waarden: ['d'] }], rest: 'leeg' } };
  const c = kern.controleerIndeling(def, LIJST);
  assert.ok(!c.voorbeeld.some((x) => /^Geldig/.test(x)), c.voorbeeld.join(' | '));
  assert.ok(!c.voorbeeld.some((x) => x !== VERBORGEN_UITLEG && /minder dan/.test(x)), c.voorbeeld.join(' | '));
  assert.ok(c.voorbeeld.includes('Groep B: ×') && c.voorbeeld.includes('Leeg: ×') && c.voorbeeld.includes('Groep A: 12'));
  assert.ok(c.voorbeeld.includes(VERBORGEN_UITLEG));
});

test('bevinding 3: alle vragenlijsten onder elkaar verschillen nooit 1 tot 4 van één vragenlijst (aanvaller)', async () => {
  // Het voorbeeld uit de review: nulmeting A 20, B 3, C 10; vervolg A 15, B 6, C 10.
  const vast = exportMet([
    { id: 100, groepen: [['a', 20, 3], ['b', 3, 5], ['c', 10, (i) => 1 + (i % 3)]] },
    { id: 101, groepen: [['a', 15, (i) => 2 + (i % 3)], ['b', 6, (i) => 1 + (i % 4)], ['c', 10, (i) => 1 + (i % 2)]] },
  ], { definities: [{ id: 3, soort: 'filter', naam: 'alleenB', definitie: { voorwaarden: [{ variabele: 'v:1000', is: ['b'] }] } }] });
  const k = maakRekenkern();
  const GESTAPELD = { soort: 'gestapeld', lijsten: 'alle' };
  // De selectie "B" (9 mensen) verschilt 3 van "B" in het vervolg (6): niet te gebruiken, ook niet in het overzicht.
  const ov = k.laad({ data: vast, bron: GESTAPELD });
  const fB = ov.filters.find((f) => f.id === 3);
  assert.equal(fB.ok, false);
  assert.equal(fB.n, null);
  const metB = await k.voerUit(wbSpec(GESTAPELD, 'beschrijvend', { variabelen: ['t:10'] }, 3));
  assert.equal(metB.geweigerd, true);
  assert.match(meldingen(metB)[0], /bij één vragenlijst/);
  const st = await k.voerUit(wbSpec(GESTAPELD, 'pergroep', { afhankelijk: ['t:10'], groep: 'v:1000' }));
  assert.ok(!pergroepRijen(st).some((g) => g.label === 'B'), 'B (9 tegenover 6 in het vervolg) staat er niet bij');
  const sf = tabellen(await k.voerUit(wbSpec(GESTAPELD, 'frequenties', { variabelen: ['v:1000'] }))).find((x) => x.id === 'freq-v:1000');
  assert.equal(rijMet(sf, 'B')[1].verborgen, true);
  // Een meningsvraag die in één vragenlijst 1 tot 4 antwoorden heeft, toont gestapeld niets.
  const weinig = exportMet([
    { id: 100, groepen: [['a', 20, 3]] },
    { id: 101, groepen: [['a', 15, (i) => (i < 3 ? 2 : 'weet_niet')]] },
  ]);
  const k3 = maakRekenkern();
  k3.stel({ data: weinig });
  const fw = await k3.voerUit(wbSpec(GESTAPELD, 'frequenties', { variabelen: ['v:1001'] }));
  assert.equal(fw.geweigerd, true);
  assert.ok(meldingen(fw).some((m) => m.includes(P_LIJST_BUUR)), meldingen(fw).join(' | '));

  // Willekeurig: wat gestapeld en bij één vragenlijst allebei te zien is, verschilt 0 of minstens 5.
  const r = lcg(909);
  let vergeleken = 0;
  for (let ronde = 0; ronde < 25; ronde++) {
    const aantal = () => (r.getal() < 0.4 ? r.geheel(4) : 5 + r.geheel(15));
    const lijst = (id) => ({ id, groepen: [['a', 5 + aantal()], ['b', aantal()], ['c', aantal()], [null, r.geheel(3)]].map(([o, n], g) => [o, n, (i) => 1 + ((i + g) % 4)]) });
    const data = exportMet([lijst(100), lijst(101)]);
    const kern = maakRekenkern();
    kern.stel({ data });
    const zichtbaar = async (bron) => {
      const uit = new Map();
      const f = await kern.voerUit(wbSpec(bron, 'frequenties', { variabelen: ['v:1000'] }));
      const tf = tabellen(f).find((x) => x.id === 'freq-v:1000');
      if (tf) for (const rij of tf.rijen) if (!rij[1].verborgen && Number.isFinite(rij[1].w) && rij[0].t !== 'Totaal') uit.set(`f|${rij[0].t}`, rij[1].w);
      const p = await kern.voerUit(wbSpec(bron, 'pergroep', { afhankelijk: ['t:10'], groep: 'v:1000' }));
      for (const g of pergroepRijen(p)) uit.set(`p|${g.label}`, g.n);
      return uit;
    };
    const st2 = await zichtbaar(GESTAPELD);
    for (const id of [100, 101]) {
      const een = await zichtbaar({ soort: 'lijst', id });
      for (const [sleutel, x] of st2) {
        if (!een.has(sleutel) || sleutel.startsWith('p|Overige')) continue;
        const verschil = Math.abs(x - een.get(sleutel));
        assert.ok(verschil === 0 || verschil >= DREMPEL, `ronde ${ronde}: ${sleutel} gestapeld ${x}, lijst ${id} ${een.get(sleutel)}`);
        vergeleken++;
      }
    }
  }
  assert.ok(vergeleken > 40, `${vergeleken} vergelijkingen`);
});

test('bevinding 4: meerdere antwoorden met een selectie volgen de kruistabelregel (gekozen én niet gekozen minstens 5)', async () => {
  const definities = [{ id: 7, soort: 'filter', naam: 'alleenA', definitie: { voorwaarden: [{ variabele: 'v:1000', is: ['a'] }] } }];
  // In A (12): Thuis 10 (2 niet), Kantoor 12 (0 niet), samen met 6 van 12 Thuis in B.
  const set = (thuis) => (i) => ({ set: [...(i < thuis ? ['m1'] : []), 'm2'] });
  const data = exportMet([{ id: 100, groepen: [['a', 12, (i) => 1 + (i % 4), set(10)], ['b', 12, (i) => 1 + (i % 3), set(6)]] }], { definities });
  const kern = maakRekenkern();
  kern.stel({ data });
  for (const streng of [false, true]) {
    const u = await kern.voerUit(wbSpec(LIJST, 'frequenties', { variabelen: ['v:1004'] }, 7), { streng });
    const t = tabellen(u).find((x) => x.id === 'set-v:1004');
    const n = rijMet(t, 'Respondenten die de vraag beantwoordden')[1].w;
    assert.equal(n, 12);
    for (const rij of t.rijen.slice(0, 2)) assert.ok(rij[1].verborgen || (rij[1].w >= DREMPEL && n - rij[1].w >= DREMPEL), `${rij[0].t}: ${rij[1].w} van ${n}`);
    assert.equal(rijMet(t, 'Thuis')[1].verborgen, true);
    assert.equal(rijMet(t, 'Kantoor')[1].verborgen, true);
  }
  // Zonder selectie is het een meningsvraag zoals op het dashboard (B26): alles zichtbaar.
  const zonder = tabellen(await kern.voerUit(wbSpec(LIJST, 'frequenties', { variabelen: ['v:1004'] }))).find((x) => x.id === 'set-v:1004');
  assert.equal(rijMet(zonder, 'Thuis')[1].w, 16);
});

test('bevinding 5: frequenties van een themascore volgen B7 (1 tot 4 weggevallen → niets; anders beschermd)', async () => {
  const drie = exportMet([{ id: 100, groepen: [['a', 30, (i) => 1 + (i % 5), (i) => ({ onvolledig: i < 3 })]] }]);
  const k = maakRekenkern();
  k.stel({ data: drie });
  const u = await k.voerUit(wbSpec(LIJST, 'frequenties', { variabelen: ['t:10'] }));
  assert.equal(u.geweigerd, true);
  assert.deepEqual(meldingen(u), [`“Werkdruk”: ${P_WEGGEVALLEN}.`]);
  const b = await k.voerUit(wbSpec(LIJST, 'beschrijvend', { variabelen: ['t:10'] }));
  assert.deepEqual(meldingen(b), [`“Werkdruk”: ${P_WEGGEVALLEN}.`], 'beschrijvend noemt de echte reden (B7)');
  const zes = exportMet([{ id: 100, groepen: [['a', 30, (i) => 1 + (i % 5), (i) => ({ onvolledig: i < 6 })]] }]);
  k.stel({ data: zes });
  const f = await k.voerUit(wbSpec(LIJST, 'frequenties', { variabelen: ['t:10'] }));
  assert.ok(!f.geweigerd, meldingen(f).join(' | '));
  const t = tabellen(f).find((x) => x.id === 'freq-t:10');
  for (const rij of t.rijen) assert.ok(rij[1].verborgen || !(rij[1].w > 0 && rij[1].w < DREMPEL), `${rij[0].t}: ${rij[1].w}`);
});

test('bevinding 6: frequenties van getallen uit een eigen dataset tonen geen aantallen van 1 tot 4', async () => {
  const bestand = maakBestand();
  const kern = maakRekenkern();
  kern.stel({ data: null, datasets: [bestand] });
  const bron = { soort: 'dataset', id: bestand.id };
  for (const id of ['d:1', 'd:4']) {
    const u = await kern.voerUit(wbSpec(bron, 'frequenties', { variabelen: [id] }));
    for (const t of tabellen(u).filter((x) => x.id.startsWith('freq-'))) {
      for (const rij of t.rijen) assert.ok(rij[1].verborgen || !(rij[1].w > 0 && rij[1].w < DREMPEL), `${id} ${rij[0].t}: ${rij[1].w}`);
      assert.ok(t.rijen.some((rij) => rij[1].verborgen), `${id}: er is iets verborgen`);
    }
  }
});

test('kleine bevindingen: zinnen bij alfa en het tweede blok van een regressie', async () => {
  const data = maakExport({ nA: 160, nB: 90 });
  const kern = maakRekenkern();
  kern.stel({ data });
  const a = await kern.voerUit(wbSpec(LIJST, 'betrouwbaarheid', { items: ['v:1002', 'v:1003', 'v:1012', 'v:1004'] }));
  const zinA = JSON.stringify(a.apa);
  assert.match(zinA, /Cronbachs α van deze 4 vragen \(\*n\* = /);
  assert.ok(!/4 vragen \(4 vragen/.test(zinA));
  const r = await kern.voerUit(wbSpec(LIJST, 'regressie', { afhankelijk: 't:11', voorspellers: ['v:1002'], blok2: ['v:1003'] }));
  const zinR = JSON.stringify(r.apa);
  assert.match(zinR, /Het tweede blok verklaarde extra variantie, \*ΔR\*² = /);
  assert.ok(!/voegde \d+% verklaarde variantie toe/.test(zinR));
});

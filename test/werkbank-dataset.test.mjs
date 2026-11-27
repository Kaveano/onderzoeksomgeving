// Tests voor het variabelenmodel van de werkbank (BOUWPLAN P4 fase 1, D2 §13.4): dataset.js, transformaties.js
// en definities.js. Geen server nodig. Uitvoeren: node --test test/werkbank-dataset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maakExport, maakBestand } from './werkbank-fixture.mjs';
import { bouwDataset, REDEN, isRechteLijn, isGetal, isIndeling, metadata, NIET_TE_ANALYSEREN } from '../public/js/beheer/werkbank/dataset.js';
import {
  pasDefinitiesToe, maakSelectie, controleerSelectie, FOUT_KRING, foutOntbreekt, eigenschappenVan,
} from '../public/js/beheer/werkbank/transformaties.js';
import {
  controleerDefinitie, controleerSpec, naamFout, gereserveerdeNamen, zoekKring, DefinitieFout, leesDefinities, refsVan, specRefs,
} from '../public/js/beheer/werkbank/definities.js';
import { spssGegevens, spssVariabeleNamen } from '../public/js/beheer/export-bestanden.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';

const ALLE = { soort: 'gestapeld', lijsten: 'alle' };

/** Bouwt een bron met definities, zoals de rekenkern dat doet. */
function bouw(data, bron, definities = [], dataset = null) {
  const eig = eigenschappenVan(definities, bron);
  const ds = bouwDataset({ data, dataset, bron, eigenschappen: eig?.definitie || null });
  pasDefinitiesToe(ds, definities, { eigenschappen: eig?.definitie || null });
  return ds;
}

const def = (id, soort, definitie, velden = {}) => ({ id, dataset_id: null, soort, naam: `eigen${id}`, label: velden.label || `Eigen ${id}`, definitie, verwijderd: false, ...velden });
const geldig = (v, r) => v.reden[r] === REDEN.GELDIG;

test('pariteit met spssGegevens: dezelfde namen, codes per rij en themascores', () => {
  const data = maakExport();
  const ds = bouw(data, ALLE);
  const sp = spssGegevens(data);
  const perNaam = new Map(ds.variabelen.map((v) => [v.naam, v]));
  // De rijen van de werkbank zijn de rijen van de twee grote lijsten, in dezelfde volgorde als het SPSS-bestand.
  assert.equal(ds.n, 105);
  const vergeleken = [];
  sp.variabelen.forEach((sv, k) => {
    if (['respondent', 'datum'].includes(sv.naam) || sv.naam.endsWith('_enps')) return;
    const v = perNaam.get(sv.naam);
    if (sv.soort === 'tekst') {
      // Open vragen staan erin, maar zijn niet te analyseren (en de tekst komt nooit in de werkbank).
      if (v && v.type === 'open') assert.equal(v.analyseerbaar, false, sv.naam);
      return;
    }
    if (sv.naam === 'v14') return; // alleen in de kleine lijst (R0): geen variabele, wel een gereserveerde naam
    assert.ok(v, `variabele ${sv.naam} ontbreekt in de werkbank`);
    vergeleken.push(sv.naam);
    for (let r = 0; r < ds.n; r++) {
      const s = sp.rijen[r][k];
      const w = geldig(v, r) ? v.waarden[r] : null;
      if (s === 99 && sv.ontbrekend?.includes(99)) {
        assert.equal(v.reden[r], REDEN.WEET_NIET, `${sv.naam} rij ${r}: weet niet`);
      } else if (sv.naam.startsWith('thema')) {
        assert.equal(w === null ? null : Math.round(w * 100) / 100, s, `${sv.naam} rij ${r}`);
      } else {
        assert.equal(w, s, `${sv.naam} rij ${r}`);
      }
    }
  });
  for (const naam of ['vragenlijst', 'meetmoment', 'afdeling', 'leeftijd', 'v03', 'v08', 'v09_1', 'v09_3', 'thema01', 'thema02']) assert.ok(vergeleken.includes(naam), naam);
  // Meerkeuze: de hernoemde optie houdt haar code en heeft beide namen in het label (zoals in SPSS).
  const afd = ds.perId.get('v:1000');
  assert.deepEqual(afd.labels.map((l) => l.label), ['Kantoor / Kantoor en staf', 'Productie', 'Verkoop', 'Service']);
  // Meerdere antwoorden: "Onderweg" met een ander id maar dezelfde tekst is dezelfde kolom; leeg waar niet gevraagd.
  const onderweg = ds.perId.get('v:1006:m3');
  assert.equal(onderweg.naam, 'v09_3');
  assert.ok(ds.perId.get('v:1006').leden.includes('v:1006:m3'));
});

test('R0: een vragenlijst met 3 antwoorden doet niet mee; de namen blijven gelijk', () => {
  const data = maakExport();
  const ds = bouw(data, ALLE);
  assert.ok(ds.meldingen.some((m) => m.includes('Kleine lijst') && m.includes('minder dan 5')));
  assert.deepEqual(ds.lijsten.map((l) => l.id), [100, 101]);
  assert.equal(ds.perId.has('v:1200'), false);
  const namen = spssVariabeleNamen(data);
  assert.equal(ds.perId.get('t:10').naam, namen.thema.get(10));
  assert.equal(ds.perId.get('v:1009').naam, namen.vraag.get(1009));
  const alleen = bouw(data, { soort: 'lijst', id: 102 });
  assert.equal(alleen.n, 0);
  assert.equal(alleen.variabelen.length, 0);
});

test('kenmerken eerst, uitsplitsen als terugval, cijfervragen als getal, onbekend type niet te analyseren, geen datum', () => {
  const data = maakExport();
  const ds = bouw(data, ALLE);
  const eerste = ds.variabelen.slice(0, 2);
  assert.deepEqual(eerste.map((v) => v.id), ['v:1000', 'v:1001']);
  assert.deepEqual(ds.perId.get('v:1001').kenmerk, { sleutel: 'leeftijd', naam: 'Leeftijd', geordend: true });
  assert.equal(ds.perId.get('v:1001').meetniveau, 'ordinaal');
  assert.equal(ds.perId.get('v:1000').groep, 'kenmerk');
  assert.equal(ds.perId.get('v:1000').groepering, true);
  // Zonder de kolom kenmerk: de uitsplitsvraag is de indeling; de leeftijdsvraag is een gewone vraag.
  const oud = bouw(maakExport({ metKenmerk: false }), ALLE);
  assert.deepEqual(oud.perId.get('v:1000').kenmerk, { sleutel: 'uitsplitsing', naam: 'Indeling', geordend: false });
  assert.equal(oud.perId.get('v:1001').kenmerk, null);
  assert.equal(oud.perId.get('v:1001').groep, 'vraag');
  // Cijfervragen: getal, interval, bereik uit de cijferschalen (nooit 0–10 voor een rapportcijfer).
  const nps = ds.perId.get('v:1008');
  const rapport = ds.perId.get('v:1009');
  assert.equal(nps.soort, 'getal');
  assert.equal(nps.meetniveau, 'interval');
  assert.deepEqual(nps.bereik, { laag: 0, hoog: 10 });
  assert.deepEqual(rapport.bereik, { laag: 1, hoog: 10 });
  assert.ok(nps.telling.perReden[REDEN.WEET_NIET] > 0);
  assert.equal(isGetal(nps), true);
  // Een cijfervraag telt nooit mee in een themascore (thema 11 = Leiding: alleen de twee schaalvragen).
  const t11 = ds.perId.get('t:11');
  const r0 = 0;
  const a = data.inzendingen.filter((i) => i.vragenlijst_id === 100)[0].antwoorden;
  const items = [a[1004], a[1013]].filter((x) => Number.isInteger(x));
  if (items.length >= 1) assert.equal(t11.waarden[r0], items.reduce((s, x) => s + x, 0) / items.length);
  // Onbekend vraagtype.
  const raar = ds.perId.get('v:1010');
  assert.equal(raar.analyseerbaar, false);
  assert.equal(raar.reden_niet, NIET_TE_ANALYSEREN);
  // Nooit de datum van invullen of het volgnummer (PR-12).
  for (const v of ds.variabelen) {
    assert.ok(!/datum/i.test(v.naam) && !/datum/i.test(v.id), v.id);
    assert.notEqual(v.naam, 'respondent');
  }
  // De tekst van open antwoorden komt nergens in de werkbank (ook niet in de metadata).
  const tekst = JSON.stringify(ds.variabelen.map(metadata));
  for (const zin of ['Meer overleg', 'Minder werkdruk', 'Betere roosters']) assert.ok(!tekst.includes(zin), zin);
});

test('codes bij een open vraag worden 0/1-variabelen (leeg als de vraag niet beantwoord is)', () => {
  const data = maakExport();
  const lijstA = data.inzendingen.filter((i) => i.vragenlijst_id === 100);
  const metAntwoord = lijstA.filter((i) => typeof i.antwoorden[1007] === 'string');
  data.codes = [{ id: 7, naam: 'werkdruk', omschrijving: '', groep: '', volgorde: 1 }];
  data.coderingen = metAntwoord.slice(0, 9).map((i, k) => ({ id: k + 1, code_id: 7, inzending_id: i.id, vraag_id: 1007, invoer_id: null }));
  const ds = bouw(data, ALLE);
  const c = ds.perId.get('c:7@1007');
  assert.ok(c, 'codevariabele');
  assert.equal(c.groep, 'code');
  assert.equal(c.groepering, true);
  assert.equal(c.meetniveau, 'nominaal');
  let een = 0;
  let nul = 0;
  for (let r = 0; r < ds.n; r++) {
    if (c.reden[r] !== REDEN.GELDIG) continue;
    if (c.waarden[r] === 1) een++;
    else nul++;
  }
  assert.equal(een, 9);
  const beantwoord = data.inzendingen.filter((i) => [100, 101].includes(i.vragenlijst_id) && typeof i.antwoorden[i.vragenlijst_id === 100 ? 1007 : 1107] === 'string').length;
  assert.equal(een + nul, beantwoord);
  assert.match(c.label, /Code “werkdruk” bij vraag “Wat kan beter\?”/);
});

test('schaalscore: gemiddelde met min_geldig en omgescoorde vragen; B7-reden voor weggevallen respondenten', () => {
  const data = maakExport();
  const defs = [def(1, 'bereken', { functie: 'gemiddelde', variabelen: ['v:1002', { id: 'v:1003', omscoren: true }, 'v:1012'], min_geldig: 2 })];
  const ds = bouw(data, { soort: 'lijst', id: 100 }, defs);
  const v = ds.perId.get('w:1');
  assert.ok(v);
  assert.equal(v.meetniveau, 'interval');
  assert.deepEqual(v.bereik, { laag: 1, hoog: 5 });
  const lijst = data.inzendingen.filter((i) => i.vragenlijst_id === 100);
  let onvolledig = 0;
  lijst.forEach((inz, r) => {
    const a = inz.antwoorden;
    const w = [a[1002], Number.isInteger(a[1003]) ? 6 - a[1003] : undefined, a[1012]].filter((x) => Number.isInteger(x));
    if (w.length >= 2) assert.ok(Math.abs(v.waarden[r] - w.reduce((s, x) => s + x, 0) / w.length) < 1e-12, `rij ${r}`);
    else if (w.length === 1) {
      assert.equal(v.reden[r], REDEN.ONVOLLEDIG);
      onvolledig++;
    } else assert.notEqual(v.reden[r], REDEN.GELDIG);
  });
  assert.equal(v.telling.perReden[REDEN.ONVOLLEDIG], onvolledig);
  // Themascore: wie minder dan de helft beantwoordde, telt als weggevallen (reden 5).
  const t10 = ds.perId.get('t:10');
  lijst.forEach((inz, r) => {
    const n = [1002, 1003, 1012].filter((q) => Number.isInteger(inz.antwoorden[q])).length;
    if (n === 1) assert.equal(t10.reden[r], REDEN.ONVOLLEDIG);
  });
});

test('omscoren: schaal 1–5 en een rapportcijfer 1–10 (11 − x, nooit 10 − x)', () => {
  const data = maakExport();
  const defs = [def(1, 'omscoren', { variabele: 'v:1002' }), def(2, 'omscoren', { variabele: 'v:1009' })];
  const ds = bouw(data, { soort: 'lijst', id: 100 }, defs);
  const bron = ds.perId.get('v:1002');
  const om = ds.perId.get('w:1');
  const rapport = ds.perId.get('v:1009');
  const omR = ds.perId.get('w:2');
  for (let r = 0; r < ds.n; r++) {
    if (geldig(bron, r)) assert.equal(om.waarden[r], 6 - bron.waarden[r]);
    else assert.equal(om.reden[r], bron.reden[r]);
    if (geldig(rapport, r)) assert.equal(omR.waarden[r], 11 - rapport.waarden[r]);
  }
  assert.equal(om.labels.find((l) => l.code === 1).label, 'Helemaal eens');
  assert.equal(om.wortel, 'v:1002');
});

test('indelen in groepen: op antwoorden en met grenzen (eNPS-indeling)', () => {
  const data = maakExport();
  const defs = [
    def(1, 'hercoderen', { variabele: 'v:1001', manier: 'categorieen', groepen: [{ code: 1, label: 'Jonger dan 55', waarden: ['o1', 'o2'] }, { code: 2, label: '55 of ouder', waarden: ['o3'] }], rest: 'leeg' }),
    def(2, 'hercoderen', { variabele: 'v:1008', manier: 'grenzen', grenzen: [7, 9], labels: ['Criticasters (0–6)', 'Passief (7–8)', 'Promotors (9–10)'] }),
  ];
  const ds = bouw(data, { soort: 'lijst', id: 100 }, defs);
  const leeftijd = ds.perId.get('v:1001');
  const groep = ds.perId.get('w:1');
  const enps = ds.perId.get('w:2');
  const nps = ds.perId.get('v:1008');
  let jong = 0;
  let oud = 0;
  for (let r = 0; r < ds.n; r++) {
    if (!geldig(leeftijd, r)) {
      assert.notEqual(groep.reden[r], REDEN.GELDIG);
      continue;
    }
    if (leeftijd.waarden[r] <= 2) { jong++; assert.equal(groep.waarden[r], 1); } else { oud++; assert.equal(groep.waarden[r], 2); }
  }
  assert.deepEqual(groep.aantallen, [jong, oud]);
  assert.equal(groep.groepering, true);
  assert.equal(groep.wortel, 'v:1001');
  for (let r = 0; r < ds.n; r++) {
    if (!geldig(nps, r)) continue;
    const x = nps.waarden[r];
    assert.equal(enps.waarden[r], x <= 6 ? 1 : x <= 8 ? 2 : 3, `cijfer ${x}`);
  }
  assert.equal(enps.meetniveau, 'ordinaal');
  assert.deepEqual(enps.dekking.get(2), { soort: 'bereik', delen: [[7, 9]] });
});

test('selectie: voorwaarden samen (en), "is niet" en een bereik; de omschrijving in gewone taal', () => {
  const data = maakExport();
  const defs = [def(9, 'filter', { voorwaarden: [{ variabele: 'v:1000', niet: ['oc'] }, { variabele: 't:10', van: 2, tot: 4.5 }] }, { label: 'Niet Verkoop, werkdruk 2–4,5' })];
  const ds = bouw(data, { soort: 'lijst', id: 100 }, defs);
  const sel = maakSelectie(ds, 9);
  const afd = ds.perId.get('v:1000');
  const t10 = ds.perId.get('t:10');
  let verwacht = 0;
  for (let r = 0; r < ds.n; r++) {
    const ok = geldig(afd, r) && afd.waarden[r] !== 3 && geldig(t10, r) && t10.waarden[r] >= 2 && t10.waarden[r] <= 4.5;
    assert.equal(sel.F[r], ok ? 1 : 0);
    if (ok) verwacht++;
  }
  assert.equal(sel.n, verwacht);
  assert.match(sel.tekst, /^“Op welke afdeling werk je\?” is niet “Verkoop” en “Werkdruk” van 2 tot en met 4,5$/);
  // Buren: iedereen, en zonder elk van de twee voorwaarden.
  assert.equal(sel.buren.length, 3);
  const controle = controleerSelectie(ds, sel);
  assert.equal(controle.totaal, ds.n);
});

test('kwaliteit: rechte lijn (8 of meer schaalvragen hetzelfde) en minimaal beantwoord', () => {
  const vragen = Array.from({ length: 9 }, (_, i) => ({ id: i + 1 }));
  const zelfde = Object.fromEntries(vragen.map((q) => [q.id, 4]));
  assert.equal(isRechteLijn(vragen, zelfde), true);
  assert.equal(isRechteLijn(vragen, { ...zelfde, 3: 2 }), false);
  assert.equal(isRechteLijn(vragen, { ...zelfde, 3: 'weet_niet' }), true);
  assert.equal(isRechteLijn(vragen.slice(0, 7), zelfde), false, 'te weinig schaalvragen');
  const data = maakExport();
  const defs = [def(4, 'filter', { voorwaarden: [{ soort: 'kwaliteit', regel: 'min_beantwoord', min_pct: 80 }, { soort: 'kwaliteit', regel: 'rechte_lijn' }] })];
  const ds = bouw(data, { soort: 'lijst', id: 100 }, defs);
  const sel = maakSelectie(ds, 4);
  for (let r = 0; r < ds.n; r++) assert.equal(sel.F[r], ds.kwaliteit.beantwoordPct[r] >= 80 && !ds.kwaliteit.rechteLijn[r] ? 1 : 0);
  assert.match(sel.tekst, /minstens 80% van de vragen/);
  // Bij een dataset kan het niet.
  const b = bouw(null, { soort: 'dataset', id: 5 }, [{ ...defs[0], dataset_id: 5 }], maakBestand());
  assert.match(maakSelectie(b, 4).fout, /alleen bij vragenlijsten/);
});

test('afhankelijkheden: volgorde, kring en een verdwenen variabele geven een duidelijke fout', () => {
  const data = maakExport();
  const defs = [
    def(2, 'bereken', { functie: 'gemiddelde', variabelen: ['w:1', 'v:1004'] }), // bouwt op w:1, dat later staat
    def(1, 'omscoren', { variabele: 'v:1003' }),
    def(3, 'bereken', { functie: 'som', variabelen: ['w:4', 'v:1002'] }),
    def(4, 'bereken', { functie: 'som', variabelen: ['w:3', 'v:1002'] }),
    def(5, 'bereken', { functie: 'gemiddelde', variabelen: ['v:999999', 'v:1002'] }),
  ];
  const ds = bouw(data, { soort: 'lijst', id: 100 }, defs);
  assert.ok(ds.perId.get('w:2'));
  assert.ok(ds.perId.get('w:1'));
  const fouten = new Map(ds.fouten.map((f) => [f.id, f.tekst]));
  assert.equal(fouten.get(3), FOUT_KRING);
  assert.equal(fouten.get(4), FOUT_KRING);
  // Zonder rekenkern (die de naam opzoekt) noemt de melding geen intern nummer zoals “v:999999”.
  assert.equal(fouten.get(5), foutOntbreekt(null));
  assert.ok(!/v:999999/.test(fouten.get(5)));
  assert.deepEqual(zoekKring(defs).sort(), [3, 4]);
  assert.equal(zoekKring(defs.slice(0, 2)), null);
});

test('verwijderde indeling telt nog mee maar staat niet in de lijst; eigenschappen veranderen meetniveau en label', () => {
  const data = maakExport();
  const defs = [
    def(1, 'hercoderen', { variabele: 'v:1001', manier: 'categorieen', groepen: [{ code: 1, label: 'Jong', waarden: ['o1'] }, { code: 2, label: 'Ouder', waarden: ['o2', 'o3'] }], rest: 'leeg' }, { verwijderd: true }),
    { id: 2, dataset_id: null, soort: 'eigenschappen', naam: '~eigenschappen', label: '', definitie: { variabelen: { 'v:1002': { meetniveau: 'interval', label: 'Genoeg tijd' }, 'w:3': { meetniveau: 'ordinaal' } } }, verwijderd: false },
    def(3, 'bereken', { functie: 'gemiddelde', variabelen: ['v:1002', 'v:1003'] }),
  ];
  const ds = bouw(data, { soort: 'lijst', id: 100 }, defs);
  assert.equal(ds.perId.get('w:1').verwijderd, true);
  assert.equal(ds.perId.get('v:1002').meetniveau, 'interval');
  assert.equal(ds.perId.get('v:1002').label, 'Genoeg tijd');
  assert.equal(ds.perId.get('w:3').meetniveau, 'ordinaal');
});

test('eigen dataset: namen, soorten, eigen ontbrekende code, volgorde en de waarschuwing bij gezondheid', () => {
  const bestand = maakBestand();
  const eig = { id: 1, dataset_id: 5, soort: 'eigenschappen', naam: '~eigenschappen', label: '', verwijderd: false, definitie: { variabelen: { 'd:4': { ontbrekend: [999] }, 'd:0': { volgorde: ['zuid', 'noord'] } } } };
  const ds = bouw(null, { soort: 'dataset', id: 5 }, [eig], bestand);
  assert.equal(ds.n, 80);
  assert.deepEqual(ds.variabelen.map((v) => v.naam), ['Regio', 'Leeftijd', 'Uren', 'Functiegroep', 'Verzuimdagen', 'Toelichting']);
  const regio = ds.perId.get('d:0');
  assert.deepEqual(regio.labels.map((l) => l.label), ['Zuid', 'Noord', 'Oost', 'West']);
  assert.equal(isIndeling(regio), true);
  assert.equal(ds.perId.get('d:1').meetniveau, 'interval');
  assert.equal(ds.perId.get('d:3').soort, 'categorie');
  const verzuim = ds.perId.get('d:4');
  const codes = bestand.rijen.filter((r) => r[4] === 999).length;
  assert.equal(verzuim.telling.perReden[REDEN.EIGEN], codes);
  assert.match(verzuim.waarschuwingen[0], /gezondheid/);
  assert.equal(ds.perId.get('d:5').analyseerbaar, false);
  assert.equal(ds.kwaliteit, null);
});

test('definities: vorm, namen (gegenereerde set, SPSS-woorden), kringen en specs', () => {
  const data = maakExport();
  const gereserveerd = gereserveerdeNamen(spssVariabeleNamen(data).gebruikt, Object.keys(KENMERKEN));
  assert.equal(naamFout('werkdruk_schaal', { gereserveerd }), null);
  for (const naam of ['v03', 'thema01', 'meetmoment', 'datum', 'AND', 'v07_enps', 'leeftijd', 'afdeling', 'v12_3']) assert.match(naamFout(naam, { gereserveerd }), /gereserveerd/, naam);
  assert.match(naamFout('1abc'), /begint met een letter/);
  assert.match(naamFout('met spatie'), /begint met een letter/);
  assert.match(naamFout('Score', { bestaande: ['score'] }), /al in gebruik/);

  assert.deepEqual(controleerDefinitie('bereken', { functie: 'gemiddelde', variabelen: ['v:1', { id: 'v:2', omscoren: true }, { id: 'v:3', omscoren: false }], min_geldig: 2 }),
    { functie: 'gemiddelde', variabelen: ['v:1', { id: 'v:2', omscoren: true }, 'v:3'], min_geldig: 2 });
  const fout = (soort, d) => assert.throws(() => controleerDefinitie(soort, d), DefinitieFout, JSON.stringify(d));
  fout('bereken', { functie: 'gemiddelde', variabelen: [] });
  fout('bereken', { functie: 'verschil', variabelen: ['v:1'] });
  fout('bereken', { functie: 'gemiddelde', variabelen: ['v:1', 'v:1'] });
  fout('bereken', { functie: 'gemiddelde', variabelen: ['v:1', 'v:2'], min_geldig: 3 });
  fout('bereken', { functie: 'gemiddelde', variabelen: ['datum'] });
  fout('bereken', { functie: 'gemiddelde', variabelen: ['sys:datum'] });
  fout('hercoderen', { variabele: 'v:1', manier: 'grenzen', grenzen: [3, 2], labels: ['a', 'b', 'c'] });
  fout('hercoderen', { variabele: 'v:1', manier: 'grenzen', grenzen: [3], labels: ['a'] });
  fout('hercoderen', { variabele: 'v:1', manier: 'categorieen', groepen: [{ code: 1, label: 'A', waarden: ['o1'] }, { code: 2, label: 'B', waarden: ['o1'] }] });
  fout('filter', { voorwaarden: [] });
  fout('filter', { voorwaarden: Array.from({ length: 11 }, () => ({ variabele: 'v:1', is: ['ja'] })) });
  fout('filter', { voorwaarden: [{ soort: 'kwaliteit', regel: 'min_beantwoord', min_pct: 0 }] });
  fout('filter', { voorwaarden: [{ variabele: 'v:1', van: 5, tot: 2 }] });
  fout('eigenschappen', { variabelen: { 'v:1': { meetniveau: 'ratio' } } });
  fout('onbekend', {});
  assert.deepEqual(controleerDefinitie('filter', { voorwaarden: [{ soort: 'kwaliteit', regel: 'rechte_lijn' }, { variabele: 'w:3', is: ['oa', 2] }] }),
    { voorwaarden: [{ soort: 'kwaliteit', regel: 'rechte_lijn' }, { variabele: 'w:3', is: ['oa', 2] }] });
  assert.deepEqual(refsVan('filter', { voorwaarden: [{ soort: 'kwaliteit', regel: 'rechte_lijn' }, { variabele: 'w:3', is: ['oa'] }] }), ['w:3']);
  assert.throws(() => controleerDefinitie('bereken', { functie: 'som', variabelen: Array.from({ length: 201 }, (_, i) => `v:${i + 1}`) }), DefinitieFout);

  const spec = controleerSpec({ versie: 1, bron: { soort: 'lijst', id: 100 }, filter: null, procedure: 'anova', variabelen: { afhankelijk: ['t:10'], factor: 'v:1000' }, opties: { posthoc: 'tukey', nonparametrisch: true } });
  assert.deepEqual(spec.opties, { posthoc: 'tukey', nonparametrisch: true });
  assert.deepEqual(specRefs(spec), ['t:10', 'v:1000']);
  const specFout = (s) => assert.throws(() => controleerSpec(s), DefinitieFout, JSON.stringify(s));
  specFout({ versie: 2, bron: { soort: 'lijst', id: 1 }, procedure: 'anova', variabelen: {} });
  specFout({ versie: 1, bron: { soort: 'lijst', id: 1 }, procedure: 'onbekend', variabelen: {} });
  specFout({ versie: 1, bron: { soort: 'lijst', id: 1 }, procedure: 'anova', variabelen: { afhankelijk: ['t:10'] } });
  specFout({ versie: 1, bron: { soort: 'lijst', id: 1 }, procedure: 'anova', variabelen: { afhankelijk: ['t:10'], factor: 'v:1' }, opties: { posthoc: 'scheffe' } });
  specFout({ versie: 1, bron: { soort: 'lijst', id: 1 }, procedure: 'anova', variabelen: { afhankelijk: ['t:10'], factor: 'v:1', extra: 'v:2' } });
  specFout({ versie: 1, bron: { soort: 'lijst', id: 1 }, procedure: 'correlatie', variabelen: { variabelen: ['t:1'] } });
  specFout({ versie: 1, bron: { soort: 'gestapeld', lijsten: [1] }, procedure: 'frequenties', variabelen: { variabelen: ['t:1'] } });
  specFout({ versie: 1, bron: { soort: 'lijst', id: 1 }, procedure: 'ttoets', variabelen: { afhankelijk: ['t:1'], groep: 'v:1' }, opties: { groepen: ['oa'] } });

  // De export geeft definitie en spec als JSON-tekst; leesDefinities maakt er objecten van (ook verwijderd_op).
  const gelezen = leesDefinities([{ id: 1, dataset_id: null, soort: 'filter', naam: 'x', label: '', definitie: '{"voorwaarden":[]}', verwijderd_op: '2026-11-01T00:00:00Z' }, { id: 2, soort: 'bereken', naam: 'y', definitie: 'kapot' }]);
  assert.equal(gelezen.length, 1);
  assert.equal(gelezen[0].verwijderd, true);
});

test('snelle controle: 500 respondenten opbouwen gaat vlot', () => {
  // (De volledige prestatietests staan in werkbank-prestaties.test.mjs; dit is een snelle controle.)
  const data = maakExport({ nA: 300, nB: 200 });
  const t0 = performance.now();
  bouw(data, ALLE);
  assert.ok(performance.now() - t0 < 1500);
});

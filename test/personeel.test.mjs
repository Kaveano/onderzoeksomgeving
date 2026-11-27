// Tests voor public/js/beheer/personeel-regels.js: het personeelsbestand voor HR-analytics (BOUWPLAN §3.5, P3
// criteria 2, 3 en 4; D1 §11.3). Geen server nodig.
// Uitvoeren: node --test test/personeel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../public/js/beheer/personeel-regels.js';
import { KENMERKVRAGEN, KLASSEGRENZEN, klasseVan } from '../public/js/beheer/kenmerken.js';

const PERIODE = { van: '2025-11', tot: '2026-10' };
const KOP = ['Naam', 'Personeelsnummer', 'Geboortedatum', 'Afdeling', 'Geslacht', 'Fte', 'Datum in dienst', 'Datum uit dienst',
  'Verzuimdagen', 'Ziekmeldingen', 'Reden uit dienst', 'Contract'];
const ROLLEN_STANDAARD = { 2: 'geboortedatum', 3: 'afdeling', 4: 'geslacht', 5: 'fte', 6: 'datum_in', 7: 'datum_uit', 8: 'verzuimdagen', 9: 'verzuimmeldingen', 10: 'reden_uit', 11: 'contract' };

let volgnr = 0;
/** Eén rij van een personeelsbestand. */
function rij({ naam, nr, geboren = '1985-04-12', afdeling = 'Zorg', geslacht = 'V', fte = 1, in: inD = '2015-01', uit = null, dagen = 0, meldingen = 0, reden = null, contract = 'Vast' } = {}) {
  volgnr++;
  return [naam ?? `Medewerker Achternaam${volgnr}`, nr ?? `PN${100000 + volgnr}`, geboren, afdeling, geslacht, fte, inD, uit, dagen, meldingen, reden, contract];
}
const groep = (aantal, velden = {}) => Array.from({ length: aantal }, (_, i) => rij(typeof velden === 'function' ? velden(i) : velden));
const verwerk = (rijen, opties = {}) => P.verwerkPersoneel(KOP, rijen, { rollen: ROLLEN_STANDAARD, periode: PERIODE, ...opties });
const rijenVan = (kpis, dim) => kpis.per_groep.find((x) => x.dimensie === dim).rijen;
const dimGroep = (agg, dim, label) => agg.dimensies[dim].groepen.find((g) => g.label === label);

// ---------- Criterium 2: het rekenvoorbeeld van D1 §5.4 ----------

test('D1 §5.4: verzuim 3,36026%, meldingsfrequentie 1,44841, diensttijd 6,2333 jaar, leeftijd 39,0, verloop 20, instroom 20, nulverzuim 25%, duur 10,71', () => {
  const kop = ['Fte', 'In dienst', 'Uit dienst', 'Verzuimdagen', 'Ziekmeldingen', 'Leeftijd'];
  const rijen = [
    [1.0, '2015-03', null, 10, 2, 34], // A
    [0.5, '2020-01', null, 40, 1, 51], // B
    [0.8, '2026-05', null, 0, 0, 27], // C
    [1.0, '2010-01', '2026-02', 5, 1, 61], // D
    [1.0, '2018-06', null, 0, 0, 45], // E
    [0.6, '2022-09', null, 20, 3, 38], // F
  ];
  const rollen = P.herkenRollen(kop, rijen);
  assert.deepEqual(rollen, { 0: 'fte', 1: 'datum_in', 2: 'datum_uit', 3: 'verzuimdagen', 4: 'verzuimmeldingen', 5: 'leeftijd' });
  const { personen, rollen: gebruikt } = P.leesPersonen(kop, rijen, { rollen, periode: PERIODE });
  assert.equal(personen.length, 6);
  const g = P.telGroep(personen, { vM: P.maandNr(PERIODE.van), tM: P.maandNr(PERIODE.tot), rollen: gebruikt, totaal: true });
  assert.equal(P.periodeDagen(PERIODE), 365);
  assert.equal(g.medewerkers, 5);
  assert.equal(g.begin, 5);
  assert.equal(g.fte, 3.9);
  assert.equal(g.verzuim.dagen_fte, 47);
  assert.ok(Math.abs(g.verzuim.beschikbaar_fte - 1398.7) < 1e-9);
  const k = P.kengetallen(g, { periode: PERIODE });
  const dicht = (a, b, tol, wat) => assert.ok(Math.abs(a - b) < tol, `${wat}: ${a} ≠ ${b}`);
  dicht(k.verzuim_pct, 3.36026, 1e-5, 'verzuim');
  dicht(k.meldingsfrequentie, 1.44841, 1e-5, 'meldingsfrequentie');
  dicht(k.gem_diensttijd_jaar, 6.2333, 1e-4, 'diensttijd');
  assert.equal(k.gem_leeftijd, 39);
  assert.equal(k.gem_aantal, 5);
  assert.equal(k.verloop_pct, 20);
  assert.equal(k.instroom_pct, 20);
  assert.equal(k.nulverzuim_pct, 25, 'A, B, E en F zijn de hele periode in dienst; alleen E heeft geen melding');
  dicht(k.gem_duur_per_melding, 75 / 7, 1e-9, 'duur per melding');
  assert.equal(Math.round(k.gem_duur_per_melding * 100) / 100, 10.71);
  assert.equal(k.pct_deeltijd, 60);

  // Hetzelfde bestand verwerkt: een organisatie van 5 medewerkers krijgt geen verzuimcijfers (n < 10).
  const { aggregaat } = P.verwerkPersoneel(kop, rijen, { rollen, periode: PERIODE });
  assert.deepEqual(aggregaat.totaal.verzuim, { toonbaar: false, reden: 'klein' });
  assert.equal(aggregaat.peildatum, '2026-10-31');
  const kpis = P.personeelKpis(aggregaat);
  assert.equal(kpis.totaal.medewerkers, 5);
  assert.equal(kpis.totaal.verzuim_pct, null);
  assert.equal(kpis.totaal.verloop_pct, null, 'één vertrekker: het verloop zou dat ene aantal verraden');
  assert.equal(kpis.totaal.gem_leeftijd, 39);
});

// ---------- Criterium 3: afschermen ----------

test('een indeling [6, 4, 2]: 4 en 2 verborgen (samen 6); [6, 3, 7]: 3 en de kleinste andere (6) verborgen', () => {
  const a = verwerk([...groep(6, { afdeling: 'A' }), ...groep(4, { afdeling: 'B' }), ...groep(2, { afdeling: 'C' })]);
  const r1 = rijenVan(P.personeelKpis(a.aggregaat), 'afdeling');
  assert.deepEqual(r1.map((r) => [r.label, r.medewerkers, r.verborgen]), [['A', 6, false], ['B', null, true], ['C', null, true]]);
  const b = verwerk([...groep(6, { afdeling: 'A' }), ...groep(3, { afdeling: 'B' }), ...groep(7, { afdeling: 'C' })]);
  const r2 = rijenVan(P.personeelKpis(b.aggregaat), 'afdeling');
  assert.deepEqual(r2.map((r) => [r.label, r.medewerkers, r.verborgen]), [['A', null, true], ['B', null, true], ['C', 7, false]]);
  // Van een groep onder de 5 gaan alleen de aantallen mee naar de server.
  assert.deepEqual(dimGroep(b.aggregaat, 'afdeling', 'B'), { label: 'B', medewerkers: 3, in_periode: 3, klein: true, verzuim: { toonbaar: false, reden: 'klein' } });
});

test('verzuim: een groep van 9 is te klein; de verborgen groepen samen onder de 10 → de kleinste andere groep gaat mee', () => {
  const rijen = [
    ...groep(9, (i) => ({ afdeling: 'Klein', dagen: i, meldingen: i ? 1 : 0 })),
    ...groep(12, (i) => ({ afdeling: 'Midden', dagen: 3 + (i % 4), meldingen: 1 })),
    ...groep(30, (i) => ({ afdeling: 'Groot', dagen: 2 + (i % 5), meldingen: i % 3 })),
  ];
  const { aggregaat } = verwerk(rijen);
  assert.deepEqual(dimGroep(aggregaat, 'afdeling', 'Klein').verzuim, { toonbaar: false, reden: 'klein' });
  assert.deepEqual(dimGroep(aggregaat, 'afdeling', 'Midden').verzuim, { toonbaar: false, reden: 'complementair' });
  assert.equal(dimGroep(aggregaat, 'afdeling', 'Groot').verzuim.toonbaar, true);
  assert.equal(aggregaat.totaal.verzuim.toonbaar, true);
  const kpis = P.personeelKpis(aggregaat);
  const r = rijenVan(kpis, 'afdeling');
  assert.equal(r.find((x) => x.label === 'Klein').verzuim_pct, null);
  assert.equal(r.find((x) => x.label === 'Klein').medewerkers, 9, 'het aantal medewerkers zelf mag wel (9 ≥ 5)');
  assert.equal(r.find((x) => x.label === 'Midden').verzuim_pct, null);
  assert.equal(r.find((x) => x.label === 'Midden').reden, 'complementair');
  assert.ok(r.find((x) => x.label === 'Groot').verzuim_pct > 0);
  assert.ok(kpis.totaal.verzuim_pct > 0);
  // De verborgen groepen samen zijn groot genoeg en niet van één persoon.
  assert.ok(9 + 12 >= P.MIN_VERZUIM);
});

test('verzuim: een groep van 12 waarin één persoon 60% van de dagen heeft, is "dominant"', () => {
  const rijen = [
    ...groep(12, (i) => ({ afdeling: 'Team', dagen: i === 0 ? 60 : i <= 4 ? 10 : 0, meldingen: i <= 4 ? 1 : 0 })),
    ...groep(25, (i) => ({ afdeling: 'Rest', dagen: i % 6, meldingen: i % 2 })),
    ...groep(20, (i) => ({ afdeling: 'Ander', dagen: (i % 4) * 2, meldingen: i % 3 ? 1 : 0 })),
  ];
  const { aggregaat } = verwerk(rijen);
  assert.deepEqual(dimGroep(aggregaat, 'afdeling', 'Team').verzuim, { toonbaar: false, reden: 'dominant' });
  // Alleen "Team" verbergen is niet genoeg: dan volgt het uit het totaal min de andere groepen, en daar is dezelfde
  // persoon nog steeds dominant. De kleinste andere groep gaat mee.
  assert.deepEqual(dimGroep(aggregaat, 'afdeling', 'Ander').verzuim, { toonbaar: false, reden: 'complementair' });
  assert.equal(dimGroep(aggregaat, 'afdeling', 'Rest').verzuim.toonbaar, true);
  const r = rijenVan(P.personeelKpis(aggregaat), 'afdeling');
  assert.equal(r.find((x) => x.label === 'Team').reden, 'dominant');
});

test('verzuim: een organisatie van 8 krijgt geen verzuimpercentage', () => {
  const { aggregaat } = verwerk(groep(8, (i) => ({ dagen: i, meldingen: 1 })));
  assert.deepEqual(aggregaat.totaal.verzuim, { toonbaar: false, reden: 'klein' });
  const kpis = P.personeelKpis(aggregaat);
  assert.equal(kpis.totaal.medewerkers, 8);
  assert.equal(kpis.totaal.verzuim_pct, null);
  assert.equal(kpis.totaal.meldingsfrequentie, null);
  assert.equal(kpis.totaal.verzuim_reden, 'klein');
  // Zonder verzuimgetallen in het aggregaat zelf.
  assert.ok(!JSON.stringify(aggregaat).includes('dagen_fte'));
  // Een organisatie van 4: alleen aantallen, en niets te zien.
  const vier = verwerk(groep(4)).aggregaat;
  assert.deepEqual(vier.totaal, { medewerkers: 4, in_periode: 4, klein: true, verzuim: { toonbaar: false, reden: 'klein' } });
  assert.equal(P.personeelKpis(vier).totaal.verborgen, true);
  assert.equal(P.personeelKpis(vier).totaal.medewerkers, null);
});

test('verzuim: met fte gewogen dagen tellen ook mee voor de dominantie; een grotere organisatie toont alles', () => {
  // Eén persoon met 50% van de kalenderdagen, maar met 1,0 fte tegen 0,2 fte bij de rest: gewogen meer dan de helft.
  const rijen = [rij({ dagen: 50, fte: 1 }), ...groep(10, () => ({ dagen: 5, fte: 0.2 }))];
  assert.deepEqual(verwerk(rijen).aggregaat.totaal.verzuim, { toonbaar: false, reden: 'dominant' });
  const ruim = [rij({ dagen: 20, fte: 1 }), ...groep(15, (i) => ({ dagen: 2 + (i % 5), fte: 0.8, meldingen: 1 }))];
  const k = P.personeelKpis(verwerk(ruim).aggregaat).totaal;
  assert.ok(k.verzuim_pct > 0 && k.meldingsfrequentie > 0 && k.gem_duur_per_melding > 0);
});

// ---------- Criterium 4: nooit namen, nummers of geboortedatums naar de server ----------

const VOORNAMEN = ['Anouk', 'Bas', 'Charlotte', 'Daan', 'Esmee', 'Floris', 'Gijs', 'Hanna', 'Ilse', 'Jesse', 'Kim', 'Lars', 'Mila', 'Niek', 'Olga', 'Pieter'];
const ACHTERNAMEN = ['Bakker', 'Dekker', 'Hendriks', 'Janssen', 'Kok', 'Meijer', 'Peters', 'Smits', 'Vermeulen', 'Willems', 'Brouwer', 'Kramer'];

function lcg(zaad) {
  let s = zaad >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Een realistisch personeelsbestand van n medewerkers (vast zaad), met kolommen die niet mee mogen. */
function bestand(n, zaad = 7) {
  const r = lcg(zaad);
  const kies = (lijst) => lijst[Math.floor(r() * lijst.length)];
  const kop = ['Voornaam', 'Achternaam', 'Personeelsnummer', 'E-mailadres', 'Geboortedatum', 'Afdeling', 'Geslacht', 'Fte', 'Datum in dienst',
    'Datum uit dienst', 'Verzuimdagen', 'Ziekmeldingen', 'Reden vertrek', 'Soort contract', 'BSN', 'Opmerking'];
  const rijen = [];
  for (let i = 0; i < n; i++) {
    const voor = kies(VOORNAMEN);
    const achter = kies(ACHTERNAMEN);
    const jaar = 1960 + Math.floor(r() * 40);
    const geb = `${String(1 + Math.floor(r() * 28)).padStart(2, '0')}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${jaar}`;
    const inJaar = 2000 + Math.floor(r() * 26);
    const vertrekt = r() < 0.15;
    rijen.push([
      voor, achter, String(700000 + i * 37), `${voor.toLowerCase()}.${achter.toLowerCase()}@voorbeeld.nl`, geb,
      kies(['Zorg', 'Zorg', 'Staf', 'Facilitair', 'ICT']), kies(['M', 'V', 'V']), kies([1, 0.8, 0.6, 0.5]),
      `${inJaar}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}`, vertrekt ? `2026-0${1 + Math.floor(r() * 9)}` : null,
      Math.floor(r() * 12), Math.floor(r() * 3), vertrekt ? kies(['Eigen verzoek', 'Pensioen', 'Einde tijdelijk contract', 'Verhuizing']) : null,
      kies(['Vast', 'Tijdelijk']), String(100000000 + i * 7919), r() < 0.2 ? `Gesprek met ${voor} gepland` : null,
    ]);
  }
  return { kop, rijen };
}

test('criterium 4: het aggregaat bevat geen tekst die alleen in een naam-, nummer- of geboortedatumkolom staat', () => {
  const { kop, rijen } = bestand(240);
  const rollen = P.herkenRollen(kop, rijen);
  // Namen, nummers, e-mail en BSN krijgen geen rol; de geboortedatum wordt een leeftijd.
  for (const i of [0, 1, 2, 3, 14, 15]) assert.equal(rollen[i], undefined, `kolom ${kop[i]}`);
  assert.equal(rollen[4], 'geboortedatum');
  // Ook als iemand per ongeluk een namen- of nummerkolom als afdeling aanwijst, gaat die niet mee.
  const fout = { ...rollen, 0: 'locatie', 2: 'functieniveau', 3: 'opleiding' };
  const { aggregaat, meldingen } = P.verwerkPersoneel(kop, rijen, { rollen: fout, periode: PERIODE, naam: 'Personeelsbestand 2026' });
  assert.ok(meldingen.some((m) => m.includes('"Voornaam"') && m.includes('niet gebruikt')));
  const json = JSON.stringify(aggregaat);
  const gevoelig = new Set();
  const overig = new Set();
  const gevoeligeKolommen = new Set([0, 1, 2, 3, 4, 14, 15]);
  for (const r of rijen) {
    r.forEach((c, i) => {
      if (c === null || c === undefined) return;
      const t = String(c);
      if (gevoeligeKolommen.has(i)) {
        gevoelig.add(t);
        if (i === 4) {
          // Een geboortedatum ook in andere schrijfwijzen.
          const [dd, mm, jj] = t.split('-');
          gevoelig.add(`${jj}-${mm}-${dd}`);
          gevoelig.add(`${jj}-${mm}`);
        }
        if (i === 15) for (const w of t.split(' ')) if (w.length >= 4) gevoelig.add(w);
      } else overig.add(t);
    });
  }
  let gecontroleerd = 0;
  for (const s of gevoelig) {
    if (overig.has(s)) continue; // staat ook in een kolom die wel mee mag
    gecontroleerd++;
    assert.ok(!json.includes(s), `"${s}" staat in het aggregaat`);
  }
  assert.ok(gecontroleerd > 500, `te weinig gecontroleerd: ${gecontroleerd}`);
  // Er staan alleen groepscijfers in: geen lijsten met een element per medewerker.
  const lijsten = [];
  JSON.parse(json, (k, v) => { if (Array.isArray(v)) lijsten.push(v.length); return v; });
  assert.ok(Math.max(...lijsten) < 50, `een lijst met ${Math.max(...lijsten)} elementen`);
  assert.ok(json.length < 200_000);
  assert.ok(aggregaat.rollen.includes('leeftijd') && !aggregaat.rollen.includes('geboortedatum'));
});

// ---------- D1 §11.3: lezen van cellen ----------

test('geboortedatum 1987-06-15 met tot 2026-10 → leeftijd 39; de datum zelf komt nergens in de uitvoer', () => {
  const kop = ['Geboortedatum', 'Afdeling'];
  const rijen = Array.from({ length: 6 }, () => ['1987-06-15', 'A']);
  const { personen } = P.leesPersonen(kop, rijen, { rollen: { 0: 'geboortedatum', 1: 'afdeling' }, periode: PERIODE });
  assert.equal(personen[0].leeftijd, 39);
  const { aggregaat } = P.verwerkPersoneel(kop, rijen, { rollen: { 0: 'geboortedatum', 1: 'afdeling' }, periode: PERIODE });
  const json = JSON.stringify(aggregaat);
  assert.ok(!json.includes('1987'));
  assert.equal(aggregaat.totaal.leeftijd_som, 6 * 39);
  // Jarig na de peildatum: nog 38.
  const later = P.leesPersonen(kop, [['1987-11-15', 'A']], { rollen: { 0: 'geboortedatum' }, periode: PERIODE }).personen[0];
  assert.equal(later.leeftijd, 38);
  // Geboortejaar: peiljaar min geboortejaar.
  assert.equal(P.leesPersonen(['Geboortejaar'], [[1990]], { rollen: { 0: 'geboortejaar' }, periode: PERIODE }).personen[0].leeftijd, 36);
});

test('maanden lezen: 15-03-2015 → 2015-03, 2015-03-15 → 2015-03, 03-2015 → 2015-03; onzin → null', () => {
  assert.equal(P.leesMaand('15-03-2015'), '2015-03');
  assert.equal(P.leesMaand('2015-03-15'), '2015-03');
  assert.equal(P.leesMaand('2015-3'), '2015-03');
  assert.equal(P.leesMaand('03-2015'), '2015-03');
  assert.equal(P.leesMaand('15 maart 2015'), '2015-03');
  assert.equal(P.leesMaand('2015-13'), null);
  assert.equal(P.leesMaand('vorig jaar'), null);
  assert.equal(P.peildatumVan('2026-02'), '2026-02-28');
  assert.equal(P.peildatumVan('2024-02'), '2024-02-29');
});

test('kolommen: een onbekende kop krijgt geen rol; een kolom met namen of nummers nooit, ook niet met een rol', () => {
  assert.equal(P.herkenRol('Lievelingskleur'), null);
  assert.equal(P.herkenRol('Afdeling'), 'afdeling');
  assert.equal(P.herkenRol('Datum in dienst'), 'datum_in');
  assert.equal(P.herkenRol('Uit dienst per'), 'datum_uit');
  assert.equal(P.herkenRol('Ziektedagen'), 'verzuimdagen');
  assert.equal(P.herkenRol('Reden vertrek'), 'reden_uit');
  // "Leidinggevende" is vaak de naam van de leidinggevende: alleen bij ja/nee.
  assert.equal(P.herkenRol('Leidinggevende', ['Jan Jansen', 'Piet Smit']), null);
  assert.equal(P.herkenRol('Leidinggevende', ['ja', 'nee', 'Nee']), 'leidinggevend');
  const kop = ['Naam', 'Lievelingskleur', 'Afdeling'];
  const rijen = Array.from({ length: 6 }, (_, i) => [`Persoon Achternaam${i}`, i % 2 ? 'blauw' : 'groen', 'A']);
  assert.deepEqual(P.herkenRollen(kop, rijen), { 2: 'afdeling' });
  const { aggregaat, meldingen } = P.verwerkPersoneel(kop, rijen, { rollen: { 0: 'afdeling', 2: 'afdeling' }, periode: PERIODE });
  assert.ok(meldingen.some((m) => m.includes('"Naam"')));
  const json = JSON.stringify(aggregaat);
  assert.ok(!json.includes('Persoon') && !json.includes('blauw') && !json.includes('groen'));
  assert.deepEqual(aggregaat.dimensies.afdeling.groepen.map((g) => g.label), ['A']);
});

test('een kolom met bijna alleen verschillende waarden is geen indeling en gaat niet mee', () => {
  const kop = ['Functie'];
  const rijen = Array.from({ length: 30 }, (_, i) => [`Functie ${i}`]);
  const { aggregaat, meldingen } = P.verwerkPersoneel(kop, rijen, { rollen: { 0: 'functieniveau' }, periode: PERIODE });
  assert.equal(aggregaat.dimensies.functieniveau, undefined);
  assert.ok(meldingen.some((m) => m.includes('geen indeling')));
});

// ---------- Redenen van vertrek ----------

test('redenen van vertrek: herkend, zelf gekoppeld of "Overig"; alleen voor de hele organisatie en afgeschermd', () => {
  assert.equal(P.herkenReden('Eigen verzoek'), 'eigen_verzoek');
  assert.equal(P.herkenReden('ontslag op eigen verzoek'), 'eigen_verzoek');
  assert.equal(P.herkenReden('Pensioen (AOW)'), 'pensioen');
  assert.equal(P.herkenReden('Contract niet verlengd'), 'tijdelijk');
  assert.equal(P.herkenReden('Reorganisatie'), 'werkgever');
  assert.equal(P.herkenReden('Verhuizing'), null);
  assert.deepEqual(Object.keys(P.REDENEN), ['eigen_verzoek', 'werkgever', 'tijdelijk', 'pensioen', 'overig']);
  const rijen = [
    ...groep(40),
    ...groep(6, { uit: '2026-03', reden: 'Eigen verzoek' }),
    ...groep(2, { uit: '2026-04', reden: 'Pensioen' }),
    ...groep(3, { uit: '2026-05', reden: 'Verhuizing' }),
    ...groep(1, { uit: '2026-06', reden: null }),
    ...groep(5, { uit: '2026-07', reden: 'VSO' }),
  ];
  const { aggregaat, meldingen } = verwerk(rijen, { redenen: { VSO: 'werkgever' } });
  assert.deepEqual(aggregaat.totaal.uitstroom_reden, { eigen_verzoek: 6, werkgever: 5, tijdelijk: 0, pensioen: 2, overig: 3, onbekend: 1 });
  assert.ok(meldingen.some((m) => m.includes('"Verhuizing"')));
  // Per groep worden geen redenen en geen vertrek in het eerste jaar bewaard.
  for (const g of aggregaat.dimensies.afdeling.groepen) {
    assert.equal(g.uitstroom_reden, undefined);
    assert.equal(g.uitstroom_eerste_jaar, undefined);
  }
  const k = P.personeelKpis(aggregaat);
  assert.deepEqual(k.uitstroom_redenen.map((r) => [r.label, r.aantal]), [
    ['Eigen verzoek', 6], ['Initiatief werkgever', 5], ['Einde tijdelijk contract', null], ['Pensioen', null], ['Overig', null], ['Onbekend', null],
  ]);
  assert.equal(k.totaal.verloop_pct, (17 / ((57 + 40) / 2)) * 100);
  assert.equal(k.totaal.verloop_vrijwillig_pct, (6 / ((57 + 40) / 2)) * 100);
  // Twee vertrekkers in het eerste jaar: niet te tonen (minder dan 5).
  const eerste = verwerk([...groep(30), ...groep(2, { in: '2026-01', uit: '2026-06', reden: 'Eigen verzoek' }), ...groep(6, { uit: '2026-06' })]);
  assert.equal(eerste.aggregaat.totaal.uitstroom_eerste_jaar, 2);
  assert.equal(P.personeelKpis(eerste.aggregaat).totaal.pct_eerste_jaar, null);
});

// ---------- Aandelen en verdelingen bij het tonen ----------

test('aandelen alleen als beide delen minstens 5 zijn; per groep met de kruistabelregel', () => {
  const rijen = [
    ...groep(8, (i) => ({ afdeling: 'A', geslacht: i < 4 ? 'M' : 'V' })), // 4 / 4: per groep niet te tonen
    ...groep(12, (i) => ({ afdeling: 'B', geslacht: i < 6 ? 'M' : 'V' })), // 6 / 6
    ...groep(15, (i) => ({ afdeling: 'C', geslacht: i < 7 ? 'M' : 'V' })), // 7 / 8
  ];
  const k = P.personeelKpis(verwerk(rijen).aggregaat);
  const r = rijenVan(k, 'afdeling');
  assert.equal(r.find((x) => x.label === 'A').pct_vrouw, null);
  // A verborgen in de kolom "vrouw": de kleinste andere cel in die kolom gaat mee (anders A = totaal − B − C).
  assert.equal(r.find((x) => x.label === 'B').pct_vrouw, null);
  assert.equal(r.find((x) => x.label === 'C').pct_vrouw, (8 / 15) * 100);
  assert.equal(k.totaal.pct_vrouw, (18 / 35) * 100);
  assert.deepEqual(k.totaal.geslacht.map((x) => [x.label, x.n]), [['Man', 17], ['Vrouw', 18], ['Anders', 0], ['Onbekend', 0]]);
  // Eén "Anders": verborgen, en de nullen en de kleinste andere cel gaan mee.
  const anders = P.personeelKpis(verwerk([...groep(20, { geslacht: 'M' }), ...groep(20, { geslacht: 'V' }), rij({ geslacht: 'X' })]).aggregaat);
  assert.deepEqual(anders.totaal.geslacht.map((x) => x.n), [null, 20, null, null]);
  assert.equal(anders.totaal.pct_vrouw, (20 / 41) * 100);
});

test('deeltijd, leeftijd en diensttijd van de organisatie; vertrek telt mee in de groep van de periode', () => {
  const rijen = [
    ...groep(10, { fte: 0.6, geboren: '1960-01-01' }),
    ...groep(10, { fte: 1, geboren: '1995-01-01', in: '2024-11' }),
    ...groep(3, { fte: 1, uit: '2026-01' }),
  ];
  const { aggregaat } = verwerk(rijen);
  assert.equal(aggregaat.totaal.medewerkers, 20);
  assert.equal(aggregaat.totaal.in_periode, 23);
  const k = P.personeelKpis(aggregaat).totaal;
  assert.equal(k.pct_deeltijd, 50);
  assert.equal(k.pct_60plus, 50);
  assert.equal(k.gem_leeftijd, (10 * 66 + 10 * 31) / 20);
  assert.equal(k.verloop_pct, null, '3 vertrekkers');
  assert.equal(k.instroom_pct, null, 'niemand kwam in de periode');
  assert.equal(k.fte, 16);
  assert.equal(Math.round(k.gem_diensttijd_jaar * 1000) / 1000, Math.round(((10 * 141 + 10 * 23) / 20 / 12) * 1000) / 1000);
  // De leeftijdsopbouw uit de klassen.
  assert.deepEqual(k.leeftijd.filter((x) => x.n !== null && x.n > 0).map((x) => [x.label, x.n]), [['25 tot 35 jaar', 10], ['60 jaar of ouder', 10]]);
});

// ---------- Populatie per antwoordmogelijkheid ----------

test('klasseVan op elke mogelijkheid uit de bibliotheek en de vaste klassegrenzen', () => {
  for (const [kenmerk, v] of Object.entries(KENMERKVRAGEN)) {
    const opties = v.varianten ? Object.values(v.varianten).flat() : v.opties;
    for (const o of opties) {
      if (!o.eenheid) continue;
      assert.deepEqual(klasseVan(o.label), { van: o.van, tot: o.tot, eenheid: o.eenheid }, `${kenmerk}: ${o.label}`);
    }
  }
  for (const [label, k] of Object.entries(KLASSEGRENZEN)) assert.deepEqual(klasseVan(label), k, label);
});

const vraagVan = (kenmerk, opties) => ({ id: 1, type: 'meerkeuze', kenmerk, opties: opties.map((o, i) => ({ id: `o${i + 1}`, ...(typeof o === 'string' ? { label: o } : o) })) });

test('populatie per mogelijkheid: leeftijd grof en fijn uit de klassen, "liever niet" zonder aantal', () => {
  const rijen = [
    ...groep(7, { geboren: '2004-01-01' }), // 22
    ...groep(9, { geboren: '1996-01-01' }), // 30
    ...groep(11, { geboren: '1986-01-01' }), // 40
    ...groep(6, { geboren: '1976-01-01' }), // 50
    ...groep(4, { geboren: '1969-01-01' }), // 57
    ...groep(3, { geboren: '1963-01-01' }), // 63
    ...groep(2, { geboren: '1990-01-01', uit: '2026-03' }), // vertrokken: niet in de populatie
  ];
  const { aggregaat } = verwerk(rijen);
  const grof = vraagVan('leeftijd', KENMERKVRAGEN.leeftijd.varianten.grof);
  assert.deepEqual(P.populatieVoorVraag(aggregaat, grof), { o1: 16, o2: 17, o3: 7 });
  const fijn = vraagVan('leeftijd', KENMERKVRAGEN.leeftijd.varianten.fijn.map((o) => o.label));
  assert.deepEqual(P.populatieVoorVraag(aggregaat, fijn), { o1: 7, o2: 9, o3: 11, o4: 6, o5: 7 });
  // Een grens die niet in de klassen zit: niet zeker, dus null (dan vul je het zelf in) …
  const eigen = vraagVan('leeftijd', ['Jonger dan 30 jaar', '30 jaar of ouder']);
  assert.equal(P.populatieVoorVraag(aggregaat, eigen), null);
  // … tenzij je de grenzen van de vragenlijst bij het inlezen meegeeft.
  const extra = P.grenzenVoorVragen([eigen]);
  assert.deepEqual(extra.leeftijd, [30]);
  const met = verwerk(rijen, { extraGrenzen: extra }).aggregaat;
  assert.deepEqual(P.populatieVoorVraag(met, eigen), { o1: 7, o2: 33 });
  // Een streepje is geen klasse ("18-24 jaar"): null.
  assert.equal(P.populatieVoorVraag(aggregaat, vraagVan('leeftijd', ['18-24 jaar', '25-34 jaar'])), null);
});

test('populatie per mogelijkheid: diensttijd in jaren en maanden (onboarding), uren en ja/nee', () => {
  const rijen = [
    ...groep(5, { in: '2026-09' }), // 1 maand
    ...groep(6, { in: '2026-06' }), // 4 maanden
    ...groep(7, { in: '2026-01' }), // 9 maanden
    ...groep(8, { in: '2020-01', fte: 0.5 }), // ruim 6 jaar
  ];
  const onboarding = vraagVan('diensttijd', ['Korter dan 3 maanden', '3 tot 6 maanden', '6 tot 12 maanden', 'Een jaar of langer']);
  const standaard = vraagVan('diensttijd', KENMERKVRAGEN.diensttijd.opties);
  const zonder = verwerk(rijen).aggregaat;
  assert.deepEqual(P.populatieVoorVraag(zonder, standaard), { o1: 18, o2: 0, o3: 8, o4: 0 });
  assert.equal(P.populatieVoorVraag(zonder, onboarding), null);
  const met = verwerk(rijen, { extraGrenzen: P.grenzenVoorVragen([onboarding]) }).aggregaat;
  assert.deepEqual(P.populatieVoorVraag(met, onboarding), { o1: 5, o2: 6, o3: 7, o4: 8 });
  // Uren: uit de fte (36 uur per fte).
  const uren = vraagVan('uren', KENMERKVRAGEN.uren.opties);
  assert.deepEqual(P.populatieVoorVraag(zonder, uren), { o1: 8, o2: 0, o3: 18 });
  // Ja/nee (leidinggevend).
  const kop = ['Leidinggevend'];
  const lg = P.verwerkPersoneel(kop, [...Array(6).fill(['ja']), ...Array(9).fill(['nee'])], { rollen: { 0: 'leidinggevend' }, periode: PERIODE }).aggregaat;
  assert.deepEqual(P.populatieVoorVraag(lg, { id: 2, type: 'janee', kenmerk: 'leidinggevend' }), { ja: 6, nee: 9 });
});

test('populatie per mogelijkheid: afdelingen via de koppeling bij het inlezen; ontbrekende mogelijkheid = 0', () => {
  const rijen = [...groep(12, { afdeling: 'Verpleging' }), ...groep(8, { afdeling: 'ADMIN' }), ...groep(5, { afdeling: 'Staf' })];
  const vraag = vraagVan('afdeling', ['Zorg', 'Administratie', 'Directie']);
  const { aggregaat } = verwerk(rijen, { koppeling: { afdeling: { Verpleging: 'Zorg', admin: 'Administratie' } } });
  assert.deepEqual(aggregaat.dimensies.afdeling.groepen.map((g) => g.label), ['Administratie', 'Staf', 'Zorg']);
  assert.deepEqual(P.populatieVoorVraag(aggregaat, vraag), { o1: 12, o2: 8, o3: 0 });
  assert.deepEqual(P.ongekoppeldeGroepen(aggregaat, vraag), [{ label: 'Staf', medewerkers: 5 }]);
  // Zonder overeenkomst: null.
  assert.equal(P.populatieVoorVraag(aggregaat, vraagVan('afdeling', ['X', 'Y'])), null);
  // Opties als tekst (zoals in de database).
  assert.deepEqual(P.populatieVoorVraag(aggregaat, { ...vraag, opties: JSON.stringify(vraag.opties) }), { o1: 12, o2: 8, o3: 0 });
});

test('verwerkPersoneel: ongeldige periode, uren per fte en meldingen bij rare cellen', () => {
  assert.throws(() => verwerk([], { periode: { van: '2026-10', tot: '2025-11' } }), /periode/);
  assert.throws(() => verwerk([], { periode: { van: '2020-01', tot: '2026-10' } }), /36 maanden/);
  assert.throws(() => verwerk([], { uren_per_fte: 0 }), /Uren per fte/);
  const { aggregaat, meldingen } = verwerk([...groep(6), rij({ in: 'ooit' }), rij({ in: '2020-05', uit: '2019-01' }), rij({ fte: 80, dagen: 300, in: '2026-09' }), rij({ dagen: 400 })]);
  assert.ok(meldingen.some((m) => m.includes('"In dienst sinds"')));
  assert.ok(meldingen.some((m) => m.includes('vóór de datum in dienst')));
  assert.ok(meldingen.some((m) => m.includes('als percentage')));
  assert.ok(meldingen.some((m) => m.includes('meer verzuimdagen dan dagen in dienst')));
  assert.ok(meldingen.some((m) => m.includes('"Verzuimdagen in de periode"')), 'meer dan 366 dagen is niet te lezen');
  assert.equal(aggregaat.totaal.in_periode, 9);
  assert.equal(aggregaat.uren_per_fte, 36);
  // Niemand in de periode.
  const leeg = verwerk([rij({ in: '2027-01' })]);
  assert.ok(leeg.meldingen.some((m) => m.includes('niemand')));
  assert.equal(leeg.aggregaat.totaal.in_periode, 0);
});

test('ontbreekt: kengetallen zonder kolom staan in de lijst', () => {
  const { aggregaat, ontbreekt } = P.verwerkPersoneel(['Afdeling'], groep(6).map((r) => [r[3]]), { rollen: { 0: 'afdeling' }, periode: PERIODE });
  for (const k of ['fte', 'gem_leeftijd', 'verzuim_pct', 'meldingsfrequentie', 'verloop_pct', 'instroom_pct', 'pct_eerste_jaar']) assert.ok(ontbreekt.includes(k), k);
  assert.deepEqual(aggregaat.ontbreekt, ontbreekt);
  assert.equal(aggregaat.totaal.verzuim, null);
  for (const k of ontbreekt) assert.ok(P.KENGETALLEN[k], k);
});

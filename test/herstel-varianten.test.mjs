// Herstelronde 3: varianten op de aanvallen van de hercontrole die na de eerste herstelcommits nog werkten.
// - R1 (eigen indeling van afdeling) via de lineaire en de logistische regressie;
// - R7 ("Zeg ik liever niet" per groep) via de regressie, ook als getal-voorspeller naast een indeling;
// - R3 (spreiding binnen een selectie) via regressie, logistische regressie, gepaarde t-toets, correlatie en
//   betrouwbaarheid.
// Per variant: de aanval van vóór deze ronde lukt niet meer, en zonder kleine groep of zonder selectie blijft de analyse.
// Zuiver: geen server nodig. Uitvoeren: node --test test/herstel-varianten.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maakRekenkern } from '../public/js/beheer/werkbank/rekenkern.js';
import { CIJFERSCHALEN, SCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';
import {
  P_VOORSPELLER_GROEPEN, P_UITKOMST_GROEPEN, P_LIEVER_NIET_PER_GROEP, P_SPREIDING_ANALYSE_SELECTIE, P_WORTEL_VERBORGEN, P_INDELING_ALS_GETAL,
  P_PAAR_VERBORGEN,
} from '../public/js/beheer/werkbank/uitvoer-tekst.js';

function exportLijst(vragen, antwoorden) {
  const q = (v) => ({ vragenlijst_id: 1, thema_id: 10, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${v.id}`, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: v.id, kenmerk: '', ...v });
  return {
    export: { versie: 1, datum: '2026-11-28' },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN, vraagtypen: {} },
    onderzoek: { id: 1, titel: 'T', bedrijfsnaam: 'X', status: 'actief' },
    themas: [{ id: 10, naam: 'Werkdruk', volgorde: 1 }, { id: 11, naam: 'Groei', volgorde: 2 }, { id: 12, naam: 'Achtergrond', volgorde: 3 }],
    meetpunten: [], meetmomenten: [{ id: 30, naam: 'Nulmeting', volgorde: 1 }],
    vragenlijsten: [{ id: 1, titel: 'Lijst', meetmoment_id: 30, status: 'gesloten' }],
    vragen: vragen.map(q),
    inzendingen: antwoorden.map((a, i) => ({ id: (i + 1) * 31, vragenlijst_id: 1, datum: '2026-10-01', antwoorden: a })),
    eigen_invoer: [], stukken: [], acties: [], rapporten: [], werkbank_definities: [], werkbank_analyses: [],
    codes: [], coderingen: [], citaten: [], bronnen_gekoppeld: [], hr_instellingen: {}, personeelscijfers: [],
  };
}
const opties = (...labels) => JSON.stringify(labels.map((label, i) => ({ id: `o${i + 1}`, label })));
const AFDELING = { id: 1, type: 'meerkeuze', thema_id: 12, tekst: 'Op welke afdeling werk je?', kenmerk: 'afdeling', uitsplitsen: 1, opties: opties('Kantoor', 'Productie', 'Lab') };

function werkbank(data, definities = []) {
  const kern = maakRekenkern();
  const defs = definities.map((d) => ({ dataset_id: null, label: d.naam, verwijderd_op: null, ...d, definitie: JSON.stringify(d.definitie) }));
  kern.laad({ data, datasets: [], definities: defs, bron: { soort: 'lijst', id: 1 } });
  return (procedure, variabelen, { filter = null, opties: o = {}, streng = true } = {}) => kern.voerUit({ versie: 1, bron: { soort: 'lijst', id: 1 }, filter, procedure, variabelen, opties: o }, { streng, nu: '2026-11-28' });
}
const tabelVan = (u, id) => u.onderdelen.find((o) => o.soort === 'tabel' && o.id.startsWith(id));
const meldingenVan = (u) => u.onderdelen.filter((o) => o.soort === 'melding').map((o) => o.tekst);
const getallen = (u) => JSON.stringify(u.onderdelen.filter((o) => o.soort === 'tabel'));
const indeling = (id, naam, groepen, variabele = 'v:1') => ({ id, soort: 'hercoderen', naam, definitie: { variabele, manier: 'categorieen', rest: 'leeg', groepen } });

// ---------- R1 via de regressie: een eigen indeling van afdeling als voorspeller ----------

/** s3 (×2 bij Kantoor en Productie voor de logistische regressie): Lab 6, van wie 4 vraag 2 beantwoordden ([1, 1, 2, 1]). */
function scenarioS3(keer = 1) {
  const geheim = [1, 1, 2, 1, 2, 1];
  const a = [];
  for (let i = 0; i < 12 * keer; i++) a.push({ 1: 'o1', 2: 3 + (i % 3), 3: 2 + (i % 4), 4: i % 2 ? 'ja' : 'nee' });
  for (let i = 0; i < 8 * keer; i++) a.push({ 1: 'o2', 2: 2 + (i % 4), 3: 3 + (i % 3), 4: i % 2 ? 'ja' : 'nee' });
  for (let i = 0; i < 6; i++) a.push({ 1: 'o3', ...(i < 4 ? { 2: geheim[i] } : {}), 3: 4 + (i % 2), 4: i < 3 ? 'ja' : 'nee' });
  return exportLijst([AFDELING, { id: 2, tekst: 'Ik voel me gepest' }, { id: 3, tekst: 'Ik kan mijn werk aan' },
    { id: 4, type: 'janee', thema_id: 12, tekst: 'Werk je thuis?' }], a);
}
const PRODUCTIE_OF_REST = indeling(41, 'productie_of_rest', [{ code: 1, label: 'Productie', waarden: ['o2'] }, { code: 2, label: 'Rest', waarden: ['o1', 'o3'] }]);
const KANTOOR_OF_FABRIEK = indeling(42, 'kantoor_of_fabriek', [{ code: 1, label: 'Kantoor', waarden: ['o1'] }, { code: 2, label: 'Fabriek', waarden: ['o2', 'o3'] }]);
const ZONDER_LAB = indeling(43, 'zonder_lab', [{ code: 1, label: 'Productie', waarden: ['o2'] }, { code: 2, label: 'Kantoor', waarden: ['o1'] }]);

test('R1 via de lineaire regressie: een eigen indeling die verborgen groepen splitst, doet niet mee', async () => {
  const run = werkbank(scenarioS3(), [PRODUCTIE_OF_REST, KANTOOR_OF_FABRIEK, ZONDER_LAB]);
  for (const y of ['v:2', 't:10']) {
    // Vroeger: constante 3,3125 (Rest, 16) en B 0,1875 (Productie 3,5): met Kantoor 4,0 volgde Lab (som 5 bij 4 mensen).
    const u = await run('regressie', { afhankelijk: y, voorspellers: ['w:41'] });
    assert.equal(u.geweigerd, true, y);
    assert.ok(!tabelVan(u, 'coef'), `${y}: geen coëfficiënten`);
    const m = meldingenVan(u);
    assert.ok(m.includes(P_WORTEL_VERBORGEN(['Productie', 'Rest'], 'Op welke afdeling werk je?', ['Productie', 'Lab'])), `${y}: ${m.join(' | ')}`);
    assert.equal(m.at(-1), P_VOORSPELLER_GROEPEN('productie_of_rest', y === 'v:2' ? 'Ik voel me gepest' : 'Werkdruk'));
  }
  // Ook als maar één groep van de indeling verborgen is (Lab hoort bij geen groep): die groep zou als B apart staan.
  const z = await run('regressie', { afhankelijk: 'v:2', voorspellers: ['w:43'] });
  assert.equal(z.geweigerd, true, meldingenVan(z).join(' | '));
  assert.ok(!getallen(z).includes('3.5'), 'het gemiddelde van Productie staat er niet');
  // Naast een andere voorspeller valt alleen de indeling weg.
  const naast = await run('regressie', { afhankelijk: 'v:2', voorspellers: ['w:41', 'v:3'] });
  assert.ok(!naast.geweigerd, meldingenVan(naast).join(' | '));
  assert.deepEqual(tabelVan(naast, 'coef').rijen.map((r) => r[0].t), ['(Constante)', 'Ik kan mijn werk aan']);
  // Kantoor tegenover Productie + Lab houdt de verborgen groepen samen: dat mag.
  const kf = await run('regressie', { afhankelijk: 'v:2', voorspellers: ['w:42'] });
  assert.ok(!kf.geweigerd, meldingenVan(kf).join(' | '));
  assert.deepEqual(tabelVan(kf, 'groepen').rijen.map((r) => r[1].t), ['Kantoor', 'Fabriek']);
});

test('R1 via de logistische regressie: eigen indeling als voorspeller (kruistabel) en als uitkomst', async () => {
  const run = werkbank(scenarioS3(2), [PRODUCTIE_OF_REST, KANTOOR_OF_FABRIEK]);
  // "Werk je thuis?" per afdeling: Lab (3 ja, 3 nee) is verborgen. Vroeger gaf Exp(B) de odds van Rest, en met
  // Kantoor volgde de verborgen rij van Lab.
  const kruis = await run('kruistabel', { rij: 'w:41', kolom: 'v:4' }, { opties: { procenten: 'geen' } });
  assert.equal(kruis.geweigerd, true);
  const lg = await run('logistisch', { uitkomst: 'v:4', voorspellers: ['w:41'] }, { opties: { gebeurtenis: 'ja' } });
  assert.equal(lg.geweigerd, true);
  assert.match(meldingenVan(lg)[0], /deelt “Productie” en “Lab” van “Op welke afdeling werk je\?” anders in .* Met deze analyse zouden ze toch terug te rekenen zijn/);
  const lgKf = await run('logistisch', { uitkomst: 'v:4', voorspellers: ['w:42'] }, { opties: { gebeurtenis: 'ja' } });
  assert.ok(!lgKf.geweigerd, meldingenVan(lgKf).join(' | '));
  // Als uitkomst: uit B volgt (met de verdeling van vraag 2 op het dashboard) de som van vraag 2 bij Productie.
  const uit = await run('logistisch', { uitkomst: 'w:41', voorspellers: ['v:2'] });
  assert.equal(uit.geweigerd, true);
  assert.equal(meldingenVan(uit).at(-1), P_UITKOMST_GROEPEN('productie_of_rest', 'Ik voel me gepest'));
  assert.ok(!tabelVan(uit, 'coef'));
  const uitKf = await run('logistisch', { uitkomst: 'w:42', voorspellers: ['v:2'] });
  assert.ok(!uitKf.geweigerd, meldingenVan(uitKf).join(' | '));
});

// ---------- R7 via de regressie ----------

/** 3 keer "liever niet", allemaal in Kantoor (55 mensen); Productie 40 zonder "liever niet". */
function scenarioVertrek(lieverInKantoor = 3, eigenschappen = false) {
  const a = [];
  for (let i = 0; i < 55; i++) a.push({ 1: 'o1', 6: i < lieverInKantoor ? 'o3' : i < 21 ? 'o1' : 'o2', 2: 1 + (i % 5) });
  for (let i = 0; i < 40; i++) a.push({ 1: 'o2', 6: i < 15 ? 'o1' : 'o2', 2: 1 + ((i * 2) % 5) });
  const data = exportLijst([{ ...AFDELING, opties: opties('Kantoor', 'Productie') },
    { id: 6, type: 'meerkeuze', thema_id: 12, tekst: 'Ben je van plan binnen een jaar te vertrekken?', opties: opties('Ja', 'Nee', 'Zeg ik liever niet') },
    { id: 2, tekst: 'Ik ben betrokken' }], a);
  const defs = eigenschappen ? [{ id: 70, soort: 'eigenschappen', naam: '~eigenschappen', definitie: { variabelen: { 'v:6': { meetniveau: 'ordinaal' } } } }] : [];
  return werkbank(data, defs);
}

test('R7 via de regressie: "liever niet" per groep volgt niet uit de groepsgrootte in het model', async () => {
  // Uitkomst met twee waarden: vroeger stond Kantoor met N 52 in "Voorspellers met groepen" (55 − 52 = 3).
  const run = scenarioVertrek();
  const u = await run('regressie', { afhankelijk: 'v:6', voorspellers: ['v:1'] });
  assert.equal(u.geweigerd, true);
  assert.equal(meldingenVan(u)[0], P_LIEVER_NIET_PER_GROEP('Ben je van plan binnen een jaar te vertrekken?', ['Kantoor'], false));
  assert.ok(!getallen(u).includes('"w":52'));
  // Als getal-voorspeller (ordinaal gemaakt) naast afdeling: wie "liever niet" zei, valt weg uit het model.
  const getal = scenarioVertrek(3, true);
  const v = await getal('regressie', { afhankelijk: 'v:2', voorspellers: ['v:6', 'v:1'] });
  assert.equal(v.geweigerd, true, meldingenVan(v).join(' | '));
  assert.equal(meldingenVan(v)[0], P_LIEVER_NIET_PER_GROEP('Ben je van plan binnen een jaar te vertrekken?', ['Kantoor'], false));
  // Zonder "liever niet" in een kleine aantal: gewoon een model.
  for (const [r, spec] of [[scenarioVertrek(0), { afhankelijk: 'v:6', voorspellers: ['v:1'] }], [scenarioVertrek(0, true), { afhankelijk: 'v:2', voorspellers: ['v:6', 'v:1'] }],
    [scenarioVertrek(6), { afhankelijk: 'v:6', voorspellers: ['v:1'] }]]) {
    const w = await r('regressie', spec);
    assert.ok(!w.geweigerd, meldingenVan(w).join(' | '));
  }
});

// ---------- R3 binnen een selectie: analyses die de spreiding gebruiken ----------

/** s4: Kantoor [2, 3, 5, 5, 5] en Productie [3, 2, 5, 5, 5] op vraag 2; vragen 3 en 5 (thema Groei) zonder kleine cellen. */
function scenarioS4(perAfdeling = [[2, 3, 5, 5, 5], [3, 2, 5, 5, 5]]) {
  const a = [];
  perAfdeling.forEach((verdeling, k) => verdeling.forEach((n, w) => { for (let i = 0; i < n; i++) a.push({ 1: `o${k + 1}`, 2: w + 1 }); }));
  a.forEach((x, i) => { x[3] = 1 + (i % 4); x[5] = 2 + ((i * 3) % 4); x[4] = i % 2 ? 'ja' : 'nee'; });
  return exportLijst([{ ...AFDELING, opties: opties('Kantoor', 'Productie') }, { id: 2, tekst: 'Ik voel me gepest' },
    { id: 3, tekst: 'Ik kan mijn werk aan', thema_id: 11 }, { id: 5, tekst: 'Ik leer veel', thema_id: 11 }, { id: 4, type: 'janee', thema_id: 12, tekst: 'Werk je thuis?' }], a);
}
const ALLEEN_KANTOOR = { id: 52, soort: 'filter', naam: 'kantoor', definitie: { voorwaarden: [{ variabele: 'v:1', is: ['o1'] }] } };

test('R3 binnen "Alleen Kantoor": regressie, gepaarde t-toets, betrouwbaarheid, correlatie en logistisch gebruiken de spreiding niet', async () => {
  const run = werkbank(scenarioS4(), [ALLEEN_KANTOOR]);
  const tekst = P_SPREIDING_ANALYSE_SELECTIE('Ik voel me gepest');
  // Werkelijk in Kantoor: SD 1,3139 (kwadratensom 32,8). Vroeger: regressie-kwadratensom 32,8; β·SD(Groei)/B = 1,3139;
  // de SD van de verschillen 1,447 met r 0,180 en SD(Groei) 0,889 gaf 1,3139; α met de SD van de andere vragen ook.
  for (const [proc, vars] of [
    ['regressie', { afhankelijk: 'v:2', voorspellers: ['t:11'] }],
    ['regressie', { afhankelijk: 't:11', voorspellers: ['v:2'] }],
    ['gepaard', { x: ['v:2'], y: ['t:11'] }],
    ['betrouwbaarheid', { items: ['v:2', 'v:3', 'v:5'] }],
    ['correlatie', { variabelen: ['v:2', 'v:4', 't:11'] }],
  ]) {
    const u = await run(proc, vars, { filter: 52 });
    const m = meldingenVan(u);
    assert.ok(m.includes(tekst), `${proc}: ${m.join(' | ')}`);
    assert.ok(!/32\.8|1\.31/.test(getallen(u)), `${proc}: geen kwadratensom of SD van de vraag`);
    if (proc !== 'correlatie') assert.equal(u.geweigerd, true, proc);
  }
  // Logistisch (minstens 30 respondenten): Kantoor [2, 3, 10, 10, 10].
  const lgRun = werkbank(scenarioS4([[2, 3, 10, 10, 10], [3, 2, 10, 10, 10]]), [ALLEEN_KANTOOR]);
  const lg = await lgRun('logistisch', { uitkomst: 'v:4', voorspellers: ['v:2'] }, { filter: 52, opties: { gebeurtenis: 'ja' } });
  assert.equal(lg.geweigerd, true);
  assert.equal(meldingenVan(lg)[0], tekst);
  assert.ok(!(await lgRun('logistisch', { uitkomst: 'v:4', voorspellers: ['v:2'] }, { opties: { gebeurtenis: 'ja' } })).geweigerd, 'zonder selectie mag het');
  // De correlatie toont de andere paren wel, de vraag zelf alleen als ×.
  const cor = await run('correlatie', { variabelen: ['v:2', 'v:4', 't:11'] }, { filter: 52 });
  assert.ok(!cor.geweigerd, meldingenVan(cor).join(' | '));
  // Beschrijvende statistiek blijft: N en gemiddelde.
  const b = await run('beschrijvend', { variabelen: ['v:2'] }, { filter: 52 });
  assert.equal(tabelVan(b, 'beschrijvend').rijen[0][2].w, 3.4);
  // Zonder selectie staat de verdeling op het dashboard: dan mag alles.
  for (const [proc, vars] of [['regressie', { afhankelijk: 'v:2', voorspellers: ['t:11'] }], ['gepaard', { x: ['v:2'], y: ['t:11'] }],
    ['betrouwbaarheid', { items: ['v:2', 'v:3', 'v:5'] }]]) {
    const u = await run(proc, vars);
    assert.ok(!u.geweigerd, `${proc}: ${meldingenVan(u).join(' | ')}`);
  }
  // Binnen een selectie zonder kleine cellen ook.
  const groot = werkbank(scenarioS4([[5, 6, 5, 7, 5], [5, 5, 8, 5, 5]]), [ALLEEN_KANTOOR]);
  for (const [proc, vars] of [['regressie', { afhankelijk: 'v:2', voorspellers: ['t:11'] }], ['gepaard', { x: ['v:2'], y: ['t:11'] }]]) {
    const u = await groot(proc, vars, { filter: 52 });
    assert.ok(!u.geweigerd, `${proc}: ${meldingenVan(u).join(' | ')}`);
  }
});

// ---------- R12: de weigering van de correlatie noemt elke reden ----------

test('R12: een correlatie die helemaal wegvalt, noemt elke privacyreden één keer', async () => {
  const leeftijd = { id: 7, type: 'meerkeuze', thema_id: 12, tekst: 'Wat is je leeftijd?', kenmerk: 'leeftijd',
    opties: JSON.stringify([{ id: 'l1', label: 'Jonger dan 35 jaar' }, { id: 'l2', label: '35 tot 55 jaar' }, { id: 'l3', label: '55 jaar of ouder' }, { id: 'l4', label: 'Dat zeg ik liever niet' }]) };
  const diensttijd = { id: 8, type: 'meerkeuze', thema_id: 12, tekst: 'Hoe lang werk je hier?', kenmerk: 'diensttijd',
    opties: JSON.stringify([{ id: 'd1', label: 'Korter dan 1 jaar' }, { id: 'd2', label: '1 tot 5 jaar' }, { id: 'd3', label: '5 jaar of langer' }, { id: 'd4', label: 'Dat zeg ik liever niet' }]) };
  const a = Array.from({ length: 150 }, (_, i) => ({ 7: i < 3 ? 'l4' : `l${1 + (i % 3)}`, 8: i >= 146 ? 'd4' : `d${1 + (i % 3)}` }));
  const run = werkbank(exportLijst([leeftijd, diensttijd], a));
  const u = await run('correlatie', { variabelen: ['v:7', 'v:8'] });
  assert.equal(u.geweigerd, true);
  assert.equal(meldingenVan(u).at(-1), `${P_INDELING_ALS_GETAL('Wat is je leeftijd?')} ${P_INDELING_ALS_GETAL('Hoe lang werk je hier?')}`);
  assert.ok(P_PAAR_VERBORGEN.length > 0);
});

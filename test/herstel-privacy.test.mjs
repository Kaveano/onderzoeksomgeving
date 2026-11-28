// Hercontrole van de integratiefixes: de omwegen die nog openstonden (eigen indeling van afdeling, "Indelen in
// groepen" met één waarde per groep, spreiding per groep of selectie, "Zeg ik liever niet" bij een gewone vraag).
// Per omweg: de aanval van de reviewer lukt niet meer, en wat het dashboard wel toont, blijft zichtbaar.
// Zuiver: geen server nodig. Uitvoeren: node --test test/herstel-privacy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dashboardUitRijen as dashboard, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';
import { maakRekenkern } from '../public/js/beheer/werkbank/rekenkern.js';
import { getalWeergave } from '../public/js/beheer/werkbank/dataset.js';
import { indelingAlsGetalFout } from '../public/js/beheer/werkbank/procedures/basis.js';
import { CIJFERSCHALEN, SCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';
import {
  P_VERDELING_PER_GROEP, P_WORTEL_VERBORGEN, P_SPREIDING_PER_GROEP, P_SPREIDING_SELECTIE, P_VERDELING_IN_GROEP,
  P_LIEVER_NIET_PER_GROEP, P_LIEVER_NIET_SELECTIE,
} from '../public/js/beheer/werkbank/uitvoer-tekst.js';

function exportLijst(vragen, antwoorden) {
  const q = (v) => ({ vragenlijst_id: 1, thema_id: 10, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${v.id}`, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: v.id, kenmerk: '', ...v });
  return {
    export: { versie: 1, datum: '2026-11-28' },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN, vraagtypen: {} },
    onderzoek: { id: 1, titel: 'T', bedrijfsnaam: 'X', status: 'actief' },
    themas: [{ id: 10, naam: 'Werkdruk', volgorde: 1 }, { id: 12, naam: 'Achtergrond', volgorde: 2 }], meetpunten: [], meetmomenten: [{ id: 30, naam: 'Nulmeting', volgorde: 1 }],
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
const rijVan = (u, id, label) => tabelVan(u, id)?.rijen.find((r) => r[0].t === label);
const groepenIn = (u) => (tabelVan(u, 'pergroep')?.rijen || []).map((r) => r[0].t).filter((t) => t !== 'Totaal');
const verborgen = (c) => c.verborgen === true && c.w === null;

// ---------- Bevinding 1: een eigen indeling van afdeling ("Productie of rest") ----------

/** s3/s6: Kantoor 12, Productie 8, Lab 6; vraag 2 in Lab door 4 mensen beantwoord ([1, 1, 2, 1]); vraag 4 ja/nee. */
function scenarioS3({ labMetVraag2 = 4 } = {}) {
  const geheim = [1, 1, 2, 1, 2, 1];
  const a = [];
  for (let i = 0; i < 12; i++) a.push({ 1: 'o1', 2: 3 + (i % 3), 3: 2 + (i % 4), 4: i < 6 ? 'ja' : 'nee' });
  for (let i = 0; i < 8; i++) a.push({ 1: 'o2', 2: 2 + (i % 4), 3: 3 + (i % 3), 4: i < 4 ? 'ja' : 'nee' });
  for (let i = 0; i < 6; i++) a.push({ 1: 'o3', ...(i < labMetVraag2 ? { 2: geheim[i] } : {}), 3: 4 + (i % 2), 4: i < 3 ? 'ja' : 'nee' });
  return exportLijst([AFDELING, { id: 2, tekst: 'Ik voel me gepest' }, { id: 3, tekst: 'Ik kan mijn werk aan' },
    { id: 4, type: 'janee', thema_id: 12, tekst: 'Werk je thuis?' }], a);
}
const PRODUCTIE_OF_REST = { id: 41, soort: 'hercoderen', naam: 'productie_of_rest', definitie: { variabele: 'v:1', manier: 'categorieen', rest: 'leeg', groepen: [
  { code: 1, label: 'Productie', waarden: ['o2'] }, { code: 2, label: 'Rest', waarden: ['o1', 'o3'] }] } };
const KANTOOR_OF_FABRIEK = { id: 42, soort: 'hercoderen', naam: 'kantoor_of_fabriek', definitie: { variabele: 'v:1', manier: 'categorieen', rest: 'leeg', groepen: [
  { code: 1, label: 'Kantoor', waarden: ['o1'] }, { code: 2, label: 'Fabriek', waarden: ['o2', 'o3'] }] } };

test('bevinding 1: per "Productie of rest" zijn Productie en Rest niet meer te zien (Lab niet terug te rekenen)', async () => {
  const data = scenarioS3();
  // Het dashboard toont vraag 2 en het thema alleen bij Kantoor.
  const d = dashboard(rijenUitExport(data), { vragenlijst: 1, uitsplitsen: 1 }).selectie.uitsplitsing.groepen;
  assert.deepEqual(d.filter((g) => !g.vragen?.[0]?.verborgen).map((g) => g.label), ['Kantoor']);
  const run = werkbank(data, [PRODUCTIE_OF_REST, KANTOOR_OF_FABRIEK]);
  for (const dep of ['v:2', 't:10', 'v:3']) {
    const u = await run('pergroep', { afhankelijk: [dep], groep: 'w:41' });
    // Vroeger: Productie 8 (3,50; SD 1,195) en Rest 16 (3,313; SD 1,448); met Kantoor 12 (4,0; 0,853) volgde Lab [1, 1, 2, 1].
    assert.deepEqual(groepenIn(u), [], `${dep}: geen groep van de eigen indeling`);
    assert.ok(meldingenVan(u).some((t) => t === P_WORTEL_VERBORGEN(['Productie', 'Rest'], 'Op welke afdeling werk je?', ['Productie', 'Lab'])), `${dep}: ${meldingenVan(u).join(' | ')}`);
  }
  // Ook de t-toets.
  assert.equal((await run('ttoets', { afhankelijk: ['t:10'], groep: 'w:41' })).geweigerd, true);
  // Wat wel mag: een indeling die de verborgen groepen samen houdt (Kantoor tegenover Productie + Lab).
  const kf = await run('pergroep', { afhankelijk: ['t:10'], groep: 'w:42' });
  assert.deepEqual(groepenIn(kf), ['Kantoor', 'Fabriek']);
});

test('bevinding 1: een selectie op "Productie of rest" wordt geweigerd; Kantoor tegenover Fabriek mag', async () => {
  const data = scenarioS3();
  const run = werkbank(data, [PRODUCTIE_OF_REST, KANTOOR_OF_FABRIEK,
    { id: 43, soort: 'filter', naam: 'alleen_productie', definitie: { voorwaarden: [{ variabele: 'w:41', is: [1] }] } },
    { id: 44, soort: 'filter', naam: 'alleen_fabriek', definitie: { voorwaarden: [{ variabele: 'w:42', is: [2] }] } },
    { id: 45, soort: 'filter', naam: 'alleen_kantoor', definitie: { voorwaarden: [{ variabele: 'w:42', is: [1] }] } }]);
  // Vroeger: N 8, gemiddelde 3,5, SD 1,195 (de oorspronkelijke s6-aanval).
  const u = await run('beschrijvend', { variabelen: ['v:2'] }, { filter: 43 });
  assert.equal(u.geweigerd, true);
  assert.match(meldingenVan(u)[0], /haalt groepen uit elkaar/);
  assert.match(meldingenVan(u)[0], /“Productie” en “Lab”/);
  for (const filter of [44, 45]) assert.ok(!(await run('beschrijvend', { variabelen: ['v:2'] }, { filter })).geweigerd, `selectie ${filter}`);
});

test('bevinding 1: een kruistabel met "Productie of rest" haalt de verborgen rijen van afdeling niet uit elkaar', async () => {
  const data = scenarioS3();
  const run = werkbank(data, [PRODUCTIE_OF_REST, KANTOOR_OF_FABRIEK]);
  // Afdeling × "Werk je thuis?": in Lab 3 ja en 3 nee (verborgen), Productie ter aanvulling. Met Rest − Kantoor volgde Lab.
  const kt = await run('kruistabel', { rij: 'w:41', kolom: 'v:4' }, { opties: { procenten: 'geen' } });
  assert.equal(kt.geweigerd, true);
  assert.match(meldingenVan(kt)[0], /deelt “Productie” en “Lab” van “Op welke afdeling werk je\?” anders in/);
  const kf = await run('kruistabel', { rij: 'w:42', kolom: 'v:4' }, { opties: { procenten: 'geen' } });
  assert.ok(!kf.geweigerd, meldingenVan(kf).join(' | '));
});

test('bevinding 1: verbergt niets extra als het dashboard alle groepen toont', async () => {
  const data = scenarioS3({ labMetVraag2: 6 });
  const run = werkbank(data, [PRODUCTIE_OF_REST]);
  const u = await run('pergroep', { afhankelijk: ['t:10'], groep: 'w:41' });
  assert.deepEqual(groepenIn(u), ['Productie', 'Rest']);
});

// ---------- Bevinding 2 en 3: spreiding per groep en binnen een selectie (s4) ----------

/** s4: Kantoor [2, 3, 5, 5, 5] en Productie [3, 2, 5, 5, 5] (aantal keer antwoord 1 tot 5 op vraag 2). */
function scenarioS4(perAfdeling = [[2, 3, 5, 5, 5], [3, 2, 5, 5, 5]]) {
  const a = [];
  perAfdeling.forEach((verdeling, k) => verdeling.forEach((n, w) => { for (let i = 0; i < n; i++) a.push({ 1: `o${k + 1}`, 2: w + 1 }); }));
  return exportLijst([{ ...AFDELING, opties: opties('Kantoor', 'Productie') }, { id: 2, tekst: 'Ik voel me gepest' }], a);
}
const VIJF_GROEPEN = { id: 51, soort: 'hercoderen', naam: 'gepest5', definitie: { variabele: 'v:2', manier: 'grenzen', grenzen: [1.5, 2.5, 3.5, 4.5], labels: ['1', '2', '3', '4', '5'] } };
const ALLEEN_KANTOOR = { id: 52, soort: 'filter', naam: 'kantoor', definitie: { voorwaarden: [{ variabele: 'v:1', is: ['o1'] }] } };

test('bevinding 2: een kruistabel met "Indelen in groepen" (één waarde per groep) wordt net zo geweigerd', async () => {
  const run = werkbank(scenarioS4(), [VIJF_GROEPEN, ALLEEN_KANTOOR]);
  // Vroeger: Kantoor × × 5 5 5 | 20; met het gemiddelde 3,4 volgde x = 2 · 5 − (20 · 3,4 − 60) = 2.
  const kt = await run('kruistabel', { rij: 'v:1', kolom: 'w:51' }, { opties: { procenten: 'geen' } });
  assert.equal(kt.geweigerd, true);
  assert.equal(meldingenVan(kt)[0], P_VERDELING_PER_GROEP('gepest5'));
  assert.doesNotMatch(P_VERDELING_PER_GROEP('x'), /met die indeling kan het wel/, 'de melding raadt de omweg niet meer aan');
  const fr = await run('frequenties', { variabelen: ['w:51'] }, { filter: 52 });
  assert.equal(fr.geweigerd, true);
  // Zonder kleine cellen kan de kruistabel van de indeling wel.
  const groot = werkbank(scenarioS4([[5, 5, 5, 5, 5], [5, 5, 5, 5, 5]]), [VIJF_GROEPEN]);
  assert.ok(!(await groot('kruistabel', { rij: 'v:1', kolom: 'w:51' }, { opties: { procenten: 'geen' } })).geweigerd);
});

test('bevinding 3: Gemiddelden per groep toont bij een groep met een verborgen cel alleen N en gemiddelde', async () => {
  const data = scenarioS4();
  const run = werkbank(data);
  const u = await run('pergroep', { afhankelijk: ['v:2'], groep: 'v:1' });
  const kantoor = rijVan(u, 'pergroep', 'Kantoor');
  // Vroeger: SD 1,314 en mediaan 3,5; met de verdeling op het dashboard was er precies één oplossing [2, 3, 5, 5, 5].
  assert.equal(kantoor[1].w, 20);
  assert.equal(kantoor[2].w, 3.4);
  assert.ok([3, 4, 5].every((k) => verborgen(kantoor[k])), 'SD, SE en mediaan zijn ×');
  assert.ok(verborgen(rijVan(u, 'pergroep', 'Productie')[3]));
  assert.ok(meldingenVan(u).includes(P_SPREIDING_PER_GROEP('Ik voel me gepest', ['Kantoor', 'Productie'], false)));
  // Het totaal is de hele vragenlijst: die verdeling staat op het dashboard, dus de spreiding mag.
  assert.ok(!verborgen(rijVan(u, 'pergroep', 'Totaal')[3]));
  // Het dashboard toont hetzelfde gemiddelde.
  assert.equal(dashboard(rijenUitExport(data), { vragenlijst: 1, uitsplitsen: 1 }).selectie.uitsplitsing.groepen[0].vragen[0].gemiddelde, 3.4);
  // Een toets gebruikt de spreiding per groep: geen groep kan dan meedoen.
  const tt = await run('ttoets', { afhankelijk: ['v:2'], groep: 'v:1' });
  assert.equal(tt.geweigerd, true);
  assert.ok(meldingenVan(tt).some((t) => t === P_VERDELING_IN_GROEP('Ik voel me gepest', ['Kantoor', 'Productie'])), meldingenVan(tt).join(' | '));
  assert.equal((await run('anova', { afhankelijk: ['v:2'], factor: 'v:1' })).geweigerd, true);
  // Zonder kleine cellen: alles zichtbaar en de toets loopt.
  const groot = werkbank(scenarioS4([[5, 6, 5, 7, 5], [5, 5, 8, 5, 5]]));
  const g = await groot('pergroep', { afhankelijk: ['v:2'], groep: 'v:1' });
  assert.ok(!verborgen(rijVan(g, 'pergroep', 'Kantoor')[3]));
  assert.ok(!(await groot('ttoets', { afhankelijk: ['v:2'], groep: 'v:1' })).geweigerd);
});

test('bevinding 3: Beschrijvende statistiek binnen "Alleen Kantoor" toont alleen N en gemiddelde', async () => {
  const run = werkbank(scenarioS4(), [ALLEEN_KANTOOR]);
  const u = await run('beschrijvend', { variabelen: ['v:2'] }, { filter: 52 });
  assert.ok(!u.geweigerd);
  const rij = rijVan(u, 'beschrijvend', 'Ik voel me gepest');
  // Vroeger: SD 1,3139, scheefheid −0,38 en kurtosis −0,84: alleen [2, 3, 5, 5, 5] past daarbij.
  assert.equal(rij[1].w, 20);
  assert.equal(rij[2].w, 3.4);
  assert.ok(rij.slice(3).every(verborgen), 'SD, SE, interval, mediaan, minimum, maximum, scheefheid en kurtosis zijn ×');
  assert.ok(meldingenVan(u).includes(P_SPREIDING_SELECTIE('Ik voel me gepest')));
  assert.doesNotMatch(u.apa?.rapport || JSON.stringify(u.apa), /SD/);
  // Gepaard en betrouwbaarheid binnen dezelfde selectie tonen de SD ook niet.
  const data = scenarioS4();
  data.vragen.push({ ...data.vragen[1], id: 3, tekst: 'Ik kan mijn werk aan', volgorde: 3 });
  data.inzendingen.forEach((x, i) => { x.antwoorden[3] = 1 + ((i * 7) % 5); });
  const run2 = werkbank(data, [ALLEEN_KANTOOR]);
  const gp = await run2('gepaard', { x: ['v:2'], y: ['v:3'] }, { filter: 52 });
  assert.ok(!gp.geweigerd, meldingenVan(gp).join(' | '));
  assert.ok(verborgen(tabelVan(gp, 'gemiddelden').rijen[0][4]));
  const ba = await run2('betrouwbaarheid', { items: ['v:2', 'v:3'] }, { filter: 52 });
  if (!ba.geweigerd) assert.ok(verborgen(tabelVan(ba, 'items').rijen[0][2]));
  // Zonder selectie staat de verdeling op het dashboard: dan alles.
  const alles = await run('beschrijvend', { variabelen: ['v:2'] });
  assert.ok(!verborgen(rijVan(alles, 'beschrijvend', 'Ik voel me gepest')[3]));
});

// ---------- Regressie door J2: Ja / Nee / "Zeg ik liever niet" bij een gewone vraag ----------

/** 3 keer "liever niet", allemaal in Kantoor (55 mensen); Productie 40 zonder "liever niet". */
function scenarioVertrek(lieverInKantoor = 3) {
  const a = [];
  for (let i = 0; i < 55; i++) a.push({ 1: 'o1', 6: i < lieverInKantoor ? 'o3' : i < 21 ? 'o1' : 'o2' });
  for (let i = 0; i < 40; i++) a.push({ 1: 'o2', 6: i < 15 ? 'o1' : 'o2' });
  return exportLijst([{ ...AFDELING, opties: opties('Kantoor', 'Productie') },
    { id: 6, type: 'meerkeuze', thema_id: 12, tekst: 'Ben je van plan binnen een jaar te vertrekken?', opties: opties('Ja', 'Nee', 'Zeg ik liever niet') }], a);
}

test('regressie J2: "liever niet" per groep is niet terug te rekenen uit de groepsgrootte min N', async () => {
  const run = werkbank(scenarioVertrek(), [{ id: 61, soort: 'filter', naam: 'kantoor', definitie: { voorwaarden: [{ variabele: 'v:1', is: ['o1'] }] } }]);
  const fr = await run('frequenties', { variabelen: ['v:1'] });
  assert.equal(rijVan(fr, 'freq-', 'Kantoor')[1].w, 55);
  for (const [proc, vars] of [['pergroep', { afhankelijk: ['v:6'], groep: 'v:1' }], ['ttoets', { afhankelijk: ['v:6'], groep: 'v:1' }]]) {
    const u = await run(proc, vars);
    // Vroeger: Kantoor N 52 en gemiddelde 1,654; 55 − 52 = 3 = de verborgen cel (Kantoor, liever niet).
    assert.ok(!JSON.stringify(u.onderdelen).includes('"w":52'), `${proc}: geen N 52`);
    assert.ok(u.geweigerd || !groepenIn(u).includes('Kantoor'), proc);
    assert.ok(meldingenVan(u).includes(P_LIEVER_NIET_PER_GROEP('Ben je van plan binnen een jaar te vertrekken?')), `${proc}: ${meldingenVan(u).join(' | ')}`);
  }
  // Binnen de selectie Kantoor: N 52 van 55 zou het ook verraden.
  const sel = await run('beschrijvend', { variabelen: ['v:6'] }, { filter: 61 });
  assert.equal(sel.geweigerd, true);
  assert.ok(!JSON.stringify(sel.onderdelen).includes('"w":52'));
  // De regel zelf: binnen een selectie moet het aantal "liever niet" 0 of minstens 5 zijn.
  const kern = maakRekenkern();
  kern.laad({ data: scenarioVertrek(), datasets: [], definities: [], bron: { soort: 'lijst', id: 1 } });
  const v6 = getalWeergave(kern.dataset({ soort: 'lijst', id: 1 }).perId.get('v:6'));
  const F = Uint8Array.from(kern.dataset({ soort: 'lijst', id: 1 }).perId.get('v:1').waarden, (w) => (w === 1 ? 1 : 0));
  const basis = Uint8Array.from(v6.reden, (x, r) => (x === 0 && F[r] ? 1 : 0));
  assert.equal(indelingAlsGetalFout(v6, basis, 5, F), P_LIEVER_NIET_SELECTIE('Ben je van plan binnen een jaar te vertrekken?'));
  assert.equal(indelingAlsGetalFout(v6, basis, 5, null), null, 'zonder selectie: de verdeling staat op het dashboard');
  // Zonder selectie mag het (de hele verdeling staat op het dashboard).
  assert.ok(!(await run('beschrijvend', { variabelen: ['v:6'] })).geweigerd);
  // Niemand "liever niet": beide groepen gewoon zichtbaar.
  const geen = werkbank(scenarioVertrek(0));
  assert.deepEqual(groepenIn(await geen('pergroep', { afhankelijk: ['v:6'], groep: 'v:1' })), ['Kantoor', 'Productie']);
});

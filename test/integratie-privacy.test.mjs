// Integratiebevindingen over privacy tussen schermen (P1–P7, J1, J4, J7): één maskeerregel op elk scherm.
// Per bevinding: de aanval van de reviewer (terugrekenen van een verborgen getal) lukt niet meer, en de getallen
// die het dashboard wel laat zien (groepen van minstens 5), blijven zichtbaar.
// Zuiver: geen server nodig. Uitvoeren: node --test test/integratie-privacy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dashboardUitRijen } from '../public/js/beheer/dashboard-rekenen.js';
import { kijkerDashboard } from '../src/routes/delen.js';

const MAG_ALLES = { dashboard: true, open_antwoorden: false, tussenstand: false, stukken: [], rapporten: [] };

// ---------- P4: verloop van een ja/nee-achtergrondvraag, bekeken vanuit een kopie zonder kenmerk ----------

/** Lijst A (Nulmeting) met de ja/nee-vraag als kenmerk; kopie B (Vervolg) met dezelfde vraag zonder kenmerk en zonder uitsplitsen. */
function rijenKopie([jaA, neeA, leegA], [jaB, neeB], { uitsplitsenA = 0, kenmerkA = 'leidinggevend' } = {}) {
  const q = (id, lijst, bron, extra) => ({
    id, vragenlijst_id: lijst, thema_id: 9, meetpunt_id: null, type: 'janee', tekst: 'Geef je leiding aan anderen?', toelichting: '', opties: '[]',
    schaal_soort: 'eens', meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: bron, volgorde: 1, kenmerk: '', ...extra,
  });
  const inz = [];
  const voeg = (lijst, vraag, ja, nee, leeg = 0) => {
    for (let k = 0; k < ja; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: { [vraag]: 'ja' } });
    for (let k = 0; k < nee; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: { [vraag]: 'nee' } });
    for (let k = 0; k < leeg; k++) inz.push({ vragenlijst_id: lijst, datum: '2026-01-01', a: {} });
  };
  voeg(1, 11, jaA, neeA, leegA);
  voeg(2, 21, jaB, neeB);
  return {
    onderzoek: { id: 1, bedrijfsnaam: 'X', titel: 'Y', status: 'actief' },
    schalen: {},
    themas: [{ id: 9, naam: 'Achtergrond' }],
    meetpunten: [],
    meetmomenten: [{ id: 1, naam: 'Nulmeting', datum: '2025-01-01' }, { id: 2, naam: 'Vervolg', datum: '2026-01-01' }],
    vragenlijsten: [
      { id: 1, titel: 'Nulmeting', status: 'gesloten', code: 'a', meetmoment_id: 1, aantal_uitgenodigd: null },
      { id: 2, titel: 'Vervolg', status: 'gesloten', code: 'b', meetmoment_id: 2, aantal_uitgenodigd: null },
    ],
    vragen: [q(11, 1, null, { kenmerk: kenmerkA, uitsplitsen: uitsplitsenA }), q(21, 2, 11)],
    inzendingen: inz,
    eigen_invoer: [],
  };
}
const kijkVerloop = (rijen, lijst) => kijkerDashboard(structuredClone(dashboardUitRijen(rijen, { vragenlijst: lijst, uitsplitsen: null })), MAG_ALLES)
  .selectie.vragen[0].verloop;

test('P4: het verborgen ja-aantal van lijst A staat niet in het verloop van kopie B zonder kenmerk', () => {
  // Lijst A: ja 3, nee 18, niet ingevuld 2 (n 23). Vroeger gaf ?vragenlijst=B voor Nulmeting percentage_ja 14,29 en n 21:
  // ja = 3 en niet ingevuld = 23 − 21 = 2.
  const rijen = rijenKopie([3, 18, 2], [10, 12]);
  const vanA = kijkVerloop(rijen, 1).find((p) => p.meetmoment_id === 1);
  const vanB = kijkVerloop(rijen, 2).find((p) => p.meetmoment_id === 1);
  assert.equal(vanA.percentage_ja, null);
  assert.equal(vanB.percentage_ja, null, 'vanuit de kopie is het punt ook verborgen');
  assert.equal(vanB.n, null);
  const beheerB = dashboardUitRijen(rijen, { vragenlijst: 2, uitsplitsen: null }).selectie.vragen[0].verloop.find((p) => p.meetmoment_id === 1);
  assert.deepEqual(beheerB, { meetmoment_id: 1, naam: 'Nulmeting', percentage_ja: null, n: null, klein: true, open: false }, 'ook op het beheerscherm');
  // De aanval: ja = percentage × n en niet ingevuld = lijstN − n. Zonder getallen lukt dat niet.
  assert.ok(!JSON.stringify(kijkVerloop(rijen, 2)).includes('14.28'));
  assert.deepEqual(kijkVerloop(rijen, 1), kijkVerloop(rijen, 2), 'vanuit elke vragenlijst hetzelfde verloop');
  // Hetzelfde als lijst A alleen "uitsplitsen" heeft (geen kenmerk).
  const alleenUitsplitsen = rijenKopie([3, 18, 2], [10, 12], { kenmerkA: '', uitsplitsenA: 1 });
  assert.equal(kijkVerloop(alleenUitsplitsen, 2).find((p) => p.meetmoment_id === 1).percentage_ja, null);
});

test('P4: is elke bijdragende lijst veilig, dan blijft het verloop vanuit de kopie zichtbaar', () => {
  const rijen = rijenKopie([5, 18, 0], [10, 12]);
  const punt = kijkVerloop(rijen, 2).find((p) => p.meetmoment_id === 1);
  assert.equal(punt.n, 23);
  assert.equal(Math.round(punt.percentage_ja * 100) / 100, Math.round((5 / 23) * 10000) / 100);
  assert.equal(kijkVerloop(rijen, 2).find((p) => p.meetmoment_id === 2).percentage_ja, Math.round((10 / 22) * 10000) / 100);
  // Zonder kenmerk of uitsplitsen in één van beide lijsten verandert er niets: een gewone ja/nee-vraag toont alles.
  const gewoon = rijenKopie([3, 18, 2], [10, 12], { kenmerkA: '' });
  assert.equal(kijkVerloop(gewoon, 2).find((p) => p.meetmoment_id === 1).n, 21);
});

// ---------- Werkbank tegenover het dashboard (P1, P2, P3) ----------

import { dashboardUitRijen as dashboard, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';
import { maakRekenkern } from '../public/js/beheer/werkbank/rekenkern.js';
import { CIJFERSCHALEN, SCHALEN } from '../src/lib/schalen.js';
import { KENMERKEN } from '../public/js/beheer/kenmerken.js';
import { P_DASHBOARD_VERBORGEN, P_VERDELING_PER_GROEP } from '../public/js/beheer/werkbank/uitvoer-tekst.js';

/** Een export (zoals gegevens.js hem geeft) met één vragenlijst. vragen: rijen van de tabel vragen (zonder vragenlijst_id). */
function exportLijst(vragen, antwoorden, { themas = [{ id: 10, naam: 'Werkdruk', volgorde: 1 }, { id: 12, naam: 'Achtergrond', volgorde: 2 }], extra = {} } = {}) {
  const q = (v) => ({ vragenlijst_id: 1, thema_id: 10, meetpunt_id: null, type: 'schaal', tekst: `Vraag ${v.id}`, toelichting: '', opties: '[]', schaal_soort: 'eens',
    meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: v.id, kenmerk: '', ...v });
  return {
    export: { versie: 1, datum: '2026-11-27' },
    lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN, vraagtypen: {} },
    onderzoek: { id: 1, titel: 'T', bedrijfsnaam: 'X', status: 'actief' },
    themas, meetpunten: [], meetmomenten: [{ id: 30, naam: 'Nulmeting', volgorde: 1 }],
    vragenlijsten: [{ id: 1, titel: 'Lijst', meetmoment_id: 30, status: 'gesloten' }],
    vragen: vragen.map(q),
    inzendingen: antwoorden.map((a, i) => ({ id: (i + 1) * 31, vragenlijst_id: 1, datum: '2026-10-01', antwoorden: a })),
    eigen_invoer: [], stukken: [], acties: [], rapporten: [], werkbank_definities: [], werkbank_analyses: [],
    codes: [], coderingen: [], citaten: [], bronnen_gekoppeld: [], hr_instellingen: {}, personeelscijfers: [],
    ...extra,
  };
}
const AFDELING = { id: 1, type: 'meerkeuze', thema_id: 12, tekst: 'Op welke afdeling werk je?', kenmerk: 'afdeling', uitsplitsen: 1,
  opties: JSON.stringify([{ id: 'oa', label: 'Kantoor' }, { id: 'ob', label: 'Productie' }, { id: 'oc', label: 'Lab' }]) };

/**
 * Scenario s3/s6 van de review: Kantoor 12, Productie 8, Lab 6. Vraag 2 ("gepest") en vraag 3 in één thema; vraag 2 is in
 * Lab door 4 mensen beantwoord, met de geheime antwoorden [1, 1, 2, 1].
 */
function scenarioGroepen({ labMetVraag2 = 4 } = {}) {
  const geheim = [1, 1, 2, 1, 2, 1];
  const a = [];
  for (let i = 0; i < 12; i++) a.push({ 1: 'oa', 2: 3 + (i % 3), 3: 2 + (i % 4) });
  for (let i = 0; i < 8; i++) a.push({ 1: 'ob', 2: 2 + (i % 4), 3: 3 + (i % 3) });
  for (let i = 0; i < 6; i++) a.push({ 1: 'oc', ...(i < labMetVraag2 ? { 2: geheim[i] } : {}), 3: 4 + (i % 2) });
  return exportLijst([AFDELING, { id: 2, tekst: 'Ik voel me gepest' }, { id: 3, tekst: 'Ik kan mijn werk aan' }], a);
}

function werkbank(data, definities = []) {
  const kern = maakRekenkern();
  const defs = definities.map((d) => ({ dataset_id: null, label: d.naam, verwijderd_op: null, ...d, definitie: JSON.stringify(d.definitie) }));
  kern.laad({ data, datasets: [], definities: defs, bron: { soort: 'lijst', id: 1 } });
  return (procedure, variabelen, { filter = null, opties = {} } = {}) => kern.voerUit({ versie: 1, bron: { soort: 'lijst', id: 1 }, filter, procedure, variabelen, opties }, { streng: true, nu: '2026-11-27' });
}
const tabelVan = (u, id) => u.onderdelen.find((o) => o.soort === 'tabel' && o.id.startsWith(id));
const groepenIn = (u) => tabelVan(u, 'pergroep').rijen.map((r) => r[0].t).filter((t) => t !== 'Totaal');
const meldingenVan = (u) => u.onderdelen.filter((o) => o.soort === 'melding').map((o) => o.tekst);
const rijVan = (u, id, label) => tabelVan(u, id).rijen.find((r) => r[0].t === label);

test('P2: de werkbank verbergt per groep wat het dashboard samen verbergt (thema, andere vragen, scores daaruit)', async () => {
  const data = scenarioGroepen();
  const d = dashboard(rijenUitExport(data), { vragenlijst: 1, uitsplitsen: 1 }).selectie.uitsplitsing.groepen;
  const zichtbaarOpDashboard = d.filter((g) => !g.vragen?.[0]?.verborgen).map((g) => g.label);
  assert.deepEqual(zichtbaarOpDashboard, ['Kantoor'], 'het dashboard toont vraag 2, vraag 3 en het thema alleen bij Kantoor');
  const run = werkbank(data, [
    { id: 1, soort: 'bereken', naam: 'samen', definitie: { functie: 'gemiddelde', variabelen: ['v:2', 'v:3'] } },
    { id: 2, soort: 'omscoren', naam: 'gepest_om', definitie: { variabele: 'v:2' } },
  ]);
  for (const dep of ['v:2', 'v:3', 't:10', 'w:1', 'w:2']) {
    const u = await run('pergroep', { afhankelijk: [dep], groep: 'v:1' });
    assert.deepEqual(groepenIn(u), ['Kantoor'], `${dep}: alleen Kantoor`);
  }
  const t = await run('pergroep', { afhankelijk: ['t:10'], groep: 'v:1' });
  assert.ok(meldingenVan(t).includes(P_DASHBOARD_VERBORGEN(['Productie', 'Lab'])));
  // De aanval: vraag 2 bij Productie = 2 × thema − vraag 3. Zonder thema en vraag 3 per groep lukt dat niet.
  assert.equal(rijVan(t, 'pergroep', 'Productie'), undefined);
  // Ook de t-toets, de variantieanalyse en de regressie (een B per groep is een verschil in gemiddelden).
  assert.equal((await run('anova', { afhankelijk: ['t:10'], factor: 'v:1' })).geweigerd, true);
  const rg = await run('regressie', { afhankelijk: 't:10', voorspellers: ['v:1'] });
  const groepen = tabelVan(rg, 'groepen');
  assert.deepEqual(groepen.samenstelling.map((x) => x.labels), [['Kantoor'], ['Productie', 'Lab']], 'Productie en Lab samen');
});

test('P2: wat het dashboard wel laat zien, laat de werkbank ook zien', async () => {
  // Lab beantwoordt vraag 2 nu met 6: niets is verborgen, dus alle groepen staan erin (op het dashboard en in de werkbank).
  const data = scenarioGroepen({ labMetVraag2: 6 });
  const d = dashboard(rijenUitExport(data), { vragenlijst: 1, uitsplitsen: 1 }).selectie.uitsplitsing.groepen;
  assert.ok(d.every((g) => !g.vragen[0].verborgen && !g.themas[0].verborgen));
  const run = werkbank(data);
  for (const dep of ['v:2', 'v:3', 't:10']) assert.deepEqual(groepenIn(await run('pergroep', { afhankelijk: [dep], groep: 'v:1' })), ['Kantoor', 'Productie', 'Lab'], dep);
  const pg = await run('pergroep', { afhankelijk: ['v:2'], groep: 'v:1' });
  assert.equal(rijVan(pg, 'pergroep', 'Kantoor')[2].w, 4, 'Kantoor gemiddeld 4, zoals op het dashboard');
  assert.ok(!(await run('anova', { afhankelijk: ['t:10'], factor: 'v:1' })).geweigerd);
});

test('P1: een selectie op een groep die bij deze vraag ter aanvulling verborgen is, wordt geweigerd', async () => {
  const data = scenarioGroepen();
  const run = werkbank(data, [
    { id: 11, soort: 'filter', naam: 'productie', definitie: { voorwaarden: [{ variabele: 'v:1', is: ['ob'] }] } },
    { id: 12, soort: 'filter', naam: 'kantoor', definitie: { voorwaarden: [{ variabele: 'v:1', is: ['oa'] }] } },
    { id: 13, soort: 'filter', naam: 'niet_kantoor', definitie: { voorwaarden: [{ variabele: 'v:1', niet: ['oa'] }] } },
    { id: 14, soort: 'filter', naam: 'zonder_lab', definitie: { voorwaarden: [{ variabele: 'v:1', niet: ['oc'] }] } },
  ]);
  // Vroeger: N 8, gemiddelde 3,5, SD 1,195 voor Productie; met het totaal en Kantoor volgden de antwoorden van Lab.
  for (const filter of [11, 14]) {
    for (const [proc, vars] of [['beschrijvend', { variabelen: ['v:2'] }], ['frequenties', { variabelen: ['v:2'] }], ['correlatie', { variabelen: ['v:2', 'v:3'] }]]) {
      const u = await run(proc, vars, { filter });
      assert.equal(u.geweigerd, true, `${proc} met selectie ${filter}`);
      assert.match(meldingenVan(u)[0], /haalt groepen uit elkaar/);
    }
  }
  // Wel: een selectie op een groep die het dashboard toont (Kantoor), of op alle verborgen groepen samen.
  const kantoor = await run('beschrijvend', { variabelen: ['v:2'] }, { filter: 12 });
  assert.ok(!kantoor.geweigerd);
  assert.equal(rijVan(kantoor, 'beschrijvend', 'Ik voel me gepest')[1].w, 12);
  const samen = await run('beschrijvend', { variabelen: ['v:2'] }, { filter: 13 });
  assert.ok(!samen.geweigerd, 'Productie en Lab samen (12) mag: dat volgt ook uit het totaal min Kantoor');
  assert.equal(rijVan(samen, 'beschrijvend', 'Ik voel me gepest')[1].w, 12);
  // Bij vraag 3 (alle groepen ook op het dashboard verborgen behalve Kantoor) geldt hetzelfde.
  assert.equal((await run('beschrijvend', { variabelen: ['v:3'] }, { filter: 11 })).geweigerd, true);
});

test('P3: een kruistabel afdeling × schaalvraag met verborgen cellen komt niet naast het gemiddelde per groep', async () => {
  // Kantoor 20 met [2, 3, 5, 5, 5] en Productie 20 met [3, 2, 5, 5, 5] (aantal keer antwoord 1 tot 5).
  const a = [];
  const voeg = (afd, verdeling) => verdeling.forEach((n, w) => { for (let k = 0; k < n; k++) a.push({ 1: afd, 2: w + 1 }); });
  voeg('oa', [2, 3, 5, 5, 5]);
  voeg('ob', [3, 2, 5, 5, 5]);
  const data = exportLijst([{ ...AFDELING, opties: JSON.stringify([{ id: 'oa', label: 'Kantoor' }, { id: 'ob', label: 'Productie' }]) }, { id: 2, tekst: 'Ik voel me gepest' }], a);
  const run = werkbank(data, [
    { id: 21, soort: 'filter', naam: 'kantoor', definitie: { voorwaarden: [{ variabele: 'v:1', is: ['oa'] }] } },
    { id: 22, soort: 'hercoderen', naam: 'gepest3', definitie: { variabele: 'v:2', manier: 'categorieen', rest: 'leeg', groepen: [
      { code: 1, label: 'Oneens', waarden: [1, 2] }, { code: 2, label: 'Neutraal', waarden: [3] }, { code: 3, label: 'Eens', waarden: [4, 5] }] } },
  ]);
  // Het gemiddelde per groep blijft (het dashboard toont het ook): Kantoor 3,4.
  const pg = await run('pergroep', { afhankelijk: ['v:2'], groep: 'v:1' });
  assert.equal(rijVan(pg, 'pergroep', 'Kantoor')[2].w, 3.4);
  assert.equal(dashboard(rijenUitExport(data), { vragenlijst: 1, uitsplitsen: 1 }).selectie.uitsplitsing.groepen[0].vragen[0].gemiddelde, 3.4);
  // Vroeger: kruistabel met ×-cellen bij 1 en 2; dan was x = 70 − 20 × 3,4 = 2. Nu geen kruistabel.
  const kt = await run('kruistabel', { rij: 'v:1', kolom: 'v:2' }, { opties: { procenten: 'geen' } });
  assert.equal(kt.geweigerd, true);
  assert.equal(meldingenVan(kt)[0], P_VERDELING_PER_GROEP('Ik voel me gepest'));
  // Ook niet als verdeling binnen een selectie (Beschrijvende statistiek van die selectie verraadt de cellen).
  const fr = await run('frequenties', { variabelen: ['v:2'] }, { filter: 21 });
  assert.equal(fr.geweigerd, true);
  assert.equal(meldingenVan(fr)[0], P_VERDELING_PER_GROEP('Ik voel me gepest'));
  assert.ok(!(await run('beschrijvend', { variabelen: ['v:2'] }, { filter: 21 })).geweigerd);
  // Met de vraag ingedeeld in drie groepen kan de kruistabel wel (zonder verborgen cellen).
  const kt3 = await run('kruistabel', { rij: 'v:1', kolom: 'w:22' }, { opties: { procenten: 'geen' } });
  assert.ok(!kt3.geweigerd, meldingenVan(kt3).join(' '));
  assert.deepEqual(rijVan(kt3, 'kruistabel', 'Kantoor').slice(1, 4).map((c) => c.w), [5, 5, 10]);
  // Zonder kleine cellen blijft de kruistabel van de vraag zelf gewoon staan.
  const groot = [];
  for (const afd of ['oa', 'ob']) for (let w = 1; w <= 5; w++) for (let k = 0; k < 5; k++) groot.push({ 1: afd, 2: w });
  const run2 = werkbank(exportLijst([{ ...AFDELING, opties: JSON.stringify([{ id: 'oa', label: 'Kantoor' }, { id: 'ob', label: 'Productie' }]) }, { id: 2, tekst: 'Ik voel me gepest' }], groot));
  assert.ok(!(await run2('kruistabel', { rij: 'v:1', kolom: 'v:2' }, { opties: { procenten: 'geen' } })).geweigerd);
});

test('P3: een indeling als getal (zoals leeftijd) per groep volgt de kruistabelregel', async () => {
  const leeftijd = { id: 4, type: 'meerkeuze', thema_id: 12, tekst: 'Wat is je leeftijd?', kenmerk: 'leeftijd',
    opties: JSON.stringify([{ id: 'l1', label: 'Jonger dan 35 jaar' }, { id: 'l2', label: '35 tot 55 jaar' }, { id: 'l3', label: '55 jaar of ouder' }]) };
  const a = [];
  // Kantoor: 10 / 8 / 2 (de 2 is klein); Productie: 7 / 7 / 6.
  for (const [afd, v] of [['oa', [10, 8, 2]], ['ob', [7, 7, 6]]]) v.forEach((n, k) => { for (let i = 0; i < n; i++) a.push({ 1: afd, 4: `l${k + 1}` }); });
  const data = exportLijst([{ ...AFDELING, opties: JSON.stringify([{ id: 'oa', label: 'Kantoor' }, { id: 'ob', label: 'Productie' }]) }, leeftijd], a);
  const run = werkbank(data);
  const u = await run('pergroep', { afhankelijk: ['v:4'], groep: 'v:1' });
  // Met het gemiddelde en de spreiding van Kantoor (3 waarden) zou de verborgen cel 2 volgen: geen enkele groep blijft over.
  assert.equal(u.geweigerd, true, 'Kantoor heeft een kleine cel, Productie gaat ter aanvulling mee');
});

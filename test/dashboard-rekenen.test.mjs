// Tests voor public/js/beheer/dashboard-rekenen.js: de browser rekent uit de export precies hetzelfde uit als
// de server voor GET /dashboard (BOUWPLAN §3.2, P1 criterium 3), en een kleine groep in een achtergrondvraag
// ("Anders: 1") staat nergens in beeld (criterium 4).
// Uitvoeren: node --test test/dashboard-rekenen.test.mjs   (er is geen server voor nodig)
//
// Wrangler voert alle migraties uit op een lege, lokale D1-database in een tijdelijke map (met een eigen, tijdelijk
// configuratiebestand). De gegevens schrijven we rechtstreeks via getPlatformProxy; daarna roepen we de echte
// routes aan (dashboard en export/data) en vergelijken we met dashboardUitRijen(rijenUitExport(export)).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { dashboard } from '../src/routes/dashboard.js';
import { data as exportData } from '../src/routes/export.js';
import * as delen from '../src/routes/delen.js';
import { kijkerDashboard } from '../src/routes/delen.js';
import { dashboardUitRijen, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';
import { verzamelFeiten, rapportNaarBlokken, standaardInhoud, blokkenNaarTekst } from '../public/js/beheer/rapport-feiten.js';
import { excelBladen } from '../public/js/beheer/export-bestanden.js';
import { VERBORGEN } from '../public/js/beheer/privacy.js';

const MIGRATIES = fileURLToPath(new URL('../migrations/', import.meta.url));
const NU = '2026-11-27T10:00:00.000Z';

let map;
let proxy;
let env;

/** Vaste reeks "willekeurige" getallen, zodat elke run dezelfde antwoorden geeft. */
function lcg(zaad) {
  let s = zaad >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const reeks = (opdrachten) => env.DB.batch(opdrachten.map(([sql, ...p]) => env.DB.prepare(sql).bind(...p)));
const opties = (...labels) => JSON.stringify(labels.map((l, i) => ({ id: `o${i + 1}`, label: l })));
const lijstOpties = (lijst) => JSON.stringify(lijst.map(([id, label]) => ({ id, label })));

async function vraag(id, lijst, thema, type, tekst, extra = {}) {
  const v = { meetpunt_id: null, opties: '[]', schaal_soort: 'eens', meerdere_antwoorden: 0, weet_niet: 0, uitsplitsen: 0, bron_vraag_id: null, volgorde: id % 100, kenmerk: '', ...extra };
  return [`INSERT INTO vragen (id, vragenlijst_id, thema_id, meetpunt_id, type, tekst, opties, schaal_soort, meerdere_antwoorden, weet_niet, uitsplitsen, bron_vraag_id, volgorde, kenmerk)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, lijst, thema, v.meetpunt_id, type, tekst, v.opties, v.schaal_soort, v.meerdere_antwoorden, v.weet_niet, v.uitsplitsen, v.bron_vraag_id, v.volgorde, v.kenmerk];
}

/** Inzendingen met een vast patroon; id's zijn zoals in het echt willekeurig (niet in volgorde van invullen). */
let volgendId = 1;
function inzendingen(lijst, aantal, maak, rnd) {
  const uit = [];
  for (let i = 0; i < aantal; i++) {
    const id = 1_000_000 + Math.floor(rnd() * 8_000_000) * 10 + (volgendId++ % 10);
    const dag = `2026-10-${String(1 + Math.floor(rnd() * 3)).padStart(2, '0')}`;
    uit.push(['INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES (?, ?, ?, ?)', id, lijst, dag, JSON.stringify(maak(i, rnd))]);
  }
  return uit;
}

const kies = (rnd, lijst) => lijst[Math.floor(rnd() * lijst.length)];
const misschien = (rnd, kans, w) => (rnd() < kans ? w : undefined);

/** Fixture 1 "plain": één vragenlijst zonder meetmoment, alle vraagsoorten, weet niet, meetpunten en eigen invoer. */
async function plain() {
  const rnd = lcg(1);
  await reeks([
    ['INSERT INTO onderzoeken (id, bedrijfsnaam, titel, aangemaakt_op) VALUES (1, ?, ?, ?)', 'Bakkerij De Korst', 'Medewerkersonderzoek', NU],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (10, 1, ?, 1)', 'Werkdruk'],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (11, 1, ?, 2)', 'Sfeer'],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (12, 1, ?, 0)', 'Achtergrond'],
    ['INSERT INTO meetpunten (id, thema_id, naam, eenheid, volgorde) VALUES (100, 10, ?, ?, 2)', 'Tijdsdruk', ''],
    ['INSERT INTO meetpunten (id, thema_id, naam, eenheid, volgorde) VALUES (101, 10, ?, ?, 1)', 'Pauzes', ''],
    ['INSERT INTO meetpunten (id, thema_id, naam, eenheid, volgorde) VALUES (102, 12, ?, ?, 0)', 'Verzuim', '%'],
    ['INSERT INTO vragenlijsten (id, onderzoek_id, titel, code, status, aantal_uitgenodigd, aangemaakt_op) VALUES (1000, 1, ?, ?, ?, 40, ?)', 'MTO 2026', 'code-plain-000000000001', 'gesloten', NU],
    await vraag(2001, 1000, 10, 'schaal', 'Ik heb genoeg tijd voor mijn werk.', { meetpunt_id: 100, weet_niet: 1, volgorde: 1 }),
    await vraag(2002, 1000, 10, 'schaal', 'Ik kan pauze nemen.', { meetpunt_id: 101, schaal_soort: 'tevreden', volgorde: 2 }),
    await vraag(2003, 1000, 11, 'schaal', 'Ik voel me thuis in mijn team.', { volgorde: 1 }),
    await vraag(2004, 1000, 11, 'janee', 'Zou je ons aanbevelen?', { volgorde: 2 }),
    await vraag(2005, 1000, 12, 'meerkeuze', 'Hoe kom je naar je werk?', { opties: opties('Auto', 'Fiets', 'OV'), volgorde: 1 }),
    await vraag(2006, 1000, 12, 'meerkeuze', 'Wat vind je belangrijk?', { opties: lijstOpties([['m1', 'Salaris'], ['m2', 'Sfeer'], ['m3', 'Vrije tijd']]), meerdere_antwoorden: 1, volgorde: 2 }),
    await vraag(2007, 1000, 11, 'open', 'Wat kan er beter?', { volgorde: 3 }),
    ...inzendingen(1000, 14, (i, r) => ({
      2001: misschien(r, 0.9, r() < 0.15 ? 'weet_niet' : 1 + Math.floor(r() * 5)),
      2002: misschien(r, 0.85, 1 + Math.floor(r() * 5)),
      2003: misschien(r, 0.8, 1 + Math.floor(r() * 5)),
      2004: misschien(r, 0.9, kies(r, ['ja', 'nee'])),
      2005: misschien(r, 0.85, kies(r, ['o1', 'o2', 'o3'])),
      2006: misschien(r, 0.8, ['m1', 'm2', 'm3'].filter(() => r() < 0.5)),
      2007: misschien(r, 0.7, r() < 0.2 ? '' : `Antwoord nummer ${i}`),
    }), rnd),
    ["INSERT INTO eigen_invoer (onderzoek_id, thema_id, meetpunt_id, soort, datum, titel, waarde, eenheid, aangemaakt_op) VALUES (1, 12, 102, 'cijfer', '2026-09-30', 'Verzuim Q3', 5.4, '%', ?)", NU],
    ["INSERT INTO eigen_invoer (onderzoek_id, thema_id, soort, datum, titel, waarde, eenheid, aangemaakt_op) VALUES (1, 10, 'cijfer', '2026-10-31', 'Overuren', 3, 'uur', ?)", NU],
    ["INSERT INTO eigen_invoer (onderzoek_id, thema_id, soort, datum, titel, tekst, aangemaakt_op) VALUES (1, 10, 'interview', '2026-10-05', 'Gesprek', 'Vertrouwelijk', ?)", NU],
  ]);
}

/** Fixture 2 "uitsplitsen": achtergrondvragen (kenmerk en uitsplitsen) met kleine groepen, o.a. "Anders: 1". */
async function uitsplitsen() {
  const rnd = lcg(2);
  const afdeling = [...Array(14).fill('o1'), ...Array(3).fill('o2'), ...Array(9).fill('o4'), ...Array(4).fill(undefined)];
  const geslacht = [...Array(13).fill('o1'), ...Array(16).fill('o2'), 'o3'];
  const leiding = [...Array(6).fill('ja'), ...Array(22).fill('nee'), undefined, undefined];
  const xy = [...Array(25).fill('o1'), ...Array(5).fill('o2')];
  await reeks([
    ['INSERT INTO onderzoeken (id, bedrijfsnaam, titel, aangemaakt_op) VALUES (2, ?, ?, ?)', 'Zorggroep Noord', 'Medewerkersonderzoek', NU],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (20, 2, ?, 1)', 'Werkdruk'],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (21, 2, ?, 2)', 'Achtergrond'],
    ['INSERT INTO vragenlijsten (id, onderzoek_id, titel, code, status, aangemaakt_op) VALUES (1100, 2, ?, ?, ?, ?)', 'MTO', 'code-uitsplits-00000001', 'gesloten', NU],
    await vraag(2101, 1100, 20, 'schaal', 'Q1', { volgorde: 1 }),
    await vraag(2102, 1100, 20, 'schaal', 'Q2', { volgorde: 2 }),
    await vraag(2103, 1100, 20, 'schaal', 'Q3 (bijna niemand)', { volgorde: 3, weet_niet: 1 }),
    await vraag(2104, 1100, 21, 'meerkeuze', 'Op welke afdeling werk je?', { opties: opties('Zorg', 'Keuken', 'Techniek', 'Kantoor'), uitsplitsen: 1, kenmerk: 'afdeling', volgorde: 1 }),
    await vraag(2105, 1100, 21, 'janee', 'Geef je zelf leiding aan een of meer medewerkers?', { uitsplitsen: 1, kenmerk: 'leidinggevend', volgorde: 2 }),
    await vraag(2106, 1100, 21, 'meerkeuze', 'Wat is je geslacht?', { opties: opties('Man', 'Vrouw', 'Anders'), kenmerk: 'geslacht', volgorde: 3 }),
    await vraag(2107, 1100, 21, 'meerkeuze', 'Werk je in ploegen?', { opties: opties('Nee', 'Ja'), uitsplitsen: 1, volgorde: 4 }),
    ...inzendingen(1100, 30, (i, r) => ({
      2101: 1 + Math.floor(r() * 5),
      2102: misschien(r, 0.9, 1 + Math.floor(r() * 5)),
      2103: i < 3 ? 1 + (i % 5) : misschien(r, 0.2, 'weet_niet'),
      2104: afdeling[i],
      2105: leiding[i],
      2106: geslacht[i],
      2107: xy[i],
    }), rnd),
  ]);
}

/** Fixture 3 "meetmomenten": kopieën van een vragenlijst op drie meetmomenten, een kleine en een open lijst. */
async function meetmomenten() {
  const rnd = lcg(3);
  const opdrachten = [
    ['INSERT INTO onderzoeken (id, bedrijfsnaam, titel, aangemaakt_op) VALUES (3, ?, ?, ?)', 'Gemeente Oost', 'Werkdrukmeting', NU],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (30, 3, ?, 1)', 'Werkdruk'],
    // Zelfde volgorde als Werkdruk: de meetpunten van beide thema's staan dan door elkaar (zoals in de database).
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (31, 3, ?, 1)', 'Leiderschap'],
    ['INSERT INTO meetpunten (id, thema_id, naam, volgorde) VALUES (300, 31, ?, 0)', 'Feedback'],
    ['INSERT INTO meetpunten (id, thema_id, naam, volgorde) VALUES (301, 30, ?, 1)', 'Tempo'],
    ['INSERT INTO meetpunten (id, thema_id, naam, volgorde) VALUES (302, 30, ?, 0)', 'Rust'],
    ['INSERT INTO meetmomenten (id, onderzoek_id, naam, datum, volgorde) VALUES (40, 3, ?, ?, 1)', 'Nulmeting', '2026-03-01'],
    ['INSERT INTO meetmomenten (id, onderzoek_id, naam, datum, volgorde) VALUES (41, 3, ?, ?, 2)', 'Vervolg', '2026-09-01'],
    ['INSERT INTO meetmomenten (id, onderzoek_id, naam, datum, volgorde) VALUES (42, 3, ?, NULL, 3)', 'Eindmeting'],
  ];
  const lijsten = [
    [1200, 40, 'gesloten', 12], [1201, 41, 'gesloten', 9], [1202, 41, 'open', 3], [1203, 42, 'open', 7], [1204, null, 'gesloten', 5],
  ];
  for (const [id, mm, status, n] of lijsten) {
    opdrachten.push(['INSERT INTO vragenlijsten (id, onderzoek_id, meetmoment_id, titel, code, status, aantal_uitgenodigd, aangemaakt_op) VALUES (?, 3, ?, ?, ?, ?, ?, ?)',
      id, mm, `Meting ${id}`, `code-mm-${id}-000000000`, status, id === 1200 ? 15 : null, NU]);
    const eerste = id === 1200;
    const b = (q) => (eerste ? null : 3000 + q);
    const v = (q) => (eerste ? 3000 + q : id * 10 + q);
    opdrachten.push(
      await vraag(v(1), id, 30, 'schaal', 'Ik kan mijn werk aan.', { meetpunt_id: 301, bron_vraag_id: b(1), volgorde: 1 }),
      await vraag(v(2), id, 30, 'schaal', 'Ik kom tot rust.', { meetpunt_id: 302, bron_vraag_id: b(2), volgorde: 2 }),
      await vraag(v(3), id, 31, 'schaal', 'Ik krijg feedback.', { meetpunt_id: 300, bron_vraag_id: b(3), volgorde: 1 }),
      await vraag(v(4), id, 31, 'janee', 'Geef je zelf leiding?', { bron_vraag_id: b(4), uitsplitsen: 1, kenmerk: 'leidinggevend', volgorde: 2 }),
      await vraag(v(5), id, 31, 'janee', 'Heb je een functioneringsgesprek gehad?', { bron_vraag_id: b(5), volgorde: 3 }),
      await vraag(v(6), id, 31, 'open', 'Toelichting', { bron_vraag_id: b(6), volgorde: 4 }),
      ...inzendingen(id, n, (i, r) => ({
        [v(1)]: 1 + Math.floor(r() * 5),
        [v(2)]: misschien(r, 0.8, 1 + Math.floor(r() * 5)),
        [v(3)]: misschien(r, 0.9, 1 + Math.floor(r() * 5)),
        [v(4)]: i < 5 ? 'ja' : misschien(r, 0.9, 'nee'),
        [v(5)]: kies(r, ['ja', 'nee']),
        [v(6)]: `Toelichting ${id}-${i}`,
      }), rnd),
    );
  }
  opdrachten.push(
    ["INSERT INTO eigen_invoer (onderzoek_id, thema_id, meetpunt_id, meetmoment_id, soort, datum, titel, waarde, aangemaakt_op) VALUES (3, 30, 301, 40, 'cijfer', '2026-03-01', 'Tempo', 7.5, ?)", NU],
    ["INSERT INTO eigen_invoer (onderzoek_id, thema_id, meetpunt_id, meetmoment_id, soort, datum, titel, waarde, aangemaakt_op) VALUES (3, 30, 301, 41, 'cijfer', '2026-09-01', 'Tempo', 6.9, ?)", NU],
  );
  await reeks(opdrachten);
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-dashboard-'));
  const project = join(map, 'project');
  mkdirSync(join(project, 'migrations'), { recursive: true });
  for (const f of readdirSync(MIGRATIES).filter((x) => /^\d{4}_.*\.sql$/.test(x))) copyFileSync(join(MIGRATIES, f), join(project, 'migrations', f));
  writeFileSync(join(project, 'werker.js'), 'export default { fetch() { return new Response(""); } };\n');
  writeFileSync(join(project, 'wrangler.jsonc'), JSON.stringify({
    name: 'dashboardproef',
    main: 'werker.js',
    compatibility_date: '2026-11-01',
    d1_databases: [{ binding: 'DB', database_name: 'dashboardproef', database_id: '00000000-0000-4000-8000-000000000012', migrations_dir: 'migrations' }],
  }, null, 2));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', join(map, 'staat')], {
    cwd: project,
    stdio: 'ignore',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  });
  proxy = await getPlatformProxy({ configPath: join(project, 'wrangler.jsonc'), persist: { path: join(map, 'staat', 'v3') } });
  env = proxy.env;
  await plain();
  await uitsplitsen();
  await meetmomenten();
});

after(async () => {
  if (proxy) await proxy.dispose();
  rmSync(map, { recursive: true, force: true });
});

async function viaRoute(onderzoekId, keuze = {}) {
  const url = new URL(`http://lokaal/api/beheer/onderzoeken/${onderzoekId}/dashboard`);
  for (const [k, w] of Object.entries(keuze)) if (w !== null && w !== undefined) url.searchParams.set(k, String(w));
  const r = await dashboard({ request: new Request(url), env, params: { id: String(onderzoekId) } });
  return JSON.parse(await r.text());
}

async function deExport(onderzoekId) {
  const r = await exportData({ env, params: { id: String(onderzoekId) } });
  return JSON.parse(await r.text());
}

/** Open antwoorden staan in willekeurige volgorde: vergelijk ze gesorteerd. */
function zonderVolgorde(d) {
  for (const o of d.selectie?.open || []) o.antwoorden.sort();
  return d;
}

async function vergelijkAlles(onderzoekId) {
  const data = await deExport(onderzoekId);
  const rijen = rijenUitExport(data);
  const keuzes = [{}];
  const eerste = await viaRoute(onderzoekId);
  for (const r of eerste.respons) {
    keuzes.push({ vragenlijst: r.vragenlijst_id });
    const d = await viaRoute(onderzoekId, { vragenlijst: r.vragenlijst_id });
    for (const u of d.selectie?.uitsplitsvragen || []) keuzes.push({ vragenlijst: r.vragenlijst_id, uitsplitsen: u.id });
  }
  keuzes.push({ vragenlijst: 999999, uitsplitsen: 'onzin' });
  for (const keuze of keuzes) {
    const server = zonderVolgorde(await viaRoute(onderzoekId, keuze));
    // Zoals de route: de keuze komt als tekst uit het adres.
    const tekst = Object.fromEntries(Object.entries({ vragenlijst: null, uitsplitsen: null, ...keuze }).map(([k, w]) => [k, w === null ? null : String(w)]));
    const lokaal = zonderVolgorde(JSON.parse(JSON.stringify(dashboardUitRijen(rijen, tekst))));
    assert.deepEqual(lokaal, server, `onderzoek ${onderzoekId}, keuze ${JSON.stringify(keuze)}`);
  }
  return keuzes.length;
}

test('criterium 3: uit de export komt hetzelfde dashboard als uit GET /dashboard (zonder meetmoment)', async () => {
  const n = await vergelijkAlles(1);
  assert.ok(n >= 3);
  const d = await viaRoute(1);
  assert.equal(d.selectie.n, 14);
  assert.equal(d.eigen_cijfers.length, 2);
  // Gewone vragen zijn niet beschermd en houden hun verdeling zoals altijd.
  assert.ok(d.selectie.vragen.every((q) => q.beschermd === false));
  const auto = d.selectie.vragen.find((q) => q.id === 2005);
  assert.equal(auto.verdeling.length, 3);
  assert.ok(auto.verdeling.every((v) => typeof v.aantal === 'number'));
});

test('criterium 3: hetzelfde bij uitsplitsen naar achtergrondvragen', async () => {
  const n = await vergelijkAlles(2);
  assert.ok(n >= 5, 'zonder keuze, de lijst, drie uitsplitsvragen en een onbekende keuze');
  const d = await viaRoute(2, { vragenlijst: 1100, uitsplitsen: 2104 });
  const g = d.selectie.uitsplitsing.groepen;
  // Zorg 14 en Kantoor 9 zichtbaar; Keuken 3 en Niet ingevuld 4 samen 7: groot genoeg, dus samen getoond.
  assert.deepEqual(g.filter((x) => !x.verborgen && x.label !== 'Overige groepen samen').map((x) => [x.label, x.n]), [['Zorg', 14], ['Kantoor', 9]]);
  const overig = g.find((x) => x.label === 'Overige groepen samen');
  assert.equal(overig.n, 7);
  // Ook Techniek (0 respondenten) staat erbij, anders zie je dat de kleine groep bij Keuken zit. "Niet ingevuld" wordt
  // nooit genoemd (anders verraadt het ontbreken ervan dat een verborgen aantal 0 is); een vaste zin zegt dat ze meetellen.
  assert.deepEqual(overig.samengevoegd, ['Keuken', 'Techniek']);
  assert.equal(overig.toelichting, 'Deze groepen zijn samengevoegd. Zo is geen groep van minder dan 5 respondenten te zien of terug te rekenen. Ook wie deze vraag niet invulde, telt hier mee.');
});

test('criterium 3: hetzelfde bij meerdere meetmomenten (verloop, kopieën, kleine en open lijsten)', async () => {
  const n = await vergelijkAlles(3);
  assert.ok(n >= 6);
  const d = await viaRoute(3, { vragenlijst: 1200 });
  assert.equal(d.verloop.meetmomenten.length, 3);
  assert.ok(d.verloop.themas.length >= 2);
  assert.ok(d.verloop.meetpunten.length >= 3);
  assert.deepEqual(d.verloop.zonder_meetmoment, ['Meting 1204']);
  const verloopVraag = d.selectie.vragen.find((q) => q.id === 3001);
  assert.equal(verloopVraag.verloop.length, 3);
  // Achtergrondvraag (ja/nee) per meetmoment: alleen waar ja, nee en "niet ingevuld" elk 0 of minstens 5 zijn.
  const leiding = d.selectie.vragen.find((q) => q.id === 3004);
  assert.equal(leiding.beschermd, true);
  for (const p of leiding.verloop) {
    if (p.percentage_ja !== null) assert.ok(p.n >= 5);
  }
  assert.ok(leiding.verloop.some((p) => p.percentage_ja === null), 'Vervolg: de kleine lijst zet "nee" op 2 en niet ingevuld op 1');
});

test('criterium 4: "Anders: 1" is verborgen op het dashboard, bij de meelezer, in de rapportfeiten, in het rapport en in Excel', async () => {
  const d = await viaRoute(2, { vragenlijst: 1100 });
  const geslacht = d.selectie.vragen.find((q) => q.id === 2106);
  // Man 13, Vrouw 16, Anders 1, Niet ingevuld 0 → Anders verborgen, de 0 en de kleinste zichtbare (Man) erbij.
  assert.equal(geslacht.beschermd, true);
  assert.deepEqual(geslacht.verdeling.map((v) => [v.label, v.aantal]), [['Man', null], ['Vrouw', 16], ['Anders', null], ['Niet ingevuld', null]]);
  assert.equal(geslacht.n, null, 'n zou de 0 bij Niet ingevuld verraden');
  assert.ok(Math.abs(geslacht.verdeling[1].percentage - (16 / 30) * 100) < 1e-9, 'percentage van de hele lijst');
  // Afdeling: Zorg 14, Keuken 3, Techniek 0, Kantoor 9, Niet ingevuld 4 → 3 + 0 + 4 = 7: genoeg, alleen die verborgen.
  const afdeling = d.selectie.vragen.find((q) => q.id === 2104);
  assert.deepEqual(afdeling.verdeling.map((v) => v.aantal), [14, null, null, 9, null]);
  // Ja/nee als achtergrondvraag: ja 6, nee 22, niet ingevuld 2 → ook het percentage ja verdwijnt.
  const leiding = d.selectie.vragen.find((q) => q.id === 2105);
  assert.deepEqual(leiding.verdeling.map((v) => v.aantal), [null, 22, null]);
  assert.equal(leiding.percentage_ja, null);
  assert.doesNotMatch(JSON.stringify(d.selectie.vragen.filter((q) => q.beschermd)), /"aantal":[1-4][,}]/);

  // De meelezer krijgt hetzelfde (de lijst is gesloten).
  const kijk = kijkerDashboard(structuredClone(d), { dashboard: true, open_antwoorden: false, tussenstand: false, stukken: [], rapporten: [] });
  const kg = kijk.selectie.vragen.find((q) => q.id === 2106);
  assert.deepEqual(kg.verdeling.map((v) => v.aantal), [null, 16, null, null]);
  assert.doesNotMatch(JSON.stringify(kijk.selectie.vragen.filter((q) => q.beschermd)), /"aantal":[1-4][,}]/);

  // Rapport: de feiten worden gemaskeerd vastgelegd, het rapport toont ×.
  const data = await deExport(2);
  const feiten = verzamelFeiten({ data, dashboards: [d], peildatum: '2026-11-27' });
  const fq = feiten.lijsten[0].vragen.find((q) => q.tekst === 'Wat is je geslacht?');
  assert.equal(fq.beschermd, true);
  assert.deepEqual(fq.opties, ['Man', 'Vrouw', 'Anders']);
  assert.deepEqual(fq.verdeling.map((v) => v.aantal), [null, 16, null, null]);
  assert.equal(fq.n, null);
  assert.doesNotMatch(JSON.stringify(feiten.lijsten[0].vragen.filter((q) => q.beschermd)), /"aantal":[1-4][,}]/);
  const inhoud = standaardInhoud('eind');
  const blokken = rapportNaarBlokken({ titel: 'R', soort: 'eind', inhoud, feiten });
  const tabelVan = (bl, tekst) => bl.flatMap((b) => (b.soort === 'feiten' ? b.blokken : [b])).find((b) => b.soort === 'tabel' && b.bijschrift.includes(tekst));
  const t = tabelVan(blokken, 'Wat is je geslacht?');
  assert.deepEqual(t.rijen.map((r) => [r[0], r[1]]), [['Man', VERBORGEN], ['Vrouw', 16], ['Anders', VERBORGEN], ['Niet ingevuld', VERBORGEN]]);
  assert.equal(t.kop[2], '% van alle respondenten');
  assert.match(blokkenNaarTekst(blokken), /× = niet getoond: minder dan 5 respondenten/);

  // Oude feiten (vastgelegd zonder beschermd, met de ruwe aantallen): bij het tonen alsnog gemaskeerd.
  const oud = structuredClone(feiten);
  for (const q of oud.lijsten[0].vragen) {
    delete q.beschermd;
    if (q.tekst === 'Wat is je geslacht?') {
      q.n = 30;
      q.verdeling = [{ waarde: 'o1', label: 'Man', aantal: 13, percentage: 43.3 }, { waarde: 'o2', label: 'Vrouw', aantal: 16, percentage: 53.3 }, { waarde: 'o3', label: 'Anders', aantal: 1, percentage: 3.3 }];
    }
  }
  const oudT = tabelVan(rapportNaarBlokken({ titel: 'R', soort: 'eind', inhoud, feiten: oud }), 'Wat is je geslacht?');
  assert.deepEqual(oudT.rijen.map((r) => r[1]), [VERBORGEN, 16, VERBORGEN, VERBORGEN]);
  assert.ok(!oudT.rijen.some((r) => r.includes(1) || r.includes('3%')));

  // Excel: de overzichtsbladen (alles behalve de ruwe antwoorden) bevatten geen verdeling van een achtergrondvraag,
  // dus ook geen "Anders: 1". De ruwe bladen blijven ruw (die staan achter de waarschuwing bij Afronden).
  const bladen = excelBladen(data);
  for (const b of bladen.filter((x) => !/^Antwoorden \d+$/.test(x.naam))) {
    for (const rij of b.rijen) assert.ok(!(rij.includes('Anders') && rij.some((c) => typeof c === 'number' && c > 0 && c < 5)), `${b.naam}: ${JSON.stringify(rij)}`);
  }
  assert.equal(bladen.find((b) => b.naam === 'Antwoorden 1').rijen.filter((r) => r.includes('Anders')).length, 1, 'het ruwe blad blijft ruw');
});

test('een kijker van een open vragenlijst ziet zonder tussenstand niets, met tussenstand de gemaskeerde verdeling', async () => {
  await reeks([['UPDATE vragenlijsten SET status = ? WHERE id = 1100', 'open']]);
  const d = await viaRoute(2, { vragenlijst: 1100 });
  const zonder = kijkerDashboard(structuredClone(d), { dashboard: true, open_antwoorden: false, tussenstand: false });
  assert.equal(zonder.selectie.reden, 'open');
  assert.deepEqual(zonder.selectie.vragen, []);
  const met = kijkerDashboard(structuredClone(d), { dashboard: true, open_antwoorden: false, tussenstand: true });
  assert.deepEqual(met.selectie.vragen.find((q) => q.id === 2106).verdeling.map((v) => v.aantal), [null, 16, null, null]);
  await reeks([['UPDATE vragenlijsten SET status = ? WHERE id = 1100', 'gesloten']]);
});

// ---------- Delen: tussenstand los van de resultaten (criterium 5) en de grens voor meelezers ----------

const jsonVerzoek = (url, body, koppen = {}) => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...koppen }, body: JSON.stringify(body) });

test('criterium 5: een deellink met alleen een rapport en de tussenstand bewaart tussenstand: true', async () => {
  await reeks([["INSERT INTO rapporten (id, onderzoek_id, soort, titel, inhoud, aangemaakt_op, bijgewerkt_op) VALUES (70, 2, 'tussen', 'Tussenrapport', '{\"secties\":[]}', ?, ?)", NU, NU]]);
  const r = await delen.nieuw({ request: jsonVerzoek('http://lokaal/x', { naam: 'Directie', onderdelen: { dashboard: false, rapporten: [70], tussenstand: true } }), env, params: { id: '2' } });
  const nieuw = JSON.parse(await r.text());
  assert.equal(r.status, 201);
  assert.deepEqual(nieuw.deellink.onderdelen, { dashboard: false, open_antwoorden: false, tussenstand: true, stukken: [], rapporten: [70] });
  const lijst = JSON.parse(await (await delen.lijst({ env, params: { id: '2' } })).text()).deellinks;
  assert.equal(lijst.find((l) => l.id === nieuw.deellink.id).onderdelen.tussenstand, true);
  // Open antwoorden horen nog steeds bij de resultaten.
  const w = await delen.wijzig({ request: jsonVerzoek('http://lokaal/x', { naam: 'Directie', onderdelen: { dashboard: false, open_antwoorden: true, rapporten: [70], tussenstand: true } }), env, params: { id: String(nieuw.deellink.id) } });
  assert.equal(w.status, 200);
  const na = JSON.parse(await (await delen.lijst({ env, params: { id: '2' } })).text()).deellinks.find((l) => l.id === nieuw.deellink.id);
  assert.deepEqual(na.onderdelen, { dashboard: false, open_antwoorden: false, tussenstand: true, stukken: [], rapporten: [70] });
});

test('meelezer: boven KIJK_MAX_INZENDINGEN of KIJK_MAX_CELLEN geen live dashboard, met een duidelijke melding', async () => {
  const r = await delen.nieuw({ request: jsonVerzoek('http://lokaal/x', { naam: 'OR', onderdelen: { dashboard: true } }), env, params: { id: '2' } });
  const { deellink, toegangscode } = JSON.parse(await r.text());
  const binnen = await delen.toegang({ request: jsonVerzoek(`http://lokaal/api/kijk/${deellink.code}/toegang`, { toegangscode }, { 'CF-Connecting-IP': '192.0.2.7' }), env, params: { code: deellink.code } });
  assert.equal(binnen.status, 200);
  const koekje = binnen.headers.get('Set-Cookie').split(';')[0];
  const vraag = (e) => delen.dashboard({ request: new Request(`http://lokaal/api/kijk/${deellink.code}/dashboard?vragenlijst=1100`, { headers: { Cookie: koekje } }), env: e, params: { code: deellink.code } });
  assert.equal(delen.KIJK_MAX_INZENDINGEN, 3000);
  const ok = await vraag(env);
  assert.equal(ok.status, 200, 'onderzoek 2 heeft 30 inzendingen');
  await assert.rejects(vraag({ ...env, KIJK_MAX_INZENDINGEN: '29' }), (e) => e.status === 413 && e.message === 'Deze resultaten zijn te groot om hier live te tonen. Vraag de onderzoeker om een rapport.');
  assert.equal((await vraag({ ...env, KIJK_MAX_INZENDINGEN: '30' })).status, 200, 'precies op de grens mag nog');
  // Antwoordcellen: per vragenlijst inzendingen × vragen, opgeteld (de rekentijd groeit daarmee, niet met inzendingen alleen).
  assert.equal(delen.KIJK_MAX_CELLEN, 60_000);
  const { cellen } = await env.DB.prepare(`SELECT SUM((SELECT COUNT(*) FROM inzendingen i WHERE i.vragenlijst_id = vl.id) * (SELECT COUNT(*) FROM vragen q WHERE q.vragenlijst_id = vl.id)) AS cellen
    FROM vragenlijsten vl WHERE vl.onderzoek_id = 2`).first();
  assert.ok(cellen > 30, `onderzoek 2 heeft ${cellen} cellen`);
  await assert.rejects(vraag({ ...env, KIJK_MAX_CELLEN: String(cellen - 1) }), (e) => e.status === 413 && e.message === delen.TE_GROOT);
  assert.equal((await vraag({ ...env, KIJK_MAX_CELLEN: String(cellen) })).status, 200, 'precies op de celgrens mag nog');
  // Een onzinnige waarde valt terug op de standaard (nooit uit).
  assert.equal((await vraag({ ...env, KIJK_MAX_CELLEN: 'uit', KIJK_MAX_INZENDINGEN: '0' })).status, 200);
});

// ---------- Verloop van een ja/nee-achtergrondvraag: elke bijdragende vragenlijst moet op zich veilig zijn ----------

/** Rijen voor dashboardUitRijen zonder database: dezelfde stamvraag (leidinggevend) in drie vragenlijsten. */
function rijenLeidinggevend(lijsten, aantallen) {
  const q = (id, lijst, bron) => ({ id, vragenlijst_id: lijst, thema_id: 9, meetpunt_id: null, type: 'janee', tekst: 'Geef je zelf leiding aan een of meer medewerkers?', toelichting: '', opties: '[]', schaal_soort: 'eens', meerdere_antwoorden: 0, verplicht: 0, weet_niet: 0, uitsplitsen: 1, bron_vraag_id: bron, volgorde: 1, kenmerk: 'leidinggevend' });
  const vragen = lijsten.map((l, i) => q(11 + i, l.id, i ? 11 : null));
  const inz = [];
  lijsten.forEach((l, i) => {
    const [ja, nee, leeg = 0] = aantallen[i];
    for (let k = 0; k < ja; k++) inz.push({ vragenlijst_id: l.id, datum: '2026-01-01', a: { [11 + i]: 'ja' } });
    for (let k = 0; k < nee; k++) inz.push({ vragenlijst_id: l.id, datum: '2026-01-01', a: { [11 + i]: 'nee' } });
    for (let k = 0; k < leeg; k++) inz.push({ vragenlijst_id: l.id, datum: '2026-01-01', a: {} });
  });
  return {
    onderzoek: { id: 1, bedrijfsnaam: 'X', titel: 'Y', status: 'actief' },
    schalen: {},
    themas: [{ id: 9, naam: 'Achtergrond' }],
    meetpunten: [],
    meetmomenten: [{ id: 1, naam: '2025', datum: '2025-01-01' }, { id: 2, naam: '2026', datum: '2026-01-01' }],
    vragenlijsten: lijsten,
    vragen,
    inzendingen: inz,
    eigen_invoer: [],
  };
}
const LIJSTEN_VERLOOP = [
  { id: 1, titel: 'Noord 2025', status: 'gesloten', code: 'a', meetmoment_id: 1, aantal_uitgenodigd: null },
  { id: 2, titel: 'Zuid 2025', status: 'gesloten', code: 'b', meetmoment_id: 1, aantal_uitgenodigd: null },
  { id: 3, titel: 'Alles 2026', status: 'gesloten', code: 'c', meetmoment_id: 2, aantal_uitgenodigd: null },
];
const MAG_ALLES = { dashboard: true, open_antwoorden: false, tussenstand: false, stukken: [], rapporten: [] };

test('verloop ja/nee-achtergrondvraag: een verborgen aantal in één vragenlijst is niet terug te rekenen uit het meetmoment', () => {
  // Noord ja 10 / nee 10 (zichtbaar), Zuid ja 3 / nee 10 (gemaskeerd); samen 2025 = 13 / 20 zou ja(Zuid) = 3 verraden.
  const rijen = rijenLeidinggevend(LIJSTEN_VERLOOP, [[10, 10], [3, 10], [10, 10]]);
  const kijk = (lijst) => kijkerDashboard(structuredClone(dashboardUitRijen(rijen, { vragenlijst: lijst, uitsplitsen: null })), MAG_ALLES).selectie.vragen[0];
  assert.deepEqual(kijk(1).verdeling.map((v) => v.aantal), [10, 10, 0]);
  assert.deepEqual(kijk(2).verdeling.map((v) => v.aantal), [null, null, null]);
  const beheer = dashboardUitRijen(rijen, { vragenlijst: 3, uitsplitsen: null }).selectie.vragen[0].verloop;
  assert.deepEqual(beheer.find((p) => p.meetmoment_id === 1), { meetmoment_id: 1, naam: '2025', percentage_ja: null, n: null, klein: true, open: false });
  const punt = kijk(3).verloop.find((p) => p.meetmoment_id === 1);
  assert.equal(punt.percentage_ja, null);
  assert.equal(punt.n, null);
  assert.equal(kijk(3).verloop.find((p) => p.meetmoment_id === 2).percentage_ja, 50, 'het eigen meetmoment blijft zichtbaar');
  // Ook een kleine "Niet ingevuld" in één vragenlijst (Zuid: 2 lieten de vraag open) verbergt het punt.
  const leeg = rijenLeidinggevend(LIJSTEN_VERLOOP, [[10, 10], [6, 10, 2], [10, 10]]);
  assert.equal(dashboardUitRijen(leeg, { vragenlijst: 3, uitsplitsen: null }).selectie.vragen[0].verloop.find((p) => p.meetmoment_id === 1).percentage_ja, null);
  // Zijn alle vragenlijsten op zich veilig, dan blijft het punt staan.
  const veilig = rijenLeidinggevend(LIJSTEN_VERLOOP, [[10, 10], [5, 10], [10, 10]]);
  const p = kijkerDashboard(structuredClone(dashboardUitRijen(veilig, { vragenlijst: 3, uitsplitsen: null })), MAG_ALLES).selectie.vragen[0].verloop.find((x) => x.meetmoment_id === 1);
  assert.equal(p.n, 35);
  assert.equal(p.percentage_ja, Math.round((15 / 35) * 10000) / 100);
});

// ---------- Gedeeld rapport: zonder tussenstand geen uitkomsten van een vragenlijst die op de peildatum openstond ----------

test('deellink: een rapport met een open vragenlijst toont de uitkomsten alleen met de tussenstand (B8)', async () => {
  const { readFileSync } = await import('node:fs');
  const { gevallen } = JSON.parse(readFileSync(new URL('./fixtures/rapport-v1-blokken.json', import.meta.url), 'utf8'));
  const g = gevallen[1]; // tussenrapport; hoofdlijst = vervolgmeting, open op de peildatum
  await reeks([['INSERT INTO rapporten (id, onderzoek_id, soort, titel, inhoud, feiten, aangemaakt_op, bijgewerkt_op) VALUES (71, 2, ?, ?, ?, ?, ?, ?)',
    g.soort, g.titel, JSON.stringify(g.inhoud), JSON.stringify(g.feiten), NU, NU]]);
  const haal = async (tussenstand, ip) => {
    const r = await delen.nieuw({ request: jsonVerzoek('http://lokaal/x', { naam: `R${ip}`, onderdelen: { dashboard: false, rapporten: [71], tussenstand } }), env, params: { id: '2' } });
    const { deellink, toegangscode } = JSON.parse(await r.text());
    const binnen = await delen.toegang({ request: jsonVerzoek(`http://lokaal/api/kijk/${deellink.code}/toegang`, { toegangscode }, { 'CF-Connecting-IP': `192.0.2.${ip}` }), env, params: { code: deellink.code } });
    const koekje = binnen.headers.get('Set-Cookie').split(';')[0];
    const a = await delen.rapport({ request: new Request(`http://lokaal/api/kijk/${deellink.code}/rapporten/71`, { headers: { Cookie: koekje } }), env, params: { code: deellink.code, id: '71' } });
    assert.equal(a.status, 200);
    return JSON.parse(await a.text()).rapport.blokken;
  };
  const met = await haal(true, 21);
  const zonder = await haal(false, 22);
  const verwacht = (verbergOpen) => JSON.parse(JSON.stringify(rapportNaarBlokken({ titel: g.titel, soort: g.soort, inhoud: g.inhoud, feiten: g.feiten }, { markeerLeeg: false, verbergOpen })));
  assert.deepEqual(met, verwacht(false));
  assert.deepEqual(met, g.blokken, 'met tussenstand: het rapport zoals het is');
  assert.deepEqual(zonder, verwacht(true));
  const tekst = blokkenNaarTekst(zonder);
  assert.match(tekst, /stond op de peildatum nog open\. De uitkomsten worden hier getoond als hij gesloten is/);
  assert.doesNotMatch(tekst, /Vervolgmeting: \d|Score 4 of 5|Hedges/);
  assert.notDeepEqual(met, zonder);
  await reeks([['DELETE FROM rapporten WHERE id = 71']]);
});

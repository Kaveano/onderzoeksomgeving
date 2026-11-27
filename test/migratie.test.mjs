// Automatische test van de database-migraties 0011–0015 en van het definitief verwijderen van een onderzoek.
// Uitvoeren: node --test test/migratie.test.mjs   (er is geen server voor nodig)
//
// Zo werkt het (de "generale repetitie" van BOUWPLAN §2.1 / D1 §11.6):
// 1. Wrangler voert migratie 0001–0010 uit op een lege, lokale D1-database in een tijdelijke map
//    (met een eigen, tijdelijk configuratiebestand: de echte database wordt nooit aangeraakt).
// 2. We vullen die database met voorbeeldgegevens, zoals een onderzoek dat al een tijd loopt.
// 3. Wrangler voert daarna 0011–0015 uit. Migratie 0011 bouwt de tabel vragen opnieuw op.
// 4. We controleren dat alle gegevens, verwijzingen en indexen er nog zijn en dat de nieuwe tabellen werken.
// De database lezen en schrijven we rechtstreeks via getPlatformProxy van Wrangler (dezelfde lokale D1).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { verwijderen } from '../src/routes/onderzoeken.js';
import { vraagVerwijder } from '../src/routes/vragenlijsten.js';

const MIGRATIES = fileURLToPath(new URL('../migrations/', import.meta.url));
const NU = '2026-11-27T10:00:00.000Z';
const NIEUWE_TABELLEN = [
  'hr_instellingen', 'personeelscijfers', 'werkbank_definities', 'werkbank_analyses',
  'bronnen', 'bron_koppelingen', 'codes', 'coderingen', 'citaten',
];

let map;
let project;
let proxy;
let db;
let vragenVoor;

function migratiesTot(laatste) {
  return readdirSync(MIGRATIES).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) <= laatste).sort();
}

function pasMigratiesToe(tot) {
  for (const f of migratiesTot(tot)) copyFileSync(join(MIGRATIES, f), join(project, 'migrations', f));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', join(map, 'staat')], {
    cwd: project,
    stdio: 'ignore',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  });
}

async function open() {
  proxy = await getPlatformProxy({ configPath: join(project, 'wrangler.jsonc'), persist: { path: join(map, 'staat', 'v3') } });
  db = proxy.env.DB;
}

async function sluit() {
  if (proxy) await proxy.dispose();
  proxy = null;
  db = null;
}

const alle = async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results;
const een = async (sql, ...p) => db.prepare(sql).bind(...p).first();
const reeks = (opdrachten) => db.batch(opdrachten.map(([sql, ...p]) => db.prepare(sql).bind(...p)));
const telling = async (tabel, kolom, waarde) => (await een(`SELECT COUNT(*) AS n FROM ${tabel} WHERE ${kolom} = ?`, waarde)).n;

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-migratie-'));
  project = join(map, 'project');
  mkdirSync(join(project, 'migrations'), { recursive: true });
  writeFileSync(join(project, 'werker.js'), 'export default { fetch() { return new Response(""); } };\n');
  writeFileSync(join(project, 'wrangler.jsonc'), JSON.stringify({
    name: 'migratieproef',
    main: 'werker.js',
    compatibility_date: '2026-11-01',
    d1_databases: [{ binding: 'DB', database_name: 'migratieproef', database_id: '00000000-0000-4000-8000-000000000011', migrations_dir: 'migrations' }],
  }, null, 2));

  // 1. De database zoals hij nu live staat.
  pasMigratiesToe(10);

  // 2. Voorbeeldgegevens: twee onderzoeken, drie vragenlijsten, vragen met en zonder meetpunt en
  //    bron_vraag_id, achtergrondvragen uit de sjablonen (ook een dubbele en een met meerdere antwoorden).
  await open();
  const opties = JSON.stringify([{ id: 'a1', label: 'Kantoor' }, { id: 'a2', label: 'Productie' }]);
  const duur = JSON.stringify([{ id: 'd1', label: 'Korter dan 1 jaar' }, { id: 'd2', label: '1 tot 5 jaar' }]);
  await reeks([
    ['INSERT INTO onderzoeken (id, bedrijfsnaam, titel, aangemaakt_op) VALUES (1, ?, ?, ?)', 'Voorbeeld B.V.', 'Medewerkersonderzoek', NU],
    ['INSERT INTO onderzoeken (id, bedrijfsnaam, titel, aangemaakt_op) VALUES (2, ?, ?, ?)', 'Tweede BV', 'Vertrekonderzoek', NU],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (10, 1, ?, 1)', 'Werkdruk'],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (11, 1, ?, 2)', 'Achtergrond'],
    ['INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (20, 2, ?, 1)', 'Vertrek'],
    ['INSERT INTO meetpunten (id, thema_id, naam) VALUES (100, 10, ?)', 'Tijdsdruk'],
    ['INSERT INTO meetmomenten (id, onderzoek_id, naam, datum) VALUES (30, 1, ?, ?)', 'Nulmeting', '2026-09-15'],
    ['INSERT INTO vragenlijsten (id, onderzoek_id, meetmoment_id, titel, code, status, aangemaakt_op) VALUES (40, 1, 30, ?, ?, ?, ?)', 'Nulmeting', 'code-veertig-0000000001', 'open', NU],
    ['INSERT INTO vragenlijsten (id, onderzoek_id, titel, code, aangemaakt_op) VALUES (41, 1, ?, ?, ?)', 'Vervolg', 'code-eenenveertig-000001', NU],
    ['INSERT INTO vragenlijsten (id, onderzoek_id, titel, code, aangemaakt_op) VALUES (50, 2, ?, ?, ?)', 'Vertrek', 'code-vijftig-00000000001', NU],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, schaal_soort, verplicht, weet_niet, volgorde) VALUES (400, 40, 10, 100, 'schaal', ?, ?, 'eens', 1, 1, 1)", 'Ik heb genoeg tijd voor mijn werk.', 'Denk aan de afgelopen maand.'],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, uitsplitsen, volgorde) VALUES (401, 40, 11, 'meerkeuze', ?, ?, 1, 2)", 'Op welke afdeling werk je?', opties],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, volgorde) VALUES (402, 40, 11, 'meerkeuze', ?, ?, 3)", 'Op welke afdeling werk je?', opties],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, uitsplitsen, volgorde) VALUES (403, 40, 11, 'meerkeuze', ?, ?, 1, 4)", 'Hoe lang werk je al bij Voorbeeld B.V.?', duur],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, uitsplitsen, volgorde) VALUES (404, 40, 11, 'janee', ?, 1, 5)", 'Geef je zelf leiding aan een of meer medewerkers?'],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, volgorde) VALUES (405, 40, 10, 'open', ?, 6)", 'Wat kan er beter?'],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, meetpunt_id, type, tekst, schaal_soort, bron_vraag_id, volgorde) VALUES (410, 41, 10, 100, 'schaal', ?, 'tevreden', 400, 1)", 'Ik heb genoeg tijd voor mijn werk.'],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, meerdere_antwoorden, volgorde) VALUES (411, 41, 11, 'meerkeuze', ?, ?, 1, 2)", 'Op welke afdeling werkte je?', opties],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, volgorde) VALUES (412, 41, 11, 'meerkeuze', ?, ?, 3)", 'Op welke afdeling werkte je?', opties],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, volgorde) VALUES (413, 41, 11, 'meerkeuze', ?, ?, 4)", 'Hoe lang heb je bij Voorbeeld B.V. gewerkt?', duur],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, volgorde) VALUES (500, 50, 20, 'meerkeuze', ?, ?, 1)", 'Hoe lang werk je bij Tweede BV?', duur],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, volgorde) VALUES (501, 50, 20, 'janee', ?, 2)", 'Geef je leiding?'],
    ['INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES (600, 40, ?, ?)', '2026-09-16', '{"400":4,"401":"a1","403":"d2","404":"ja","405":"Meer overleg."}'],
    ['INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES (601, 40, ?, ?)', '2026-09-17', '{"400":"weet_niet","401":"a2"}'],
    ['INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES (610, 41, ?, ?)', '2026-11-01', '{"410":3}'],
    ['INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES (700, 50, ?, ?)', '2026-10-01', '{"500":"d1"}'],
    ['INSERT INTO inzendteller (vragenlijst_id, tijdvak, aantal) VALUES (41, ?, 1)', '2026-11-01T10:00'],
  ]);
  vragenVoor = await alle('SELECT * FROM vragen ORDER BY id');
  await sluit();

  // 3. De nieuwe migraties.
  pasMigratiesToe(15);
  await open();
});

after(async () => {
  await sluit();
  if (map) rmSync(map, { recursive: true, force: true });
});

test('migraties: 0011 tot en met 0015 zijn daarna uitgevoerd, in volgorde', async () => {
  const namen = (await alle('SELECT name FROM d1_migrations ORDER BY id')).map((r) => r.name);
  assert.deepEqual(namen, migratiesTot(15));
  assert.deepEqual(namen.slice(-5), [
    '0011_vragen_cijfer_kenmerk.sql', '0012_hr_analytics.sql', '0013_werkbank.sql', '0014_bibliotheek.sql', '0015_codering.sql',
  ]);
});

test('0011: alle vragen blijven precies gelijk (ids, bron_vraag_id, meetpunten, volgorde) en krijgen een kolom kenmerk', async () => {
  const na = await alle('SELECT * FROM vragen ORDER BY id');
  assert.equal(na.length, vragenVoor.length);
  assert.deepEqual(na.map(({ kenmerk, ...rest }) => rest), vragenVoor);
  assert.equal(na.find((q) => q.id === 410).bron_vraag_id, 400);
  const kolommen = await alle("SELECT name, type, \"notnull\" AS verplicht, dflt_value FROM pragma_table_info('vragen') ORDER BY cid");
  assert.deepEqual(kolommen.map((k) => k.name), [
    'id', 'vragenlijst_id', 'thema_id', 'meetpunt_id', 'type', 'tekst', 'toelichting', 'opties', 'schaal_soort',
    'meerdere_antwoorden', 'verplicht', 'weet_niet', 'uitsplitsen', 'bron_vraag_id', 'volgorde', 'kenmerk',
  ]);
  const kenmerk = kolommen.find((k) => k.name === 'kenmerk');
  assert.equal(kenmerk.type, 'TEXT');
  assert.equal(kenmerk.verplicht, 1);
  assert.equal(kenmerk.dflt_value, "''");
  assert.equal(await een("SELECT name FROM sqlite_master WHERE name = 'vragen_nieuw'"), null);
  // De antwoorden zelf zijn niet aangeraakt.
  assert.equal((await een('SELECT antwoorden FROM inzendingen WHERE id = 600')).antwoorden,
    '{"400":4,"401":"a1","403":"d2","404":"ja","405":"Meer overleg."}');
});

test('0011: verwijzingen en indexen van vragen zijn precies zo overgenomen', async () => {
  const fk = (await alle("SELECT \"table\" AS tabel, \"from\" AS kolom, on_delete FROM pragma_foreign_key_list('vragen')"))
    .sort((a, b) => a.kolom.localeCompare(b.kolom));
  assert.deepEqual(fk, [
    { tabel: 'meetpunten', kolom: 'meetpunt_id', on_delete: 'SET NULL' },
    { tabel: 'themas', kolom: 'thema_id', on_delete: 'NO ACTION' },
    { tabel: 'vragenlijsten', kolom: 'vragenlijst_id', on_delete: 'CASCADE' },
  ]);
  const indexen = (await alle("SELECT name FROM pragma_index_list('vragen') ORDER BY name")).map((r) => r.name);
  assert.deepEqual(indexen, ['idx_vragen_thema', 'idx_vragen_vragenlijst']);
  assert.deepEqual((await alle("SELECT name FROM pragma_index_info('idx_vragen_vragenlijst')")).map((r) => r.name), ['vragenlijst_id']);
  assert.deepEqual((await alle("SELECT name FROM pragma_index_info('idx_vragen_thema')")).map((r) => r.name), ['thema_id']);
  // Er verwijst (nog steeds) geen enkele tabel naar vragen(id).
  const tabellen = (await alle("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'")).map((r) => r.name);
  for (const t of tabellen) {
    const naarVragen = (await alle(`SELECT "table" AS tabel FROM pragma_foreign_key_list('${t}')`)).filter((r) => r.tabel === 'vragen');
    assert.deepEqual(naarVragen, [], `${t} verwijst naar vragen`);
  }
  assert.deepEqual(await alle('PRAGMA foreign_key_check'), []);
});

test('0011: bestaande achtergrondvragen krijgen hun kenmerk (de eerste per vragenlijst, één antwoord)', async () => {
  const kenmerken = Object.fromEntries((await alle('SELECT id, kenmerk FROM vragen ORDER BY id')).map((r) => [r.id, r.kenmerk]));
  assert.deepEqual(kenmerken, {
    400: '',
    401: 'afdeling', // eerste afdelingsvraag van de lijst
    402: '', // dezelfde vraag nog een keer: niet
    403: 'diensttijd', // 'Hoe lang werk je al bij Voorbeeld B.V.?'
    404: 'leidinggevend',
    405: '',
    410: '',
    411: '', // meerdere antwoorden mogelijk: geen kenmerk
    412: 'afdeling', // 'Op welke afdeling werkte je?' met één antwoord
    413: 'diensttijd', // 'Hoe lang heb je bij … gewerkt?'
    500: 'diensttijd', // 'Hoe lang werk je bij …?'
    501: '', // andere tekst dan in de sjablonen
  });
});

test('0011: het nieuwe vraagtype cijfer kan worden opgeslagen, een onbekend type niet', async () => {
  await reeks([["INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, schaal_soort, kenmerk) VALUES (420, 41, 10, 'cijfer', ?, 'nps', '')", 'Hoe waarschijnlijk is het dat je ons aanbeveelt?']]);
  assert.equal((await een('SELECT type, schaal_soort, kenmerk FROM vragen WHERE id = 420')).type, 'cijfer');
  await assert.rejects(reeks([["INSERT INTO vragen (vragenlijst_id, thema_id, type, tekst) VALUES (41, 10, 'getal', 'x')"]]), /CHECK/);
  await assert.rejects(reeks([["INSERT INTO vragen (vragenlijst_id, thema_id, type, tekst, kenmerk) VALUES (41, 10, 'janee', 'x', NULL)"]]), /NOT NULL/);
  await reeks([['DELETE FROM vragen WHERE id = 420']]);
});

test('0012–0015: de nieuwe tabellen en indexen bestaan, met hun controles', async () => {
  const tabellen = new Set((await alle("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name));
  for (const t of NIEUWE_TABELLEN) assert.ok(tabellen.has(t), t);
  const indexen = new Set((await alle("SELECT name FROM sqlite_master WHERE type = 'index'")).map((r) => r.name));
  for (const i of [
    'idx_personeelscijfers_onderzoek', 'idx_wb_definities_onderzoek', 'idx_wb_analyses_onderzoek', 'idx_bronnen_collectie',
    'idx_bron_koppelingen_bron', 'idx_codes_naam', 'idx_coderingen_antwoord', 'idx_coderingen_invoer', 'idx_coderingen_onderzoek',
    'idx_citaten_onderzoek',
  ]) assert.ok(indexen.has(i), i);
  assert.equal((await een("SELECT waarde FROM instellingen WHERE sleutel = 'bibliotheek_versie'")).waarde, '1');

  // JSON-velden weigeren tekst die geen JSON is.
  await assert.rejects(reeks([['INSERT INTO hr_instellingen (onderzoek_id, inhoud, bijgewerkt_op) VALUES (1, ?, ?)', 'geen json', NU]]), /CHECK/);
  await assert.rejects(reeks([["INSERT INTO personeelscijfers (onderzoek_id, naam, periode_van, periode_tot, inhoud, bewaren_tot, aangemaakt_op) VALUES (1, 'P', '2025-01', '2025-12', '{', '2027-01-01', ?)", NU]]), /CHECK/);
  await assert.rejects(reeks([["INSERT INTO werkbank_definities (onderzoek_id, soort, naam, definitie, aangemaakt_op, bijgewerkt_op) VALUES (1, 'bereken', 'x', 'x', ?, ?)", NU, NU]]), /CHECK/);
  await assert.rejects(reeks([["INSERT INTO werkbank_definities (onderzoek_id, soort, naam, definitie, aangemaakt_op, bijgewerkt_op) VALUES (1, 'onbekend', 'x', '{}', ?, ?)", NU, NU]]), /CHECK/);
  await assert.rejects(reeks([["INSERT INTO bronnen (citeersleutel, soort, titel, auteurs, aangemaakt_op, bijgewerkt_op) VALUES ('x2024', 'artikel', 'T', 'Bakker', ?, ?)", NU, NU]]), /CHECK/);
  await assert.rejects(reeks([["INSERT INTO bronnen (citeersleutel, soort, titel, jaar, aangemaakt_op, bijgewerkt_op) VALUES ('x2024', 'artikel', 'T', 1700, ?, ?)", NU, NU]]), /CHECK/);
  // Een geldige bron, en de citeersleutel is uniek.
  await reeks([["INSERT INTO bronnen (id, citeersleutel, soort, titel, jaar, aangemaakt_op, bijgewerkt_op) VALUES (900, 'cbs2025', 'cijfers', 'Ziekteverzuim', 2025, ?, ?)", NU, NU]]);
  assert.equal((await een('SELECT collectie, taal, verborgen FROM bronnen WHERE id = 900')).collectie, 'eigen');
  await assert.rejects(reeks([["INSERT INTO bronnen (citeersleutel, soort, titel, aangemaakt_op, bijgewerkt_op) VALUES ('cbs2025', 'rapport', 'T', ?, ?)", NU, NU]]), /UNIQUE/);
});

test('0015: een codering hoort bij precies één antwoord of één stuk eigen invoer', async () => {
  await reeks([
    ['INSERT INTO eigen_invoer (id, onderzoek_id, thema_id, soort, datum, titel, aangemaakt_op) VALUES (800, 1, 10, ?, ?, ?, ?)', 'interview', '2026-10-01', 'Interview teamleider', NU],
    ['INSERT INTO codes (id, onderzoek_id, naam, aangemaakt_op) VALUES (80, 1, ?, ?)', 'Planning', NU],
    ['INSERT INTO codes (id, onderzoek_id, naam, aangemaakt_op) VALUES (81, 1, ?, ?)', 'Overleg', NU],
  ]);
  // Beide doelen of geen doel: geweigerd.
  await assert.rejects(reeks([['INSERT INTO coderingen (onderzoek_id, code_id, inzending_id, vraag_id, invoer_id) VALUES (1, 80, 600, 405, 800)']]), /CHECK/);
  await assert.rejects(reeks([['INSERT INTO coderingen (onderzoek_id, code_id) VALUES (1, 80)']]), /CHECK/);
  await assert.rejects(reeks([['INSERT INTO coderingen (onderzoek_id, code_id, inzending_id) VALUES (1, 80, 600)']]), /CHECK/);
  await assert.rejects(reeks([['INSERT INTO coderingen (onderzoek_id, code_id, vraag_id, invoer_id) VALUES (1, 80, 405, 800)']]), /CHECK/);
  // Eén doel: goed. Dezelfde code twee keer bij hetzelfde antwoord: geweigerd.
  await reeks([
    ['INSERT INTO coderingen (id, onderzoek_id, code_id, inzending_id, vraag_id) VALUES (1, 1, 80, 600, 405)'],
    ['INSERT INTO coderingen (id, onderzoek_id, code_id, inzending_id, vraag_id) VALUES (2, 1, 81, 600, 405)'],
    ['INSERT INTO coderingen (id, onderzoek_id, code_id, inzending_id, vraag_id) VALUES (3, 1, 80, 601, 400)'],
    ['INSERT INTO coderingen (id, onderzoek_id, code_id, invoer_id) VALUES (4, 1, 80, 800)'],
  ]);
  await assert.rejects(reeks([['INSERT INTO coderingen (onderzoek_id, code_id, inzending_id, vraag_id) VALUES (1, 80, 600, 405)']]), /UNIQUE/);
  await assert.rejects(reeks([['INSERT INTO coderingen (onderzoek_id, code_id, invoer_id) VALUES (1, 80, 800)']]), /UNIQUE/);
  await assert.rejects(reeks([['INSERT INTO codes (onderzoek_id, naam, aangemaakt_op) VALUES (1, ?, ?)', 'Planning', NU]]), /UNIQUE/);
  await reeks([
    ['INSERT INTO citaten (id, onderzoek_id, code_id, inzending_id, vraag_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES (1, 1, 80, 600, 405, ?, ?, ?)', 'Meer overleg.', NU, NU],
    ['INSERT INTO citaten (id, onderzoek_id, code_id, invoer_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES (2, 1, 81, 800, ?, ?, ?)', 'De planning wijzigt vaak.', NU, NU],
  ]);
  await assert.rejects(reeks([['INSERT INTO citaten (onderzoek_id, tekst, gecontroleerd, aangemaakt_op, bijgewerkt_op) VALUES (1, ?, 2, ?, ?)', 'x', NU, NU]]), /CHECK/);
});

test('0015: codes en citaten verdwijnen mee met hun inzending of eigen invoer; een code weg laat het citaat staan', async () => {
  await reeks([['DELETE FROM inzendingen WHERE id = 600']]);
  assert.deepEqual((await alle('SELECT id FROM coderingen ORDER BY id')).map((r) => r.id), [3, 4]);
  assert.deepEqual((await alle('SELECT id FROM citaten ORDER BY id')).map((r) => r.id), [2]);
  await reeks([['DELETE FROM eigen_invoer WHERE id = 800']]);
  assert.deepEqual((await alle('SELECT id FROM coderingen ORDER BY id')).map((r) => r.id), [3]);
  assert.deepEqual(await alle('SELECT id FROM citaten'), []);
  // Een citaat zonder bron (losse tekst) houdt zijn tekst als de code verdwijnt.
  await reeks([['INSERT INTO citaten (id, onderzoek_id, code_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES (3, 1, 81, ?, ?, ?)', 'Los citaat', NU, NU]]);
  await reeks([['DELETE FROM codes WHERE id = 81']]);
  assert.equal((await een('SELECT code_id FROM citaten WHERE id = 3')).code_id, null);
  assert.deepEqual(await alle('PRAGMA foreign_key_check'), []);
});

test('vraag verwijderen: ook de codes en citaten bij die vraag gaan weg, de rest blijft', async () => {
  await reeks([
    ['INSERT INTO coderingen (id, onderzoek_id, code_id, inzending_id, vraag_id) VALUES (5, 1, 80, 601, 401)'],
    ['INSERT INTO citaten (id, onderzoek_id, code_id, inzending_id, vraag_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES (4, 1, 80, 601, 400, ?, ?, ?)', 'Weet ik niet.', NU, NU],
    ['INSERT INTO citaten (id, onderzoek_id, code_id, inzending_id, vraag_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES (5, 1, 80, 601, 401, ?, ?, ?)', 'Afdeling.', NU, NU],
  ]);
  const antwoord = await vraagVerwijder({ env: { DB: db }, params: { id: '400' } });
  assert.equal(antwoord.status, 200);
  assert.equal((await antwoord.json()).ok, true);
  assert.equal(await een('SELECT id FROM vragen WHERE id = 400'), null);
  assert.deepEqual((await alle('SELECT id FROM coderingen ORDER BY id')).map((r) => r.id), [5]);
  assert.deepEqual((await alle('SELECT id FROM citaten ORDER BY id')).map((r) => r.id), [3, 5]);
});

test('0011: een meetpunt weg zet meetpunt_id op leeg; een vragenlijst weg neemt vragen en inzendingen mee', async () => {
  await reeks([['DELETE FROM meetpunten WHERE id = 100']]);
  assert.equal((await een('SELECT meetpunt_id FROM vragen WHERE id = 410')).meetpunt_id, null);
  await reeks([['DELETE FROM vragenlijsten WHERE id = 41']]);
  assert.equal(await telling('vragen', 'vragenlijst_id', 41), 0);
  assert.equal(await telling('inzendingen', 'vragenlijst_id', 41), 0);
  assert.equal(await telling('inzendteller', 'vragenlijst_id', 41), 0);
  assert.equal(await telling('vragen', 'vragenlijst_id', 40), 5);
  assert.deepEqual(await alle('PRAGMA foreign_key_check'), []);
});

// ---------- Onderzoek definitief verwijderen (BOUWPLAN §2.8, criterium 6) ----------

/** Alle tabellen met een kolom onderzoek_id, rechtstreeks uit het databaseschema. */
async function tabellenMetOnderzoek() {
  return (await alle(
    `SELECT m.name FROM sqlite_master m
     WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
       AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name = 'onderzoek_id')
     ORDER BY m.name`,
  )).map((r) => r.name);
}

/** Vult een onderzoek met minstens één rij in elke tabel die bij een onderzoek hoort. */
async function vulVolledigOnderzoek(o, basis) {
  const b = basis; // alle ids van dit onderzoek beginnen hiermee, zodat ze niet botsen
  const json = (x) => JSON.stringify(x);
  await reeks([
    ['INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op, gearchiveerd_op) VALUES (?, ?, ?, ?, ?, ?)', o, `Bedrijf ${o} BV`, 'Onderzoek', 'gearchiveerd', NU, NU],
    ['INSERT INTO themas (id, onderzoek_id, naam) VALUES (?, ?, ?)', b + 1, o, 'Thema'],
    ['INSERT INTO meetpunten (id, thema_id, naam) VALUES (?, ?, ?)', b + 2, b + 1, 'Meetpunt'],
    ['INSERT INTO meetmomenten (id, onderzoek_id, naam) VALUES (?, ?, ?)', b + 3, o, 'Nulmeting'],
    ['INSERT INTO vragenlijsten (id, onderzoek_id, meetmoment_id, titel, code, aangemaakt_op) VALUES (?, ?, ?, ?, ?, ?)', b + 4, o, b + 3, 'Lijst', `code-${b}-volledig-0001`, NU],
    ["INSERT INTO vragen (id, vragenlijst_id, thema_id, meetpunt_id, type, tekst) VALUES (?, ?, ?, ?, 'open', ?)", b + 5, b + 4, b + 1, b + 2, 'Wat kan beter?'],
    ['INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES (?, ?, ?, ?)', b + 6, b + 4, '2026-10-01', json({ [b + 5]: 'Alles.' })],
    ['INSERT INTO inzendteller (vragenlijst_id, tijdvak, aantal) VALUES (?, ?, 1)', b + 4, '2026-10-01T10:00'],
    ["INSERT INTO eigen_invoer (id, onderzoek_id, thema_id, meetpunt_id, meetmoment_id, soort, datum, titel, aangemaakt_op) VALUES (?, ?, ?, ?, ?, 'interview', '2026-10-02', 'Interview', ?)", b + 7, o, b + 1, b + 2, b + 3, NU],
    ["INSERT INTO stukken (id, onderzoek_id, titel, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, 'Notitie', ?, ?)", b + 8, o, NU, NU],
    ["INSERT INTO acties (id, onderzoek_id, titel, aangemaakt_op) VALUES (?, ?, 'Actie', ?)", b + 9, o, NU],
    ["INSERT INTO deellinks (id, onderzoek_id, code, toegang_zout, toegang_hash, aangemaakt_op) VALUES (?, ?, ?, 'zout', 'hash', ?)", b + 10, o, `deel-${b}-volledig-00001`, NU],
    ['INSERT INTO kijksessies (token_hash, deellink_id, verloopt_op) VALUES (?, ?, 1)', `sessie-${b}`, b + 10],
    ['INSERT INTO kijkpogingen (id, deellink_id, tijdstip) VALUES (?, ?, 1)', b + 11, b + 10],
    ["INSERT INTO rapporten (id, onderzoek_id, titel, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, 'Rapport', ?, ?)", b + 12, o, NU, NU],
    ["INSERT INTO datasets (id, onderzoek_id, naam, kolommen, rijen, aantal_rijen, aangemaakt_op) VALUES (?, ?, 'Verzuim', '[]', '[]', 0, ?)", b + 13, o, NU],
    ['INSERT INTO hr_instellingen (onderzoek_id, inhoud, bijgewerkt_op) VALUES (?, ?, ?)', o, json({ versie: 1 }), NU],
    ["INSERT INTO personeelscijfers (id, onderzoek_id, naam, periode_van, periode_tot, inhoud, bewaren_tot, aangemaakt_op) VALUES (?, ?, 'Personeel', '2025-01', '2025-12', '{}', '2027-01-01', ?)", b + 14, o, NU],
    ["INSERT INTO werkbank_definities (id, onderzoek_id, dataset_id, soort, naam, definitie, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, ?, 'bereken', 'score', '{}', ?, ?)", b + 15, o, b + 13, NU, NU],
    ["INSERT INTO werkbank_definities (id, onderzoek_id, soort, naam, definitie, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, 'filter', 'selectie', '{}', ?, ?)", b + 16, o, NU, NU],
    ["INSERT INTO werkbank_analyses (id, onderzoek_id, dataset_id, titel, procedure, spec, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, ?, 'Analyse', 'frequenties', '{}', ?, ?)", b + 17, o, b + 13, NU, NU],
    ["INSERT INTO bronnen (id, citeersleutel, soort, titel, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, 'rapport', 'Bron', ?, ?)", b + 18, `bron${b}`, NU, NU],
    ['INSERT INTO bron_koppelingen (onderzoek_id, bron_id, aangemaakt_op) VALUES (?, ?, ?)', o, b + 18, NU],
    ['INSERT INTO codes (id, onderzoek_id, naam, aangemaakt_op) VALUES (?, ?, ?, ?)', b + 19, o, 'Code', NU],
    ['INSERT INTO coderingen (id, onderzoek_id, code_id, inzending_id, vraag_id) VALUES (?, ?, ?, ?, ?)', b + 20, o, b + 19, b + 6, b + 5],
    ['INSERT INTO coderingen (id, onderzoek_id, code_id, invoer_id) VALUES (?, ?, ?, ?)', b + 21, o, b + 19, b + 7],
    ['INSERT INTO citaten (id, onderzoek_id, code_id, inzending_id, vraag_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', b + 22, o, b + 19, b + 6, b + 5, 'Alles.', NU, NU],
    ['INSERT INTO citaten (id, onderzoek_id, code_id, invoer_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, ?, ?, ?, ?, ?)', b + 23, o, b + 19, b + 7, 'Uit het interview.', NU, NU],
  ]);
}

const verwijderVerzoek = (bevestiging) => new Request('https://onderzoek.test/api/beheer/onderzoeken/x', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bevestiging }),
});

test('onderzoek verwijderen: geen enkele tabel met onderzoek_id houdt rijen van dat onderzoek over', async () => {
  await vulVolledigOnderzoek(3, 30000);
  await vulVolledigOnderzoek(4, 40000); // een ander onderzoek, dat moet blijven staan

  const tabellen = await tabellenMetOnderzoek();
  // De lijst komt uit het schema; zo valt een nieuwe tabel met onderzoek_id vanzelf onder deze test.
  for (const t of ['themas', 'meetmomenten', 'vragenlijsten', 'eigen_invoer', 'stukken', 'acties', 'deellinks', 'rapporten', 'datasets', ...NIEUWE_TABELLEN.filter((x) => x !== 'bronnen')]) {
    assert.ok(tabellen.includes(t), `${t} ontbreekt in de lijst met onderzoek_id`);
  }
  assert.ok(!tabellen.includes('bronnen'), 'bronnen horen bij de hele bibliotheek, niet bij één onderzoek');
  const voorAnder = {};
  for (const t of tabellen) {
    assert.ok(await telling(t, 'onderzoek_id', 3) > 0, `de test vult ${t} niet: voeg een rij toe in vulVolledigOnderzoek`);
    voorAnder[t] = await telling(t, 'onderzoek_id', 4);
  }

  // Bevestigen met een verkeerde naam doet niets.
  await assert.rejects(verwijderen({ request: verwijderVerzoek('Ander BV'), env: { DB: db }, params: { id: '3' } }), (e) => e.status === 400);
  assert.ok(await telling('codes', 'onderzoek_id', 3) > 0);

  const antwoord = await verwijderen({ request: verwijderVerzoek('Bedrijf 3 BV'), env: { DB: db }, params: { id: '3' } });
  assert.equal(antwoord.status, 200);
  assert.deepEqual(await antwoord.json(), { ok: true });

  for (const t of tabellen) {
    assert.equal(await telling(t, 'onderzoek_id', 3), 0, `${t} heeft nog rijen van het verwijderde onderzoek`);
    assert.equal(await telling(t, 'onderzoek_id', 4), voorAnder[t], `${t}: het andere onderzoek is geraakt`);
  }
  assert.equal(await een('SELECT id FROM onderzoeken WHERE id = 3'), null);
  // Tabellen zonder onderzoek_id die via een andere tabel bij het onderzoek horen.
  assert.equal(await een('SELECT id FROM meetpunten WHERE id = 30002'), null);
  assert.equal(await een('SELECT id FROM vragen WHERE id = 30005'), null);
  assert.equal(await een('SELECT id FROM inzendingen WHERE id = 30006'), null);
  assert.equal(await telling('inzendteller', 'vragenlijst_id', 30004), 0);
  assert.equal(await telling('kijksessies', 'deellink_id', 30010), 0);
  assert.equal(await telling('kijkpogingen', 'deellink_id', 30010), 0);
  // Bronnen horen bij de bibliotheek en blijven bestaan; alleen de koppeling is weg.
  assert.ok(await een('SELECT id FROM bronnen WHERE id = 30018'));
  assert.ok(await een('SELECT id FROM inzendingen WHERE id = 40006'));
  assert.deepEqual(await alle('PRAGMA foreign_key_check'), []);
});

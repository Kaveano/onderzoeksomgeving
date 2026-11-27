// Servertests van de werkbank (BOUWPLAN P4 fase 3, D2 §13.5 zonder de rapportdelen): definities en bewaarde
// analyses via een echte lokale testserver op poort 8793, en het aantal databaseopdrachten per route.
// Uitvoeren: node --test test/werkbank-api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import * as werkbank from '../src/routes/werkbank.js';
import { volledigeJson } from '../public/js/beheer/export.js';
import { leesDefinities } from '../public/js/beheer/werkbank/definities.js';

const POORT = 8793;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-werkbank';
const B = '/api/beheer';
const NU = '2026-11-27T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
let server;
let map;
let cookie = '';

// Onderzoek 1 (actief) en 2 (actief, ander onderzoek) met een vragenlijst en een dataset; 3 is gearchiveerd met
// een definitie en een analyse; 4 heeft al 300 definities en 200 analyses (de grenzen).
const veel = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join(',\n');
const ZAAD = `
INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op, gearchiveerd_op) VALUES
  (1, 'Een BV', 'Onderzoek een', 'actief', '${NU}', NULL), (2, 'Twee BV', 'Onderzoek twee', 'actief', '${NU}', NULL),
  (3, 'Drie BV', 'Archief', 'gearchiveerd', '${NU}', '${NU}'), (4, 'Vier BV', 'Vol', 'actief', '${NU}', NULL);
INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (11, 1, 'Werkdruk', 1), (12, 1, 'Achtergrond', 2), (21, 2, 'Werkdruk', 1), (31, 3, 'Werk', 1);
INSERT INTO vragenlijsten (id, onderzoek_id, meetmoment_id, titel, code, status, aangemaakt_op) VALUES
  (10, 1, NULL, 'Lijst een', 'zaadcode-werkbank-0000001', 'gesloten', '${NU}'),
  (20, 2, NULL, 'Lijst twee', 'zaadcode-werkbank-0000002', 'gesloten', '${NU}');
INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, uitsplitsen, kenmerk, volgorde) VALUES
  (100, 10, 12, 'meerkeuze', 'Op welke afdeling werk je?', '[{"id":"oa","label":"A"},{"id":"ob","label":"B"}]', 1, 'afdeling', 1),
  (101, 10, 11, 'schaal', 'Tempo', '[]', 0, '', 2), (102, 10, 11, 'schaal', 'Tijd', '[]', 0, '', 3), (103, 10, 11, 'schaal', 'Pauze', '[]', 0, '', 4),
  (200, 20, 21, 'schaal', 'Tempo', '[]', 0, '', 1);
INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES
  ${veel(12, (i) => `(${1000 + i}, 10, '2026-10-01', '{"100":"${i % 2 ? 'oa' : 'ob'}","101":${1 + (i % 5)},"102":${1 + ((i + 2) % 5)},"103":${1 + ((i + 1) % 5)}}')`)};
INSERT INTO datasets (id, onderzoek_id, naam, kolommen, rijen, aantal_rijen, aangemaakt_op) VALUES
  (50, 1, 'Opleidingsuren 2025', '["Regio","Uren"]', '[["Noord",4],["Zuid",6]]', 2, '${NU}'),
  (60, 2, 'Ander bestand', '["Regio"]', '[["Oost"]]', 1, '${NU}');
INSERT INTO werkbank_definities (id, onderzoek_id, dataset_id, soort, naam, label, definitie, aangemaakt_op, bijgewerkt_op) VALUES
  (900, 2, NULL, 'omscoren', 'ander', '', '{"variabele":"v:200"}', '${NU}', '${NU}'),
  (901, 2, NULL, 'filter', 'anderefilter', '', '{"voorwaarden":[{"variabele":"v:200","van":1,"tot":3}]}', '${NU}', '${NU}'),
  (902, 3, NULL, 'omscoren', 'archief', '', '{"variabele":"v:1"}', '${NU}', '${NU}'),
  ${veel(300, (i) => `(${5000 + i}, 4, NULL, 'omscoren', 'vol${i}', '', '{"variabele":"v:1"}', '${NU}', '${NU}')`)};
INSERT INTO werkbank_analyses (id, onderzoek_id, titel, procedure, spec, aangemaakt_op, bijgewerkt_op) VALUES
  (903, 3, 'Archief', 'frequenties', '{"versie":1}', '${NU}', '${NU}'),
  ${veel(200, (i) => `(${7000 + i}, 4, 'A${i}', 'frequenties', '{"versie":1}', '${NU}', '${NU}')`)};
`;

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-werkbank-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: WRANGLER_ENV });
  const zaad = join(map, 'zaad.sql');
  writeFileSync(zaad, ZAAD);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', zaad], { stdio: 'ignore', env: WRANGLER_ENV });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--ip', '127.0.0.1', '--persist-to', map,
    '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
  { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASIS}/api/sessie`)).ok) break;
    } catch { /* nog niet klaar */ }
    await new Promise((r) => setTimeout(r, 500));
    if (i === 59) throw new Error('Testserver start niet');
  }
  const li = await fetch(`${BASIS}/api/inloggen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: WACHTWOORD }) });
  cookie = li.headers.get('set-cookie').split(';')[0];
});

after(() => {
  try { process.kill(-server.pid); } catch { /* al gestopt */ }
  rmSync(map, { recursive: true, force: true });
});

async function roep(pad, { methode = 'GET', body } = {}) {
  const r = await fetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let data = null;
  try { data = JSON.parse(tekst); } catch { /* geen json */ }
  return { status: r.status, data, tekst };
}

const def = (body, onderzoek = 1) => roep(`${B}/onderzoeken/${onderzoek}/werkbank/definities`, { methode: 'POST', body });
const lijst = async (onderzoek = 1) => (await roep(`${B}/onderzoeken/${onderzoek}/werkbank`)).data;
const spec = (velden = {}) => ({ versie: 1, bron: { soort: 'lijst', id: 10 }, filter: null, procedure: 'beschrijvend', variabelen: { variabelen: ['t:11'] }, opties: {}, ...velden });
const s = {};

test('lege werkbank: definities, analyses en de grenzen', async () => {
  const r = await roep(`${B}/onderzoeken/1/werkbank`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { definities: [], analyses: [], limieten: { definities: 300, analyses: 200 } });
  assert.equal((await roep(`${B}/onderzoeken/999/werkbank`)).status, 404);
});

test('nieuwe definities: schaalscore, omscoren, indeling en selectie; de definitie komt terug als object', async () => {
  const a = await def({ soort: 'bereken', naam: 'werkdruk_s', label: 'Werkdruk (eigen)', definitie: { functie: 'gemiddelde', variabelen: ['v:101', { id: 'v:102', omscoren: true }], min_geldig: 1 } });
  assert.equal(a.status, 201, a.tekst);
  assert.ok(a.data.id && a.data.bijgewerkt_op);
  s.bereken = a.data;
  const om = await def({ soort: 'omscoren', naam: 'tempo_om', definitie: { variabele: 'v:101' } });
  assert.equal(om.status, 201, om.tekst);
  s.omscoren = om.data;
  const her = await def({ soort: 'hercoderen', naam: 'werkdruk_groep', label: 'Werkdruk in groepen', definitie: { variabele: `w:${s.bereken.id}`, manier: 'grenzen', grenzen: [3], labels: ['laag', 'hoog'] } });
  assert.equal(her.status, 201, her.tekst);
  s.hercoderen = her.data;
  const fil = await def({ soort: 'filter', naam: 'afdeling_a', label: 'Alleen A', definitie: { voorwaarden: [{ variabele: 'v:100', is: ['oa'] }, { soort: 'kwaliteit', regel: 'min_beantwoord', min_pct: 50 }] } });
  assert.equal(fil.status, 201, fil.tekst);
  s.filter = fil.data;
  const l = await lijst();
  assert.equal(l.definities.length, 4);
  const b = l.definities.find((d) => d.id === s.bereken.id);
  assert.deepEqual(b.definitie, { functie: 'gemiddelde', variabelen: ['v:101', { id: 'v:102', omscoren: true }], min_geldig: 1 });
  assert.equal(b.verwijderd, false);
  assert.equal(b.dataset_id, null);
  assert.equal(b.label, 'Werkdruk (eigen)');
});

test('namen: dubbel (400), gereserveerd (gegenereerde SPSS-namen, kenmerken, SPSS-woorden) en ongeldig', async () => {
  const d = (naam) => def({ soort: 'omscoren', naam, definitie: { variabele: 'v:101' } });
  const dubbel = await d('Werkdruk_S');
  assert.equal(dubbel.status, 400);
  assert.equal(dubbel.data.fout, 'De naam “Werkdruk_S” is al in gebruik. Kies een andere naam.');
  for (const naam of ['v01', 'v02', 'thema01', 'meetmoment', 'datum', 'afdeling', 'leeftijd', 'AND', 'v04_enps']) {
    const r = await d(naam);
    assert.equal(r.status, 400, naam);
    assert.match(r.data.fout, /gereserveerd/, naam);
  }
  for (const naam of ['1score', 'met spatie', '', 'a'.repeat(33)]) assert.equal((await d(naam)).status, 400, naam);
});

test('ongeldige vormen en verwijzingen naar een ander onderzoek: 400', async () => {
  const fout = async (body, onderzoek = 1) => {
    const r = await def(body, onderzoek);
    assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status} ${r.tekst}`);
    return r.data.fout;
  };
  await fout({ soort: 'onbekend', naam: 'x1', definitie: {} });
  await fout({ soort: 'bereken', naam: 'x2' });
  await fout({ soort: 'bereken', naam: 'x3', definitie: { functie: 'verschil', variabelen: ['v:101'] } });
  await fout({ soort: 'bereken', naam: 'x4', definitie: { functie: 'gemiddelde', variabelen: ['datum'] } });
  await fout({ soort: 'filter', naam: 'x5', definitie: { voorwaarden: Array.from({ length: 11 }, () => ({ variabele: 'v:101', van: 1 })) } });
  await fout({ soort: 'hercoderen', naam: 'x6', definitie: { variabele: 'v:101', manier: 'grenzen', grenzen: [3, 2], labels: ['a', 'b', 'c'] } });
  // Een dataset van een ander onderzoek, een eigen variabele van een ander onderzoek.
  assert.match(await fout({ soort: 'omscoren', naam: 'x7', dataset_id: 60, definitie: { variabele: 'd:0' } }), /dataset hoort niet bij dit onderzoek/);
  assert.match(await fout({ soort: 'bereken', naam: 'x8', definitie: { functie: 'gemiddelde', variabelen: ['w:900', 'v:101'] } }), /niet \(meer\) bestaat/);
  // Een selectie kun je niet als variabele gebruiken.
  assert.match(await fout({ soort: 'omscoren', naam: 'x9', definitie: { variabele: `w:${s.filter.id}` } }), /selectie/);
});

test('een definitie bij een dataset: de kolomnamen zijn gereserveerd, een eigen naam mag', async () => {
  const kolom = await def({ soort: 'omscoren', naam: 'Regio', dataset_id: 50, definitie: { variabele: 'd:1', laag: 0, hoog: 10 } });
  assert.equal(kolom.status, 400);
  assert.match(kolom.data.fout, /gereserveerd/);
  const goed = await def({ soort: 'hercoderen', naam: 'uren_groep', dataset_id: 50, definitie: { variabele: 'd:1', manier: 'grenzen', grenzen: [5], labels: ['weinig', 'veel'] } });
  assert.equal(goed.status, 201, goed.tekst);
  s.dataset = goed.data;
  // Dezelfde naam mag wel bij de vragenlijsten (een andere gegevensbron).
  assert.equal((await def({ soort: 'omscoren', naam: 'uren_groep', definitie: { variabele: 'v:103' } })).status, 201);
  // Een eigen variabele van de vragenlijsten kun je niet bij de dataset gebruiken.
  assert.equal((await def({ soort: 'omscoren', naam: 'kruis', dataset_id: 50, definitie: { variabele: `w:${s.bereken.id}` } })).status, 400);
  // Eén set eigenschappen per gegevensbron.
  const e1 = await def({ soort: 'eigenschappen', naam: 'wat dan ook', definitie: { variabelen: { 'v:101': { meetniveau: 'interval' } } } });
  assert.equal(e1.status, 201, e1.tekst);
  assert.equal((await lijst()).definities.find((d) => d.id === e1.data.id).naam, '~eigenschappen');
  const e2 = await def({ soort: 'eigenschappen', definitie: { variabelen: {} } });
  assert.equal(e2.status, 409);
});

test('wijzigen: verouderde versie geeft 409 (conflict), soort en gegevensbron liggen vast, kringen geven 400', async () => {
  const pad = `${B}/werkbank/definities/${s.omscoren.id}`;
  const oud = await roep(pad, { methode: 'PUT', body: { label: 'Tempo omgekeerd', bijgewerkt_op: '2020-01-01T00:00:00.000Z' } });
  assert.equal(oud.status, 409);
  assert.equal(oud.data.conflict, true);
  const goed = await roep(pad, { methode: 'PUT', body: { label: 'Tempo omgekeerd', bijgewerkt_op: s.omscoren.bijgewerkt_op } });
  assert.equal(goed.status, 200, goed.tekst);
  assert.ok(goed.data.bijgewerkt_op > s.omscoren.bijgewerkt_op);
  s.omscoren.bijgewerkt_op = goed.data.bijgewerkt_op;
  assert.equal((await roep(pad, { methode: 'PUT', body: { soort: 'bereken' } })).status, 400);
  assert.equal((await roep(pad, { methode: 'PUT', body: { dataset_id: 50 } })).status, 400);
  // Kring: de schaalscore gebruikt nu w:omscoren, en omscoren gaat dan de schaalscore gebruiken.
  const b = await roep(`${B}/werkbank/definities/${s.bereken.id}`, { methode: 'PUT', body: { definitie: { functie: 'gemiddelde', variabelen: [`w:${s.omscoren.id}`, 'v:102'] } } });
  assert.equal(b.status, 200, b.tekst);
  const kring = await roep(pad, { methode: 'PUT', body: { definitie: { variabele: `w:${s.bereken.id}` } } });
  assert.equal(kring.status, 400);
  assert.equal(kring.data.fout, 'Deze variabelen verwijzen naar elkaar. Pas een van beide aan.');
  assert.equal((await roep(`${B}/werkbank/definities/99999`, { methode: 'PUT', body: { label: 'x' } })).status, 404);
});

test('bewaarde analyses: nieuw, lijst, wijzigen (met conflict), en controles op de spec', async () => {
  const pad = `${B}/onderzoeken/1/werkbank/analyses`;
  const a = await roep(pad, { methode: 'POST', body: { titel: 'Werkdruk per afdeling', procedure: 'pergroep', notitie: 'Voor hoofdstuk 4', spec: spec({ procedure: 'pergroep', filter: s.filter.id, variabelen: { afhankelijk: [`w:${s.bereken.id}`], groep: 'v:100' } }) } });
  assert.equal(a.status, 201, a.tekst);
  s.analyse = a.data;
  const l = await lijst();
  const x = l.analyses.find((y) => y.id === s.analyse.id);
  assert.equal(x.procedure, 'pergroep');
  assert.equal(x.spec.filter, s.filter.id);
  assert.equal(x.notitie, 'Voor hoofdstuk 4');
  const fout = async (body, verwacht = 400) => {
    const r = await roep(pad, { methode: 'POST', body: { titel: 'x', ...body } });
    assert.equal(r.status, verwacht, `${JSON.stringify(body)} → ${r.tekst}`);
  };
  await fout({ spec: spec({ procedure: 'onbekend' }) });
  await fout({ procedure: 'anova', spec: spec() });
  await fout({ spec: spec({ opties: { posthoc: 'scheffe' } }) });
  await fout({ spec: spec({ filter: s.bereken.id }) }); // geen selectie
  await fout({ spec: spec({ filter: 901 }) }); // selectie van een ander onderzoek
  await fout({ spec: spec({ bron: { soort: 'lijst', id: 20 } }) }); // vragenlijst van een ander onderzoek
  await fout({ spec: spec({ bron: { soort: 'dataset', id: 60 } }) });
  await fout({ spec: spec({ bron: { soort: 'gestapeld', lijsten: [10, 20] } }) });
  await fout({ spec: spec({ bron: { soort: 'dataset', id: 50 }, filter: s.filter.id }) }); // selectie hoort bij de vragenlijsten
  const ds = await roep(pad, { methode: 'POST', body: { titel: 'Uren', spec: spec({ bron: { soort: 'dataset', id: 50 }, procedure: 'frequenties', variabelen: { variabelen: ['d:0'] } }) } });
  assert.equal(ds.status, 201, ds.tekst);
  assert.equal((await lijst()).analyses.find((y) => y.id === ds.data.id).dataset_id, 50);
  const wpad = `${B}/werkbank/analyses/${s.analyse.id}`;
  assert.equal((await roep(wpad, { methode: 'PUT', body: { titel: 'Nieuw', bijgewerkt_op: '2020-01-01T00:00:00.000Z' } })).data.conflict, true);
  const w = await roep(wpad, { methode: 'PUT', body: { titel: 'Werkdruk per afdeling (v2)', bijgewerkt_op: s.analyse.bijgewerkt_op } });
  assert.equal(w.status, 200, w.tekst);
  assert.equal((await lijst()).analyses.find((y) => y.id === s.analyse.id).titel, 'Werkdruk per afdeling (v2)');
  assert.equal((await roep(wpad, { methode: 'PUT', body: { notitie: 'Alleen een notitie' } })).status, 200);
  assert.equal((await roep(`${B}/werkbank/analyses/${ds.data.id}`, { methode: 'DELETE' })).data.ok, true);
  assert.equal((await roep(`${B}/werkbank/analyses/${ds.data.id}`, { methode: 'DELETE' })).status, 404);
});

test('verwijderen: in gebruik geeft 409 met gebruikt_door; zacht en definitief verwijderen', async () => {
  // De schaalscore wordt gebruikt door de indeling en de analyse.
  const inGebruik = await roep(`${B}/werkbank/definities/${s.bereken.id}`, { methode: 'DELETE' });
  assert.equal(inGebruik.status, 409);
  assert.deepEqual(inGebruik.data.gebruikt_door.map((x) => x.soort).sort(), ['analyse', 'variabele']);
  assert.match(inGebruik.data.fout, /^Deze variabele wordt nog gebruikt door: /);
  // De selectie wordt gebruikt door de analyse.
  const filterGebruik = await roep(`${B}/werkbank/definities/${s.filter.id}`, { methode: 'DELETE' });
  assert.equal(filterGebruik.status, 409);
  assert.deepEqual(filterGebruik.data.gebruikt_door, [{ soort: 'analyse', id: s.analyse.id, naam: 'Werkdruk per afdeling (v2)' }]);
  assert.equal((await roep(`${B}/werkbank/analyses/${s.analyse.id}`, { methode: 'DELETE' })).status, 200);
  // Een indeling verdwijnt eerst zacht (telt nog mee bij regel E), dan definitief.
  const zacht = await roep(`${B}/werkbank/definities/${s.hercoderen.id}`, { methode: 'DELETE' });
  assert.deepEqual(zacht.data, { ok: true, verwijderd: 'zacht' });
  const na = (await lijst()).definities.find((d) => d.id === s.hercoderen.id);
  assert.equal(na.verwijderd, true);
  assert.ok(na.verwijderd_op);
  assert.equal((await roep(`${B}/werkbank/definities/${s.hercoderen.id}`, { methode: 'PUT', body: { label: 'x' } })).status, 409);
  // De naam is weer vrij voor een nieuwe definitie.
  assert.equal((await def({ soort: 'hercoderen', naam: 'werkdruk_groep', definitie: { variabele: 'v:101', manier: 'grenzen', grenzen: [3], labels: ['laag', 'hoog'] } })).status, 201);
  const definitief = await roep(`${B}/werkbank/definities/${s.hercoderen.id}?definitief=1`, { methode: 'DELETE' });
  assert.deepEqual(definitief.data, { ok: true, verwijderd: 'definitief' });
  assert.ok(!(await lijst()).definities.some((d) => d.id === s.hercoderen.id));
  // Nu wordt de schaalscore niet meer gebruikt: een schaalscore gaat meteen definitief weg.
  const b = await roep(`${B}/werkbank/definities/${s.bereken.id}`, { methode: 'DELETE' });
  assert.deepEqual(b.data, { ok: true, verwijderd: 'definitief' });
});

test('gearchiveerd onderzoek: lezen mag, schrijven geeft 409', async () => {
  const l = await lijst(3);
  assert.equal(l.definities.length, 1);
  assert.equal(l.analyses.length, 1);
  const verwacht409 = [
    await def({ soort: 'omscoren', naam: 'nieuw', definitie: { variabele: 'v:1' } }, 3),
    await roep(`${B}/werkbank/definities/902`, { methode: 'PUT', body: { label: 'x' } }),
    await roep(`${B}/werkbank/definities/902`, { methode: 'DELETE' }),
    await roep(`${B}/onderzoeken/3/werkbank/analyses`, { methode: 'POST', body: { titel: 'x', spec: spec({ bron: { soort: 'gestapeld', lijsten: 'alle' } }) } }),
    await roep(`${B}/werkbank/analyses/903`, { methode: 'PUT', body: { titel: 'x' } }),
    await roep(`${B}/werkbank/analyses/903`, { methode: 'DELETE' }),
  ];
  for (const r of verwacht409) {
    assert.equal(r.status, 409, r.tekst);
    assert.equal(r.data.fout, 'Dit onderzoek is gearchiveerd en kan niet meer worden gewijzigd.');
  }
});

test('grenzen: 300 definities en 200 analyses per onderzoek', async () => {
  const d = await def({ soort: 'omscoren', naam: 'nog_een', definitie: { variabele: 'v:1' } }, 4);
  assert.equal(d.status, 409);
  assert.match(d.data.fout, /maximaal 300/);
  const a = await roep(`${B}/onderzoeken/4/werkbank/analyses`, { methode: 'POST', body: { titel: 'x', spec: spec({ bron: { soort: 'gestapeld', lijsten: 'alle' } }) } });
  assert.equal(a.status, 409);
  assert.match(a.data.fout, /maximaal 200/);
});

test('export/data bevat de werkbank (ook zacht verwijderde indelingen) en de volledige kopie leest ze', async () => {
  const f = await def({ soort: 'filter', naam: 'weg_straks', definitie: { voorwaarden: [{ variabele: 'v:100', is: ['ob'] }] } });
  await roep(`${B}/werkbank/definities/${f.data.id}`, { methode: 'DELETE' });
  const r = await roep(`${B}/onderzoeken/1/export/data`);
  assert.equal(r.status, 200);
  const rij = r.data.werkbank_definities.find((d) => d.id === f.data.id);
  assert.equal(typeof rij.definitie, 'string');
  assert.ok(rij.verwijderd_op);
  const gelezen = leesDefinities(r.data.werkbank_definities);
  assert.equal(gelezen.find((d) => d.id === f.data.id).verwijderd, true);
  const kopie = JSON.parse(volledigeJson({ ...r.data, datasets: [] }));
  assert.ok(kopie.werkbank.definities.some((d) => d.id === f.data.id && typeof d.definitie === 'object'));
  assert.ok(Array.isArray(kopie.werkbank.analyses));
});

test('verwijderen van een dataset of een onderzoek neemt de werkbank mee', async () => {
  assert.ok((await lijst()).definities.some((d) => d.dataset_id === 50));
  assert.equal((await roep(`${B}/datasets/50`, { methode: 'DELETE' })).status, 200);
  assert.ok(!(await lijst()).definities.some((d) => d.dataset_id === 50));
  assert.equal((await roep(`${B}/onderzoeken/2/archiveren`, { methode: 'POST', body: {} })).status, 200);
  const weg = await roep(`${B}/onderzoeken/2`, { methode: 'DELETE', body: { bevestiging: 'Twee BV' } });
  assert.equal(weg.status, 200, weg.tekst);
  const dir = join(map, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const db = new DatabaseSync(join(dir, readdirSync(dir).find((x) => x.endsWith('.sqlite') && x !== 'metadata.sqlite')), { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM werkbank_definities WHERE onderzoek_id = 2').get().n, 0);
  db.close();
});

// ---------- Aantal databaseopdrachten per route (in het proces, met node:sqlite als D1) ----------

function testDatabase() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.exec(ZAAD);
  const tel = { batches: 0, los: 0, opdrachtenPerBatch: [] };
  const opdracht = (sql, params = []) => ({
    sql, params,
    bind: (...p) => opdracht(sql, p),
    async all() { tel.los++; return { results: db.prepare(sql).all(...params) }; },
    async first() { tel.los++; return db.prepare(sql).get(...params) ?? null; },
    async run() { tel.los++; db.prepare(sql).run(...params); return { meta: {} }; },
  });
  const DB = {
    prepare: (sql) => opdracht(sql),
    async batch(lijst) {
      tel.batches++;
      tel.opdrachtenPerBatch.push(lijst.length);
      return lijst.map((o) => ({ results: /^\s*(SELECT|WITH)/i.test(o.sql) ? db.prepare(o.sql).all(...o.params) : (db.prepare(o.sql).run(...o.params), []) }));
    },
  };
  return { env: { DB }, tel, db };
}

const verzoek = (methode, body) => new Request('http://x/api', { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

test('rekentijd: elke route doet hooguit één batch en daarnaast hooguit één schrijfopdracht', async () => {
  const { env, tel } = testDatabase();
  const meet = async (fn) => {
    tel.batches = 0;
    tel.los = 0;
    const r = await fn();
    assert.ok(tel.batches <= 1, `batches: ${tel.batches}`);
    assert.ok(tel.los <= 1, `losse opdrachten: ${tel.los}`);
    return r.json();
  };
  const nieuw = await meet(() => werkbank.definitieNieuw({ env, params: { id: '1' }, request: verzoek('POST', { soort: 'omscoren', naam: 'tempo_r', definitie: { variabele: 'v:101' } }) }));
  await meet(() => werkbank.definitieWijzig({ env, params: { id: String(nieuw.id) }, request: verzoek('PUT', { label: 'x' }) }));
  await meet(() => werkbank.overzicht({ env, params: { id: '1' } }));
  const a = await meet(() => werkbank.analyseNieuw({ env, params: { id: '1' }, request: verzoek('POST', { titel: 't', spec: spec() }) }));
  await meet(() => werkbank.analyseWijzig({ env, params: { id: String(a.id) }, request: verzoek('PUT', { titel: 't2', spec: spec() }) }));
  await meet(() => werkbank.analyseVerwijder({ env, params: { id: String(a.id) } }));
  await meet(() => werkbank.definitieVerwijder({ env, params: { id: String(nieuw.id) }, url: new URL('http://x/?definitief=1') }));
  assert.ok(Math.max(...tel.opdrachtenPerBatch) <= 10);
});

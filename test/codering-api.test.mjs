// Eind-tot-eindtests voor het coderen van open antwoorden en interviews (BOUWPLAN §4 P5, criterium 7; B24) via een
// echte lokale testserver (poort 8789; inspector 9789):
// - codes maken (unieke naam), samenvoegen en verwijderen;
// - de codes van één antwoord of interview vervangen, met controle dat het antwoord bij dit onderzoek hoort, de vraag
//   een open vraag van die vragenlijst is en er iets is ingevuld;
// - citaten: niet in het rapport zonder "gecontroleerd" (400); een nieuwe tekst moet opnieuw gecontroleerd worden;
// - gearchiveerd onderzoek: 409;
// - de aantallen in coderingFeiten (uit gegevens.js, zoals het scherm) zijn gemaskeerd;
// - coderingen en citaten verdwijnen met hun inzending.
// Uitvoeren: node --test test/codering-api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { haalGegevens, vergeetGegevens } from '../public/js/beheer/gegevens.js';
import { coderingFeiten, CITAAT_NIET_GECONTROLEERD } from '../public/js/beheer/codering-regels.js';

const POORT = 8789;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-codering';
const B = '/api/beheer';
const NU = '2026-11-27T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
const echteFetch = globalThis.fetch;
let server;
let map;
let cookie = '';

// Onderzoek 600 (actief): vragenlijst 6001 met open vraag 6002 en schaalvraag 6003; 12 ingevulde antwoorden en
// één leeg antwoord (61013). Onderzoek 601 is gearchiveerd, 602 is een ander onderzoek.
function zaad() {
  const r = [
    `INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op, gearchiveerd_op) VALUES
      (600, 'Bedrijf', 'Actief', 'actief', '${NU}', NULL), (601, 'Oud', 'Gearchiveerd', 'gearchiveerd', '${NU}', '${NU}'),
      (602, 'Ander', 'Ander onderzoek', 'actief', '${NU}', NULL);`,
    'INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (6000, 600, \'Werk\', 1), (6010, 601, \'Werk\', 1), (6020, 602, \'Werk\', 1);',
    `INSERT INTO vragenlijsten (id, onderzoek_id, titel, code, status, aangemaakt_op) VALUES
      (6001, 600, 'Nulmeting', 'zaadcode-codering-000001', 'gesloten', '${NU}'), (6011, 601, 'Lijst', 'zaadcode-codering-000002', 'gesloten', '${NU}'),
      (6021, 602, 'Lijst', 'zaadcode-codering-000003', 'gesloten', '${NU}');`,
    `INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, volgorde) VALUES
      (6002, 6001, 6000, 'open', 'Wat kan beter?', 1), (6003, 6001, 6000, 'schaal', 'Tevreden?', 2),
      (6012, 6011, 6010, 'open', 'Wat kan beter?', 1), (6022, 6021, 6020, 'open', 'Wat kan beter?', 1);`,
  ];
  const inz = [];
  for (let i = 1; i <= 12; i++) inz.push(`(${61000 + i}, 6001, '2026-10-01', '{"6002":"Antwoord ${i} over de planning","6003":4}')`);
  inz.push('(61013, 6001, \'2026-10-01\', \'{"6003":3}\')', '(61101, 6011, \'2026-10-01\', \'{"6012":"Oud antwoord"}\')', '(62101, 6021, \'2026-10-01\', \'{"6022":"Ander antwoord"}\')');
  r.push(`INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES ${inz.join(', ')};`);
  r.push(`INSERT INTO eigen_invoer (id, onderzoek_id, thema_id, soort, datum, titel, tekst, aangemaakt_op) VALUES
    (6005, 600, 6000, 'interview', '2026-10-02', 'Interview teamleider', 'Veel overwerk door late wijzigingen.', '${NU}'),
    (6015, 601, 6010, 'interview', '2026-10-02', 'Gesprek', 'Tekst', '${NU}'),
    (6025, 602, 6020, 'interview', '2026-10-02', 'Gesprek', 'Tekst', '${NU}'),
    (6027, 602, 6020, 'cijfer', '2026-10-02', 'Verzuim', 'Toelichting bij het cijfer', '${NU}'),
    (6028, 602, 6020, 'observatie', '2026-10-03', 'Werkoverleg', 'Korte lijnen.', '${NU}');`);
  r.push(`INSERT INTO codes (id, onderzoek_id, naam, volgorde, aangemaakt_op) VALUES (6016, 601, 'Oud', 1, '${NU}'), (6026, 602, 'Ander', 1, '${NU}');`);
  return r.join('\n');
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-codering-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: WRANGLER_ENV });
  const pad = join(map, 'zaad.sql');
  writeFileSync(pad, zaad());
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', pad], { stdio: 'ignore', env: WRANGLER_ENV });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--inspector-port', String(POORT + 1000), '--ip', '127.0.0.1',
    '--persist-to', map, '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
  { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await echteFetch(`${BASIS}/api/sessie`)).ok) break;
    } catch { /* nog niet klaar */ }
    await new Promise((res) => setTimeout(res, 500));
    if (i === 59) throw new Error('Testserver start niet');
  }
  const li = await echteFetch(`${BASIS}/api/inloggen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: WACHTWOORD }) });
  cookie = li.headers.get('set-cookie').split(';')[0];
});

after(() => {
  globalThis.fetch = echteFetch;
  try { process.kill(-server.pid); } catch { /* al gestopt */ }
  rmSync(map, { recursive: true, force: true });
});

async function roep(pad, { methode = 'GET', body } = {}) {
  const r = await echteFetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let data = null;
  try { data = JSON.parse(tekst); } catch { /* geen json */ }
  return { status: r.status, data };
}
const zet = (body) => roep(`${B}/onderzoeken/600/coderingen`, { methode: 'PUT', body });
const stand = async () => (await roep(`${B}/onderzoeken/600/codering`)).data;
const s = {};

test('codes maken: unieke naam per onderzoek', async () => {
  let r = await roep(`${B}/onderzoeken/600/codes`, { methode: 'POST', body: { naam: 'Werkdruk', omschrijving: 'Te veel werk' } });
  assert.equal(r.status, 201);
  s.a = r.data.id;
  r = await roep(`${B}/onderzoeken/600/codes`, { methode: 'POST', body: { naam: 'Planning' } });
  s.b = r.data.id;
  r = await roep(`${B}/onderzoeken/600/codes`, { methode: 'POST', body: { naam: 'Werkdruk' } });
  assert.equal(r.status, 409);
  assert.equal(r.data.fout, 'Er is al een code met de naam "Werkdruk".');
  assert.equal((await roep(`${B}/onderzoeken/600/codes`, { methode: 'POST', body: { naam: '  ' } })).status, 400);
  // Dezelfde naam in een ander onderzoek mag.
  assert.equal((await roep(`${B}/onderzoeken/602/codes`, { methode: 'POST', body: { naam: 'Werkdruk' } })).status, 201);
  const st = await stand();
  assert.deepEqual(st.codes.map((c) => [c.naam, c.volgorde]), [['Werkdruk', 1], ['Planning', 2]]);
  r = await roep(`${B}/codes/${s.b}`, { methode: 'PUT', body: { naam: 'Werkdruk' } });
  assert.equal(r.status, 409);
  r = await roep(`${B}/codes/${s.b}`, { methode: 'PUT', body: { naam: 'Planning en roosters', groep: 'Organisatie' } });
  assert.equal(r.status, 200);
  assert.equal((await stand()).codes[1].groep, 'Organisatie');
});

test('de codes van één antwoord vervangen, met de controles van het plan', async () => {
  let r = await zet({ inzending_id: 61001, vraag_id: 6002, code_ids: [s.a] });
  assert.equal(r.status, 200);
  r = await zet({ inzending_id: 61001, vraag_id: 6002, code_ids: [s.a, s.b] });
  assert.deepEqual((await stand()).coderingen.filter((c) => c.inzending_id === 61001).map((c) => c.code_id).sort(), [s.a, s.b].sort());
  r = await zet({ inzending_id: 61001, vraag_id: 6002, code_ids: [] });
  assert.equal((await stand()).coderingen.length, 0);
  // Antwoord van een ander onderzoek, een gesloten vraag, een leeg antwoord, een code van een ander onderzoek
  r = await zet({ inzending_id: 62101, vraag_id: 6022, code_ids: [s.a] });
  assert.equal(r.status, 400);
  assert.equal(r.data.fout, 'Dit antwoord hoort niet bij dit onderzoek.');
  r = await zet({ inzending_id: 61001, vraag_id: 6003, code_ids: [s.a] });
  assert.equal(r.data.fout, 'Kies een open vraag van de vragenlijst van dit antwoord.');
  r = await zet({ inzending_id: 61001, vraag_id: 6022, code_ids: [s.a] });
  assert.equal(r.status, 400, 'de vraag van een andere vragenlijst');
  r = await zet({ inzending_id: 61013, vraag_id: 6002, code_ids: [s.a] });
  assert.equal(r.data.fout, 'Op deze vraag staat in dit antwoord niets ingevuld.');
  assert.equal((await zet({ inzending_id: 61002, vraag_id: 6002, code_ids: [s.a] })).status, 200);
  r = await zet({ inzending_id: 61002, vraag_id: 6002, code_ids: [6026] });
  assert.equal(r.data.fout, 'Kies codes van dit onderzoek.');
  assert.deepEqual((await stand()).coderingen.filter((c) => c.inzending_id === 61002).map((c) => c.code_id), [s.a],
    'een geweigerd verzoek laat de bestaande codes staan (controle en schrijven in één batch)');
  await zet({ inzending_id: 61002, vraag_id: 6002, code_ids: [] });
  r = await zet({ inzending_id: 61002, vraag_id: 6002, code_ids: [s.a, s.a] });
  assert.equal(r.status, 400);
  // Interview
  r = await zet({ invoer_id: 6005, code_ids: [s.a] });
  assert.equal(r.status, 200);
  assert.equal((await zet({ invoer_id: 6025, code_ids: [s.a] })).status, 400);
  assert.equal((await zet({ invoer_id: 6005, inzending_id: 61001, vraag_id: 6002, code_ids: [s.a] })).status, 400);
  // Alleen interviews en observaties (BOUWPLAN P5 B): een cijfer uit Eigen invoer niet, ook niet met een lege lijst
  const zet602 = (body) => roep(`${B}/onderzoeken/602/coderingen`, { methode: 'PUT', body });
  r = await zet602({ invoer_id: 6027, code_ids: [6026] });
  assert.equal(r.status, 400);
  assert.equal(r.data.fout, 'Alleen interviews en observaties kun je coderen.');
  assert.equal((await zet602({ invoer_id: 6027, code_ids: [] })).status, 400);
  assert.equal((await zet({ invoer_id: 6027, code_ids: [s.a] })).data.fout, 'Deze invoer hoort niet bij dit onderzoek.', 'eerst: van dit onderzoek');
  assert.equal((await zet602({ invoer_id: 6028, code_ids: [6026] })).status, 200, 'een observatie mag');
  assert.equal((await zet602({ invoer_id: 6028, code_ids: [] })).status, 200);
  assert.deepEqual((await stand()).coderingen.map((c) => [c.invoer_id, c.code_id]), [[6005, s.a]]);
});

test('criterium 7: een citaat kan niet in het rapport zonder "gecontroleerd"', async () => {
  const nieuw = (body) => roep(`${B}/onderzoeken/600/citaten`, { methode: 'POST', body: { inzending_id: 61002, vraag_id: 6002, code_id: s.a, tekst: 'Over de planning', ...body } });
  let r = await nieuw({ in_rapport: true });
  assert.equal(r.status, 400);
  assert.equal(r.data.fout, CITAAT_NIET_GECONTROLEERD);
  r = await nieuw({ tekst: 'x'.repeat(1001) });
  assert.equal(r.status, 400);
  r = await nieuw({ gecontroleerd: true, in_rapport: true });
  assert.equal(r.status, 201);
  s.citaat = r.data.id;
  r = await roep(`${B}/onderzoeken/600/citaten`, { methode: 'POST', body: { invoer_id: 6005, tekst: 'late wijzigingen' } });
  assert.equal(r.status, 201);
  s.citaatInterview = r.data.id;
  assert.equal((await roep(`${B}/onderzoeken/600/citaten`, { methode: 'POST', body: { inzending_id: 61013, vraag_id: 6002, tekst: 'x' } })).status, 400);
  r = await roep(`${B}/onderzoeken/602/citaten`, { methode: 'POST', body: { invoer_id: 6027, tekst: 'Toelichting' } });
  assert.deepEqual([r.status, r.data.fout], [400, 'Alleen interviews en observaties kun je coderen.']);
  // Een nieuwe tekst moet opnieuw gecontroleerd worden.
  r = await roep(`${B}/citaten/${s.citaat}`, { methode: 'PUT', body: { tekst: 'Over de planning (ingekort)' } });
  assert.deepEqual([r.data.gecontroleerd, r.data.in_rapport], [0, 0]);
  r = await roep(`${B}/citaten/${s.citaat}`, { methode: 'PUT', body: { in_rapport: true } });
  assert.equal(r.status, 400);
  r = await roep(`${B}/citaten/${s.citaat}`, { methode: 'PUT', body: { gecontroleerd: true, in_rapport: true } });
  assert.deepEqual([r.status, r.data.gecontroleerd, r.data.in_rapport], [200, 1, 1]);
  // Gecontroleerd uitzetten haalt het citaat ook uit het rapport.
  r = await roep(`${B}/citaten/${s.citaat}`, { methode: 'PUT', body: { gecontroleerd: false } });
  assert.deepEqual([r.data.gecontroleerd, r.data.in_rapport], [0, 0]);
  await roep(`${B}/citaten/${s.citaat}`, { methode: 'PUT', body: { gecontroleerd: true, in_rapport: true } });
  const st = await stand();
  assert.equal(st.citaten.find((c) => c.id === s.citaat).tekst, 'Over de planning (ingekort)');
  assert.equal(st.citaten.length, 2);
});

test('codes samenvoegen en verwijderen', async () => {
  const c = (await roep(`${B}/onderzoeken/600/codes`, { methode: 'POST', body: { naam: 'Overwerk' } })).data.id;
  await zet({ inzending_id: 61003, vraag_id: 6002, code_ids: [c] });
  await zet({ inzending_id: 61004, vraag_id: 6002, code_ids: [c, s.a] });
  await roep(`${B}/citaten/${s.citaatInterview}`, { methode: 'PUT', body: { code_id: c } });
  let r = await roep(`${B}/codes/${c}`, { methode: 'PUT', body: { samenvoegen_in: s.a } });
  assert.equal(r.status, 200);
  let st = await stand();
  assert.equal(st.codes.some((x) => x.id === c), false);
  assert.deepEqual(st.coderingen.filter((x) => x.inzending_id === 61003 || x.inzending_id === 61004).map((x) => [x.inzending_id, x.code_id]).sort(),
    [[61003, s.a], [61004, s.a]]);
  assert.equal(st.citaten.find((x) => x.id === s.citaatInterview).code_id, s.a);
  assert.equal((await roep(`${B}/codes/${s.a}`, { methode: 'PUT', body: { samenvoegen_in: 6026 } })).status, 400);
  // Verwijderen: de code verdwijnt van de antwoorden, het citaat blijft zonder code.
  const d = (await roep(`${B}/onderzoeken/600/codes`, { methode: 'POST', body: { naam: 'Tijdelijk' } })).data.id;
  await zet({ inzending_id: 61005, vraag_id: 6002, code_ids: [d] });
  const cit = (await roep(`${B}/onderzoeken/600/citaten`, { methode: 'POST', body: { inzending_id: 61005, vraag_id: 6002, code_id: d, tekst: 'Iets' } })).data.id;
  r = await roep(`${B}/codes/${d}`, { methode: 'DELETE' });
  assert.equal(r.status, 200);
  st = await stand();
  assert.equal(st.coderingen.some((x) => x.code_id === d), false);
  assert.equal(st.citaten.find((x) => x.id === cit).code_id, null);
  assert.equal((await roep(`${B}/citaten/${cit}`, { methode: 'DELETE' })).status, 200);
});

test('GET …/codering: JSON uit de database, coderingen in delen (?na=, ?max=)', async () => {
  assert.equal((await zet({ inzending_id: 61005, vraag_id: 6002, code_ids: [s.a] })).status, 200);
  const alles = await stand();
  assert.deepEqual(Object.keys(alles), ['codes', 'coderingen', 'citaten', 'volgende']);
  assert.equal(alles.volgende, null);
  assert.ok(alles.coderingen.length >= 4);
  assert.deepEqual(Object.keys(alles.coderingen[0]), ['id', 'code_id', 'inzending_id', 'vraag_id', 'invoer_id']);
  assert.deepEqual(Object.keys(alles.codes[0]), ['id', 'onderzoek_id', 'naam', 'omschrijving', 'groep', 'volgorde', 'aangemaakt_op']);
  assert.ok(alles.citaten.every((c) => typeof c.tekst === 'string' && [0, 1].includes(c.gecontroleerd)));
  const ids = alles.coderingen.map((c) => c.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'in volgorde van id');
  // In delen van 2: samen precies dezelfde coderingen; codes en citaten alleen in het eerste deel
  const delen = [];
  let r = (await roep(`${B}/onderzoeken/600/codering?max=2`)).data;
  delen.push(...r.coderingen);
  assert.equal(r.coderingen.length, 2);
  assert.ok(Array.isArray(r.codes) && Array.isArray(r.citaten));
  while (r.volgende !== null) {
    r = (await roep(`${B}/onderzoeken/600/codering?max=2&na=${r.volgende}`)).data;
    assert.equal(r.codes, undefined);
    assert.equal(r.citaten, undefined);
    delen.push(...r.coderingen);
  }
  assert.deepEqual(delen, alles.coderingen);
  assert.equal((await roep(`${B}/onderzoeken/600/codering?max=0`)).status, 400);
  assert.equal((await roep(`${B}/onderzoeken/600/codering?max=10001`)).status, 400);
  r = (await roep(`${B}/onderzoeken/602/codering`)).data;
  assert.ok(r.codes.some((c) => c.naam === 'Ander') && r.codes.every((c) => c.onderzoek_id === 602));
  assert.deepEqual([r.coderingen, r.citaten, r.volgende], [[], [], null]);
  assert.equal((await roep(`${B}/onderzoeken/999/codering`)).status, 404);
  await zet({ inzending_id: 61005, vraag_id: 6002, code_ids: [] });
});

test('gearchiveerd onderzoek: niets wijzigen (409), wel bekijken', async () => {
  assert.equal((await roep(`${B}/onderzoeken/601/codes`, { methode: 'POST', body: { naam: 'Nieuw' } })).status, 409);
  assert.equal((await roep(`${B}/codes/6016`, { methode: 'PUT', body: { naam: 'Anders' } })).status, 409);
  assert.equal((await roep(`${B}/codes/6016`, { methode: 'DELETE' })).status, 409);
  assert.equal((await roep(`${B}/onderzoeken/601/coderingen`, { methode: 'PUT', body: { inzending_id: 61101, vraag_id: 6012, code_ids: [6016] } })).status, 409);
  assert.equal((await roep(`${B}/onderzoeken/601/citaten`, { methode: 'POST', body: { invoer_id: 6015, tekst: 'x' } })).status, 409);
  assert.equal((await roep(`${B}/onderzoeken/601/codering`)).status, 200);
});

test('criterium 7: gemaskeerde aantallen in coderingFeiten, uit gegevens.js zoals het scherm', async () => {
  // Werkdruk bij antwoord 1–6, Planning bij 7–8, zonder code 9–12: [6, 2, 4] → Planning en "zonder code" verborgen.
  for (let i = 1; i <= 12; i++) {
    const code = i <= 6 ? [s.a] : i <= 8 ? [s.b] : [];
    assert.equal((await zet({ inzending_id: 61000 + i, vraag_id: 6002, code_ids: code })).status, 200);
  }
  globalThis.fetch = (pad, opties = {}) => echteFetch(BASIS + pad, { ...opties, headers: { ...(opties.headers || {}), Cookie: cookie } });
  try {
    vergeetGegevens(600);
    const data = await haalGegevens(600);
    const f = coderingFeiten(data);
    assert.equal(f.vragen.length, 1);
    assert.equal(f.vragen[0].n_antwoorden, 12);
    assert.deepEqual(f.vragen[0].codes, [
      { code_id: s.a, naam: 'Werkdruk', aantal: 6, verborgen: false },
      { code_id: s.b, naam: 'Planning en roosters', aantal: null, verborgen: true },
    ]);
    assert.equal(f.vragen[0].geen_code, null);
    assert.deepEqual(f.citaten.map((c) => c.tekst), ['Over de planning (ingekort)'], 'alleen het gecontroleerde citaat dat in het rapport mag');
    assert.deepEqual(f.interviews, { n: 1, codes: [{ code_id: s.a, naam: 'Werkdruk', aantal: null, verborgen: true }], geen_code: null });
  } finally {
    globalThis.fetch = echteFetch;
  }
});

test('criterium 7: coderingen en citaten verdwijnen met hun inzending', async () => {
  const voor = await stand();
  assert.ok(voor.coderingen.some((c) => c.inzending_id));
  const r = await roep(`${B}/vragenlijsten/6001/inzendingen`, { methode: 'DELETE' });
  assert.equal(r.status, 200);
  const na = await stand();
  assert.deepEqual(na.coderingen.map((c) => c.invoer_id), [6005], 'alleen de codering van het interview blijft');
  assert.deepEqual(na.citaten.map((c) => c.invoer_id), [6005]);
  assert.equal(na.codes.length, voor.codes.length, 'het codeboek blijft');
});

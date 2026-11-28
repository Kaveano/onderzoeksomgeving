// Hercontrole J7 via een echte lokale testserver (poort 8786; inspector 9786): een eigen variabele die er al was
// vóór een code met dezelfde naam, blijft te wijzigen. De server reserveert de codenamen zoals de werkbank ze maakt:
// de namen van de eigen variabelen staan vast vóór de codes (die code heet dan …_2).
// Uitvoeren: node --test test/herstel-server.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const POORT = 8786;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-integratie';
const B = '/api/beheer';
const NU = '2026-11-28T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
let server;
let map;
let cookie = '';

// Onderzoek 800: schaalvraag 8003 (v01) en open vraag 8002 (v02). Eigen variabele 8100 "v02_nieuwecode" (eerst gemaakt);
// daarna de code "nieuwecode" bij 6 antwoorden van vraag 8002 (in de werkbank: v02_nieuwecode_2).
function zaad() {
  const r = [
    `INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op) VALUES (800, 'Bedrijf', 'Namen', 'actief', '${NU}');`,
    'INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (8000, 800, \'Werk\', 1);',
    `INSERT INTO vragenlijsten (id, onderzoek_id, titel, code, status, aangemaakt_op) VALUES (8001, 800, 'Lijst', 'zaadcode-herstel-0001', 'gesloten', '${NU}');`,
    `INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, volgorde) VALUES (8003, 8001, 8000, 'schaal', 'Tevreden?', 1), (8002, 8001, 8000, 'open', 'Wat kan beter?', 2);`,
  ];
  const inz = [];
  for (let i = 1; i <= 8; i++) inz.push(`(${81000 + i}, 8001, '2026-10-01', '{"8003":${1 + (i % 5)},"8002":"Antwoord ${i}"}')`);
  r.push(`INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES ${inz.join(', ')};`);
  r.push(`INSERT INTO werkbank_definities (id, onderzoek_id, dataset_id, soort, naam, label, definitie, aangemaakt_op, bijgewerkt_op) VALUES
    (8100, 800, NULL, 'omscoren', 'v02_nieuwecode', 'Oud label', '{"variabele":"v:8003"}', '${NU}', '${NU}');`);
  r.push(`INSERT INTO codes (id, onderzoek_id, naam, volgorde, aangemaakt_op) VALUES (8010, 800, 'nieuwecode', 1, '${NU}');`);
  r.push(`INSERT INTO coderingen (onderzoek_id, code_id, inzending_id, vraag_id) VALUES ${[1, 2, 3, 4, 5, 6].map((i) => `(800, 8010, ${81000 + i}, 8002)`).join(', ')};`);
  return r.join('\n');
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-herstel-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: WRANGLER_ENV });
  const pad = join(map, 'zaad.sql');
  writeFileSync(pad, zaad());
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', pad], { stdio: 'ignore', env: WRANGLER_ENV });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--inspector-port', String(POORT + 1000), '--ip', '127.0.0.1',
    '--persist-to', map, '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
  { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASIS}/api/sessie`)).ok) break;
    } catch { /* nog niet klaar */ }
    await new Promise((res) => setTimeout(res, 500));
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
  return { status: r.status, data };
}

test('J7: een eigen variabele van vóór de code blijft te wijzigen; de naam van de code zelf blijft gereserveerd', async () => {
  // Vroeger: 400 "De naam “v02_nieuwecode” is gereserveerd voor een vaste variabele", terwijl de werkbank de code
  // v02_nieuwecode_2 noemt.
  const wijzig = await roep('/api/beheer/werkbank/definities/8100', { methode: 'PUT', body: { label: 'Nieuw label' } });
  assert.equal(wijzig.status, 200, JSON.stringify(wijzig.data));
  // De code heet nu v02_nieuwecode_2: die naam is gereserveerd, voor een nieuwe variabele en bij hernoemen.
  const nieuw = await roep('/api/beheer/onderzoeken/800/werkbank/definities', { methode: 'POST', body: { soort: 'omscoren', naam: 'v02_nieuwecode_2', label: '', definitie: { variabele: 'v:8003' } } });
  assert.equal(nieuw.status, 400);
  assert.match(nieuw.data.fout, /gereserveerd/);
  const hernoem = await roep('/api/beheer/werkbank/definities/8100', { methode: 'PUT', body: { naam: 'V02_NIEUWECODE_2' } });
  assert.equal(hernoem.status, 400);
  // Een vaste vraagnaam blijft gereserveerd; een vrije naam mag.
  assert.equal((await roep('/api/beheer/onderzoeken/800/werkbank/definities', { methode: 'POST', body: { soort: 'omscoren', naam: 'v01', label: '', definitie: { variabele: 'v:8003' } } })).status, 400);
  assert.equal((await roep('/api/beheer/onderzoeken/800/werkbank/definities', { methode: 'POST', body: { soort: 'omscoren', naam: 'v01_om', label: '', definitie: { variabele: 'v:8003' } } })).status, 201);
});

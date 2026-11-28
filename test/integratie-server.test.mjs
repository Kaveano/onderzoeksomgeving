// Integratiebevinding J5 via een echte lokale testserver (poort 8787; inspector 9787):
// "Alle antwoorden wissen" meldt precies het aantal gewiste ingevulde vragenlijsten, ook als er coderingen en
// citaten (ON DELETE CASCADE, migratie 0015) mee verdwijnen. Vroeger telde meta.changes die rijen mee.
// Uitvoeren: node --test test/integratie-server.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const POORT = 8787;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-integratie';
const B = '/api/beheer';
const NU = '2026-11-28T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
let server;
let map;
let cookie = '';

// Onderzoek 700: vragenlijst 7001 (7 antwoorden, 5 coderingen, 2 citaten) en vragenlijst 7005 (2 antwoorden, 1 codering).
function zaad() {
  const r = [
    `INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op) VALUES (700, 'Bedrijf', 'Wissen', 'actief', '${NU}');`,
    'INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (7000, 700, \'Werk\', 1);',
    `INSERT INTO vragenlijsten (id, onderzoek_id, titel, code, status, aangemaakt_op) VALUES
      (7001, 700, 'Test', 'zaadcode-integratie-0001', 'gesloten', '${NU}'), (7005, 700, 'Echt', 'zaadcode-integratie-0002', 'gesloten', '${NU}');`,
    `INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, volgorde) VALUES
      (7002, 7001, 7000, 'open', 'Wat kan beter?', 1), (7003, 7001, 7000, 'schaal', 'Tevreden?', 2), (7006, 7005, 7000, 'open', 'Wat kan beter?', 1);`,
  ];
  const inz = [];
  for (let i = 1; i <= 7; i++) inz.push(`(${71000 + i}, 7001, '2026-10-01', '{"7002":"Antwoord ${i}","7003":4}')`);
  inz.push('(75001, 7005, \'2026-10-01\', \'{"7006":"Echt antwoord 1"}\')', '(75002, 7005, \'2026-10-01\', \'{"7006":"Echt antwoord 2"}\')');
  r.push(`INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES ${inz.join(', ')};`);
  r.push(`INSERT INTO codes (id, onderzoek_id, naam, volgorde, aangemaakt_op) VALUES (7010, 700, 'Werkdruk', 1, '${NU}'), (7011, 700, 'Planning', 2, '${NU}');`);
  r.push(`INSERT INTO coderingen (onderzoek_id, code_id, inzending_id, vraag_id) VALUES
    (700, 7010, 71001, 7002), (700, 7010, 71002, 7002), (700, 7011, 71002, 7002), (700, 7010, 71003, 7002), (700, 7011, 71004, 7002),
    (700, 7010, 75001, 7006);`);
  r.push(`INSERT INTO citaten (onderzoek_id, code_id, inzending_id, vraag_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES
    (700, 7010, 71001, 7002, 'Antwoord 1', '${NU}', '${NU}'), (700, 7011, 71002, 7002, 'Antwoord 2', '${NU}', '${NU}');`);
  return r.join('\n');
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-integratie-'));
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

test('J5: "Alle antwoorden wissen" meldt het aantal gewiste ingevulde vragenlijsten, zonder de coderingen en citaten', async () => {
  const voor = (await roep(`${B}/onderzoeken/700/codering`)).data;
  assert.equal(voor.coderingen.length, 6);
  const r = await roep(`${B}/vragenlijsten/7001/inzendingen`, { methode: 'DELETE' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // verwijderd telt alleen de ingevulde vragenlijsten; sinds R10 staan de meegegane coderingen en citaten er apart bij.
  assert.deepEqual(r.data, { ok: true, verwijderd: 7, coderingen: 5, citaten: 2 }, 'vroeger 7 + 5 coderingen + 2 citaten = 14');
  // De coderingen en citaten van die antwoorden zijn mee weg; die van de andere vragenlijst niet.
  const na = (await roep(`${B}/onderzoeken/700/codering`)).data;
  assert.deepEqual(na.coderingen.map((c) => c.inzending_id), [75001]);
  assert.equal(na.citaten.length, 0);
  const data = (await roep(`${B}/onderzoeken/700/export/data`)).data;
  assert.deepEqual(data.inzendingen.map((i) => i.vragenlijst_id), [7005, 7005]);
  // Nog een keer wissen: niets meer te wissen.
  assert.deepEqual((await roep(`${B}/vragenlijsten/7001/inzendingen`, { methode: 'DELETE' })).data, { ok: true, verwijderd: 0, coderingen: 0, citaten: 0 });
});

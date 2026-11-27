// Eind-tot-eindtests voor de bibliotheek (BOUWPLAN §4 P5, criteria 5, 6 en 8) via een echte lokale testserver
// (poort 8794; inspector 9794, zodat hij naast de tests van andere pakketten kan draaien):
// - scripts/startcollectie.mjs maakt van de drie verzonnen voorbeeldrecords een migratie die op een verse D1 werkt;
// - plaatsen en tonen, de versie (ongewijzigd), de lijst in delen;
// - een eigen bron krijgt bakker2017b bij een botsing; foute DOI/link/onderwerp → 400;
// - startbronnen alleen-lezen: wijzigen → 400, alleen notities mag; verbergen en terugzetten; eigen kopie;
// - een bron die in een rapport genoemd wordt, verwijder je niet zonder bevestigd (GLOB);
// - inlezen in een reeks met dubbele bronnen; koppelen aan een onderzoek, 409 als het gearchiveerd is.
// Uitvoeren: node --test test/bibliotheek-api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { START_ALLEEN_LEZEN } from '../src/lib/bibliotheek.js';

const POORT = 8794;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-bibliotheek';
const B = '/api/beheer';
const NU = '2026-11-27T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
const ROOT = fileURLToPath(new URL('..', import.meta.url));
let server;
let map;
let uit;
let cookie = '';
const GROOT = 60; // zoveel grote bronnen: samen meer dan één deel van de lijst

const q = (t) => `'${String(t).replace(/'/g, "''")}'`;
function zaad() {
  const regels = [
    // De echte startcollectie (migratie 0016, 89 bronnen) eerst weg: deze test werkt met de drie verzonnen
    // voorbeeldrecords (test/bibliotheek-start.test.mjs controleert de echte collectie).
    "DELETE FROM bronnen WHERE collectie = 'start';",
    "DELETE FROM instellingen WHERE sleutel = 'bibliotheek_start';",
    `INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op, gearchiveerd_op) VALUES
      (500, 'Bedrijf', 'Actief onderzoek', 'actief', '${NU}', NULL), (501, 'Oud', 'Gearchiveerd onderzoek', 'gearchiveerd', '${NU}', '${NU}');`,
    // Een eigen bron die al vóór de startcollectie de citeersleutel kcv2025 had (de startbron wijkt uit naar …st).
    `INSERT INTO bronnen (id, citeersleutel, soort, titel, aangemaakt_op, bijgewerkt_op) VALUES (10, 'kcv2025', 'rapport', 'Eerder zelf toegevoegd', '${NU}', '${NU}');`,
  ];
  for (let i = 0; i < GROOT; i++) {
    regels.push(`INSERT INTO bronnen (id, citeersleutel, soort, titel, samenvatting, kernpunten, notities, aangemaakt_op, bijgewerkt_op) VALUES
      (${1000 + i}, 'groot${i}x', 'overig', ${q(`Grote bron ${i} ${'t'.repeat(480)}`)}, ${q('s'.repeat(4000))},
      ${q(JSON.stringify(Array.from({ length: 10 }, () => 'k'.repeat(300))))}, ${q('n'.repeat(5000))}, '${NU}', '${NU}');`);
  }
  return regels.join('\n');
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-bibliotheek-'));
  uit = mkdtempSync(join(tmpdir(), 'onderzoek-startcollectie-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: WRANGLER_ENV });
  const zaadPad = join(map, 'zaad.sql');
  writeFileSync(zaadPad, zaad());
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', zaadPad], { stdio: 'ignore', env: WRANGLER_ENV });
  // Criterium 8: het script maakt een migratie die op deze D1 werkt (twee keer uitvoeren voegt niets dubbel toe).
  execFileSync('node', [join(ROOT, 'scripts/startcollectie.mjs'), join(ROOT, 'test/fixtures/startcollectie-voorbeeld.json'), '--uit', uit], { stdio: 'ignore' });
  for (let i = 0; i < 2; i++) {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', join(uit, '0016_bibliotheek_start.sql')], { stdio: 'ignore', env: WRANGLER_ENV });
  }
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--inspector-port', String(POORT + 1000), '--ip', '127.0.0.1',
    '--persist-to', map, '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
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
  rmSync(uit, { recursive: true, force: true });
});

async function roep(pad, { methode = 'GET', body, koekje = cookie } = {}) {
  const r = await fetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(koekje ? { Cookie: koekje } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let data = null;
  try { data = JSON.parse(tekst); } catch { /* geen json */ }
  return { status: r.status, data, tekst };
}

/** De hele bibliotheek, deel voor deel (zoals bibliotheek-data.js). */
async function heleLijst() {
  const bronnen = [];
  let vanaf = 0;
  let delen = 0;
  let laatste;
  for (;;) {
    const r = await roep(`${B}/bibliotheek?vanaf=${vanaf}`);
    assert.equal(r.status, 200);
    assert.ok(r.tekst.length < 2_000_000, 'één deel blijft onder 2 MB');
    delen++;
    laatste = r.data;
    bronnen.push(...r.data.bronnen);
    if (r.data.volgende === null) break;
    vanaf = r.data.volgende;
  }
  return { bronnen, delen, laatste };
}

const ABAKKER = [{ achternaam: 'Bakker', tussenvoegsel: '', voorletters: 'A. B.' }, { achternaam: 'Demerouti', tussenvoegsel: '', voorletters: 'E.' }];
const s = {};

test('zonder inloggen geen bibliotheek; geen bibliotheekroute voor meelezers', async () => {
  assert.equal((await roep(`${B}/bibliotheek`, { koekje: '' })).status, 401);
  assert.equal((await roep('/api/kijk/abcdefghijklmnopqrst/bibliotheek', { koekje: '' })).status, 404);
});

test('criterium 8 en 5: de startcollectie staat erin, met de verzonnen voorbeeldrecords', async () => {
  const migratie = readFileSync(join(uit, '0016_bibliotheek_start.sql'), 'utf8');
  for (const regel of migratie.split(';\n').filter((x) => x.startsWith('INSERT INTO bronnen'))) assert.ok(regel.length < 18_000);
  const { bronnen, delen, laatste } = await heleLijst();
  assert.ok(delen >= 2, `de grote bibliotheek komt in ${delen} delen`);
  assert.equal(bronnen.length, 3 + 1 + GROOT);
  assert.equal(new Set(bronnen.map((b) => b.id)).size, bronnen.length);
  const start = bronnen.filter((b) => b.collectie === 'start');
  assert.equal(start.length, 3);
  assert.deepEqual(laatste.start, { aantal: 3, verborgen: 0, totaal: 64, versie: 1, datum: '2026-11-27' });
  const artikel = start.find((b) => b.soort === 'artikel');
  assert.equal(artikel.citeersleutel, 'verbeek2021');
  assert.deepEqual(artikel.auteurs[1], { achternaam: 'Wit', tussenvoegsel: 'de', voorletters: 'H. J.' });
  assert.deepEqual(artikel.onderwerpen, ['werkdruk']);
  assert.ok(artikel.trefwoorden.includes('Burn-out'));
  assert.equal(artikel.doi, '10.5555/voorbeeld.2021.001');
  assert.deepEqual(artikel.onderzoeken, []);
  const rapport = start.find((b) => b.soort === 'rapport');
  assert.equal(rapport.citeersleutel, 'kcv2025st', 'de citeersleutel was al bezet door een eigen bron');
  assert.equal(rapport.organisatie, 'Kenniscentrum Voorbeeld');
  assert.deepEqual(rapport.auteurs, []);
  assert.equal(rapport.betrouwbaarheid, 'redelijk');
  s.start = { artikel, rapport, website: start.find((b) => b.soort === 'website') };
  s.versie = laatste.versie;
  // Ongewijzigde versie: alleen { versie, ongewijzigd }
  const nogmaals = await roep(`${B}/bibliotheek?versie=${s.versie}`);
  assert.deepEqual(nogmaals.data, { versie: s.versie, ongewijzigd: true });
  assert.ok((await roep(`${B}/bibliotheek?versie=${s.versie - 1}`)).data.bronnen.length > 0);
});

test('criterium 5: een eigen bron krijgt een citeersleutel, bij een botsing bakker2017b', async () => {
  const bron = { soort: 'artikel', titel: 'Job demands-resources theory', auteurs: ABAKKER, jaar: 2017, taal: 'en', doi: 'https://doi.org/10.1037/ocp0000056', onderwerpen: ['werkdruk'] };
  const a = await roep(`${B}/bibliotheek`, { methode: 'POST', body: { bron } });
  assert.equal(a.status, 201);
  assert.equal(a.data.citeersleutel, 'bakker2017');
  assert.ok(a.data.versie > s.versie);
  const b = await roep(`${B}/bibliotheek`, { methode: 'POST', body: { bron: { ...bron, titel: 'Een ander artikel', doi: '' } } });
  assert.equal(b.data.citeersleutel, 'bakker2017b');
  s.bakker = a.data.id;
  s.bakkerB = b.data.id;
  const d = await roep(`${B}/bibliotheek/${s.bakker}`);
  assert.equal(d.data.bron.doi, '10.1037/ocp0000056');
  assert.equal(d.data.bron.collectie, 'eigen');
  // Foute invoer
  const fout = async (extra) => (await roep(`${B}/bibliotheek`, { methode: 'POST', body: { bron: { ...bron, ...extra } } }));
  let r = await fout({ doi: '11.123/x' });
  assert.equal(r.status, 400);
  assert.match(r.data.fout, /geldige DOI/);
  r = await fout({ url: 'javascript:alert(1)' });
  assert.equal(r.status, 400);
  assert.equal(r.data.fout, 'Een link moet beginnen met http:// of https://.');
  r = await fout({ onderwerpen: ['astrologie'] });
  assert.equal(r.status, 400);
  assert.equal(r.data.fout, 'Kies onderwerpen uit de lijst.');
  assert.equal((await fout({ titel: ' ' })).data.fout, 'Vul de titel van de bron in.');
  assert.equal((await fout({ soort: 'gedicht' })).data.fout, 'Kies een geldige soort bron.');
  assert.equal((await fout({ jaar: 1700 })).data.fout, 'Het jaar moet tussen 1800 en 2200 liggen, of leeg zijn (zonder datum).');
  assert.equal((await fout({ auteurs: [ABAKKER[0], { voorletters: 'X.' }] })).data.fout, 'Auteur 2: vul de achternaam in.');
});

test('criterium 5: een bron uit de startcollectie is alleen-lezen (wel notities)', async () => {
  const id = s.start.artikel.id;
  let r = await roep(`${B}/bibliotheek/${id}`, { methode: 'PUT', body: { bron: { titel: 'Andere titel' } } });
  assert.equal(r.status, 400);
  assert.equal(r.data.fout, START_ALLEEN_LEZEN);
  r = await roep(`${B}/bibliotheek/${id}`, { methode: 'PUT', body: { bron: { notities: 'Mijn eigen notitie', titel: s.start.artikel.titel } } });
  assert.equal(r.status, 400, 'ook een ongewijzigd ander veld meesturen mag niet');
  r = await roep(`${B}/bibliotheek/${id}`, { methode: 'PUT', body: { bron: { notities: 'Mijn eigen notitie' }, bijgewerkt_op: s.start.artikel.bijgewerkt_op } });
  assert.equal(r.status, 200);
  const d = (await roep(`${B}/bibliotheek/${id}`)).data.bron;
  assert.equal(d.notities, 'Mijn eigen notitie');
  assert.equal(d.titel, s.start.artikel.titel);
  // Verouderde bijgewerkt_op → conflict
  r = await roep(`${B}/bibliotheek/${id}`, { methode: 'PUT', body: { bron: { notities: 'x' }, bijgewerkt_op: s.start.artikel.bijgewerkt_op } });
  assert.equal(r.status, 409);
  assert.equal(r.data.conflict, true);
  // Verwijderen mag niet; verbergen wel
  assert.equal((await roep(`${B}/bibliotheek/${id}`, { methode: 'DELETE' })).status, 400);
});

test('criterium 5: verbergen en de startcollectie terugzetten', async () => {
  const id = s.start.website.id;
  let r = await roep(`${B}/bibliotheek/${id}/verbergen`, { methode: 'PUT', body: { verborgen: true } });
  assert.equal(r.status, 200);
  assert.equal((await roep(`${B}/bibliotheek/${id}`)).data.bron.verborgen, 1);
  let lijst = await roep(`${B}/bibliotheek`);
  assert.equal(lijst.data.start.verborgen, 1);
  assert.equal((await roep(`${B}/bibliotheek/${s.bakker}/verbergen`, { methode: 'PUT', body: { verborgen: true } })).status, 400, 'een eigen bron verberg je niet');
  r = await roep(`${B}/bibliotheek/herstellen`, { methode: 'POST', body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.data.teruggezet, 1);
  lijst = await roep(`${B}/bibliotheek`);
  assert.equal(lijst.data.start.verborgen, 0);
  assert.equal((await heleLijst()).bronnen.find((b) => b.id === id).citeersleutel, s.start.website.citeersleutel);
});

test('eigen kopie van een startbron: aanpasbaar, met een nieuwe citeersleutel', async () => {
  const r = await roep(`${B}/bibliotheek/${s.start.artikel.id}/kopie`, { methode: 'POST', body: {} });
  assert.equal(r.status, 201);
  assert.equal(r.data.citeersleutel, 'verbeek2021b');
  const kopie = (await roep(`${B}/bibliotheek/${r.data.id}`)).data.bron;
  assert.equal(kopie.collectie, 'eigen');
  assert.equal(kopie.kopie_van, s.start.artikel.sleutel);
  assert.equal(kopie.titel, s.start.artikel.titel);
  const w = await roep(`${B}/bibliotheek/${r.data.id}`, { methode: 'PUT', body: { bron: { ...kopie, titel: 'Mijn aangepaste versie' } } });
  assert.equal(w.status, 200);
  assert.equal((await roep(`${B}/bibliotheek/${r.data.id}`)).data.bron.titel, 'Mijn aangepaste versie');
  assert.equal((await roep(`${B}/bibliotheek/${s.bakker}/kopie`, { methode: 'POST', body: {} })).status, 400);
});

test('criterium 5: een bron die in een rapport genoemd wordt, verwijder je niet zonder bevestiging', async () => {
  const rapport = async (titel, tekst) => {
    const inhoud = { secties: [{ id: 'kader', soort: 'kader', titel: 'Kader', tekst, aan: true }] };
    const n = await roep(`${B}/onderzoeken/500/rapporten`, { methode: 'POST', body: { soort: 'eind', titel, inhoud } });
    assert.equal(n.status, 201);
  };
  await rapport('Rapport A', 'Zie [@bakker2017, p. 12].');
  await rapport('Rapport B', 'Alleen [@bakker2017b] en @bakker2017c.');
  let r = await roep(`${B}/bibliotheek/${s.bakker}`, { methode: 'DELETE' });
  assert.equal(r.status, 409);
  assert.deepEqual(r.data.rapporten.map((x) => x.titel), ['Rapport A'], '@bakker2017b telt niet mee voor bakker2017');
  assert.equal(r.data.rapporten[0].onderzoek_titel, 'Actief onderzoek');
  const detail = (await roep(`${B}/bibliotheek/${s.bakkerB}`)).data.bron;
  assert.deepEqual(detail.rapporten.map((x) => x.titel), ['Rapport B']);
  r = await roep(`${B}/bibliotheek/${s.bakker}`, { methode: 'DELETE', body: { bevestigd: true } });
  assert.equal(r.status, 200);
  assert.equal((await roep(`${B}/bibliotheek/${s.bakker}`)).status, 404);
});

test('inlezen in een reeks: dubbele bronnen overgeslagen, hooguit 25 per verzoek (FT-02)', async () => {
  const bron = (titel, doi = '', extra = {}) => ({ soort: 'rapport', titel, organisatie: 'TNO', jaar: 2023, doi, ...extra });
  let r = await roep(`${B}/bibliotheek/reeks`, {
    methode: 'POST',
    body: { bronnen: [bron('Eerste', '10.1234/aaa'), bron('Tweede', '10.1234/AAA'), bron('Derde'), { soort: 'rapport', titel: '' }] },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.toegevoegd.map((t) => [t.rij, t.citeersleutel]), [[1, 'tno2023'], [3, 'tno2023b']]);
  assert.equal(r.data.overgeslagen.length, 2);
  assert.equal(r.data.overgeslagen[0].rij, 2);
  assert.equal(r.data.overgeslagen[0].bestaand_id, null, 'dubbel binnen hetzelfde verzoek');
  assert.equal(r.data.overgeslagen[1].reden, 'Vul de titel van de bron in.');
  // Nog een keer: nu staat de eerste al in de bibliotheek
  r = await roep(`${B}/bibliotheek/reeks`, { methode: 'POST', body: { bronnen: [bron('Weer de eerste', 'https://doi.org/10.1234/aaa')] } });
  assert.deepEqual(r.data.toegevoegd, []);
  assert.ok(Number.isInteger(r.data.overgeslagen[0].bestaand_id));
  r = await roep(`${B}/bibliotheek/reeks`, { methode: 'POST', body: { bronnen: Array.from({ length: 26 }, (_, i) => bron(`B${i}`)) } });
  assert.equal(r.status, 400);
  assert.equal(r.data.fout, 'Je kunt hooguit 25 bronnen tegelijk toevoegen.');
  // Een te groot verzoek wordt niet eens gelezen
  r = await roep(`${B}/bibliotheek/reeks`, { methode: 'POST', body: { bronnen: [bron('Groot', '', { samenvatting: 'x'.repeat(510_000) })] } });
  assert.equal(r.status, 413);
});

test('criterium 5: koppelen aan een onderzoek; 409 als het onderzoek gearchiveerd is', async () => {
  const id = s.start.rapport.id;
  let r = await roep(`${B}/onderzoeken/500/bronnen/${id}`, { methode: 'PUT', body: {} });
  assert.equal(r.status, 200);
  r = await roep(`${B}/onderzoeken/500/bronnen/${id}`, { methode: 'PUT', body: { notitie: 'Voor het kader over verzuim' } });
  assert.equal(r.status, 200);
  r = await roep(`${B}/onderzoeken/500/bronnen/${id}`, { methode: 'PUT', body: {} });
  let lijst = (await roep(`${B}/onderzoeken/500/bronnen`)).data.bronnen;
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0].koppeling.notitie, 'Voor het kader over verzuim', 'zonder notitie blijft de notitie staan');
  assert.deepEqual(lijst[0].onderzoeken, [500]);
  assert.deepEqual((await roep(`${B}/bibliotheek/${id}`)).data.bron.onderzoeken.map((o) => o.titel), ['Actief onderzoek']);
  const inLijst = (await heleLijst()).bronnen.find((b) => b.id === id);
  assert.deepEqual(inLijst.onderzoeken, [500]);
  // Gearchiveerd: koppelen en ontkoppelen geweigerd, bekijken mag
  r = await roep(`${B}/onderzoeken/501/bronnen/${id}`, { methode: 'PUT', body: {} });
  assert.equal(r.status, 409);
  assert.equal((await roep(`${B}/onderzoeken/501/bronnen/${id}`, { methode: 'DELETE' })).status, 409);
  assert.equal((await roep(`${B}/onderzoeken/501/bronnen`)).status, 200);
  assert.equal((await roep(`${B}/onderzoeken/500/bronnen/999999`, { methode: 'PUT', body: {} })).status, 404);
  r = await roep(`${B}/onderzoeken/500/bronnen/${id}`, { methode: 'DELETE' });
  assert.equal(r.status, 200);
  lijst = (await roep(`${B}/onderzoeken/500/bronnen`)).data.bronnen;
  assert.deepEqual(lijst, []);
});

test('elke wijziging verhoogt de versie', async () => {
  const voor = (await roep(`${B}/bibliotheek`)).data.versie;
  const r = await roep(`${B}/onderzoeken/500/bronnen/${s.start.artikel.id}`, { methode: 'PUT', body: {} });
  assert.equal(r.data.versie, voor + 1);
  assert.equal((await roep(`${B}/bibliotheek?versie=${voor}`)).data.ongewijzigd, undefined);
});

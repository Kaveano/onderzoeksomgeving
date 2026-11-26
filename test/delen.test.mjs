// Tests voor de deellink (alleen-lezen inzage met toegangscode). Eigen testserver op poort 8797.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const POORT = 8797;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-tests';
let server;
let map;
let cookie = '';

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-delen-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--ip', '127.0.0.1', '--persist-to', map, '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
    { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASIS}/api/sessie`)).ok) return;
    } catch { /* nog niet klaar */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Testserver start niet');
});

after(() => {
  try { process.kill(-server.pid); } catch { /* al gestopt */ }
  rmSync(map, { recursive: true, force: true });
});

async function roep(pad, { methode = 'GET', body, koekje = cookie } = {}) {
  const r = await fetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(koekje ? { Cookie: koekje } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* geen json */ }
  return { status: r.status, data, koppen: r.headers };
}

const s = {};

test('voorbereiding: onderzoek met antwoorden', async () => {
  const li = await fetch(`${BASIS}/api/inloggen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: WACHTWOORD }) });
  cookie = li.headers.get('set-cookie').split(';')[0];
  const n = await roep('/api/beheer/onderzoeken', { methode: 'POST', body: { bedrijfsnaam: 'Deelbedrijf', titel: 'MTO', onderzoeksvraag: 'Vraag?', sjablonen: ['medewerkerstevredenheid'] } });
  s.onderzoek = n.data.id;
  const vl = (await roep(`/api/beheer/onderzoeken/${s.onderzoek}/vragenlijsten`)).data.vragenlijsten[0];
  s.vl = vl.id;
  await roep(`/api/beheer/vragenlijsten/${vl.id}/status`, { methode: 'POST', body: { status: 'open' } });
  const pub = (await roep(`/api/publiek/${vl.code}`, { koekje: '' })).data;
  const vragen = pub.themas.flatMap((t) => t.vragen);
  s.open = vragen.find((q) => q.type === 'open').id;
  for (let i = 0; i < 6; i++) {
    const a = {};
    for (const q of vragen) {
      if (q.type === 'schaal') a[q.id] = 4;
      if (q.type === 'open' && i < 5) a[q.id] = `Geheim open antwoord ${i}`;
      if (q.type === 'meerkeuze') a[q.id] = q.opties[0].id;
    }
    assert.equal((await roep(`/api/publiek/${vl.code}`, { methode: 'POST', body: { antwoorden: a }, koekje: '' })).status, 200);
  }
  s.stukken = (await roep(`/api/beheer/onderzoeken/${s.onderzoek}/stukken`)).data.stukken;
  await roep(`/api/beheer/stukken/${s.stukken[0].id}`, { methode: 'PUT', body: { inhoud: 'Interne notitie, niet delen' } });
  await roep(`/api/beheer/stukken/${s.stukken[2].id}`, { methode: 'PUT', body: { inhoud: '# Rapport voor de klant' } });
});

test('deellink aanmaken: toegangscode alleen nu zichtbaar, alleen een hash opgeslagen', async () => {
  const zonder = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'x' }, koekje: '' });
  assert.equal(zonder.status, 401);
  const leeg = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'Directie', onderdelen: { dashboard: false, stukken: [] } } });
  assert.equal(leeg.status, 400);
  const r = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'Directie', onderdelen: { dashboard: true, stukken: [s.stukken[2].id] } } });
  assert.equal(r.status, 201);
  assert.match(r.data.toegangscode, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  assert.match(r.data.deellink.code, /^[A-Za-z0-9_-]{22}$/);
  s.link = r.data.deellink;
  s.toegangscode = r.data.toegangscode;
  const lijst = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/deellinks`);
  assert.equal(lijst.data.deellinks.length, 1);
  assert.doesNotMatch(JSON.stringify(lijst.data), new RegExp(s.toegangscode));
  assert.doesNotMatch(JSON.stringify(lijst.data), /toegang_hash|toegang_zout/);
});

test('zonder toegangscode krijgt een kijker niets te zien', async () => {
  const st = await roep(`/api/kijk/${s.link.code}`, { koekje: '' });
  assert.deepEqual(st.data, { toegang: false });
  for (const pad of ['overzicht', 'dashboard', `stukken/${s.stukken[2].id}`]) {
    const r = await roep(`/api/kijk/${s.link.code}/${pad}`, { koekje: '' });
    assert.equal(r.status, 401, pad);
    assert.doesNotMatch(JSON.stringify(r.data), /Deelbedrijf|MTO/);
  }
  // Ook de beheercookie geeft geen toegang tot de kijkroutes, en andersom.
  assert.equal((await roep(`/api/kijk/${s.link.code}/overzicht`)).status, 401);
  assert.equal((await roep('/api/kijk/bestaatniet1234567890abc', { koekje: '' })).status, 404);
});

test('verkeerde toegangscode wordt geweigerd; de juiste geeft een eigen, beveiligde sessie', async () => {
  const fout = await roep(`/api/kijk/${s.link.code}/toegang`, { methode: 'POST', body: { toegangscode: 'AAAAA-AAAAA' }, koekje: '' });
  assert.equal(fout.status, 401);
  const leeg = await roep(`/api/kijk/${s.link.code}/toegang`, { methode: 'POST', body: { toegangscode: '' }, koekje: '' });
  assert.equal(leeg.status, 401);
  // Kleine letters en spaties mogen.
  const goed = await fetch(`${BASIS}/api/kijk/${s.link.code}/toegang`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toegangscode: ` ${s.toegangscode.toLowerCase().replace('-', ' ')} ` }) });
  assert.equal(goed.status, 200);
  const sc = goed.headers.get('set-cookie');
  assert.match(sc, new RegExp(`^__Host-kijk-${s.link.id}=`));
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /Secure/);
  assert.match(sc, /SameSite=Strict/);
  s.kijk = sc.split(';')[0];
  assert.equal((await roep(`/api/kijk/${s.link.code}`, { koekje: s.kijk })).data.toegang, true);
});

test('kijker ziet alleen wat is vrijgegeven en kan niets wijzigen', async () => {
  const ov = await roep(`/api/kijk/${s.link.code}/overzicht`, { koekje: s.kijk });
  assert.equal(ov.status, 200);
  assert.equal(ov.data.onderzoek.titel, 'MTO');
  assert.deepEqual(ov.data.stukken.map((x) => x.id), [s.stukken[2].id]);
  const d = await roep(`/api/kijk/${s.link.code}/dashboard`, { koekje: s.kijk });
  assert.equal(d.status, 200);
  assert.equal(d.data.kijker, true);
  assert.equal(d.data.selectie.n, 6);
  assert.ok(d.data.selectie.themas.length > 0);
  // Open antwoorden zijn niet vrijgegeven; links naar vragenlijsten ontbreken.
  assert.deepEqual(d.data.selectie.open, []);
  assert.doesNotMatch(JSON.stringify(d.data), /Geheim open antwoord|"code"/);
  // Wel het vrijgegeven stuk, niet het andere.
  assert.equal((await roep(`/api/kijk/${s.link.code}/stukken/${s.stukken[2].id}`, { koekje: s.kijk })).data.stuk.inhoud, '# Rapport voor de klant');
  assert.equal((await roep(`/api/kijk/${s.link.code}/stukken/${s.stukken[0].id}`, { koekje: s.kijk })).status, 404);
  // De kijksessie geeft geen toegang tot het beheer.
  assert.equal((await roep('/api/beheer/onderzoeken', { koekje: s.kijk })).status, 401);
  assert.equal((await roep(`/api/beheer/onderzoeken/${s.onderzoek}/export/data`, { koekje: s.kijk })).status, 401);
  assert.equal((await roep(`/api/beheer/stukken/${s.stukken[2].id}`, { methode: 'PUT', body: { inhoud: 'gehackt' }, koekje: s.kijk })).status, 401);
});

test('open antwoorden alleen als ze zijn vrijgegeven', async () => {
  await roep(`/api/beheer/deellinks/${s.link.id}`, { methode: 'PUT', body: { naam: 'Directie', onderdelen: { dashboard: true, open_antwoorden: true, stukken: [s.stukken[2].id] } } });
  const d = await roep(`/api/kijk/${s.link.code}/dashboard`, { koekje: s.kijk });
  const open = d.data.selectie.open.find((q) => q.vraag_id === s.open);
  assert.equal(open.antwoorden.length, 5);
});

test('minder dan 5 respondenten: kijker ziet geen uitkomsten van die vragenlijst', async () => {
  const vl2 = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Kleine lijst' } });
  const thema = (await roep(`/api/beheer/onderzoeken/${s.onderzoek}`)).data.themas[0].id;
  const q = await roep(`/api/beheer/vragenlijsten/${vl2.data.id}/vragen`, { methode: 'POST', body: { type: 'schaal', thema_id: thema, tekst: 'Klein' } });
  await roep(`/api/beheer/vragenlijsten/${vl2.data.id}/status`, { methode: 'POST', body: { status: 'open' } });
  const code = (await roep(`/api/beheer/vragenlijsten/${vl2.data.id}`)).data.vragenlijst.code;
  for (let i = 0; i < 3; i++) await roep(`/api/publiek/${code}`, { methode: 'POST', body: { antwoorden: { [q.data.id]: 1 } }, koekje: '' });
  const beheer = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/dashboard?vragenlijst=${vl2.data.id}`);
  assert.equal(beheer.data.selectie.themas[0].gemiddelde, 1);
  const kijk = await roep(`/api/kijk/${s.link.code}/dashboard?vragenlijst=${vl2.data.id}`, { koekje: s.kijk });
  assert.equal(kijk.data.selectie.verborgen, true);
  assert.deepEqual(kijk.data.selectie.themas, []);
  assert.deepEqual(kijk.data.selectie.vragen, []);
});

test('nieuwe toegangscode maakt de oude en lopende sessies ongeldig', async () => {
  const r = await roep(`/api/beheer/deellinks/${s.link.id}/nieuwe-toegangscode`, { methode: 'POST', body: {} });
  assert.notEqual(r.data.toegangscode, s.toegangscode);
  assert.equal((await roep(`/api/kijk/${s.link.code}/overzicht`, { koekje: s.kijk })).status, 401);
  assert.equal((await roep(`/api/kijk/${s.link.code}/toegang`, { methode: 'POST', body: { toegangscode: s.toegangscode }, koekje: '' })).status, 401);
  const goed = await fetch(`${BASIS}/api/kijk/${s.link.code}/toegang`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toegangscode: r.data.toegangscode }) });
  assert.equal(goed.status, 200);
  s.kijk = goed.headers.get('set-cookie').split(';')[0];
  s.toegangscode = r.data.toegangscode;
});

test('raden van de toegangscode wordt geremd', async () => {
  const tweede = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'OR', onderdelen: { dashboard: true } } });
  const code = tweede.data.deellink.code;
  const statussen = [];
  for (let i = 0; i < 7; i++) statussen.push((await roep(`/api/kijk/${code}/toegang`, { methode: 'POST', body: { toegangscode: `FOUT${i}-AAAAA` }, koekje: '' })).status);
  assert.deepEqual(statussen, [401, 401, 401, 401, 401, 429, 429]);
  // Ook de juiste code werkt dan even niet; een andere link wordt niet geraakt.
  assert.equal((await roep(`/api/kijk/${code}/toegang`, { methode: 'POST', body: { toegangscode: tweede.data.toegangscode }, koekje: '' })).status, 429);
  assert.equal((await roep(`/api/kijk/${s.link.code}/overzicht`, { koekje: s.kijk })).status, 200);
  s.tweede = tweede.data.deellink;
});

test('verlopen of ingetrokken link werkt niet meer, ook niet met een lopende sessie', async () => {
  const verleden = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'Oud', verloopt_op: '2020-01-01', onderdelen: { dashboard: true } } });
  assert.equal(verleden.status, 400);
  await roep(`/api/beheer/deellinks/${s.link.id}`, { methode: 'PUT', body: { naam: 'Directie', verloopt_op: '2020-01-01', onderdelen: { dashboard: true } } });
  assert.equal((await roep(`/api/kijk/${s.link.code}/overzicht`, { koekje: s.kijk })).status, 404);
  assert.equal((await roep(`/api/kijk/${s.link.code}`, { koekje: '' })).status, 404);
  await roep(`/api/beheer/deellinks/${s.link.id}`, { methode: 'PUT', body: { naam: 'Directie', verloopt_op: null, onderdelen: { dashboard: true } } });
  assert.equal((await roep(`/api/kijk/${s.link.code}/overzicht`, { koekje: s.kijk })).status, 200);
  await roep(`/api/beheer/deellinks/${s.link.id}`, { methode: 'PUT', body: { naam: 'Directie', ingetrokken: true, onderdelen: { dashboard: true } } });
  assert.equal((await roep(`/api/kijk/${s.link.code}/overzicht`, { koekje: s.kijk })).status, 404);
});

test('stuk van een ander onderzoek kan niet worden gedeeld; verwijderen ruimt alles op', async () => {
  const ander = await roep('/api/beheer/onderzoeken', { methode: 'POST', body: { bedrijfsnaam: 'Ander', titel: 'X' } });
  const stukAnder = (await roep(`/api/beheer/onderzoeken/${ander.data.id}/stukken`)).data.stukken[0].id;
  const r = await roep(`/api/beheer/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'Lek', onderdelen: { dashboard: true, stukken: [stukAnder] } } });
  assert.equal(r.status, 400);
  assert.equal((await roep(`/api/beheer/deellinks/${s.tweede.id}`, { methode: 'DELETE' })).status, 200);
  assert.equal((await roep(`/api/kijk/${s.tweede.code}`, { koekje: '' })).status, 404);
  // Onderzoek archiveren en definitief verwijderen: deellinks gaan mee.
  await roep(`/api/beheer/onderzoeken/${s.onderzoek}/archiveren`, { methode: 'POST', body: {} });
  assert.equal((await roep(`/api/beheer/onderzoeken/${s.onderzoek}`, { methode: 'DELETE', body: { bevestiging: 'Deelbedrijf' } })).status, 200);
  assert.equal((await roep(`/api/kijk/${s.link.code}`, { koekje: '' })).status, 404);
});

test('tekst van de uitnodiging: bewaren, teruglezen en begrenzen', async () => {
  const n = await roep('/api/beheer/onderzoeken', { methode: 'POST', body: { bedrijfsnaam: 'Uitnodigbedrijf', titel: 'MTO', sjablonen: ['medewerkerstevredenheid'] } });
  const pad = `/api/beheer/onderzoeken/${n.data.id}/vragenlijsten`;
  const vl = (await roep(pad)).data.vragenlijsten[0];
  assert.deepEqual(vl.uitnodiging, {});
  assert.equal((await roep(`/api/beheer/vragenlijsten/${vl.id}/uitnodiging`, { methode: 'PUT', body: { tekst: 'x' }, koekje: '' })).status, 401);
  const tekst = 'Beste collega,\n\nVul de lijst in: {link}\n\nGroet';
  const r = await roep(`/api/beheer/vragenlijsten/${vl.id}/uitnodiging`, { methode: 'PUT', body: { onderwerp: 'Doe mee: {titel}', tekst, herinnering_onderwerp: 'Herinnering', herinnering_tekst: 'Nog even: {link}', vreemd: 'x' } });
  assert.equal(r.status, 200);
  const terug = (await roep(pad)).data.vragenlijsten[0].uitnodiging;
  assert.deepEqual(terug, { onderwerp: 'Doe mee: {titel}', tekst, herinnering_onderwerp: 'Herinnering', herinnering_tekst: 'Nog even: {link}' });
  assert.equal((await roep(`/api/beheer/vragenlijsten/${vl.id}/uitnodiging`, { methode: 'PUT', body: { tekst: 'x'.repeat(5001) } })).status, 400);
  assert.equal((await roep(`/api/beheer/vragenlijsten/${vl.id}/uitnodiging`, { methode: 'PUT', body: { onderwerp: 'x'.repeat(201) } })).status, 400);
  // Na archiveren kan de tekst niet meer worden gewijzigd.
  await roep(`/api/beheer/onderzoeken/${n.data.id}/archiveren`, { methode: 'POST', body: {} });
  assert.equal((await roep(`/api/beheer/vragenlijsten/${vl.id}/uitnodiging`, { methode: 'PUT', body: { tekst: 'nieuw' } })).status, 409);
  assert.equal((await roep(pad)).data.vragenlijsten[0].uitnodiging.tekst, tekst);
});

test('de kijkpagina wordt geserveerd; ongeldige adressen geven 404', async () => {
  assert.equal((await fetch(`${BASIS}/d/${'a'.repeat(22)}`)).status, 200);
  assert.equal((await fetch(`${BASIS}/d/kort`)).status, 404);
});

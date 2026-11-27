// Eind-tot-eindtests voor het fundament (BOUWPLAN §4 P1): via een echte lokale testserver (poort 8790).
// - criterium 4: "Anders: 1" is verborgen op het dashboard, bij de meelezer, in vastgelegde en getoonde rapporten
//   (ook oude feiten) en in de Excel-overzichtsbladen;
// - criterium 5: een deellink met alleen een rapport en de tussenstand bewaart tussenstand: true;
// - criterium 6: na het verwijderen van een onderzoek staat er in geen enkele tabel met onderzoek_id nog iets van;
// - criterium 8: gegevens.js haalt de antwoorden één keer op, daarna alleen een veranderde vragenlijst, en geeft
//   precies de export van export/data (zonder de id's);
// - criterium 11: de nieuwe routes doen hooguit één batch; een deel stopt bij 1.000 rijen of ongeveer 1,5 MB;
// - en: verschilwacht (B9), bevroren gegevens in alle verwerkers, geen fetch naar buiten in src/ (FT-01) en geen
//   dashboardverzoek per vragenlijst in de rapporteditor (FT-07).
// Uitvoeren: node --test test/fundament.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { haalGegevens, vergeetGegevens, voortgangTekst, standVan } from '../public/js/beheer/gegevens.js';
import { dashboardUitRijen, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';
import { verzamelFeiten, rapportNaarBlokken, standaardInhoud, blokkenNaarTekst } from '../public/js/beheer/rapport-feiten.js';
import { excelBladen, excelWerkboek, spssPakket } from '../public/js/beheer/export-bestanden.js';
import { volledigeJson, alleAntwoordenCsv, antwoordenVragenlijstCsv, eigenInvoerCsv } from '../public/js/beheer/export.js';
import { bouwModel, waardenVan } from '../public/js/beheer/analyse-model.js';
import { VERBORGEN } from '../public/js/beheer/privacy.js';
import { gedeeldeStand, kleineVerschillen, isGedeeld, WAARSCHUWING_OPENZETTEN } from '../public/js/beheer/verschilwacht.js';
import * as exportRoute from '../src/routes/export.js';

const POORT = 8790;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-fundament';
const B = '/api/beheer';
const NU = '2026-11-27T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
let server;
let map;
let cookie = '';
const echteFetch = globalThis.fetch;

// Onderzoek 900 wordt verwijderd (criterium 6); onderzoek 901 moet daarbij helemaal blijven staan.
const ZAAD = `
INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op, gearchiveerd_op) VALUES
  (900, 'Wisbedrijf', 'Te verwijderen', 'gearchiveerd', '${NU}', '${NU}'),
  (901, 'Blijfbedrijf', 'Blijft staan', 'actief', '${NU}', NULL);
INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES (9000, 900, 'Werk', 1), (9010, 901, 'Werk', 1);
INSERT INTO meetpunten (id, thema_id, naam, eenheid, volgorde) VALUES (9001, 9000, 'Tijd', '', 1), (9011, 9010, 'Tijd', '', 1);
INSERT INTO meetmomenten (id, onderzoek_id, naam, volgorde) VALUES (9002, 900, 'Nul', 1), (9012, 901, 'Nul', 1);
INSERT INTO vragenlijsten (id, onderzoek_id, meetmoment_id, titel, code, status, aangemaakt_op) VALUES
  (9003, 900, 9002, 'Lijst', 'zaadcode-wis-00000000001', 'gesloten', '${NU}'),
  (9013, 901, 9012, 'Lijst', 'zaadcode-blijf-000000001', 'gesloten', '${NU}');
INSERT INTO vragen (id, vragenlijst_id, thema_id, meetpunt_id, type, tekst, volgorde) VALUES
  (9004, 9003, 9000, 9001, 'open', 'Wat kan beter?', 1), (9014, 9013, 9010, 9011, 'open', 'Wat kan beter?', 1);
INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES
  (9005, 9003, '2026-10-01', '{"9004":"Meer overleg"}'), (9015, 9013, '2026-10-01', '{"9014":"Meer overleg"}');
INSERT INTO inzendteller (vragenlijst_id, tijdvak, aantal) VALUES (9003, '2026-10-01T10', 1), (9013, '2026-10-01T10', 1);
INSERT INTO eigen_invoer (id, onderzoek_id, thema_id, soort, datum, titel, tekst, aangemaakt_op) VALUES
  (9006, 900, 9000, 'interview', '2026-10-02', 'Gesprek', 'Tekst', '${NU}'), (9016, 901, 9010, 'interview', '2026-10-02', 'Gesprek', 'Tekst', '${NU}');
INSERT INTO stukken (id, onderzoek_id, titel, aangemaakt_op, bijgewerkt_op) VALUES (9007, 900, 'Notitie', '${NU}', '${NU}'), (9017, 901, 'Notitie', '${NU}', '${NU}');
INSERT INTO acties (id, onderzoek_id, titel, aangemaakt_op) VALUES (9008, 900, 'Actie', '${NU}'), (9018, 901, 'Actie', '${NU}');
INSERT INTO deellinks (id, onderzoek_id, naam, code, toegang_zout, toegang_hash, onderdelen, aangemaakt_op) VALUES
  (9009, 900, 'OR', 'zaaddeellink-wis-0000001', 'z', 'h', '{"dashboard":true}', '${NU}'),
  (9019, 901, 'OR', 'zaaddeellink-blijf-00001', 'z', 'h', '{"dashboard":true}', '${NU}');
INSERT INTO kijksessies (token_hash, deellink_id, verloopt_op) VALUES ('hash-wis', 9009, 9999999999999), ('hash-blijf', 9019, 9999999999999);
INSERT INTO kijkpogingen (id, deellink_id, tijdstip, afzender) VALUES (9020, 9009, ${Date.now()}, 'a'), (9021, 9019, ${Date.now()}, 'a');
INSERT INTO rapporten (id, onderzoek_id, soort, titel, aangemaakt_op, bijgewerkt_op) VALUES (9022, 900, 'eind', 'R', '${NU}', '${NU}'), (9023, 901, 'eind', 'R', '${NU}', '${NU}');
INSERT INTO datasets (id, onderzoek_id, naam, kolommen, rijen, aantal_rijen, aangemaakt_op) VALUES
  (9024, 900, 'D', '["a"]', '[[1]]', 1, '${NU}'), (9025, 901, 'D', '["a"]', '[[1]]', 1, '${NU}');
INSERT INTO hr_instellingen (onderzoek_id, inhoud, bijgewerkt_op) VALUES (900, '{"versie":1}', '${NU}'), (901, '{"versie":1}', '${NU}');
INSERT INTO personeelscijfers (id, onderzoek_id, naam, periode_van, periode_tot, inhoud, bewaren_tot, aangemaakt_op) VALUES
  (9026, 900, 'P', '2025-01', '2025-12', '{"versie":1}', '2027-01-01', '${NU}'), (9027, 901, 'P', '2025-01', '2025-12', '{"versie":1}', '2027-01-01', '${NU}');
INSERT INTO werkbank_definities (id, onderzoek_id, dataset_id, soort, naam, definitie, aangemaakt_op, bijgewerkt_op) VALUES
  (9028, 900, 9024, 'bereken', 'x', '{}', '${NU}', '${NU}'), (9029, 901, NULL, 'bereken', 'x', '{}', '${NU}', '${NU}');
INSERT INTO werkbank_analyses (id, onderzoek_id, titel, procedure, spec, aangemaakt_op, bijgewerkt_op) VALUES
  (9030, 900, 'A', 'frequenties', '{"versie":1}', '${NU}', '${NU}'), (9031, 901, 'A', 'frequenties', '{"versie":1}', '${NU}', '${NU}');
INSERT INTO bronnen (id, citeersleutel, soort, titel, aangemaakt_op, bijgewerkt_op) VALUES (9032, 'zaad2026', 'rapport', 'Bron', '${NU}', '${NU}');
INSERT INTO bron_koppelingen (onderzoek_id, bron_id, aangemaakt_op) VALUES (900, 9032, '${NU}'), (901, 9032, '${NU}');
INSERT INTO codes (id, onderzoek_id, naam, aangemaakt_op) VALUES (9033, 900, 'Overleg', '${NU}'), (9034, 901, 'Overleg', '${NU}');
INSERT INTO coderingen (id, onderzoek_id, code_id, inzending_id, vraag_id) VALUES (9035, 900, 9033, 9005, 9004), (9036, 901, 9034, 9015, 9014);
INSERT INTO coderingen (id, onderzoek_id, code_id, invoer_id) VALUES (9037, 900, 9033, 9006), (9038, 901, 9034, 9016);
INSERT INTO citaten (id, onderzoek_id, code_id, inzending_id, vraag_id, tekst, aangemaakt_op, bijgewerkt_op) VALUES
  (9039, 900, 9033, 9005, 9004, 'Meer overleg', '${NU}', '${NU}'), (9040, 901, 9034, 9015, 9014, 'Meer overleg', '${NU}', '${NU}');
`;

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-fundament-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: WRANGLER_ENV });
  const zaad = join(map, 'zaad.sql');
  writeFileSync(zaad, ZAAD);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', zaad], { stdio: 'ignore', env: WRANGLER_ENV });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--ip', '127.0.0.1', '--persist-to', map,
    '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
  { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await echteFetch(`${BASIS}/api/sessie`)).ok) break;
    } catch { /* nog niet klaar */ }
    await new Promise((r) => setTimeout(r, 500));
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

async function roep(pad, { methode = 'GET', body, koekje = cookie } = {}) {
  const r = await echteFetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(koekje ? { Cookie: koekje } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let data = null;
  try { data = JSON.parse(tekst); } catch { /* geen json */ }
  return { status: r.status, data, tekst, koppen: r.headers };
}

// gegevens.js draait hier in Node: fetch krijgt het adres van de testserver en de sessiecookie, en we tellen mee.
const verzoeken = [];
function browserFetch() {
  globalThis.fetch = (pad, opties = {}) => {
    verzoeken.push(pad);
    return echteFetch(BASIS + pad, { ...opties, headers: { ...(opties.headers || {}), Cookie: cookie } });
  };
}

/** De D1-database van de testserver, alleen om te lezen. */
function database() {
  const dir = join(map, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const bestand = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  return new DatabaseSync(join(dir, bestand), { readOnly: true });
}

const s = {};

/** Een onderzoek met een thema en een gesloten vragenlijst; vragen via de inleesroute. */
async function maakOnderzoek(bedrijfsnaam, vragen) {
  const o = (await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam, titel: 'MTO', onderzoeksvraag: 'Vraag?' } })).data;
  const thema = (await roep(`${B}/onderzoeken/${o.id}/themas`, { methode: 'POST', body: { naam: 'Werk' } })).data.id;
  const lijsten = [];
  for (const [titel, lijstVragen] of vragen) {
    const vl = (await roep(`${B}/onderzoeken/${o.id}/vragenlijsten`, { methode: 'POST', body: { titel } })).data.id;
    const r = await roep(`${B}/vragenlijsten/${vl}/vragen/reeks`, { methode: 'POST', body: { vragen: lijstVragen.map((q) => ({ thema_id: thema, ...q })) } });
    assert.equal(r.status, 201, r.tekst);
    lijsten.push({ id: vl, vragen: (await roep(`${B}/vragenlijsten/${vl}`)).data.vragen });
  }
  return { id: o.id, thema, lijsten };
}

async function leesIn(vlId, items) {
  for (let i = 0; i < items.length; i += 300) {
    const r = await roep(`${B}/vragenlijsten/${vlId}/inzendingen/reeks`, { methode: 'POST', body: { inzendingen: items.slice(i, i + 300) } });
    assert.equal(r.status, 201, r.tekst);
  }
}

const zonderKop = ({ export: _e, ...rest }) => rest;
const zonderIds = (data) => ({ ...data, inzendingen: data.inzendingen.map(({ id: _id, ...r }) => r) });

// ---------- Criterium 8: gegevens.js ----------

test('criterium 8: één download, daarna alleen de veranderde vragenlijst, en precies de oude export', async () => {
  const schaal = (n) => Array.from({ length: n }, (_, i) => ({ type: 'schaal', tekst: `Stelling ${i + 1}` }));
  const o = await maakOnderzoek('Gegevensbedrijf', [['Groot', [...schaal(3), { type: 'open', tekst: 'Open' }]], ['Klein', schaal(2)], ['Leeg', schaal(1)]]);
  s.gegevens = o;
  const [groot, klein] = o.lijsten;
  await leesIn(groot.id, Array.from({ length: 1100 }, (_, i) => ({
    datum: `2026-10-${String(1 + (i % 9)).padStart(2, '0')}`,
    antwoorden: { [groot.vragen[0].id]: 1 + (i % 5), [groot.vragen[1].id]: 1 + ((i * 7) % 5), [groot.vragen[3].id]: i % 3 ? `Antwoord ${i}` : undefined },
  })));
  await leesIn(klein.id, Array.from({ length: 7 }, (_, i) => ({ datum: '2026-10-05', antwoorden: { [klein.vragen[0].id]: 1 + (i % 5) } })));

  browserFetch();
  const stappen = [];
  verzoeken.length = 0;
  const eerste = await haalGegevens(o.id, { voortgang: (geladen, totaal) => stappen.push(voortgangTekst(geladen, totaal)) });
  // Kop + de grote lijst in twee delen (1.000 + 100) + de kleine; de lege lijst hoeft niet opgehaald te worden.
  assert.deepEqual(verzoeken.map((p) => p.replace(/\?.*/, '')), [
    `${B}/onderzoeken/${o.id}/export/data`, ...Array(3).fill(`${B}/onderzoeken/${o.id}/export/inzendingen`)]);
  assert.equal(verzoeken.filter((p) => p.includes(`vragenlijst=${groot.id}&`)).length, 2);
  assert.deepEqual(stappen, ['Gegevens laden: 0 van 1.107 antwoorden…', 'Gegevens laden: 1.000 van 1.107 antwoorden…',
    'Gegevens laden: 1.100 van 1.107 antwoorden…', 'Gegevens laden: 1.107 van 1.107 antwoorden…']);
  assert.equal(eerste.inzendingen.length, 1107);
  assert.ok(eerste.inzendingen.every((i) => Number.isSafeInteger(i.id)), 'elke inzending heeft haar id');
  assert.ok(Object.isFrozen(eerste.inzendingen[0]) && Object.isFrozen(eerste.inzendingen[0].antwoorden));

  // Gelijk aan de oude export (zonder de id's; het tijdstip van exporteren verschilt).
  const oud = (await roep(`${B}/onderzoeken/${o.id}/export/data`)).data;
  assert.deepEqual(Object.keys(oud.inzendingen[0]).sort(), ['antwoorden', 'datum', 'vragenlijst_id']);
  assert.deepEqual(zonderKop(zonderIds(eerste)), zonderKop(oud));
  assert.deepEqual(eerste.inzendingen_stand, oud.inzendingen_stand);
  assert.deepEqual(eerste.inzendingen_stand.map((x) => x.aantal), [1100, 7, 0]);
  const { aantal, controle } = eerste.inzendingen_stand[0];
  assert.deepEqual(standVan(eerste.inzendingen.filter((i) => i.vragenlijst_id === groot.id)), { aantal, controle });

  // Nog een keer zonder wijzigingen: alleen de kop, geen antwoorden.
  verzoeken.length = 0;
  stappen.length = 0;
  const tweede = await haalGegevens(o.id, { voortgang: (g, t) => stappen.push([g, t]) });
  assert.equal(verzoeken.length, 1);
  assert.match(verzoeken[0], /export\/data\?zonder_inzendingen=1$/);
  assert.deepEqual(stappen, [], 'niets op te halen: geen voortgang');
  assert.deepEqual(zonderKop(tweede), zonderKop(eerste));
  assert.equal(tweede.inzendingen[5], eerste.inzendingen[5], 'dezelfde (bevroren) inzendingen, niet opnieuw opgehaald');

  // Eén nieuwe inzending in de kleine lijst: alleen die lijst opnieuw.
  await leesIn(klein.id, [{ datum: '2026-10-06', antwoorden: { [klein.vragen[1].id]: 5 } }]);
  verzoeken.length = 0;
  const derde = await haalGegevens(o.id);
  assert.equal(verzoeken.length, 2);
  assert.match(verzoeken[1], new RegExp(`vragenlijst=${klein.id}&na=0&max=1000$`));
  assert.equal(derde.inzendingen.length, 1108);
  assert.deepEqual(zonderKop(zonderIds(derde)), zonderKop((await roep(`${B}/onderzoeken/${o.id}/export/data`)).data));

  // vers: alles opnieuw; vergeetGegevens: ook.
  verzoeken.length = 0;
  await haalGegevens(o.id, { vers: true });
  assert.equal(verzoeken.length, 4);
  vergeetGegevens(o.id);
  verzoeken.length = 0;
  await haalGegevens(o.id);
  assert.equal(verzoeken.length, 4);

  // Twee schermen tegelijk: de tweede wacht en haalt daarna alleen de kop.
  verzoeken.length = 0;
  vergeetGegevens(o.id);
  const [a, b] = await Promise.all([haalGegevens(o.id), haalGegevens(o.id)]);
  assert.equal(verzoeken.filter((p) => p.includes('export/inzendingen')).length, 3);
  assert.equal(a.inzendingen.length, b.inzendingen.length);
});

test('bevroren gegevens: alle verwerkers in de browser werken ermee zonder iets te veranderen', async () => {
  const data = await haalGegevens(s.gegevens.id);
  const voor = JSON.stringify(data.inzendingen);
  const r = rijenUitExport(data);
  for (const l of data.vragenlijsten) dashboardUitRijen(r, { vragenlijst: String(l.id), uitsplitsen: null });
  const dashboards = data.vragenlijsten.map((l) => dashboardUitRijen(r, { vragenlijst: String(l.id), uitsplitsen: null }));
  verzamelFeiten({ data, dashboards, peildatum: '2026-11-27' });
  const model = bouwModel(data);
  for (const l of model.lijsten) waardenVan(l, `t:${s.gegevens.thema}`);
  excelBladen(data);
  excelWerkboek(data);
  spssPakket(data);
  alleAntwoordenCsv(data);
  antwoordenVragenlijstCsv(data, s.gegevens.lijsten[0].id);
  eigenInvoerCsv(data);
  const json = JSON.parse(volledigeJson({ ...data, datasets: [] }));
  assert.equal(json.vragenlijsten[0].inzendingen.length, 1100);
  assert.equal(json.vragenlijsten[0].inzendingen[0].respondent, 1);
  assert.ok(!('id' in json.vragenlijsten[0].inzendingen[0]), 'het willekeurige id gaat niet mee in de volledige kopie');
  assert.deepEqual(Object.keys(json).slice(-5), ['hr_instellingen', 'personeelscijfers', 'werkbank', 'codering', 'bronnen_gekoppeld']);
  assert.deepEqual(json.werkbank, { definities: [], analyses: [] });
  assert.deepEqual(json.codering, { codes: [], coderingen: [], citaten: [] });
  assert.equal(JSON.stringify(data.inzendingen), voor);
});

// ---------- Criterium 11: de nieuwe routes ----------

test('criterium 11: een deel stopt bij 1.000 rijen of ongeveer 1,5 MB', async () => {
  const [groot] = s.gegevens.lijsten;
  const p = (q) => roep(`${B}/onderzoeken/${s.gegevens.id}/export/inzendingen?${q}`);
  const eerste = await p(`vragenlijst=${groot.id}&na=0&max=50000`);
  assert.equal(eerste.status, 200);
  assert.equal(eerste.data.inzendingen.length, 1000, 'max wordt 1.000');
  assert.deepEqual(Object.keys(eerste.data.inzendingen[0]), ['id', 'vragenlijst_id', 'datum', 'antwoorden']);
  const ids = eerste.data.inzendingen.map((i) => i.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'op volgorde van id');
  assert.equal(eerste.data.volgende, ids[ids.length - 1]);
  const tweede = await p(`vragenlijst=${groot.id}&na=${eerste.data.volgende}`);
  assert.equal(tweede.data.inzendingen.length, 100);
  assert.equal(tweede.data.volgende, null, 'geen leeg deel achteraan');
  assert.ok(tweede.data.inzendingen[0].id > eerste.data.volgende);
  // Precies 1.000 over: één deel, geen leeg deel erachter.
  const precies = await p(`vragenlijst=${groot.id}&na=${ids[99]}`);
  assert.equal(precies.data.inzendingen.length, 1000);
  assert.equal(precies.data.volgende, null);
  // Fouten: geen vragenlijst, een vragenlijst van een ander onderzoek, en zonder inlog.
  assert.equal((await p('na=0')).status, 400);
  assert.equal((await roep(`${B}/onderzoeken/901/export/inzendingen?vragenlijst=${groot.id}`)).status, 404);
  assert.equal((await roep(`${B}/onderzoeken/${s.gegevens.id}/export/inzendingen?vragenlijst=${groot.id}`, { koekje: '' })).status, 401);

  // Grote antwoorden: 20 open vragen × 5.000 tekens = ongeveer 100.000 tekens per respondent.
  const o = await maakOnderzoek('Groot antwoordbedrijf', [['Lang', Array.from({ length: 20 }, (_, i) => ({ type: 'open', tekst: `Vertel ${i + 1}` }))]]);
  const lang = o.lijsten[0];
  for (let k = 0; k < 4; k++) {
    await leesIn(lang.id, Array.from({ length: 5 }, (_, i) => ({ antwoorden: Object.fromEntries(lang.vragen.map((q) => [q.id, `${k}${i}${'x'.repeat(4998)}`])) })));
  }
  const delen = [];
  let na = 0;
  for (;;) {
    const d = await roep(`${B}/onderzoeken/${o.id}/export/inzendingen?vragenlijst=${lang.id}&na=${na}`);
    delen.push(d);
    if (d.data.volgende === null) break;
    na = d.data.volgende;
  }
  const tekens = (d) => d.data.inzendingen.reduce((n, i) => n + JSON.stringify(i.antwoorden).length, 0);
  assert.ok(delen.length >= 2, 'in meer dan één deel');
  assert.ok(delen[0].data.inzendingen.length < 20);
  assert.ok(tekens(delen[0]) >= 1_500_000 && tekens(delen[0]) < 1_500_000 + 110_000, `eerste deel: ${tekens(delen[0])} tekens`);
  assert.ok(delen[0].tekst.length < 1_700_000);
  assert.equal(delen.reduce((n, d) => n + d.data.inzendingen.length, 0), 20);
});

test('criterium 11: export/data en export/inzendingen doen elk één batch (plus één losse query voor het onderzoek)', async () => {
  // Een nep-database die telt; elke opdracht geeft een lege uitkomst.
  function telDb() {
    const tel = { batches: 0, opdrachtenPerBatch: [], los: 0, parameters: [] };
    const opdracht = (sql) => ({
      sql,
      bind(...p) { tel.parameters.push(p.length); return this; },
      async first() { tel.los++; return { id: 1, bedrijfsnaam: 'X', titel: 'Y', status: 'actief' }; },
      async all() { tel.los++; return { results: [] }; },
      async run() { tel.los++; return { meta: {} }; },
    });
    const DB = {
      prepare: opdracht,
      async batch(lijst) {
        tel.batches++;
        tel.opdrachtenPerBatch.push(lijst.length);
        return lijst.map((o) => ({ results: /FROM vragenlijsten WHERE id = \? AND onderzoek_id/.test(o.sql) ? [{ ja: 1 }] : [] }));
      },
    };
    return { env: { DB }, tel };
  }
  for (const zonder of [false, true]) {
    const { env, tel } = telDb();
    const url = new URL(`http://x/api/beheer/onderzoeken/1/export/data${zonder ? '?zonder_inzendingen=1' : ''}`);
    const r = await exportRoute.data({ env, url, params: { id: '1' } });
    const d = JSON.parse(await r.text());
    assert.equal(tel.batches, 1);
    assert.equal(tel.los, 1, 'alleen het onderzoek zelf');
    assert.ok(tel.parameters.every((n) => n <= 100));
    assert.deepEqual(d.inzendingen, []);
    assert.deepEqual(d.hr_instellingen, {});
    assert.deepEqual(d.inzendingen_stand, []);
  }
  const { env, tel } = telDb();
  const r = await exportRoute.inzendingen({ env, url: new URL('http://x/a?vragenlijst=5&na=7&max=10'), params: { id: '1' } });
  assert.deepEqual(JSON.parse(await r.text()), { inzendingen: [], volgende: null });
  assert.equal(tel.batches, 1);
  assert.equal(tel.los, 0);
  assert.deepEqual(tel.opdrachtenPerBatch, [2]);
  assert.equal(exportRoute.MAX_PER_DEEL, 1000);
  assert.equal(exportRoute.MAX_TEKENS_PER_DEEL, 1_500_000);
});

// ---------- Criterium 4: "Anders: 1" nergens in beeld ----------

test('criterium 4: "Anders: 1" is verborgen bij beheer, meelezer, rapportfeiten, getoond rapport (ook oud) en Excel', async () => {
  const o = await maakOnderzoek('Maskeerbedrijf', [['MTO', [
    { type: 'meerkeuze', tekst: 'Wat is je geslacht?', opties: ['Man', 'Vrouw', 'Anders'], uitsplitsen: true },
    { type: 'schaal', tekst: 'Ik werk hier graag.' },
  ]]]);
  const lijst = o.lijsten[0];
  const [geslacht, stelling] = lijst.vragen;
  const optie = Object.fromEntries(geslacht.opties.map((x) => [x.label, x.id]));
  const plan = [...Array(11).fill('Man'), ...Array(8).fill('Vrouw'), 'Anders'];
  await leesIn(lijst.id, plan.map((g, i) => ({ datum: '2026-10-01', antwoorden: { [geslacht.id]: optie[g], [stelling.id]: 1 + (i % 5) } })));
  const alleenKleineAantallen = (vragen) => JSON.stringify(vragen.filter((q) => q.beschermd)).match(/"aantal":[1-4][,}]/);

  // Beheer: Anders 1 + Niet ingevuld 0 → samen met de kleinste zichtbare (Vrouw) verborgen.
  const d = (await roep(`${B}/onderzoeken/${o.id}/dashboard?vragenlijst=${lijst.id}`)).data;
  const q = d.selectie.vragen.find((x) => x.id === geslacht.id);
  assert.equal(q.beschermd, true);
  assert.deepEqual(q.verdeling.map((v) => [v.label, v.aantal]), [['Man', 11], ['Vrouw', null], ['Anders', null], ['Niet ingevuld', null]]);
  assert.equal(q.n, null);
  assert.ok(Math.abs(q.verdeling[0].percentage - 55) < 1e-9, 'percentage van de hele lijst (11 van 20)');
  assert.equal(alleenKleineAantallen(d.selectie.vragen), null);

  // De browser rekent precies hetzelfde uit (zo maakt de rapporteditor zijn feiten).
  browserFetch();
  const data = await haalGegevens(o.id);
  const lokaal = dashboardUitRijen(rijenUitExport(data), { vragenlijst: String(lijst.id), uitsplitsen: null });
  const ordenOpen = (x) => JSON.parse(JSON.stringify(x), (k, v) => (k === 'antwoorden' && Array.isArray(v) ? [...v].sort() : v));
  assert.deepEqual(ordenOpen(lokaal), ordenOpen(d));

  // Meelezer (live dashboard van de gesloten lijst).
  const link = (await roep(`${B}/onderzoeken/${o.id}/deellinks`, { methode: 'POST', body: { naam: 'OR', onderdelen: { dashboard: true } } })).data;
  const toegang = await roep(`/api/kijk/${link.deellink.code}/toegang`, { methode: 'POST', body: { toegangscode: link.toegangscode }, koekje: '' });
  const kijkKoekje = toegang.koppen.get('set-cookie').split(';')[0];
  const kd = (await roep(`/api/kijk/${link.deellink.code}/dashboard?vragenlijst=${lijst.id}`, { koekje: kijkKoekje })).data;
  assert.deepEqual(kd.selectie.vragen.find((x) => x.id === geslacht.id).verdeling.map((v) => v.aantal), [11, null, null, null]);
  assert.equal(alleenKleineAantallen(kd.selectie.vragen), null);

  // Rapport: vastleggen zoals Cijfers bijwerken het doet, dan via de server tonen aan een meelezer.
  const rapport = (await roep(`${B}/onderzoeken/${o.id}/rapporten`, { methode: 'POST', body: { soort: 'eind', titel: 'Eindrapport', inhoud: standaardInhoud('eind') } })).data.id;
  const feiten = verzamelFeiten({ data, dashboards: [lokaal], peildatum: '2026-11-27' });
  assert.equal((await roep(`${B}/rapporten/${rapport}/feiten`, { methode: 'PUT', body: { feiten } })).status, 200);
  const bewaard = (await roep(`${B}/rapporten/${rapport}`)).data.rapport.feiten;
  const fq = bewaard.lijsten[0].vragen.find((x) => x.tekst === 'Wat is je geslacht?');
  assert.equal(fq.beschermd, true);
  assert.deepEqual(fq.verdeling.map((v) => v.aantal), [11, null, null, null]);
  assert.equal(alleenKleineAantallen(bewaard.lijsten[0].vragen), null);
  await roep(`${B}/deellinks/${link.deellink.id}`, { methode: 'PUT', body: { naam: 'OR', onderdelen: { dashboard: true, rapporten: [rapport] } } });
  const tabel = (blokken) => blokken.flatMap((b) => (b.soort === 'feiten' ? b.blokken : [b])).find((b) => b.soort === 'tabel' && b.bijschrift.includes('Wat is je geslacht?'));
  const kr = (await roep(`/api/kijk/${link.deellink.code}/rapporten/${rapport}`, { koekje: kijkKoekje })).data.rapport;
  assert.deepEqual(tabel(kr.blokken).rijen.map((r) => [r[0], r[1]]), [['Man', 11], ['Vrouw', VERBORGEN], ['Anders', VERBORGEN], ['Niet ingevuld', VERBORGEN]]);
  assert.match(blokkenNaarTekst(kr.blokken), /× = niet getoond/);

  // Oude feiten (zonder beschermd, met de ruwe aantallen) worden bij het tonen alsnog gemaskeerd.
  const oud = structuredClone(bewaard);
  for (const x of oud.lijsten[0].vragen) {
    delete x.beschermd;
    if (x.tekst === 'Wat is je geslacht?') {
      x.n = 20;
      x.verdeling = [{ waarde: optie.Man, label: 'Man', aantal: 11, percentage: 55 }, { waarde: optie.Vrouw, label: 'Vrouw', aantal: 8, percentage: 40 }, { waarde: optie.Anders, label: 'Anders', aantal: 1, percentage: 5 }];
    }
  }
  await roep(`${B}/rapporten/${rapport}/feiten`, { methode: 'PUT', body: { feiten: oud } });
  const oudKr = (await roep(`/api/kijk/${link.deellink.code}/rapporten/${rapport}`, { koekje: kijkKoekje })).data.rapport;
  const oudT = tabel(oudKr.blokken);
  assert.deepEqual(oudT.rijen.map((r) => r[1]), [11, VERBORGEN, VERBORGEN, VERBORGEN]);
  assert.ok(!oudT.rijen.some((r) => r.includes(1) || r.includes(8)));
  assert.deepEqual(tabel(rapportNaarBlokken({ titel: 'R', soort: 'eind', inhoud: standaardInhoud('eind'), feiten: oud })).rijen, oudT.rijen);

  // Excel: de overzichtsbladen tonen geen klein aantal bij een achtergrondvraag; de ruwe bladen blijven ruw.
  const bladen = excelBladen(data);
  for (const b of bladen.filter((x) => !/^Antwoorden \d+$/.test(x.naam))) {
    for (const rij of b.rijen) assert.ok(!(rij.includes('Anders') && rij.some((c) => typeof c === 'number' && c > 0 && c < 5)), `${b.naam}: ${JSON.stringify(rij)}`);
  }
  s.masker = { onderzoek: o.id, lijst: lijst.id, rapport, link: link.deellink.id };
});

// ---------- Criterium 5 en verschilwacht ----------

test('criterium 5: een deellink met alleen een rapport en de tussenstand bewaart tussenstand: true', async () => {
  const r = await roep(`${B}/onderzoeken/${s.masker.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'Directie', onderdelen: { dashboard: false, rapporten: [s.masker.rapport], tussenstand: true } } });
  assert.equal(r.status, 201, r.tekst);
  assert.equal(r.data.deellink.onderdelen.tussenstand, true);
  assert.equal(r.data.deellink.onderdelen.dashboard, false);
  const lijst = (await roep(`${B}/onderzoeken/${s.masker.onderzoek}/deellinks`)).data.deellinks;
  assert.deepEqual(lijst.find((l) => l.id === r.data.deellink.id).onderdelen, { dashboard: false, open_antwoorden: false, tussenstand: true, stukken: [], rapporten: [s.masker.rapport] });
  s.masker.alleenRapport = r.data.deellink.id;
});

test('verschilwacht: de rapportlijst geeft de vastgelegde n per vragenlijst; waarschuwen bij 1 tot 4 verschil', async () => {
  const { rapporten } = (await roep(`${B}/onderzoeken/${s.masker.onderzoek}/rapporten`)).data;
  assert.deepEqual(rapporten.find((r) => r.id === s.masker.rapport).lijsten_n, [{ id: s.masker.lijst, n: 20 }]);
  const { deellinks } = (await roep(`${B}/onderzoeken/${s.masker.onderzoek}/deellinks`)).data;
  const stand = gedeeldeStand(deellinks, rapporten);
  assert.equal(stand.live, true);
  assert.equal(stand.rapporten.length, 1);
  assert.ok(isGedeeld(stand, s.masker.lijst, 20));
  assert.deepEqual(kleineVerschillen(stand, s.masker.lijst, 23, { huidigN: 20 }).map((u) => [u.bron, u.n, u.verschil]), [['dashboard', 20, 3], ['rapport', 20, 3]]);
  assert.deepEqual(kleineVerschillen(stand, s.masker.lijst, 25, { huidigN: 20 }), [], '5 nieuwe: geen waarschuwing');
  assert.deepEqual(kleineVerschillen(stand, s.masker.lijst, 20, { huidigN: 20 }), []);

  // Zonder actieve deellink is er niets gedeeld.
  for (const id of [s.masker.link, s.masker.alleenRapport]) await roep(`${B}/deellinks/${id}`, { methode: 'DELETE' });
  const leeg = gedeeldeStand((await roep(`${B}/onderzoeken/${s.masker.onderzoek}/deellinks`)).data.deellinks, rapporten);
  assert.equal(isGedeeld(leeg, s.masker.lijst, 20), false);

  // Kleine uitkomsten tonen niets, dus daarmee valt niets te vergelijken; een ingetrokken link telt niet mee.
  const s2 = gedeeldeStand([
    { actief: true, naam: 'A', onderdelen: { dashboard: false, rapporten: [1] } },
    { actief: false, naam: 'B', onderdelen: { dashboard: true, rapporten: [2] } },
  ], [{ id: 1, titel: 'T', lijsten_n: [{ id: 7, n: 3 }, { id: 8, n: 12 }] }, { id: 2, titel: 'U', lijsten_n: [{ id: 7, n: 40 }] }]);
  assert.equal(s2.live, false);
  assert.equal(isGedeeld(s2, 7, 3), false);
  assert.deepEqual(kleineVerschillen(s2, 7, 6, { huidigN: 3 }), []);
  assert.deepEqual(kleineVerschillen(s2, 8, 14, { huidigN: 12 }).map((u) => u.titel), ['T']);
  assert.match(WAARSCHUWING_OPENZETTEN, /^Let op: deze vragenlijst is gedeeld via een deellink\. Als je hem weer openzet/);
});

// ---------- Criterium 6: onderzoek verwijderen ----------

test('criterium 6: na verwijderen staat er in geen tabel met onderzoek_id nog iets van het onderzoek', async () => {
  const db = database();
  const tabellen = db.prepare(`SELECT m.name FROM sqlite_master m WHERE m.type = 'table'
    AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name = 'onderzoek_id')`).all().map((r) => r.name);
  for (const t of ['hr_instellingen', 'personeelscijfers', 'werkbank_definities', 'werkbank_analyses', 'bron_koppelingen', 'codes', 'coderingen', 'citaten', 'deellinks', 'datasets']) {
    assert.ok(tabellen.includes(t), t);
  }
  const tel = (t, id) => db.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE onderzoek_id = ?`).get(id).n;
  for (const t of tabellen) assert.ok(tel(t, 900) > 0, `het zaad vult ${t}`);
  db.close();

  assert.equal((await roep(`${B}/onderzoeken/900`, { methode: 'DELETE', body: { bevestiging: 'Wisbedrijf' } })).status, 200);

  const na = database();
  for (const t of tabellen) {
    assert.equal(na.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE onderzoek_id = 900`).get().n, 0, `${t} is leeg voor 900`);
    assert.ok(na.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE onderzoek_id = 901`).get().n > 0, `${t} van 901 blijft`);
  }
  // Ook de tabellen zonder onderzoek_id die eronder hangen.
  for (const [t, kolom, wis, blijf] of [['meetpunten', 'id', 9001, 9011], ['vragen', 'id', 9004, 9014], ['inzendingen', 'id', 9005, 9015],
    ['inzendteller', 'vragenlijst_id', 9003, 9013], ['kijksessies', 'deellink_id', 9009, 9019], ['kijkpogingen', 'deellink_id', 9009, 9019]]) {
    assert.equal(na.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${kolom} = ?`).get(wis).n, 0, t);
    assert.equal(na.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${kolom} = ?`).get(blijf).n, 1, t);
  }
  assert.equal(na.prepare('SELECT COUNT(*) AS n FROM onderzoeken WHERE id = 900').get().n, 0);
  assert.equal(na.prepare('SELECT COUNT(*) AS n FROM bronnen WHERE id = 9032').get().n, 1, 'bronnen zijn van alle onderzoeken samen');
  na.close();
});

// ---------- Gratis laag (FT-01, FT-07) ----------

function bestandenIn(dir) {
  return readdirSync(dir).flatMap((f) => {
    const pad = join(dir, f);
    return statSync(pad).isDirectory() ? bestandenIn(pad) : [pad];
  });
}

test('FT-01 en FT-07: geen fetch naar buiten in src/, geen dashboard per vragenlijst in de rapporteditor', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  for (const f of bestandenIn(src).filter((x) => x.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /fetch\(\s*['"`]https?:/, f);
  }
  const editor = readFileSync(fileURLToPath(new URL('../public/js/beheer/schermen/rapport-bewerken.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(editor, /\/dashboard[?`'"]/, 'geen verzoek naar /dashboard');
  assert.doesNotMatch(editor, /export\/data/);
  assert.match(editor, /haalGegevens/);
});

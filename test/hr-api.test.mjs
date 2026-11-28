// Servertests van HR-analytics (BOUWPLAN P3, D1 §11.4 HR-deel): instellingen, personeelscijfers met "Bewaren tot",
// de strenge vorm van het aggregaat, gearchiveerde onderzoeken, en dat de cellen van "Thema's per groep" uit de
// export gelijk zijn aan GET /dashboard?uitsplitsen=. Echte lokale testserver op poort 8792 (BOUWPLAN §4.0), plus het
// aantal databaseopdrachten per route (in het proces, met node:sqlite als D1).
// Uitvoeren: node --test test/hr-api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import * as hr from '../src/routes/hr.js';
import { controleerHrInstellingen, controleerPersoneelsaggregaat } from '../src/lib/hr-validatie.js';
import { verwerkPersoneel } from '../public/js/beheer/personeel-regels.js';
import { verzamelKerncijfers, gekozenPersoneel } from '../public/js/beheer/hr-analytics.js';
import { controleerKerncijfers } from '../public/js/beheer/hr-rapport.js';
import { standaardExport } from './hr-fixture.mjs';

const POORT = 8792;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-hr-analytics';
const B = '/api/beheer';
const NU = '2026-11-27T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
let server;
let map;
let cookie = '';

// ---------- Gegevens ----------

const sql = (w) => (w === null || w === undefined ? 'NULL' : typeof w === 'number' ? String(w) : `'${String(w).replace(/'/g, "''")}'`);
const DATA = standaardExport({ n: 90, afdelingen: [40, 30, 3, 2], metas: 2, uitgenodigd: 120 });

/** Een personeelsbestand (fictief) met kolommen die nooit mee mogen. */
function personeelsbestand(n = 60) {
  const kop = ['Naam', 'Personeelsnummer', 'Geboortedatum', 'Afdeling', 'Geslacht', 'Fte', 'In dienst', 'Uit dienst', 'Verzuimdagen', 'Ziekmeldingen'];
  const rijen = Array.from({ length: n }, (_, i) => [
    `Persoon Achternaam${i}`, `PN-${4000 + i}`, `19${60 + (i % 35)}-0${1 + (i % 9)}-1${i % 9}`, ['Zorg', 'Staf', 'Facilitair'][i % 3],
    i % 2 ? 'V' : 'M', [1, 0.8, 0.6][i % 3], `20${10 + (i % 15)}-0${1 + (i % 9)}`, i % 11 === 0 ? '2026-03' : null, i % 7, i % 3,
  ]);
  return { kop, rijen, rollen: { 2: 'geboortedatum', 3: 'afdeling', 4: 'geslacht', 5: 'fte', 6: 'datum_in', 7: 'datum_uit', 8: 'verzuimdagen', 9: 'verzuimmeldingen' } };
}
const PERIODE = { van: '2025-11', tot: '2026-10' };
const aggregaatVan = (n = 60) => {
  const b = personeelsbestand(n);
  return verwerkPersoneel(b.kop, b.rijen, { rollen: b.rollen, periode: PERIODE, naam: 'Personeelsbestand 2026' }).aggregaat;
};
const AGGREGAAT = aggregaatVan();

const ZAAD = `
INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op, gearchiveerd_op) VALUES
  (1, 'Voorbeeld BV', 'Medewerkersonderzoek', 'actief', '${NU}', NULL), (2, 'Twee BV', 'Leeg', 'actief', '${NU}', NULL),
  (3, 'Archief BV', 'Archief', 'gearchiveerd', '${NU}', '${NU}');
INSERT INTO themas (id, onderzoek_id, naam, volgorde) VALUES
  ${DATA.themas.map((t) => `(${t.id}, 1, ${sql(t.naam)}, ${t.volgorde})`).join(', ')}, (50, 2, 'Werk', 1), (60, 3, 'Werk', 1);
INSERT INTO meetmomenten (id, onderzoek_id, naam, datum, volgorde) VALUES
  ${DATA.meetmomenten.map((m) => `(${m.id}, 1, ${sql(m.naam)}, ${sql(m.datum)}, ${m.volgorde})`).join(', ')};
INSERT INTO vragenlijsten (id, onderzoek_id, meetmoment_id, titel, code, status, aantal_uitgenodigd, aangemaakt_op) VALUES
  ${DATA.vragenlijsten.map((l) => `(${l.id}, 1, ${l.meetmoment_id}, ${sql(l.titel)}, 'hr-zaadcode-${l.id}-000000000', ${sql(l.status)}, ${sql(l.aantal_uitgenodigd)}, '${NU}')`).join(', ')};
INSERT INTO vragen (id, vragenlijst_id, thema_id, type, tekst, opties, schaal_soort, meerdere_antwoorden, weet_niet, uitsplitsen, bron_vraag_id, volgorde, kenmerk) VALUES
  ${DATA.vragen.map((q) => `(${q.id}, ${q.vragenlijst_id}, ${q.thema_id}, ${sql(q.type)}, ${sql(q.tekst)}, ${sql(q.opties)}, ${sql(q.schaal_soort)}, ${q.meerdere_antwoorden}, ${q.weet_niet}, ${q.uitsplitsen}, ${sql(q.bron_vraag_id)}, ${q.volgorde}, ${sql(q.kenmerk)})`).join(',\n  ')};
INSERT INTO inzendingen (id, vragenlijst_id, datum, antwoorden) VALUES
  ${DATA.inzendingen.map((i) => `(${i.id}, ${i.vragenlijst_id}, ${sql(i.datum)}, ${sql(JSON.stringify(i.antwoorden))})`).join(',\n  ')};
INSERT INTO personeelscijfers (id, onderzoek_id, naam, periode_van, periode_tot, inhoud, bewaren_tot, aangemaakt_op) VALUES
  (300, 3, 'Oud bestand', '2025-11', '2026-10', ${sql(JSON.stringify(AGGREGAAT))}, '2027-05-27', '${NU}');
INSERT INTO hr_instellingen (onderzoek_id, inhoud, bijgewerkt_op) VALUES (3, '{"versie":1,"personeel":{"id":300}}', '${NU}');
`;

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-hr-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: WRANGLER_ENV });
  const zaad = join(map, 'zaad.sql');
  writeFileSync(zaad, ZAAD);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', zaad], { stdio: 'ignore', env: WRANGLER_ENV });
  server = spawn('npx', ['wrangler', 'dev', '--port', String(POORT), '--inspector-port', String(POORT + 1000), '--ip', '127.0.0.1', '--persist-to', map,
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

async function roep(pad, { methode = 'GET', body, ruw } = {}) {
  const r = await fetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined || ruw !== undefined ? { 'Content-Type': 'application/json' } : {}), Cookie: cookie },
    body: ruw !== undefined ? ruw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let data = null;
  try { data = JSON.parse(tekst); } catch { /* geen json */ }
  return { status: r.status, data, tekst };
}
const vandaag = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const s = {};

// ---------- Instellingen ----------

test('HR-instellingen: leeg ophalen, opslaan en terugkrijgen; alleen ingelogd', async () => {
  const leeg = await roep(`${B}/onderzoeken/1/hr`);
  assert.equal(leeg.status, 200);
  assert.deepEqual(leeg.data, { instellingen: {}, bijgewerkt_op: null, personeelscijfers: [], limieten: { personeelscijfers: 5, bewaren_maanden: 36 } });
  assert.equal((await roep(`${B}/onderzoeken/999/hr`)).status, 404);
  assert.equal((await fetch(`${BASIS}${B}/onderzoeken/1/hr`)).status, 401);
  const instellingen = {
    versie: 1, uitkomst: { sleutel: 'v:30' },
    signalen: [{ sleutel: 'v:10', ongunstig: [1, 2], grens: 30 }, { sleutel: 'v:32', ongunstig: ['ja'], grens: 30 }],
    populatie: { 1: { o1: 60, o2: 45, o3: 10, o4: 5 } },
    benchmarks: [{ sleutel: 'verzuim_pct', waarde: 5, omschrijving: 'Landelijk verzuim 2025', citeersleutel: 'cbs2025' }, { sleutel: 't:1', waarde: 3.6 }],
  };
  const op = await roep(`${B}/onderzoeken/1/hr`, { methode: 'PUT', body: { instellingen } });
  assert.equal(op.status, 200, op.tekst);
  assert.ok(op.data.bijgewerkt_op);
  s.bijgewerkt_op = op.data.bijgewerkt_op;
  const terug = await roep(`${B}/onderzoeken/1/hr`);
  const verwacht = { ...instellingen, benchmarks: [instellingen.benchmarks[0], { sleutel: 't:1', waarde: 3.6, omschrijving: '', citeersleutel: '' }] };
  assert.deepEqual(terug.data.instellingen, verwacht);
  assert.equal(terug.data.bijgewerkt_op, s.bijgewerkt_op);
  // Tegelijk gewijzigd op een andere plek: 409.
  const nieuw = await roep(`${B}/onderzoeken/1/hr`, { methode: 'PUT', body: { instellingen: { ...instellingen, uitkomst: null }, bijgewerkt_op: s.bijgewerkt_op } });
  assert.equal(nieuw.status, 200, nieuw.tekst);
  const oud = await roep(`${B}/onderzoeken/1/hr`, { methode: 'PUT', body: { instellingen, bijgewerkt_op: s.bijgewerkt_op } });
  assert.equal(oud.status, 409);
  assert.equal(oud.data.conflict, true);
  s.bijgewerkt_op = nieuw.data.bijgewerkt_op;
  const weer = await roep(`${B}/onderzoeken/1/hr`, { methode: 'PUT', body: { instellingen, bijgewerkt_op: s.bijgewerkt_op } });
  assert.equal(weer.status, 200);
});

test('HR-instellingen: 400 bij een ongeldige sleutel, grens 0, onbekend veld, slechte bron; te groot; 409 als gearchiveerd', async () => {
  const fout = async (instellingen, patroon, status = 400) => {
    const r = await roep(`${B}/onderzoeken/2/hr`, { methode: 'PUT', body: { instellingen } });
    assert.equal(r.status, status, r.tekst);
    if (patroon) assert.match(r.data.fout, patroon);
  };
  await fout({ uitkomst: { sleutel: 'x:1' } }, /geldige uitkomst/);
  await fout({ signalen: [{ sleutel: 'v:1', ongunstig: [1], grens: 0 }] }, /grens/);
  await fout({ signalen: [{ sleutel: 'v:1', ongunstig: [1], grens: 101 }] }, /grens/);
  await fout({ signalen: [{ sleutel: 'v:1', ongunstig: [], grens: 30 }] }, /ongunstig/);
  await fout({ signalen: Array.from({ length: 31 }, () => ({ sleutel: 'v:1', ongunstig: [1], grens: 30 })) }, /hooguit 30 signalen/);
  await fout({ geheim: 1 }, /onbekend veld/);
  await fout({ populatie: { 1: { o1: -3 } } }, /heel getal/);
  await fout({ populatie: { 1: { o1: 2.5 } } }, /heel getal/);
  await fout({ personeel: { id: 'x' } }, /personeelsbestand/);
  await fout({ benchmarks: [{ sleutel: 'onzin', waarde: 1 }] }, /waarmee je vergelijkt/);
  await fout({ benchmarks: [{ sleutel: 'enps', waarde: 'veel' }] }, /getal/);
  await fout({ benchmarks: [{ sleutel: 'enps', waarde: 10, citeersleutel: 'CBS 2025' }] }, /bron/);
  await fout({ benchmarks: [{ sleutel: 'enps', waarde: 10, omschrijving: 'x'.repeat(121) }] }, /120 tekens/);
  await fout({ versie: 2 }, /versie/);
  await fout('tekst', /ongeldig/);
  const groot = await roep(`${B}/onderzoeken/2/hr`, { methode: 'PUT', body: { instellingen: { benchmarks: [{ sleutel: 'enps', waarde: 1, omschrijving: 'x'.repeat(160_000) }] } } });
  assert.equal(groot.status, 413);
  const archief = await roep(`${B}/onderzoeken/3/hr`, { methode: 'PUT', body: { instellingen: { versie: 1 } } });
  assert.equal(archief.status, 409);
  assert.match(archief.data.fout, /gearchiveerd/);
  assert.equal((await roep(`${B}/onderzoeken/3/hr`)).status, 200, 'lezen mag wel');
});

// ---------- Personeelscijfers ----------

test('personeelscijfers: alleen groepscijfers, met "Bewaren tot"; terug te lezen zonder namen of nummers', async () => {
  const tot = hr.standaardBewarenTot(vandaag());
  const r = await roep(`${B}/onderzoeken/1/personeelscijfers`, { methode: 'POST', body: { aggregaat: AGGREGAAT, bewaren_tot: tot } });
  assert.equal(r.status, 201, r.tekst);
  assert.ok(r.data.id);
  s.personeel = r.data.id;
  const lijst = await roep(`${B}/onderzoeken/1/personeelscijfers`);
  assert.deepEqual(lijst.data.personeelscijfers.map((p) => [p.id, p.naam, p.periode_van, p.periode_tot, p.bewaren_tot, p.verlopen]),
    [[s.personeel, 'Personeelsbestand 2026', '2025-11', '2026-10', tot, false]]);
  assert.ok(!('inhoud' in lijst.data.personeelscijfers[0]), 'de lijst bevat geen cijfers');
  const detail = await roep(`${B}/personeelscijfers/${s.personeel}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.personeelscijfers.onderzoek_id, 1);
  assert.deepEqual(detail.data.personeelscijfers.inhoud, controleerPersoneelsaggregaat(AGGREGAAT));
  // Niets van de kolommen die niet mee mogen (criterium 4, op de server).
  const { rijen } = personeelsbestand();
  for (const rij of rijen) for (const i of [0, 1, 2]) assert.ok(!detail.tekst.includes(rij[i]), `"${rij[i]}" staat in het antwoord`);
  // De standaard is zes maanden na vandaag.
  assert.equal(hr.maandenLater('2026-08-31', 6), '2027-02-28');
  assert.equal(hr.standaardBewarenTot('2026-11-27'), '2027-05-27');
  // In de export (zoals gegevens.js hem krijgt) als object; HR-analytics rekent ermee.
  const op = await roep(`${B}/onderzoeken/1/hr`, { methode: 'PUT', body: { instellingen: { versie: 1, personeel: { id: s.personeel } } } });
  assert.equal(op.status, 200, op.tekst);
  const data = (await roep(`${B}/onderzoeken/1/export/data`)).data;
  assert.equal(typeof data.personeelscijfers[0].inhoud, 'object');
  assert.deepEqual(data.hr_instellingen, { versie: 1, personeel: { id: s.personeel } });
  const k = verzamelKerncijfers(data, gekozenPersoneel(data, data.hr_instellingen), data.hr_instellingen, { peildatum: '2026-11-27' });
  assert.equal(k.personeel.totaal.medewerkers, AGGREGAAT.totaal.medewerkers);
  assert.ok(k.personeel.totaal.verzuim_pct > 0);
  assert.equal(controleerKerncijfers(k), true);
});

test('personeelscijfers: de server weigert alles wat niet bij groepscijfers hoort (PR-16)', async () => {
  const tot = hr.standaardBewarenTot(vandaag());
  const fout = async (aggregaat, patroon, extra = {}) => {
    const r = await roep(`${B}/onderzoeken/2/personeelscijfers`, { methode: 'POST', body: { aggregaat, bewaren_tot: tot, ...extra } });
    assert.equal(r.status, 400, `${patroon}: ${r.tekst}`);
    if (patroon) assert.match(r.data.fout, patroon);
  };
  const kopie = () => structuredClone(AGGREGAAT);
  const dimA = (a) => a.dimensies.afdeling;
  await fout({ ...kopie(), rijen: [['Persoon', 34]] }, /onbekend veld: "rijen"/);
  await fout((() => { const a = kopie(); a.totaal.namen = ['Jan']; return a; })(), /onbekend veld: "namen"/);
  await fout((() => { const a = kopie(); dimA(a).groepen[0].personen = [1]; return a; })(), /onbekend veld/);
  await fout((() => { const a = kopie(); a.rollen.push('naam'); return a; })(), /onbekende kolommen/);
  await fout((() => { const a = kopie(); a.rollen.push('geboortedatum'); return a; })(), /onbekende kolommen/);
  await fout((() => { const a = kopie(); a.dimensies.bsn = { groepen: [] }; return a; })(), /onbekende indeling/);
  await fout((() => { const a = kopie(); a.peildatum = '2026-10-15'; return a; })(), /peildatum/);
  await fout((() => { const a = kopie(); a.periode = { van: '2020-01', tot: '2026-10' }; return a; })(), /36 maanden/);
  // Verzuim van een organisatie (of groep) met minder dan 10 medewerkers: de browser bewaart dat nooit, de server weigert het.
  await fout((() => {
    const a = aggregaatVan(9);
    assert.deepEqual(a.totaal.verzuim, { toonbaar: false, reden: 'klein' });
    a.totaal.verzuim = { toonbaar: true, dagen_fte: 10, beschikbaar_fte: 3000, beschikbaar: 3000, meldingen: 3, dagen: 10, n_hele_periode: 8, n_nulverzuim: 6 };
    return a;
  })(), /verzuim van de organisatie met minder dan 10 medewerkers/);
  // Verzuim niet aanvullend afgeschermd: alleen de groep van 9 verborgen (dan volgt die uit het totaal min de rest).
  await fout((() => {
    const kop = ['Afdeling', 'Verzuimdagen'];
    const rijen = [...Array.from({ length: 9 }, (_, i) => ['Klein', i]), ...Array.from({ length: 12 }, (_, i) => ['Midden', 2 + (i % 3)]), ...Array.from({ length: 30 }, (_, i) => ['Groot', i % 5])];
    const a = verwerkPersoneel(kop, rijen, { rollen: { 0: 'afdeling', 1: 'verzuimdagen' }, periode: PERIODE }).aggregaat;
    const midden = a.dimensies.afdeling.groepen.find((g) => g.label === 'Midden');
    assert.deepEqual(midden.verzuim, { toonbaar: false, reden: 'complementair' });
    midden.verzuim = { toonbaar: true, dagen_fte: 36, beschikbaar_fte: 4380, beschikbaar: 4380, meldingen: null, dagen: 36, n_hele_periode: 12, n_nulverzuim: 0 };
    return a;
  })(), /niet aanvullend afgeschermd/);
  // Een groep onder de 5 met alle cijfers.
  await fout((() => {
    const a = kopie();
    const g = dimA(a).groepen[0];
    const extraN = g.medewerkers - 3;
    Object.assign(g, { medewerkers: 3, verzuim: { toonbaar: false, reden: 'klein' } });
    dimA(a).groepen[1].medewerkers += extraN;
    return a;
  })(), /alleen de aantallen/);
  // De groepen tellen niet op tot de organisatie.
  await fout((() => { const a = kopie(); dimA(a).groepen[0].in_periode += 1; return a; })(), /tellen niet op/);
  // Meer 55-plussers dan medewerkers met een leeftijd.
  await fout((() => { const a = kopie(); a.totaal.n_55plus = a.totaal.leeftijd_n + 1; return a; })(), /leeftijden/);
  await fout((() => { const a = kopie(); a.totaal.uitstroom_reden.overig += 1; return a; })(), /redenen van vertrek/);
  await fout((() => { const a = kopie(); a.totaal.verzuim.dagen = a.totaal.verzuim.beschikbaar + 1; return a; })(), /meer verzuimdagen/);
  // Een tekst waar een getal hoort.
  await fout((() => { const a = kopie(); a.totaal.medewerkers = 'Jan Jansen'; return a; })(), /heel getal/);
  // Bewaren tot: verplicht, niet in het verleden, hooguit 3 jaar.
  for (const [b, p] of [[undefined, /verplicht/], ['2020-01-01', /vanaf vandaag/], ['2099-01-01', /hooguit 3 jaar/], ['morgen', /geldige datum/]]) {
    const r = await roep(`${B}/onderzoeken/2/personeelscijfers`, { methode: 'POST', body: { aggregaat: AGGREGAAT, bewaren_tot: b } });
    assert.equal(r.status, 400);
    assert.match(r.data.fout, p);
  }
  assert.equal((await roep(`${B}/onderzoeken/2/personeelscijfers`)).data.personeelscijfers.length, 0);
});

test('personeelscijfers: hooguit 5 per onderzoek; naam en "Bewaren tot" aanpassen; gearchiveerd → 409', async () => {
  const tot = hr.standaardBewarenTot(vandaag());
  for (let i = 0; i < 5; i++) {
    const r = await roep(`${B}/onderzoeken/2/personeelscijfers`, { methode: 'POST', body: { aggregaat: AGGREGAAT, bewaren_tot: tot, naam: `Bestand ${i + 1}` } });
    assert.equal(r.status, 201, r.tekst);
    s.twee = r.data.id;
  }
  const zesde = await roep(`${B}/onderzoeken/2/personeelscijfers`, { methode: 'POST', body: { aggregaat: AGGREGAAT, bewaren_tot: tot } });
  assert.equal(zesde.status, 409);
  assert.match(zesde.data.fout, /hooguit 5/);
  const w = await roep(`${B}/personeelscijfers/${s.twee}`, { methode: 'PUT', body: { naam: 'Personeelsbestand Q4', bewaren_tot: hr.maandenLater(vandaag(), 12) } });
  assert.equal(w.status, 200, w.tekst);
  const d = await roep(`${B}/personeelscijfers/${s.twee}`);
  assert.equal(d.data.personeelscijfers.naam, 'Personeelsbestand Q4');
  assert.equal(d.data.personeelscijfers.inhoud.naam, 'Personeelsbestand Q4');
  assert.equal(d.data.personeelscijfers.bewaren_tot, hr.maandenLater(vandaag(), 12));
  assert.equal((await roep(`${B}/personeelscijfers/${s.twee}`, { methode: 'PUT', body: { bewaren_tot: '2001-01-01' } })).status, 400);
  // Gearchiveerd: nieuw en aanpassen niet, lezen wel.
  assert.equal((await roep(`${B}/onderzoeken/3/personeelscijfers`, { methode: 'POST', body: { aggregaat: AGGREGAAT, bewaren_tot: tot } })).status, 409);
  assert.equal((await roep(`${B}/personeelscijfers/300`, { methode: 'PUT', body: { naam: 'x' } })).status, 409);
  assert.equal((await roep(`${B}/personeelscijfers/300`)).status, 200);
  assert.equal((await roep(`${B}/personeelscijfers/9999`)).status, 404);
});

test('personeelscijfers verwijderen: ook bij een gearchiveerd onderzoek; de verwijzing in de instellingen gaat mee', async () => {
  const weg = await roep(`${B}/personeelscijfers/300`, { methode: 'DELETE' });
  assert.equal(weg.status, 200, weg.tekst);
  assert.equal((await roep(`${B}/personeelscijfers/300`)).status, 404);
  assert.deepEqual((await roep(`${B}/onderzoeken/3/hr`)).data.instellingen, { versie: 1 });
  // Onderzoek 1: de instellingen wijzen naar het bestand; na verwijderen niet meer.
  assert.equal((await roep(`${B}/personeelscijfers/${s.personeel}`, { methode: 'DELETE' })).status, 200);
  const na = await roep(`${B}/onderzoeken/1/hr`);
  assert.deepEqual(na.data.instellingen, { versie: 1 });
  assert.deepEqual(na.data.personeelscijfers, []);
});

// ---------- Criterium 5: de heatmap is het dashboard ----------

test("thema's per groep uit de export zijn gelijk aan GET /dashboard?uitsplitsen= (ook de cijfercellen)", async () => {
  const data = (await roep(`${B}/onderzoeken/1/export/data`)).data;
  for (const lijstId of [1, 2]) {
    const k = verzamelKerncijfers(data, null, {}, { vragenlijstId: lijstId, peildatum: '2026-11-27' });
    assert.equal(k.groepen.length, 3);
    for (const g of k.groepen) {
      const dash = (await roep(`${B}/onderzoeken/1/dashboard?vragenlijst=${lijstId}&uitsplitsen=${g.vraag_id}`)).data;
      const u = dash.selectie.uitsplitsing;
      assert.deepEqual(g.kolommen.map((c) => [c.label, c.n]), u.groepen.map((x) => [x.label, x.verborgen ? null : x.n]));
      const themas = g.rijen.filter((r) => r.soort === 'thema');
      assert.deepEqual(themas.map((r) => r.cellen), themas.map((_, t) => u.groepen.map((x) => (x.verborgen ? null : x.themas[t].gemiddelde))));
      const cijfers = g.rijen.filter((r) => r.soort !== 'thema');
      assert.deepEqual(cijfers.map((r) => r.cellen), u.cijfervragen.map((c, i) => u.groepen.map((x) => (x.verborgen ? null : c.schaal_soort === 'nps' ? x.cijfers[i].enps : x.cijfers[i].gemiddelde))));
      // En het themagemiddelde van iedereen is dat van het dashboard.
      for (const t of k.scores.themas) assert.equal(t.gemiddelde, dash.selectie.themas.find((x) => x.thema_id === t.thema_id).gemiddelde);
    }
    assert.equal(controleerKerncijfers(k), true);
  }
});

test('een onderzoek verwijderen neemt de HR-instellingen en personeelscijfers mee', async () => {
  assert.equal((await roep(`${B}/onderzoeken/2/hr`, { methode: 'PUT', body: { instellingen: { versie: 1 } } })).status, 200);
  assert.equal((await roep(`${B}/onderzoeken/2/archiveren`, { methode: 'POST', body: {} })).status, 200);
  assert.equal((await roep(`${B}/onderzoeken/2`, { methode: 'DELETE', body: { bevestiging: 'Twee BV' } })).status, 200);
  const dir = join(map, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const db = new DatabaseSync(join(dir, readdirSync(dir).find((x) => x.endsWith('.sqlite') && x !== 'metadata.sqlite')), { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM personeelscijfers WHERE onderzoek_id = 2').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hr_instellingen WHERE onderzoek_id = 2').get().n, 0);
  db.close();
});

// ---------- Zuivere controles (zonder server) ----------

test('controleerHrInstellingen en controleerPersoneelsaggregaat: schone uitkomst, opnieuw opgebouwd', () => {
  assert.deepEqual(controleerHrInstellingen({}), { versie: 1 });
  assert.deepEqual(controleerHrInstellingen({ uitkomst: null, personeel: null }), { versie: 1 });
  const schoon = controleerPersoneelsaggregaat(AGGREGAAT);
  assert.deepEqual(schoon, JSON.parse(JSON.stringify(AGGREGAAT)), 'een goed aggregaat komt ongewijzigd terug');
  // Ook een klein bestand (organisatie onder de 5) en een zonder verzuimkolommen zijn geldig.
  const klein = verwerkPersoneel(['Afdeling'], [['A'], ['A'], ['B']], { rollen: { 0: 'afdeling' }, periode: PERIODE }).aggregaat;
  assert.deepEqual(controleerPersoneelsaggregaat(klein), klein);
  const groot = aggregaatVan(400);
  assert.deepEqual(controleerPersoneelsaggregaat(groot), JSON.parse(JSON.stringify(groot)));
  assert.ok(JSON.stringify(groot).length < 200_000);
});

// ---------- Aantal databaseopdrachten per route ----------

function testDatabase() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.exec(`INSERT INTO onderzoeken (id, bedrijfsnaam, titel, status, aangemaakt_op) VALUES (1, 'A', 'A', 'actief', '${NU}')`);
  const tel = { batches: 0, los: 0 };
  const opdracht = (sqlTekst, params = []) => ({
    sql: sqlTekst, params,
    bind: (...p) => opdracht(sqlTekst, p),
    async all() { tel.los++; return { results: db.prepare(sqlTekst).all(...params) }; },
    async first() { tel.los++; return db.prepare(sqlTekst).get(...params) ?? null; },
    async run() { tel.los++; db.prepare(sqlTekst).run(...params); return { meta: {} }; },
  });
  const DB = {
    prepare: (sqlTekst) => opdracht(sqlTekst),
    async batch(lijst) {
      tel.batches++;
      return lijst.map((o) => ({ results: /^\s*(SELECT|WITH)/i.test(o.sql) ? db.prepare(o.sql).all(...o.params) : (db.prepare(o.sql).run(...o.params), []) }));
    },
  };
  return { env: { DB }, tel };
}
const verzoek = (methode, body) => new Request('http://x/api', { method: methode, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

test('rekentijd: elke route doet hooguit één batch, of hooguit twee losse opdrachten', async () => {
  const { env, tel } = testDatabase();
  const meet = async (fn) => {
    tel.batches = 0;
    tel.los = 0;
    const r = await fn();
    assert.ok(r.status < 300, `status ${r.status}: ${await r.clone().text()}`);
    assert.ok(tel.batches + tel.los <= 2 && tel.batches <= 1, `batches ${tel.batches}, losse opdrachten ${tel.los}`);
    return r.json();
  };
  await meet(() => hr.wijzig({ env, params: { id: '1' }, request: verzoek('PUT', { instellingen: { versie: 1, signalen: [{ sleutel: 'v:1', ongunstig: [1], grens: 20 }] } }) }));
  await meet(() => hr.lees({ env, params: { id: '1' } }));
  const n = await meet(() => hr.personeelNieuw({ env, params: { id: '1' }, request: verzoek('POST', { aggregaat: AGGREGAAT, bewaren_tot: hr.standaardBewarenTot(vandaag()) }) }));
  await meet(() => hr.personeelLijst({ env, params: { id: '1' } }));
  await meet(() => hr.personeelDetail({ env, params: { id: String(n.id) } }));
  await meet(() => hr.personeelWijzig({ env, params: { id: String(n.id) }, request: verzoek('PUT', { naam: 'Nieuw' }) }));
  await meet(() => hr.personeelVerwijder({ env, params: { id: String(n.id) } }));
});

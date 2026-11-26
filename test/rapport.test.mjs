// Tests voor de rapportgenerator: de rekenkern (feiten met vaste regels) en de opslag op de server.
// Eigen testserver op poort 8796.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  standaardInhoud, verzamelFeiten, sectieFeiten, rapportNaarBlokken, blokkenVoorWord, blokkenNaarTekst,
  tekstNaarBlokken, genummerdeSecties, nogInTeVullen, hoofdLijst, nlDatum, SECTIESOORTEN,
} from '../public/js/beheer/rapport-feiten.js';

const POORT = 8796;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-tests';
let server;
let map;
let cookie = '';

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-rapport-'));
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
const B = '/api/beheer';
const s = {};

// Vaste "willekeur", zodat de test elke keer dezelfde antwoorden geeft.
let zaad = 12345;
const rnd = () => { zaad = (zaad * 1664525 + 1013904223) % 4294967296; return zaad / 4294967296; };

async function vulIn(code, aantal, basisScore) {
  const pub = (await roep(`/api/publiek/${code}`, { koekje: '' })).data;
  const vragen = pub.themas.flatMap((t) => t.vragen);
  for (let i = 0; i < aantal; i++) {
    const a = {};
    for (const q of vragen) {
      if (q.type === 'schaal') a[q.id] = Math.max(1, Math.min(5, Math.round(basisScore + (rnd() - 0.5) * 2.4)));
      if (q.type === 'janee') a[q.id] = rnd() < 0.6 ? 'ja' : 'nee';
      if (q.type === 'meerkeuze') a[q.id] = q.opties[Math.floor(rnd() * q.opties.length)].id;
      if (q.type === 'open' && i < 6) a[q.id] = `Open antwoord nummer ${i}`;
    }
    assert.equal((await roep(`/api/publiek/${code}`, { methode: 'POST', body: { antwoorden: a }, koekje: '' })).status, 200);
  }
}

async function haalFeiten(onderzoekId, peildatum = '2026-11-26') {
  const data = (await roep(`${B}/onderzoeken/${onderzoekId}/export/data`)).data;
  const dashboards = [];
  for (const l of data.vragenlijsten) dashboards.push((await roep(`${B}/onderzoeken/${onderzoekId}/dashboard?vragenlijst=${l.id}`)).data);
  return { feiten: verzamelFeiten({ data, dashboards, peildatum }), dashboards, data };
}

test('voorbereiding: onderzoek met nulmeting (12), vervolgmeting (14) en een kleine lijst (3)', async () => {
  const li = await fetch(`${BASIS}/api/inloggen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wachtwoord: WACHTWOORD }) });
  cookie = li.headers.get('set-cookie').split(';')[0];
  const n = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Rapportbedrijf B.V.', titel: 'MTO 2026', onderzoeksvraag: 'Hoe tevreden zijn medewerkers?', sjablonen: ['medewerkerstevredenheid'] } });
  s.onderzoek = n.data.id;
  const detail = (await roep(`${B}/onderzoeken/${s.onderzoek}`)).data;
  s.themas = detail.themas;
  const vl = (await roep(`${B}/onderzoeken/${s.onderzoek}/vragenlijsten`)).data.vragenlijsten[0];
  s.vl1 = vl.id;
  await roep(`${B}/vragenlijsten/${vl.id}`, { methode: 'PUT', body: { titel: vl.titel, meetmoment_id: vl.meetmoment_id, aantal_uitgenodigd: 20, status: 'open' } });
  await vulIn(vl.code, 12, 2.8);
  // Vervolgmeting: nieuw meetmoment + kopie van de vragenlijst
  const mm = await roep(`${B}/onderzoeken/${s.onderzoek}/meetmomenten`, { methode: 'POST', body: { naam: 'Vervolgmeting', datum: '2027-03-01' } });
  const kopie = await roep(`${B}/vragenlijsten/${vl.id}/kopie`, { methode: 'POST', body: { titel: 'Vervolg', meetmoment_id: mm.data.id } });
  s.vl2 = kopie.data.id;
  await roep(`${B}/vragenlijsten/${s.vl2}/status`, { methode: 'POST', body: { status: 'open' } });
  const code2 = (await roep(`${B}/vragenlijsten/${s.vl2}`)).data.vragenlijst.code;
  await vulIn(code2, 14, 3.9);
  // Kleine lijst met 3 antwoorden: mag niet in het rapport
  const klein = await roep(`${B}/onderzoeken/${s.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Kleine peiling' } });
  s.vl3 = klein.data.id;
  const q = await roep(`${B}/vragenlijsten/${s.vl3}/vragen`, { methode: 'POST', body: { type: 'schaal', thema_id: s.themas[0].id, tekst: 'Geheime kleine vraag' } });
  await roep(`${B}/vragenlijsten/${s.vl3}/status`, { methode: 'POST', body: { status: 'open' } });
  const code3 = (await roep(`${B}/vragenlijsten/${s.vl3}`)).data.vragenlijst.code;
  for (let i = 0; i < 3; i++) await roep(`/api/publiek/${code3}`, { methode: 'POST', body: { antwoorden: { [q.data.id]: 1 } }, koekje: '' });
  await roep(`${B}/onderzoeken/${s.onderzoek}/acties`, { methode: 'POST', body: { titel: 'Werkdruk bespreken in teamoverleg', status: 'te_doen', datum: '2027-01-15' } });
  await roep(`${B}/onderzoeken/${s.onderzoek}/acties`, { methode: 'POST', body: { titel: 'Resultaten delen met OR', status: 'klaar' } });
  await roep(`${B}/onderzoeken/${s.onderzoek}/invoer`, { methode: 'POST', body: { soort: 'cijfer', thema_id: s.themas[1].id, titel: 'Verzuim', datum: '2026-10-01', waarde: 6.4, eenheid: '%' } });
  await roep(`${B}/onderzoeken/${s.onderzoek}/invoer`, { methode: 'POST', body: { soort: 'interview', thema_id: s.themas[0].id, titel: 'Gesprek teamleider', datum: '2026-10-05', inhoud: 'Vertrouwelijke gespreksnotitie' } });
});

test('feiten: cijfers komen overeen met het dashboard en kleine aantallen blijven weg', async () => {
  const { feiten, dashboards } = await haalFeiten(s.onderzoek);
  s.feiten = feiten;
  assert.equal(feiten.peildatum, '2026-11-26');
  assert.equal(feiten.onderzoek.onderzoeksvraag, 'Hoe tevreden zijn medewerkers?');
  assert.equal(feiten.lijsten.length, 3);
  const [l1, l2, l3] = feiten.lijsten;
  assert.equal(l1.n, 12);
  assert.equal(l1.aantal_uitgenodigd, 20);
  assert.equal(Math.round(l1.percentage), 60);
  assert.equal(l2.n, 14);
  // Gemiddelden per thema zijn dezelfde getallen als op het dashboard.
  const d1 = dashboards[0].selectie;
  assert.deepEqual(l1.themas.map((t) => t.gemiddelde), d1.themas.map((t) => t.gemiddelde));
  assert.deepEqual(l1.themas.map((t) => t.naam), d1.themas.map((t) => t.naam));
  // De kleine lijst (3 respondenten): geen enkele uitkomst.
  assert.equal(l3.verborgen, true);
  assert.deepEqual(l3.themas, []);
  assert.ok(l3.vragen.every((q) => q.verborgen && q.verdeling.length === 0 && q.gemiddelde === undefined));
  assert.deepEqual(l3.open, []);
  // Tekst van interviews zit niet in de feiten, alleen het aantal.
  assert.doesNotMatch(JSON.stringify(feiten), /Vertrouwelijke gespreksnotitie/);
  assert.equal(feiten.invoer.interview, 1);
  // Toetsen: per thema nulmeting tegen vervolgmeting; duidelijk hogere scores, dus significant.
  assert.ok(feiten.toetsen.length >= 5);
  for (const t of feiten.toetsen) {
    assert.equal(t.van.n, 12);
    assert.equal(t.naar.n, 14);
    assert.ok(t.verschil > 0.5, `${t.thema_naam}: verschil ${t.verschil}`);
    assert.ok(t.p < 0.05);
    assert.ok(['middelgroot', 'groot'].includes(t.effect));
  }
});

test('feitenblokken: vaste zinnen en tabellen, zonder verzonnen inhoud', () => {
  const inhoud = standaardInhoud('eind');
  const f = s.feiten;
  const per = Object.fromEntries(inhoud.secties.map((sec) => [sec.soort, sectieFeiten(sec, f, inhoud)]));
  // Hoofdstukken zonder feiten blijven leeg: daar schrijft de onderzoeker zelf.
  assert.deepEqual(per.samenvatting, []);
  assert.deepEqual(per.conclusies, []);
  // Aanleiding: de onderzoeksvraag letterlijk als citaat
  assert.deepEqual(per.aanleiding.find((b) => b.soort === 'citaat'), { soort: 'citaat', tekst: 'Hoe tevreden zijn medewerkers?' });
  // Aanpak: tabel met respons; de kleine lijst zonder aantal
  const responsTabel = per.aanpak.find((b) => b.soort === 'tabel');
  assert.deepEqual(responsTabel.kop, ['Vragenlijst', 'Meetmoment', 'Vragen', 'Uitgenodigd', 'Ingevuld', 'Respons']);
  assert.deepEqual(responsTabel.rijen[0].slice(3), [20, 12, '60%']);
  assert.equal(responsTabel.rijen[2][4], 'minder dan 5');
  assert.match(per.aanpak.map((b) => b.tekst || '').join(' '), /geen naam, e-mailadres of IP-adres opgeslagen/);
  // Resultaten gaan standaard over de laatste lijst met zichtbare antwoorden (de vervolgmeting)
  assert.equal(hoofdLijst(f, inhoud).id, s.vl2);
  assert.match(per.resultaten[0].tekst, /is 14 keer ingevuld/);
  const themaTabel = per.resultaten.find((b) => b.soort === 'tabel');
  assert.equal(themaTabel.rijen.length, f.lijsten[1].themas.length);
  assert.match(themaTabel.rijen[0][1], /^\d,\d$/);
  assert.ok(per.resultaten.some((b) => b.soort === 'alinea' && /^Het hoogste gemiddelde heeft het thema /.test(b.tekst)));
  // Geen oordelende woorden in de automatische zinnen (teksten uit het onderzoek zelf, tussen aanhalingstekens
  // of vetgedrukt, tellen niet mee: dat zijn de eigen vragen en thema's van de onderzoeker).
  const zinnen = Object.values(per).flat()
    .flatMap((b) => (b.soort === 'alinea' ? [b.tekst] : b.soort === 'lijst' && b.items[0].startsWith('**') ? b.items : []))
    .map((t) => t.replace(/"[^"]*"/g, '').replace(/\*\*[^*]*\*\*/g, '').replace(/thema [A-Z][^(]*\(/g, 'thema ('));
  assert.ok(zinnen.length > 15);
  assert.doesNotMatch(zinnen.join(' '), /\b(goed|goede|slecht|zorgelijk|uitstekend|helaas|gelukkig|opvallend|aanbevolen|moet|moeten|positief|negatief)\b/i);
  // Verloop: tabel met beide meetmomenten en per thema een toetszin
  const verloopTabel = per.verloop.find((b) => b.soort === 'tabel');
  assert.equal(verloopTabel.kop.length, 4);
  const toetsen = per.verloop.find((b) => b.soort === 'lijst');
  assert.equal(toetsen.items.length, f.toetsen.length);
  assert.match(toetsen.items[0], /statistisch significant \(p [<=] 0,\d+\)/);
  assert.match(toetsen.items[0], /Hedges' g = \d,\d\d/);
  // Aanbevelingen: de actielijst, niets erbij bedacht
  const acties = per.aanbevelingen.find((b) => b.soort === 'tabel').rijen;
  assert.equal(acties.length, f.acties.length);
  assert.deepEqual(acties.slice(-2), [['Werkdruk bespreken in teamoverleg', 'Te doen', '15 januari 2027'], ['Resultaten delen met OR', 'Klaar', '–']]);
  // Bijlage open antwoorden: alleen vragen met minstens 5 antwoorden
  assert.ok(per['bijlage-open'].filter((b) => b.soort === 'lijst').every((b) => b.items.length >= 5));
  // Kiest de onderzoeker de kleine lijst, dan komen er geen cijfers
  const klein = sectieFeiten(inhoud.secties.find((x) => x.soort === 'resultaten'), f, { ...inhoud, lijst: s.vl3 });
  assert.equal(klein.length, 1);
  assert.match(klein[0].tekst, /minder dan 5 personen ingevuld/);
  // Beknopt (tussenrapport): alleen de thema's
  const tussen = standaardInhoud('tussen');
  const beknopt = sectieFeiten(tussen.secties.find((x) => x.soort === 'resultaten'), f, tussen);
  assert.equal(beknopt.filter((b) => b.soort === 'tabel').length, 1);
});

test('dezelfde gegevens geven altijd precies hetzelfde rapport', async () => {
  const { feiten } = await haalFeiten(s.onderzoek);
  const inhoud = standaardInhoud('eind');
  const zonderOpen = (f) => JSON.stringify(rapportNaarBlokken({ titel: 'T', soort: 'eind', inhoud, feiten: f }).filter((b) => !(b.soort === 'feiten' && JSON.stringify(b).includes('willekeurige volgorde'))));
  assert.equal(zonderOpen(feiten), zonderOpen(s.feiten));
});

test('eigen tekst: opmaak naar blokken, nummering en "nog in te vullen"', () => {
  const blokken = tekstNaarBlokken('Eerste alinea\nmet twee regels.\n\n## Tussenkop\n- punt één\n- punt **twee**\n\n1. eerst\n2. dan\n\n> Een citaat');
  assert.deepEqual(blokken.map((b) => b.soort), ['alinea', 'kop', 'lijst', 'lijst', 'citaat']);
  assert.equal(blokken[0].tekst, 'Eerste alinea\nmet twee regels.');
  assert.equal(blokken[3].genummerd, true);
  assert.deepEqual(tekstNaarBlokken('   \n\n'), []);

  const inhoud = standaardInhoud('eind');
  assert.equal(inhoud.secties.find((x) => x.soort === 'bijlage-open').aan, false, 'open antwoorden staan standaard uit');
  assert.deepEqual(genummerdeSecties(inhoud).map((x) => x.nummer), ['1', '2', '3', '4', '5', '6', '7', '8', 'A']);
  assert.equal(nogInTeVullen(inhoud).length, 8);
  inhoud.secties.find((x) => x.soort === 'conclusies').tekst = 'De werkdruk is **het** aandachtspunt.';
  assert.equal(nogInTeVullen(inhoud).includes('Conclusies'), false);

  const alles = rapportNaarBlokken({ titel: 'Eindrapport MTO', soort: 'eind', inhoud: { ...inhoud, opsteller: 'A. Adviseur', datum: '2026-12-01' }, feiten: s.feiten }, { markeerLeeg: true });
  assert.equal(alles[0].soort, 'titel');
  assert.deepEqual(alles[1].rijen.map((r) => r[0]), ['Organisatie', 'Opgesteld door', 'Datum', 'Peildatum van de cijfers']);
  assert.equal(alles[1].rijen[2][1], '1 december 2026');
  const koppen = alles.filter((b) => b.soort === 'kop' && b.niveau === 1).map((b) => b.tekst);
  assert.deepEqual(koppen.slice(0, 2), ['1. Samenvatting', '2. Aanleiding en onderzoeksvraag']);
  assert.equal(koppen[koppen.length - 1], 'Bijlage A: de vragenlijst');
  // Eigen tekst en feiten blijven gescheiden blokken
  const iConclusies = alles.findIndex((b) => b.soort === 'kop' && b.tekst === '7. Conclusies');
  assert.deepEqual(alles[iConclusies + 1], { soort: 'alinea', tekst: 'De werkdruk is **het** aandachtspunt.' });
  assert.ok(alles.some((b) => b.soort === 'leeg'));
  assert.ok(alles.filter((b) => b.soort === 'feiten').every((b) => /peildatum 26 november 2026/.test(b.bron)));
  // Voor Word: alleen soorten die maakDocx kent
  const word = blokkenVoorWord(rapportNaarBlokken({ titel: 'T', soort: 'eind', inhoud, feiten: s.feiten }));
  assert.ok(word.every((b) => ['kop', 'alinea', 'lijst', 'citaat', 'tabel', 'paginaeinde'].includes(b.soort)));
  assert.ok(word.filter((b) => b.soort === 'tabel').every((b) => b.rijen.every((r) => r.length === b.kop.length)));
  // Als tekst
  const tekst = blokkenNaarTekst(alles);
  assert.match(tekst, /^# Eindrapport MTO\n/);
  assert.match(tekst, /## 7\. Conclusies\n\nDe werkdruk is \*\*het\*\* aandachtspunt\./);
  assert.equal(nlDatum('2026-03-05'), '5 maart 2026');
  assert.ok(Object.values(SECTIESOORTEN).every((x) => x.titel && Array.isArray(x.hulp) && x.hulp.length));
});

test('rapport opslaan: aanmaken, tekst bewaren, feiten vastleggen en conflicten', async () => {
  const pad = `${B}/onderzoeken/${s.onderzoek}/rapporten`;
  assert.equal((await roep(pad, { koekje: '' })).status, 401);
  assert.equal((await roep(pad, { methode: 'POST', body: { soort: 'jaar', titel: 'x', inhoud: standaardInhoud('eind') } })).status, 400);
  assert.equal((await roep(pad, { methode: 'POST', body: { soort: 'eind', titel: '', inhoud: standaardInhoud('eind') } })).status, 400);
  assert.equal((await roep(pad, { methode: 'POST', body: { soort: 'eind', titel: 'x', inhoud: { secties: 'nee' } } })).status, 400);
  const dubbel = standaardInhoud('eind');
  dubbel.secties[1].id = dubbel.secties[0].id;
  assert.equal((await roep(pad, { methode: 'POST', body: { soort: 'eind', titel: 'x', inhoud: dubbel } })).status, 400);

  const inhoud = standaardInhoud('eind');
  const r = await roep(pad, { methode: 'POST', body: { soort: 'eind', titel: 'Eindrapport MTO 2026', inhoud } });
  assert.equal(r.status, 201);
  s.rapport = r.data.id;
  let d = (await roep(`${B}/rapporten/${s.rapport}`)).data.rapport;
  assert.equal(d.feiten, null);
  assert.equal(d.inhoud.secties.length, 10);

  // Eigen tekst bewaren (met een vreemd veld dat wordt weggelaten)
  inhoud.secties[6].tekst = 'Mijn eigen conclusie.\n\n- punt';
  inhoud.secties[0].extra = '<script>';
  inhoud.lijst = s.vl2;
  const put = await roep(`${B}/rapporten/${s.rapport}`, { methode: 'PUT', body: { titel: 'Eindrapport MTO 2026', inhoud, bijgewerkt_op: d.bijgewerkt_op } });
  assert.equal(put.status, 200);
  // Verouderde versie: conflict; met overschrijven lukt het
  const oud = await roep(`${B}/rapporten/${s.rapport}`, { methode: 'PUT', body: { titel: 'Anders', inhoud, bijgewerkt_op: d.bijgewerkt_op } });
  assert.equal(oud.status, 409);
  assert.equal(oud.data.conflict, true);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}`, { methode: 'PUT', body: { titel: 'Eindrapport MTO 2026', inhoud, overschrijven: true } })).status, 200);
  // Te lange tekst en vragenlijst van een ander onderzoek
  const lang = structuredClone(inhoud);
  lang.secties[0].tekst = 'x'.repeat(60001);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}`, { methode: 'PUT', body: { inhoud: lang } })).status, 400);

  // Feiten vastleggen; de eigen tekst blijft staan
  assert.equal((await roep(`${B}/rapporten/${s.rapport}/feiten`, { methode: 'PUT', body: { feiten: 'tekst' } })).status, 400);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}/feiten`, { methode: 'PUT', body: { feiten: { peildatum: 'gisteren' } } })).status, 400);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}/feiten`, { methode: 'PUT', body: { feiten: s.feiten } })).status, 200);
  d = (await roep(`${B}/rapporten/${s.rapport}`)).data.rapport;
  assert.equal(d.inhoud.secties[6].tekst, 'Mijn eigen conclusie.\n\n- punt');
  assert.equal(d.inhoud.secties[0].extra, undefined);
  assert.equal(d.inhoud.lijst, s.vl2);
  assert.equal(d.feiten.peildatum, '2026-11-26');
  assert.deepEqual(d.feiten.lijsten.map((l) => l.n), [12, 14, 3]);
  const lijst = (await roep(pad)).data.rapporten;
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0].peildatum, '2026-11-26');
  // In de volledige export staat het rapport (de eigen tekst)
  const exp = (await roep(`${B}/onderzoeken/${s.onderzoek}/export/data`)).data;
  assert.equal(exp.rapporten.length, 1);
  assert.match(exp.rapporten[0].inhoud, /Mijn eigen conclusie/);
});

test('rapport delen via een deellink: alleen-lezen en zonder open antwoorden', async () => {
  const stukken = (await roep(`${B}/onderzoeken/${s.onderzoek}/stukken`)).data.stukken;
  const fout = await roep(`${B}/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'X', onderdelen: { dashboard: false, rapporten: [99999] } } });
  assert.equal(fout.status, 400);
  const r = await roep(`${B}/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'Directie', onderdelen: { dashboard: false, rapporten: [s.rapport] } } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.deellink.onderdelen, { dashboard: false, open_antwoorden: false, stukken: [], rapporten: [s.rapport] });
  const code = r.data.deellink.code;
  const toegang = await fetch(`${BASIS}/api/kijk/${code}/toegang`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toegangscode: r.data.toegangscode }) });
  const kijk = toegang.headers.get('set-cookie').split(';')[0];
  assert.equal((await roep(`/api/kijk/${code}/rapporten/${s.rapport}`, { koekje: '' })).status, 401);
  const ov = (await roep(`/api/kijk/${code}/overzicht`, { koekje: kijk })).data;
  assert.deepEqual(ov.rapporten.map((x) => x.id), [s.rapport]);
  assert.deepEqual(ov.onderdelen, { dashboard: false, open_antwoorden: false });
  // Het dashboard is niet gedeeld, een stuk ook niet
  assert.equal((await roep(`/api/kijk/${code}/dashboard`, { koekje: kijk })).status, 403);
  assert.equal((await roep(`/api/kijk/${code}/stukken/${stukken[0].id}`, { koekje: kijk })).status, 404);
  const rap = await roep(`/api/kijk/${code}/rapporten/${s.rapport}`, { koekje: kijk });
  assert.equal(rap.status, 200);
  assert.equal(rap.data.rapport.titel, 'Eindrapport MTO 2026');
  // De bijlage met open antwoorden staat uit: de antwoorden gaan dan ook niet mee naar de kijker
  assert.doesNotMatch(JSON.stringify(rap.data), /Open antwoord nummer/);
  assert.ok(rap.data.rapport.inhoud.secties.every((x) => x.soort !== 'bijlage-open'));
  assert.match(JSON.stringify(rap.data), /Mijn eigen conclusie/);
  // Kijker kan het rapport niet wijzigen
  assert.equal((await roep(`${B}/rapporten/${s.rapport}`, { methode: 'PUT', body: { titel: 'gehackt' }, koekje: kijk })).status, 401);
  // Intrekken kan altijd, ook als het gedeelde rapport is verwijderd
  s.link = r.data.deellink;
});

test('archiveren maakt het rapport alleen-lezen; verwijderen ruimt op', async () => {
  const tweede = await roep(`${B}/onderzoeken/${s.onderzoek}/rapporten`, { methode: 'POST', body: { soort: 'tussen', titel: 'Tussenrapport', inhoud: standaardInhoud('tussen') } });
  assert.equal(tweede.status, 201);
  assert.equal((await roep(`${B}/rapporten/${tweede.data.id}`, { methode: 'DELETE' })).status, 200);
  assert.equal((await roep(`${B}/rapporten/${tweede.data.id}`)).status, 404);
  await roep(`${B}/onderzoeken/${s.onderzoek}/archiveren`, { methode: 'POST', body: {} });
  assert.equal((await roep(`${B}/rapporten/${s.rapport}`, { methode: 'PUT', body: { titel: 'Nieuw' } })).status, 409);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}/feiten`, { methode: 'PUT', body: { feiten: s.feiten } })).status, 409);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}`, { methode: 'DELETE' })).status, 409);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}`)).status, 200);
  // Intrekken van de deellink kan ook na archiveren
  assert.equal((await roep(`${B}/deellinks/${s.link.id}`, { methode: 'PUT', body: { naam: 'Directie', onderdelen: { dashboard: false, rapporten: [] }, ingetrokken: true } })).status, 200);
  assert.equal((await roep(`${B}/onderzoeken/${s.onderzoek}`, { methode: 'DELETE', body: { bevestiging: 'Rapportbedrijf B.V.' } })).status, 200);
  assert.equal((await roep(`${B}/rapporten/${s.rapport}`)).status, 404);
});

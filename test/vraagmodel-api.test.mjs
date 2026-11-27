// Eind-tot-eindtests voor pakket P2 (cijfervraag en achtergrondkenmerk) via een echte lokale testserver (poort 8791).
// - criterium 2: openbaar insturen: 0 en 10 bij 0–10 goed; 11, −1 en 5,5 geweigerd; 0 bij 1–10 geweigerd; weet niet
//   alleen als het aan staat;
// - criterium 3: de cijferschaal veranderen na antwoorden geeft 409;
// - criterium 4: de openbare vragenlijst bevat nooit het kenmerk (de controle van api.test.mjs, uitgebreid);
// - criterium 5: kenmerk alleen bij meerkeuze met één antwoord en ja/nee, dubbel geeft 409, kenmerkvragen maakt het
//   thema Achtergrond één keer, kopie en als-sjabloon houden het kenmerk;
// - criterium 6: na migratie 0017 leest elk ongewijzigd standaardsjabloon "gewijzigd: false" (een aangepast blijft
//   staan); toepassen van medewerkerstevredenheid geeft de kenmerken en de cijfervragen;
// - en: dashboard (themagemiddelde zonder cijfers, eNPS, uitsplitsing), meelezer, export/data en inlezen.
// Uitvoeren: node --test test/vraagmodel-api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INGEBOUWD } from '../src/lib/sjablonen-beheer.js';
import { KENMERK_TOELICHTING } from '../public/js/beheer/kenmerken.js';

const POORT = 8791;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-vraagmodel';
const B = '/api/beheer';
const NU = '2026-11-27T10:00:00.000Z';
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
const MIGRATIE_0017 = fileURLToPath(new URL('../migrations/0017_sjablonen_kenmerken.sql', import.meta.url));
let server;
let map;
let cookie = '';

const q = (t) => `'${String(t).replace(/'/g, "''")}'`;

/** Alle tekstwaarden ('…') uit één SQL-opdracht, in volgorde. */
const sqlTeksten = (opdracht) => [...opdracht.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));

/**
 * Standaardsjablonen zoals ze in een bestaande database staan: de inhoud die migratie 0010 erin zette (de versie van
 * vóór dit pakket). hr-processen heeft de onderzoeker zelf aangepast; dat sjabloon moet blijven zoals het is.
 */
function oudeSjablonen() {
  const oud = new Map(readFileSync(new URL('../migrations/0010_sjablonen_bijwerken.sql', import.meta.url), 'utf8').split('\n')
    .filter((r) => r.startsWith('UPDATE')).map((r) => {
      const [inhoud, bron] = sqlTeksten(r);
      return [bron, inhoud];
    }));
  const regels = [];
  INGEBOUWD.forEach((s, i) => {
    let inhoud = oud.get(s.id);
    if (s.id === 'hr-processen') {
      const x = JSON.parse(inhoud);
      x.vragenlijst.titel = 'Onze eigen HR-peiling';
      inhoud = JSON.stringify(x);
    }
    regels.push(`INSERT INTO sjablonen (id, naam, omschrijving, inhoud, aangemaakt_op, bron) VALUES (${800 + i}, ${q(String(s.naam).trim())}, ${q(String(s.omschrijving || '').trim())}, ${q(inhoud)}, '${NU}', ${q(s.id)});`);
  });
  regels.push(`INSERT INTO instellingen (sleutel, waarde) VALUES ('sjablonen_geplaatst', ${q(JSON.stringify(INGEBOUWD.map((s) => s.id)))});`);
  return regels.join('\n');
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-vraagmodel-'));
  // Alle migraties (0017 werkt dan nog op een lege tabel), dan de sjablonen zoals ze live staan, dan 0017 nog eens
  // precies zoals Wrangler hem uitvoert: zo zien we wat 0017 met een bestaande database doet.
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], { stdio: 'ignore', env: WRANGLER_ENV });
  const zaad = join(map, 'sjablonen-oud.sql');
  writeFileSync(zaad, oudeSjablonen());
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', zaad], { stdio: 'ignore', env: WRANGLER_ENV });
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', map, '--file', MIGRATIE_0017], { stdio: 'ignore', env: WRANGLER_ENV });
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

async function roep(pad, { methode = 'GET', body, koekje = cookie } = {}) {
  const r = await fetch(BASIS + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(koekje ? { Cookie: koekje } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let data = null;
  try { data = JSON.parse(tekst); } catch { /* geen json */ }
  return { status: r.status, data, tekst, koppen: r.headers };
}

const s = {};
const nieuweVraag = (body) => roep(`${B}/vragenlijsten/${s.lijst}/vragen`, { methode: 'POST', body: { thema_id: s.werk, ...body } });
const stuur = (code, antwoorden) => roep(`/api/publiek/${code}`, { methode: 'POST', body: { antwoorden }, koekje: '' });

// ---------- Criterium 6: sjablonen na migratie 0017 ----------

test('criterium 6: na 0017 leest elk ongewijzigd standaardsjabloon "gewijzigd: false"; een eigen aanpassing blijft staan', async () => {
  const r = await roep(`${B}/sjablonen`);
  assert.equal(r.status, 200);
  const standaard = r.data.sjablonen.filter((x) => x.standaard);
  assert.equal(standaard.length, INGEBOUWD.length, 'er zijn geen standaardsjablonen dubbel geplaatst');
  assert.deepEqual(r.data.ontbrekend, []);
  for (const x of standaard) assert.equal(x.gewijzigd, x.bron === 'hr-processen', x.bron);
  const mto = await roep(`${B}/sjablonen/medewerkerstevredenheid`);
  assert.equal(mto.data.gewijzigd, false);
  const cijfers = mto.data.inhoud.vragen.filter((v) => v.type === 'cijfer');
  assert.deepEqual(cijfers.map((v) => v.schaal_soort), ['rapport', 'nps']);
  assert.deepEqual(mto.data.inhoud.vragen.filter((v) => v.kenmerk).map((v) => v.kenmerk), ['afdeling', 'diensttijd']);
  const hr = await roep(`${B}/sjablonen/hr-processen`);
  assert.equal(hr.data.inhoud.vragenlijst.titel, 'Onze eigen HR-peiling', 'aangepast sjabloon niet overschreven');
  assert.ok(!hr.data.inhoud.vragen.some((v) => v.kenmerk), 'het aangepaste sjabloon heeft nog de oude inhoud');
  // Terugzetten naar het origineel geeft de nieuwe versie.
  assert.equal((await roep(`${B}/sjablonen/hr-processen/origineel`, { methode: 'POST', body: {} })).status, 200);
  assert.equal((await roep(`${B}/sjablonen/hr-processen`)).data.gewijzigd, false);
});

test('instellingen: vraagtype cijfer, cijferschalen, kenmerken en de bibliotheek met achtergrondvragen', async () => {
  const r = await roep(`${B}/instellingen`);
  assert.equal(r.data.vraagtypen.cijfer, 'Cijfer (0–10 of 1–10)');
  assert.deepEqual(Object.keys(r.data.vraagtypen), ['schaal', 'meerkeuze', 'janee', 'cijfer', 'open']);
  assert.deepEqual([r.data.cijferschalen.nps.min, r.data.cijferschalen.rapport.min], [0, 1]);
  assert.equal(r.data.kenmerken.leeftijd.naam, 'Leeftijd');
  assert.equal(r.data.kenmerkvragen.leeftijd.varianten.fijn.length, 6);
});

// ---------- Opzet ----------

test('voorbereiding: onderzoek met een vragenlijst, een cijfervraag 0–10, een rapportcijfer en een achtergrondvraag', async () => {
  const o = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Cijferbedrijf B.V.', titel: 'Peiling' } });
  assert.equal(o.status, 201, o.tekst);
  s.onderzoek = o.data.id;
  s.werk = (await roep(`${B}/onderzoeken/${s.onderzoek}/themas`, { methode: 'POST', body: { naam: 'Werk' } })).data.id;
  s.lijst = (await roep(`${B}/onderzoeken/${s.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Peiling 2026' } })).data.id;
  const maak = async (body) => {
    const r = await nieuweVraag(body);
    assert.equal(r.status, 201, `${body.tekst}: ${r.tekst}`);
    return r.data.id;
  };
  s.schaal = await maak({ type: 'schaal', tekst: 'Ik werk hier graag.' });
  s.nps = await maak({ type: 'cijfer', schaal_soort: 'nps', tekst: 'Hoe waarschijnlijk is het dat je ons aanbeveelt?' });
  s.rapport = await maak({ type: 'cijfer', tekst: 'Welk rapportcijfer geef je je werk?', weet_niet: true });
  s.afdeling = await maak({ type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['Kantoor', 'Productie'], uitsplitsen: true, kenmerk: 'afdeling' });
  const det = (await roep(`${B}/vragenlijsten/${s.lijst}`)).data;
  const per = new Map(det.vragen.map((v) => [v.id, v]));
  assert.deepEqual([per.get(s.nps).type, per.get(s.nps).schaal_soort], ['cijfer', 'nps']);
  assert.deepEqual([per.get(s.rapport).schaal_soort, per.get(s.rapport).weet_niet], ['rapport', true], 'zonder schaal: rapportcijfer');
  assert.equal(per.get(s.afdeling).kenmerk, 'afdeling');
  assert.equal(per.get(s.schaal).kenmerk, '');
  s.code = det.vragenlijst.code;
  assert.equal((await roep(`${B}/vragenlijsten/${s.lijst}/status`, { methode: 'POST', body: { status: 'open' } })).status, 200);
});

// ---------- Criterium 4: de openbare vragenlijst ----------

test('criterium 4: de openbare vragenlijst geeft het cijferblok en nooit het kenmerk', async () => {
  const r = await roep(`/api/publiek/${s.code}`, { koekje: '' });
  assert.equal(r.data.status, 'open');
  const json = JSON.stringify(r.data);
  assert.doesNotMatch(json, /kenmerk|uitsplitsen|meetpunt|onderzoek_id|code|afdeling"/);
  const vragen = r.data.themas.flatMap((t) => t.vragen);
  const nps = vragen.find((v) => v.id === s.nps);
  assert.deepEqual(nps.cijfer, { min: 0, max: 10, laag: 'Zeer onwaarschijnlijk', hoog: 'Zeer waarschijnlijk' });
  assert.equal(nps.weet_niet, false);
  const rapport = vragen.find((v) => v.id === s.rapport);
  assert.deepEqual(rapport.cijfer, { min: 1, max: 10, laag: 'Zeer slecht', hoog: 'Uitstekend' });
  assert.equal(rapport.weet_niet, true);
  assert.equal(vragen.find((v) => v.id === s.schaal).cijfer, undefined);
});

// ---------- Criterium 2: insturen ----------

test('criterium 2: 0 en 10 bij 0–10 goed; 11, −1 en 5,5 niet; 0 bij 1–10 niet; weet niet alleen als het mag', async () => {
  for (const w of [0, 10]) {
    const r = await stuur(s.code, { [s.nps]: w, [s.schaal]: 4 });
    assert.equal(r.status, 200, `${w}: ${r.tekst}`);
  }
  for (const [vraag, w] of [[s.nps, 11], [s.nps, -1], [s.nps, 5.5], [s.rapport, 0], [s.nps, 'weet_niet'], [s.rapport, 'acht']]) {
    const r = await stuur(s.code, { [vraag]: w, [s.schaal]: 4 });
    assert.equal(r.status, 400, `${vraag} ${w}`);
    assert.equal(r.data.fout, 'Ongeldig antwoord op een cijfervraag.');
  }
  assert.equal((await stuur(s.code, { [s.rapport]: 'weet_niet', [s.schaal]: 4 })).status, 200);
  const exp = (await roep(`${B}/onderzoeken/${s.onderzoek}/export/data`)).data;
  const waarden = exp.inzendingen.map((i) => i.antwoorden);
  assert.deepEqual(waarden.map((a) => a[s.nps] ?? null).sort(), [0, 10, null]);
  assert.equal(waarden.filter((a) => a[s.rapport] === 'weet_niet').length, 1);
  // export/data: de cijferschalen en kenmerken staan in de lijsten; het kenmerk bij de vraag.
  assert.equal(exp.lijsten.cijferschalen.nps.max, 10);
  assert.equal(exp.lijsten.kenmerken.afdeling.naam, 'Afdeling');
  assert.equal(exp.vragen.find((v) => v.id === s.afdeling).kenmerk, 'afdeling');
});

// ---------- Criterium 3: de cijferschaal ligt vast na antwoorden ----------

test('criterium 3: de cijferschaal veranderen na antwoorden geeft 409; zonder antwoorden mag het', async () => {
  const body = { thema_id: s.werk, type: 'cijfer', schaal_soort: 'rapport', tekst: 'Hoe waarschijnlijk is het dat je ons aanbeveelt?' };
  const r = await roep(`${B}/vragen/${s.nps}`, { methode: 'PUT', body });
  assert.equal(r.status, 409);
  assert.equal(r.data.fout, 'Deze vragenlijst heeft al antwoorden. De cijferschaal kan daarom niet meer veranderen.');
  // Tekst aanpassen met dezelfde schaal mag wel.
  assert.equal((await roep(`${B}/vragen/${s.nps}`, { methode: 'PUT', body: { ...body, schaal_soort: 'nps' } })).status, 200);
  // Een andere vragenlijst zonder antwoorden: wisselen mag.
  s.leeg = (await roep(`${B}/onderzoeken/${s.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Leeg' } })).data.id;
  const v = await roep(`${B}/vragenlijsten/${s.leeg}/vragen`, { methode: 'POST', body: { ...body, schaal_soort: 'nps' } });
  assert.equal(v.status, 201);
  assert.equal((await roep(`${B}/vragen/${v.data.id}`, { methode: 'PUT', body })).status, 200);
  assert.equal((await roep(`${B}/vragenlijsten/${s.leeg}`)).data.vragen[0].schaal_soort, 'rapport');
  // Een ongeldige cijferschaal: 400.
  assert.equal((await roep(`${B}/vragen/${v.data.id}`, { methode: 'PUT', body: { ...body, schaal_soort: 'eens' } })).status, 400);
  // Een oud scherm dat geen kenmerk meestuurt, laat het kenmerk staan.
  const afd = { thema_id: s.werk, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: [{ id: 'x', label: 'Kantoor' }, { label: 'Productie' }], uitsplitsen: true };
  const detail = (await roep(`${B}/vragenlijsten/${s.lijst}`)).data.vragen.find((x) => x.id === s.afdeling);
  assert.equal((await roep(`${B}/vragen/${s.afdeling}`, { methode: 'PUT', body: { ...afd, opties: detail.opties } })).status, 200);
  assert.equal((await roep(`${B}/vragenlijsten/${s.lijst}`)).data.vragen.find((x) => x.id === s.afdeling).kenmerk, 'afdeling');
});

// ---------- Criterium 5: kenmerk ----------

test('criterium 5: kenmerk alleen bij meerkeuze met één antwoord of ja/nee; een dubbel kenmerk geeft 409', async () => {
  const fouten = [
    [{ type: 'schaal', tekst: 'Schaal met kenmerk?', kenmerk: 'leeftijd' }, 400, 'Een kenmerk kan alleen bij een meerkeuzevraag met één antwoord of bij een ja/nee-vraag.'],
    [{ type: 'cijfer', tekst: 'Cijfer met kenmerk?', kenmerk: 'leeftijd' }, 400, 'Een kenmerk kan alleen bij een meerkeuzevraag met één antwoord of bij een ja/nee-vraag.'],
    [{ type: 'meerkeuze', tekst: 'Meerdere?', opties: ['A', 'B'], meerdere_antwoorden: true, kenmerk: 'locatie' }, 400, 'Een kenmerk kan alleen bij een meerkeuzevraag met één antwoord of bij een ja/nee-vraag.'],
    [{ type: 'janee', tekst: 'Onbekend?', kenmerk: 'schoenmaat' }, 400, 'Kies een geldig kenmerk.'],
    [{ type: 'meerkeuze', tekst: 'Nog een afdeling?', opties: ['A', 'B'], kenmerk: 'afdeling' }, 409, 'Deze vragenlijst heeft al een vraag met het kenmerk Afdeling.'],
  ];
  for (const [body, status, fout] of fouten) {
    const r = await nieuweVraag(body);
    assert.equal(r.status, status, body.tekst);
    assert.equal(r.data.fout, fout, body.tekst);
  }
  // 'Ander kenmerk' mag vaker.
  for (const tekst of ['Werk je in ploegendienst?', 'Werk je op kantoor of buiten?']) {
    assert.equal((await nieuweVraag({ type: 'janee', tekst, kenmerk: 'overig' })).status, 201);
  }
  // PUT /vragen/:id/kenmerk: zetten, dubbel (409), bij een schaalvraag (400) en weghalen.
  s.leiding = (await nieuweVraag({ type: 'janee', tekst: 'Geef je leiding?' })).data.id;
  const zet = (id, kenmerk) => roep(`${B}/vragen/${id}/kenmerk`, { methode: 'PUT', body: { kenmerk } });
  assert.equal((await zet(s.leiding, 'leidinggevend')).status, 200);
  const dubbel = await zet(s.leiding, 'afdeling');
  assert.equal(dubbel.status, 409);
  assert.equal(dubbel.data.fout, 'Deze vragenlijst heeft al een vraag met het kenmerk Afdeling.');
  assert.equal((await zet(s.schaal, 'leeftijd')).status, 400);
  assert.equal((await zet(s.leiding, 'bestaat-niet')).status, 400);
  assert.equal((await roep(`${B}/vragenlijsten/${s.lijst}`)).data.vragen.find((x) => x.id === s.leiding).kenmerk, 'leidinggevend');
  assert.equal((await zet(s.leiding, '')).status, 200);
  assert.equal((await roep(`${B}/vragenlijsten/${s.lijst}`)).data.vragen.find((x) => x.id === s.leiding).kenmerk, '');
  assert.equal((await zet(s.leiding, 'leidinggevend')).status, 200);
});

test('criterium 5: kenmerkvragen maakt het thema Achtergrond één keer en weigert een kenmerk dat er al is', async () => {
  const pad = `${B}/vragenlijsten/${s.lijst}/kenmerkvragen`;
  const r = await roep(pad, { methode: 'POST', body: { kenmerken: [{ kenmerk: 'leeftijd', variant: 'fijn' }, { kenmerk: 'diensttijd' }] } });
  assert.equal(r.status, 201, r.tekst);
  assert.equal(r.data.aantal, 2);
  const themas = (await roep(`${B}/onderzoeken/${s.onderzoek}`)).data.themas;
  const achtergrond = themas.filter((t) => t.naam === 'Achtergrond');
  assert.equal(achtergrond.length, 1);
  assert.equal(r.data.thema_id, achtergrond[0].id);
  assert.equal(themas.at(-1).naam, 'Achtergrond', 'aan het eind');
  const vragen = (await roep(`${B}/vragenlijsten/${s.lijst}`)).data.vragen;
  const leeftijd = vragen.find((v) => v.kenmerk === 'leeftijd');
  assert.deepEqual(leeftijd.opties.map((o) => o.label), ['Jonger dan 25 jaar', '25 tot 35 jaar', '35 tot 45 jaar', '45 tot 55 jaar', '55 jaar of ouder', 'Dat zeg ik liever niet']);
  assert.deepEqual([leeftijd.type, leeftijd.uitsplitsen, leeftijd.thema_id, leeftijd.toelichting], ['meerkeuze', true, achtergrond[0].id, KENMERK_TOELICHTING]);
  assert.equal(vragen.find((v) => v.kenmerk === 'diensttijd').tekst, 'Hoe lang werk je al bij Cijferbedrijf B.V.?');
  // Nog een keer, een ander kenmerk: hetzelfde thema; standaard 3 leeftijdsgroepen in een andere lijst.
  const tweede = await roep(pad, { methode: 'POST', body: { kenmerken: [{ kenmerk: 'geslacht' }] } });
  assert.equal(tweede.status, 201);
  assert.equal(tweede.data.thema_id, achtergrond[0].id);
  assert.equal((await roep(`${B}/onderzoeken/${s.onderzoek}`)).data.themas.filter((t) => t.naam === 'Achtergrond').length, 1);
  const grof = await roep(`${B}/vragenlijsten/${s.leeg}/kenmerkvragen`, { methode: 'POST', body: { kenmerken: [{ kenmerk: 'leeftijd' }] } });
  assert.equal(grof.status, 201);
  assert.equal((await roep(`${B}/vragenlijsten/${s.leeg}`)).data.vragen.find((v) => v.kenmerk === 'leeftijd').opties.length, 4);
  // Weigeren: al aanwezig, onbekend, 'overig' (geen standaardvraag), geen keuze, ongeldige variant.
  const al = await roep(pad, { methode: 'POST', body: { kenmerken: [{ kenmerk: 'leeftijd' }] } });
  assert.equal(al.status, 409);
  assert.equal(al.data.fout, 'Deze vragenlijst heeft al een vraag met het kenmerk Leeftijd.');
  const twee = await roep(pad, { methode: 'POST', body: { kenmerken: [{ kenmerk: 'leeftijd' }, { kenmerk: 'geslacht' }, { kenmerk: 'contract' }] } });
  assert.equal(twee.status, 409);
  assert.equal(twee.data.fout, 'Deze vragenlijst heeft al vragen met de kenmerken Leeftijd en Geslacht.');
  for (const body of [{ kenmerken: [{ kenmerk: 'schoenmaat' }] }, { kenmerken: [{ kenmerk: 'overig' }] }, { kenmerken: [] }, {}, { kenmerken: [{ kenmerk: 'leeftijd', variant: 'heel-fijn' }] }]) {
    assert.equal((await roep(`${B}/vragenlijsten/${s.leeg}/kenmerkvragen`, { methode: 'POST', body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await roep(`${B}/vragenlijsten/${s.lijst}`)).data.vragen.filter((v) => v.kenmerk === 'contract').length, 0, 'niets half toegevoegd');
});

test('criterium 5: kopie en als-sjabloon houden het kenmerk; toepassen herkent het ook aan de tekst', async () => {
  const k = await roep(`${B}/vragenlijsten/${s.lijst}/kopie`, { methode: 'POST', body: { titel: 'Vervolg' } });
  assert.equal(k.status, 201);
  const bron = (await roep(`${B}/vragenlijsten/${s.lijst}`)).data.vragen;
  const kopie = (await roep(`${B}/vragenlijsten/${k.data.id}`)).data.vragen;
  const kenmerken = (vragen) => vragen.map((v) => [v.tekst, v.kenmerk, v.schaal_soort]).sort();
  assert.deepEqual(kenmerken(kopie), kenmerken(bron));
  assert.ok(kopie.every((v) => v.bron_vraag_id));

  const sj = await roep(`${B}/onderzoeken/${s.onderzoek}/als-sjabloon`, { methode: 'POST', body: { naam: 'Met kenmerken', vragenlijst_id: s.lijst } });
  assert.equal(sj.status, 201, sj.tekst);
  const inhoud = (await roep(`${B}/sjablonen/${sj.data.id}`)).data.inhoud;
  assert.deepEqual(inhoud.vragen.filter((v) => v.kenmerk).map((v) => v.kenmerk).sort(), ['afdeling', 'diensttijd', 'geslacht', 'leeftijd', 'leidinggevend', 'overig', 'overig']);
  assert.deepEqual(inhoud.vragen.filter((v) => v.type === 'cijfer').map((v) => v.schaal_soort), ['nps', 'rapport']);
  assert.match(inhoud.vragen.find((v) => v.kenmerk === 'diensttijd').tekst, /\{bedrijf\}/);
  const nieuw = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Ander B.V.', titel: 'Kopie', sjablonen: [sj.data.id] } });
  assert.equal(nieuw.status, 201, nieuw.tekst);
  const vl = (await roep(`${B}/onderzoeken/${nieuw.data.id}/vragenlijsten`)).data.vragenlijsten[0];
  const vragen = (await roep(`${B}/vragenlijsten/${vl.id}`)).data.vragen;
  assert.deepEqual(vragen.filter((v) => v.kenmerk).map((v) => v.kenmerk).sort(), ['afdeling', 'diensttijd', 'geslacht', 'leeftijd', 'leidinggevend', 'overig', 'overig']);
  assert.equal(vragen.find((v) => v.kenmerk === 'diensttijd').tekst, 'Hoe lang werk je al bij Ander B.V.?');

  // Een eigen sjabloon van vóór de kenmerken: de achtergrondvraag krijgt zijn kenmerk bij het toepassen.
  const oud = await roep(`${B}/sjablonen`, { methode: 'POST', body: { naam: 'Oud sjabloon', inhoud: {
    themas: [{ naam: 'Achtergrond' }],
    vragen: [
      { thema: 'Achtergrond', type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['A', 'B'], uitsplitsen: true },
      { thema: 'Achtergrond', type: 'meerkeuze', tekst: 'Hoe lang werk je al bij {bedrijf}?', opties: ['Kort', 'Lang'] },
    ],
  } } });
  assert.equal(oud.status, 201, oud.tekst);
  const o2 = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Oud B.V.', titel: 'Oud', sjablonen: [oud.data.id] } });
  const vl2 = (await roep(`${B}/onderzoeken/${o2.data.id}/vragenlijsten`)).data.vragenlijsten[0];
  assert.deepEqual((await roep(`${B}/vragenlijsten/${vl2.id}`)).data.vragen.map((v) => v.kenmerk), ['afdeling', 'diensttijd']);
});

test('criterium 6: medewerkerstevredenheid toepassen geeft de kenmerken, de eNPS-vraag en het rapportcijfer', async () => {
  const o = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Sjabloonbedrijf', titel: 'MTO', sjablonen: ['medewerkerstevredenheid'] } });
  assert.equal(o.status, 201);
  const vl = (await roep(`${B}/onderzoeken/${o.data.id}/vragenlijsten`)).data.vragenlijsten[0];
  const vragen = (await roep(`${B}/vragenlijsten/${vl.id}`)).data.vragen;
  assert.equal(vragen.length, 26);
  assert.deepEqual(vragen.filter((v) => v.kenmerk).map((v) => [v.tekst, v.kenmerk, v.uitsplitsen]), [
    ['Op welke afdeling werk je?', 'afdeling', true],
    ['Hoe lang werk je al bij Sjabloonbedrijf?', 'diensttijd', true],
  ]);
  assert.deepEqual(vragen.filter((v) => v.type === 'cijfer').map((v) => [v.schaal_soort, v.tekst]), [
    ['rapport', 'Welk rapportcijfer geef je Sjabloonbedrijf als werkgever?'],
    ['nps', 'Hoe waarschijnlijk is het dat je Sjabloonbedrijf als werkgever aanbeveelt aan vrienden of bekenden?'],
  ]);
  assert.ok(!vragen.some((v) => v.type === 'janee' && /aanbevelen/.test(v.tekst)));
  // Vertrekonderzoek: kenmerk zonder uitsplitsen.
  const v = await roep(`${B}/onderzoeken`, { methode: 'POST', body: { bedrijfsnaam: 'Vertrekbedrijf', titel: 'Vertrek', sjablonen: ['vertrekonderzoek'] } });
  const vlv = (await roep(`${B}/onderzoeken/${v.data.id}/vragenlijsten`)).data.vragenlijsten[0];
  const vv = (await roep(`${B}/vragenlijsten/${vlv.id}`)).data.vragen;
  assert.deepEqual(vv.filter((x) => x.kenmerk).map((x) => [x.kenmerk, x.uitsplitsen]), [['afdeling', false], ['diensttijd', false]]);
});

// ---------- Dashboard, meelezer en inlezen ----------

test('dashboard: het themagemiddelde telt alleen schaalvragen; eNPS, rapportcijfer en uitsplitsing per kolom', async () => {
  // Een eigen vragenlijst: 6 respondenten, het aanbeveelcijfer door 4 van hen ingevuld.
  const lijst = (await roep(`${B}/onderzoeken/${s.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Dashboardtest' } })).data.id;
  const vraag = async (body) => (await roep(`${B}/vragenlijsten/${lijst}/vragen`, { methode: 'POST', body: { thema_id: s.werk, ...body } })).data.id;
  const schaal = await vraag({ type: 'schaal', tekst: 'Ik heb plezier in mijn werk.' });
  const nps = await vraag({ type: 'cijfer', schaal_soort: 'nps', tekst: 'Zou je ons aanraden (0 tot 10)?' });
  const rapport = await vraag({ type: 'cijfer', schaal_soort: 'rapport', tekst: 'Je cijfer voor het werk?' });
  const afd = await vraag({ type: 'meerkeuze', tekst: 'Waar werk je?', opties: ['Kantoor', 'Productie'], uitsplitsen: true, kenmerk: 'afdeling' });
  await roep(`${B}/vragenlijsten/${lijst}/status`, { methode: 'POST', body: { status: 'open' } });
  const det = (await roep(`${B}/vragenlijsten/${lijst}`)).data;
  const kantoor = det.vragen.find((v) => v.id === afd).opties[0].id;
  const npsWaarden = [10, 9, 3, 10, undefined, undefined];
  for (let i = 0; i < 6; i++) {
    const a = { [schaal]: 3, [rapport]: 10, [afd]: kantoor };
    if (npsWaarden[i] !== undefined) a[nps] = npsWaarden[i];
    assert.equal((await stuur(det.vragenlijst.code, a)).status, 200);
  }
  await roep(`${B}/vragenlijsten/${lijst}/status`, { methode: 'POST', body: { status: 'gesloten' } });
  const d = (await roep(`${B}/onderzoeken/${s.onderzoek}/dashboard?vragenlijst=${lijst}&uitsplitsen=${afd}`)).data;
  const werk = d.selectie.themas.find((t) => t.thema_id === s.werk);
  assert.deepEqual([werk.gemiddelde, werk.aantal_vragen, werk.antwoorden], [3, 1, 6], 'het rapportcijfer 10 telt niet mee');
  const n = d.selectie.vragen.find((v) => v.id === nps);
  assert.deepEqual([n.n_score, n.enps.score, n.enps.promotors, n.enps.criticasters], [4, 50, 3, 1]);
  const r = d.selectie.vragen.find((v) => v.id === rapport);
  assert.deepEqual([r.gemiddelde, r.pct_onvoldoende, r.n_score], [10, 0, 6]);
  assert.deepEqual(d.selectie.uitsplitsing.cijfervragen.map((c) => c.vraag_id), [nps, rapport]);
  // Eén groep van 6 (Kantoor) is zichtbaar; de cijferkolom van het aanbeveelcijfer heeft er 4: verborgen.
  const groep = d.selectie.uitsplitsing.groepen.find((g) => g.label === 'Kantoor');
  assert.equal(groep.cijfers.find((c) => c.vraag_id === nps).verborgen, true);
  assert.equal(groep.cijfers.find((c) => c.vraag_id === rapport).gemiddelde, 10);
  s.dashboardLijst = { lijst, nps, rapport };
});

test('meelezer: een cijfervraag met 4 scores toont geen verdeling, gemiddelde of eNPS', async () => {
  const link = await roep(`${B}/onderzoeken/${s.onderzoek}/deellinks`, { methode: 'POST', body: { naam: 'OR', onderdelen: { dashboard: true } } });
  assert.equal(link.status, 201, link.tekst);
  const code = link.data.deellink.code;
  const toegang = await fetch(`${BASIS}/api/kijk/${code}/toegang`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toegangscode: link.data.toegangscode }) });
  assert.equal(toegang.status, 200);
  const kijkKoekje = toegang.headers.get('set-cookie').split(';')[0];
  const d = (await roep(`/api/kijk/${code}/dashboard?vragenlijst=${s.dashboardLijst.lijst}`, { koekje: kijkKoekje })).data;
  assert.equal(d.kijker, true);
  const n = d.selectie.vragen.find((v) => v.id === s.dashboardLijst.nps);
  assert.deepEqual([n.verborgen, n.verdeling, n.gemiddelde, n.enps, n.n], [true, [], null, null, null]);
  const r = d.selectie.vragen.find((v) => v.id === s.dashboardLijst.rapport);
  assert.equal(r.gemiddelde, 10);
  assert.doesNotMatch(JSON.stringify(d), /"kenmerk"/);
});

test('inlezen: vragen met een cijfer en een kenmerk; een dubbel kenmerk geeft 409 en er wordt niets opgeslagen', async () => {
  const voor = (await roep(`${B}/vragenlijsten/${s.leeg}`)).data.vragen.length;
  const goed = await roep(`${B}/vragenlijsten/${s.leeg}/vragen/reeks`, { methode: 'POST', body: { vragen: [
    { thema_id: s.werk, type: 'cijfer', schaal_soort: 'nps', tekst: 'Ingelezen eNPS?' },
    { thema_id: s.werk, type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['A', 'B'], kenmerk: 'afdeling', uitsplitsen: true },
  ] } });
  assert.equal(goed.status, 201, goed.tekst);
  const vragen = (await roep(`${B}/vragenlijsten/${s.leeg}`)).data.vragen;
  assert.deepEqual(vragen.filter((v) => v.tekst === 'Ingelezen eNPS?').map((v) => [v.type, v.schaal_soort]), [['cijfer', 'nps']]);
  assert.equal(vragen.find((v) => v.tekst === 'Op welke afdeling werk je?').kenmerk, 'afdeling');
  const dubbel = await roep(`${B}/vragenlijsten/${s.leeg}/vragen/reeks`, { methode: 'POST', body: { vragen: [
    { thema_id: s.werk, type: 'janee', tekst: 'Nieuw 1?' },
    { thema_id: s.werk, type: 'meerkeuze', tekst: 'Nog een afdeling?', opties: ['A', 'B'], kenmerk: 'afdeling' },
  ] } });
  assert.equal(dubbel.status, 409);
  assert.match(dubbel.data.fout, /^Regel 2: Deze vragenlijst heeft al een vraag met het kenmerk Afdeling\.$/);
  const binnen = await roep(`${B}/vragenlijsten/${s.leeg}/vragen/reeks`, { methode: 'POST', body: { vragen: [
    { thema_id: s.werk, type: 'janee', tekst: 'Leiding 1?', kenmerk: 'leidinggevend' },
    { thema_id: s.werk, type: 'janee', tekst: 'Leiding 2?', kenmerk: 'leidinggevend' },
  ] } });
  assert.equal(binnen.status, 409, 'ook binnen dezelfde reeks');
  assert.equal((await roep(`${B}/vragenlijsten/${s.leeg}`)).data.vragen.length, voor + 2);
  // Antwoorden inlezen: dezelfde controle als bij insturen.
  const eNPS = vragen.find((v) => v.tekst === 'Ingelezen eNPS?').id;
  const fout = await roep(`${B}/vragenlijsten/${s.leeg}/inzendingen/reeks`, { methode: 'POST', body: { inzendingen: [{ antwoorden: { [eNPS]: 11 } }] } });
  assert.equal(fout.status, 400);
  assert.match(fout.data.fout, /Ongeldig antwoord op een cijfervraag/);
  assert.equal((await roep(`${B}/vragenlijsten/${s.leeg}/inzendingen/reeks`, { methode: 'POST', body: { inzendingen: [{ antwoorden: { [eNPS]: 0 } }] } })).status, 201);
});

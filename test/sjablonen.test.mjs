// Automatische test van de sjablonen: controle van de inhoud, standaardsjablonen klaarzetten,
// herstellen, samenvoegen, een onderzoek aanmaken met eigen inhoud en oude verwijzingen.
// Start zelf een lokale testserver met een lege database. Uitvoeren: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { voegSjablonenSamen, MAX_VRAGEN } from '../src/lib/sjabloon-toepassen.js';
import { controleerSjabloonInhoud, INGEBOUWD } from '../src/lib/sjablonen-beheer.js';

const POORT = 8798;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-sjablonen';
let server;
let map;
let cookie = '';

async function wacht(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-sjablonen-test-'));
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', map], {
    stdio: 'ignore',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  });
  server = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(POORT), '--ip', '127.0.0.1', '--persist-to', map,
      '--var', `BEHEER_WACHTWOORD:${WACHTWOORD}`, '--show-interactive-dev-session=false'],
    { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASIS}/api/sessie`);
      if (r.ok) break;
    } catch {
      /* nog niet klaar */
    }
    if (i === 59) throw new Error('Testserver start niet');
    await wacht(500);
  }
  const r = await fetch(`${BASIS}/api/inloggen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wachtwoord: WACHTWOORD }),
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
});

after(() => {
  try {
    process.kill(-server.pid);
  } catch {
    /* al gestopt */
  }
  rmSync(map, { recursive: true, force: true });
});

async function api(pad, { methode = 'GET', body } = {}) {
  const r = await fetch(`${BASIS}/api/beheer${pad}`, {
    method: methode,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let data = null;
  try {
    data = JSON.parse(tekst);
  } catch {
    data = tekst;
  }
  return { status: r.status, data };
}

const post = (pad, body = {}) => api(pad, { methode: 'POST', body });
const put = (pad, body = {}) => api(pad, { methode: 'PUT', body });
const del = (pad) => api(pad, { methode: 'DELETE' });

async function ruimOnderzoekOp(id) {
  const o = (await api(`/onderzoeken/${id}`)).data.onderzoek;
  await post(`/onderzoeken/${id}/archiveren`);
  await api(`/onderzoeken/${id}`, { methode: 'DELETE', body: { bevestiging: o.bedrijfsnaam } });
}

/** Een kleine, geldige inhoud om mee te testen. */
function voorbeeld() {
  return {
    vragenlijst: { titel: 'Peiling {bedrijf}', introtekst: 'Welkom bij {bedrijf}.', bedanktekst: 'Dank je wel!' },
    themas: [
      { naam: 'Werkdruk', omschrijving: 'Over drukte', meetpunten: [{ naam: 'Ervaren werkdruk', omschrijving: '', eenheid: 'score 1–5' }, { naam: 'Verzuim', eenheid: '%' }] },
      { naam: 'Achtergrond', meetpunten: [{ naam: 'Verzuim', omschrijving: 'Zelfde naam, ander thema' }] },
    ],
    vragen: [
      { thema: 'Achtergrond', type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['Inkoop', 'Verkoop'], uitsplitsen: true },
      { thema: 'Werkdruk', meetpunt: 'Ervaren werkdruk', type: 'schaal', tekst: 'Het werk bij {bedrijf} is goed te doen.', schaal_soort: 'frequentie', weet_niet: true, verplicht: true },
      { thema: 'Werkdruk', type: 'meerkeuze', tekst: 'Wat helpt?', opties: ['Rust', 'Hulp', 'Planning'], meerdere_antwoorden: true },
      { thema: 'Werkdruk', type: 'janee', tekst: 'Werk je over?', uitsplitsen: true },
      { thema: 'Werkdruk', type: 'open', tekst: 'Wat wil je kwijt?', toelichting: 'Noem geen namen.' },
    ],
    acties: ['Aankondiging sturen namens {bedrijf}', 'Resultaten bespreken'],
  };
}

const ids = {};

// ---------- Losse functies (zonder server) ----------

test('samenvoegen (losse functie): thema\'s en meetpunten op naam, vragen op tekst, Achtergrond achteraan', () => {
  const a = {
    vragenlijst: { titel: 'Lijst A', introtekst: 'Intro A', bedanktekst: 'Dank A' },
    themas: [
      { naam: 'Achtergrond', meetpunten: [] },
      { naam: 'Werkdruk', omschrijving: 'Eerste', meetpunten: [{ naam: 'Druk', eenheid: 'score' }, { naam: 'Verzuim', eenheid: '%' }] },
    ],
    vragen: [
      { thema: 'Achtergrond', type: 'janee', tekst: 'Werk je voltijd?' },
      { thema: 'Werkdruk', meetpunt: 'Druk', type: 'schaal', tekst: 'Het is druk.' },
    ],
    acties: ['Plannen', 'Versturen'],
  };
  const b = {
    vragenlijst: { titel: 'Lijst B' },
    themas: [
      { naam: 'werkdruk ', omschrijving: 'Tweede', meetpunten: [{ naam: 'druk' }, { naam: 'Herstel' }] },
      { naam: 'Begeleiding', meetpunten: [{ naam: 'Verzuim' }, { naam: 'Contact' }] },
      { naam: 'Gezondheid', meetpunten: [{ naam: 'Verzuim' }] },
    ],
    vragen: [
      { thema: 'Werkdruk', meetpunt: 'Herstel', type: 'schaal', tekst: 'Ik herstel goed.' },
      { thema: 'Werkdruk', type: 'schaal', tekst: 'HET IS DRUK.' },
      { thema: 'Gezondheid', meetpunt: 'Verzuim', type: 'open', tekst: 'Wat speelt er?' },
      { thema: 'Nieuw thema', type: 'open', tekst: 'Nog iets?' },
    ],
    acties: ['versturen', 'Bespreken'],
  };
  const kopie = JSON.stringify([a, b]);
  const s = voegSjablonenSamen([a, b]);
  assert.equal(JSON.stringify([a, b]), kopie, 'de invoer blijft ongewijzigd');
  assert.deepEqual(s.themas.map((t) => t.naam), ['Werkdruk', 'Begeleiding', 'Gezondheid', 'Nieuw thema', 'Achtergrond']);
  assert.equal(s.themas[0].omschrijving, 'Eerste');
  assert.deepEqual(s.themas[0].meetpunten.map((m) => m.naam), ['Druk', 'Verzuim', 'Herstel']);
  // "Verzuim" staat al bij Werkdruk: bij Begeleiding (geen vraag) vervalt het, bij Gezondheid (wel een vraag) blijft het.
  assert.deepEqual(s.themas[1].meetpunten.map((m) => m.naam), ['Contact']);
  assert.deepEqual(s.themas[2].meetpunten.map((m) => m.naam), ['Verzuim']);
  assert.deepEqual(s.vragen.map((v) => v.tekst), ['Het is druk.', 'Ik herstel goed.', 'Wat speelt er?', 'Nog iets?', 'Werk je voltijd?']);
  assert.equal(s.vragen.at(-1).thema, 'Achtergrond');
  assert.equal(s.vragen[2].meetpunt, 'Verzuim');
  assert.deepEqual(s.acties, ['Plannen', 'Versturen', 'Bespreken']);
  assert.deepEqual(s.vragenlijst, { titel: '', introtekst: 'Intro A', bedanktekst: 'Dank A' });
  assert.equal(voegSjablonenSamen([a]).vragenlijst.titel, 'Lijst A');
  // Eén sjabloon: dezelfde meetpuntnaam bij twee thema's blijft staan zoals je het hebt opgezet.
  const een = voegSjablonenSamen([voorbeeld()]);
  assert.deepEqual(een.themas.map((t) => t.meetpunten.map((m) => m.naam)), [['Ervaren werkdruk', 'Verzuim'], ['Verzuim']]);
  // Met een bedrijfsnaam wordt {bedrijf} vervangen, zonder dubbele punt.
  const metNaam = voegSjablonenSamen([voorbeeld()], { bedrijf: 'Voorbeeld B.V.' });
  assert.equal(metNaam.vragenlijst.introtekst, 'Welkom bij Voorbeeld B.V.');
  assert.equal(metNaam.vragenlijst.titel, 'Peiling Voorbeeld B.V.');
  assert.doesNotMatch(JSON.stringify(metNaam), /\{bedrijf\}/);
});

test('controle van de inhoud (losse functie): vaste vorm, onbekende velden weg, vragen in volgorde van de thema\'s', () => {
  const ruw = voorbeeld();
  ruw.onbekend = 'x';
  ruw.themas[0].kleur = 'rood';
  ruw.vragen[1].id = 99;
  ruw.vragen[1].opties = ['hoort hier niet'];
  ruw.acties.push('   ', { titel: 'Als object' });
  const schoon = controleerSjabloonInhoud(ruw);
  assert.deepEqual(Object.keys(schoon), ['vragenlijst', 'themas', 'vragen', 'acties']);
  assert.deepEqual(Object.keys(schoon.themas[0]), ['naam', 'omschrijving', 'meetpunten']);
  assert.deepEqual(Object.keys(schoon.vragen[0]), ['thema', 'meetpunt', 'type', 'tekst', 'toelichting', 'opties', 'schaal_soort',
    'meerdere_antwoorden', 'verplicht', 'weet_niet', 'uitsplitsen']);
  assert.deepEqual(schoon.vragen.map((v) => v.thema), ['Werkdruk', 'Werkdruk', 'Werkdruk', 'Werkdruk', 'Achtergrond']);
  assert.deepEqual(schoon.vragen[0], {
    thema: 'Werkdruk', meetpunt: 'Ervaren werkdruk', type: 'schaal', tekst: 'Het werk bij {bedrijf} is goed te doen.', toelichting: '',
    opties: [], schaal_soort: 'frequentie', meerdere_antwoorden: false, verplicht: true, weet_niet: true, uitsplitsen: false,
  });
  assert.deepEqual(schoon.acties, ['Aankondiging sturen namens {bedrijf}', 'Resultaten bespreken', 'Als object']);
  // Twee keer controleren geeft precies hetzelfde.
  assert.deepEqual(controleerSjabloonInhoud(schoon), schoon);
  // Lege inhoud mag.
  assert.deepEqual(controleerSjabloonInhoud({}), { vragenlijst: { titel: '', introtekst: '', bedanktekst: '' }, themas: [], vragen: [], acties: [] });
});

test('de standaardsjablonen uit de code voldoen zelf aan de regels', () => {
  assert.ok(INGEBOUWD.length >= 3);
  for (const s of INGEBOUWD) {
    assert.doesNotThrow(() => controleerSjabloonInhoud(s.inhoud), `standaardsjabloon "${s.id}"`);
    assert.ok(s.inhoud.vragen.length <= MAX_VRAGEN);
  }
});

// ---------- Via de server ----------

test('standaardsjablonen worden één keer klaargezet en zijn op te vragen', async () => {
  const r = await api('/sjablonen');
  assert.equal(r.status, 200);
  const standaard = r.data.sjablonen.filter((s) => s.standaard);
  assert.deepEqual(standaard.map((s) => s.bron), INGEBOUWD.map((s) => s.id));
  assert.deepEqual(r.data.ontbrekend, []);
  for (const s of standaard) {
    assert.equal(typeof s.id, 'number');
    assert.equal(s.gewijzigd, false);
    assert.equal(s.herstelbaar, true);
  }
  const mto = standaard.find((s) => s.bron === 'medewerkerstevredenheid');
  assert.deepEqual(mto.samenvatting, { themas: 8, meetpunten: 12, vragen: 25, acties: 7 });
  ids.mto = mto.id;
  ids.hr = standaard.find((s) => s.bron === 'hr-processen').id;
  ids.arbo = standaard.find((s) => s.bron === 'arbeidsvoorwaarden').id;

  // Een tweede keer opvragen maakt geen dubbele sjablonen.
  const nogEens = await api('/sjablonen');
  assert.deepEqual(nogEens.data.sjablonen.map((s) => s.id), r.data.sjablonen.map((s) => s.id));
});

test('een sjabloon is aan te wijzen met nummer, oude vorm (eigen-N) en kenmerk van het standaardsjabloon', async () => {
  const opKenmerk = await api('/sjablonen/medewerkerstevredenheid');
  assert.equal(opKenmerk.status, 200);
  assert.equal(opKenmerk.data.id, ids.mto);
  assert.equal(opKenmerk.data.bron, 'medewerkerstevredenheid');
  assert.equal(opKenmerk.data.inhoud.vragen.length, 25);
  assert.match(JSON.stringify(opKenmerk.data.inhoud), /\{bedrijf\}/);
  for (const ref of [ids.mto, `eigen-${ids.mto}`]) {
    const r = await api(`/sjablonen/${ref}`);
    assert.equal(r.status, 200, String(ref));
    assert.equal(r.data.id, ids.mto);
  }
  assert.equal((await api('/sjablonen/bestaat-niet')).status, 404);
  assert.equal((await api('/sjablonen/999999')).status, 404);
  assert.equal((await api('/sjablonen/niet%20geldig!')).status, 400);
});

test('de inhoud wordt streng gecontroleerd, met een melding die het probleem benoemt', async () => {
  const basis = () => ({ themas: [{ naam: 'A', meetpunten: [{ naam: 'M' }] }, { naam: 'B', meetpunten: [{ naam: 'N' }] }], vragen: [], acties: [] });
  const vraag = (extra) => ({ thema: 'A', type: 'open', tekst: 'Vraag?', ...extra });
  const gevallen = [
    ['geen naam', { inhoud: basis() }, /Naam van het sjabloon is verplicht/, true],
    ['inhoud is geen object', 'tekst', /inhoud van het sjabloon/],
    ['thema\'s geen lijst', { themas: 'x' }, /lijst met thema's is ongeldig/],
    ['te veel thema\'s', { themas: Array.from({ length: 41 }, (_, i) => ({ naam: `T${i}` })) }, /maximaal 40 thema's/],
    ['thema zonder naam', { themas: [{ naam: 'A' }, { naam: '  ' }] }, /Thema 2: vul een naam in\./],
    ['themanaam te lang', { themas: [{ naam: 'x'.repeat(151) }] }, /Thema 1: de naam is te lang \(maximaal 150 tekens\)/],
    ['dubbel thema', { themas: [{ naam: 'Werkdruk' }, { naam: ' werkdruk' }] }, /Thema 2: de naam "werkdruk" komt al voor/],
    ['te veel meetpunten', { themas: [{ naam: 'A', meetpunten: Array.from({ length: 31 }, (_, i) => ({ naam: `M${i}` })) }] }, /Thema "A": maximaal 30 meetpunten per thema/],
    ['dubbel meetpunt', { themas: [{ naam: 'A', meetpunten: [{ naam: 'M' }, { naam: 'm' }] }] }, /Thema "A": het meetpunt "m" staat er dubbel in/],
    ['eenheid te lang', { themas: [{ naam: 'A', meetpunten: [{ naam: 'M', eenheid: 'x'.repeat(31) }] }] }, /meetpunt 1: de eenheid is te lang/],
    ['onbekend thema', { ...basis(), vragen: [vraag(), vraag({ thema: 'C', tekst: 'Tweede?' })] }, /Vraag 2: kies een thema dat in het sjabloon staat\./],
    ['meetpunt van ander thema', { ...basis(), vragen: [vraag({ meetpunt: 'N' })] }, /Vraag 1: het meetpunt "N" staat niet bij het thema "A"/],
    ['onbekend vraagtype', { ...basis(), vragen: [vraag({ type: 'cijfer' })] }, /Vraag 1: kies een geldig vraagtype/],
    ['vraag zonder tekst', { ...basis(), vragen: [vraag({ tekst: '' })] }, /Vraag 1: vul de vraag in\./],
    ['vraag te lang', { ...basis(), vragen: [vraag({ tekst: 'x'.repeat(1001) })] }, /Vraag 1: de vraag is te lang \(maximaal 1000 tekens\)/],
    ['te weinig opties', { ...basis(), vragen: [vraag({ type: 'meerkeuze', opties: ['Eén', ' '] })] }, /Vraag 1: geef minimaal twee antwoordmogelijkheden op/],
    ['te veel opties', { ...basis(), vragen: [vraag({ type: 'meerkeuze', opties: Array.from({ length: 31 }, (_, i) => `O${i}`) })] }, /Vraag 1: maximaal 30 antwoordmogelijkheden/],
    ['dubbele optie', { ...basis(), vragen: [vraag({ type: 'meerkeuze', opties: ['Ja', 'Nee', 'ja'] })] }, /Vraag 1: de antwoordmogelijkheid "ja" staat er dubbel in/],
    ['uitsplitsen bij schaal', { ...basis(), vragen: [vraag({ type: 'schaal', uitsplitsen: true })] }, /Vraag 1: uitsplitsing kan alleen bij een meerkeuzevraag met één antwoord of bij een ja\/nee-vraag/],
    ['uitsplitsen bij meerdere antwoorden', { ...basis(), vragen: [vraag({ type: 'meerkeuze', opties: ['a', 'b'], meerdere_antwoorden: true, uitsplitsen: true })] }, /Vraag 1: uitsplitsing kan alleen/],
    ['weet niet bij ja/nee', { ...basis(), vragen: [vraag({ type: 'janee', weet_niet: true })] }, /Vraag 1: het antwoord "weet niet" kan alleen bij een schaalvraag/],
    ['meerdere antwoorden bij open', { ...basis(), vragen: [vraag({ meerdere_antwoorden: true })] }, /Vraag 1: meerdere antwoorden kan alleen bij een meerkeuzevraag/],
    ['onbekende schaal', { ...basis(), vragen: [vraag({ type: 'schaal', schaal_soort: 'cijfer' })] }, /Vraag 1: kies een geldige schaal/],
    ['dubbele vraag', { ...basis(), vragen: [vraag(), vraag({ thema: 'B', tekst: ' vraag? ' })] }, /Vraag 2: deze vraag staat er al in \(vraag 1\)/],
    ['te veel vragen', { ...basis(), vragen: Array.from({ length: 101 }, (_, i) => vraag({ tekst: `Vraag ${i}?` })) }, /maximaal 100 vragen bevatten \(nu 101\)\. Verwijder 1 vraag/],
    ['te veel acties', { ...basis(), acties: Array.from({ length: 101 }, (_, i) => `Actie ${i}`) }, /maximaal 100 acties/],
    ['dubbele actie', { ...basis(), acties: ['Bellen', 'Mailen', 'bellen'] }, /Actie 3: "bellen" staat er al in/],
    ['actie te lang', { ...basis(), acties: ['x'.repeat(301)] }, /Actie 1: de tekst is te lang \(maximaal 300 tekens\)/],
    ['uitleg te lang', { vragenlijst: { introtekst: 'x'.repeat(5001) } }, /Vragenlijst: de uitleg voor respondenten is te lang/],
    ['te groot', { ...basis(), vragen: Array.from({ length: 100 }, (_, i) => vraag({ tekst: `${i} ${'é'.repeat(990)}`, toelichting: 'é'.repeat(1000) })) }, /te groot \(maximaal 200 kB\)/],
  ];
  const voor = (await api('/sjablonen')).data.sjablonen.length;
  for (const [naam, inhoud, patroon, zonderNaam] of gevallen) {
    const body = zonderNaam ? inhoud : { naam: 'Test', inhoud };
    const r = await post('/sjablonen', body);
    assert.equal(r.status, 400, `${naam}: ${JSON.stringify(r.data)}`);
    assert.match(r.data.fout, patroon, naam);
    // Dezelfde controle geldt bij een nieuw onderzoek met eigen inhoud.
    if (!zonderNaam) {
      const o = await post('/onderzoeken', { bedrijfsnaam: 'Fout BV', titel: 'Mag niet bestaan', inhoud });
      assert.equal(o.status, 400, `${naam} (onderzoek)`);
      assert.match(o.data.fout, patroon, `${naam} (onderzoek)`);
    }
  }
  assert.equal((await api('/sjablonen')).data.sjablonen.length, voor, 'er is geen sjabloon bijgekomen');
  const onderzoeken = (await api('/onderzoeken')).data.onderzoeken;
  assert.ok(!onderzoeken.some((o) => o.bedrijfsnaam === 'Fout BV'), 'er is geen onderzoek aangemaakt');
});

test('eigen sjabloon maken, ophalen, wijzigen, kopiëren en verwijderen', async () => {
  const ruw = voorbeeld();
  ruw.rommel = true;
  ruw.vragen[0].rommel = true;
  const r = await post('/sjablonen', { naam: '  Mijn sjabloon ', omschrijving: 'Voor de test', inhoud: ruw });
  assert.equal(r.status, 201);
  assert.equal(typeof r.data.id, 'number');
  ids.eigen = r.data.id;

  const d = await api(`/sjablonen/${ids.eigen}`);
  assert.equal(d.data.naam, 'Mijn sjabloon');
  assert.equal(d.data.standaard, false);
  assert.equal(d.data.bron, null);
  assert.equal(d.data.gewijzigd, false);
  assert.deepEqual(d.data.inhoud, controleerSjabloonInhoud(voorbeeld()));
  assert.doesNotMatch(JSON.stringify(d.data.inhoud), /rommel/);

  const lijst = (await api('/sjablonen')).data.sjablonen;
  const inLijst = lijst.find((s) => s.id === ids.eigen);
  assert.deepEqual(inLijst.samenvatting, { themas: 2, meetpunten: 3, vragen: 5, acties: 2 });
  assert.ok(lijst.findIndex((s) => s.id === ids.eigen) >= lijst.filter((s) => s.standaard).length, 'eigen sjablonen staan na de standaardsjablonen');

  // Volledig wijzigen: naam, omschrijving en inhoud.
  const nieuw = voorbeeld();
  nieuw.themas[0].naam = 'Werkdruk en herstel';
  for (const v of nieuw.vragen) if (v.thema === 'Werkdruk') v.thema = 'Werkdruk en herstel';
  nieuw.acties.push('Derde actie');
  const w = await put(`/sjablonen/${ids.eigen}`, { naam: 'Mijn sjabloon 2', omschrijving: '', inhoud: nieuw });
  assert.equal(w.status, 200);
  assert.equal(w.data.standaard, false);
  const na = (await api(`/sjablonen/eigen-${ids.eigen}`)).data;
  assert.equal(na.naam, 'Mijn sjabloon 2');
  assert.equal(na.inhoud.themas[0].naam, 'Werkdruk en herstel');
  assert.equal(na.inhoud.acties.length, 3);
  assert.ok(na.bijgewerkt_op);

  // Alleen naam en omschrijving (zonder inhoud) laat de inhoud staan.
  assert.equal((await put(`/sjablonen/${ids.eigen}`, { naam: 'Mijn sjabloon 3', omschrijving: 'Nieuw' })).status, 200);
  assert.equal((await api(`/sjablonen/${ids.eigen}`)).data.inhoud.acties.length, 3);
  // Ongeldige inhoud wijzigt niets.
  const fout = await put(`/sjablonen/${ids.eigen}`, { naam: 'Kapot', omschrijving: '', inhoud: { themas: [{ naam: '' }] } });
  assert.equal(fout.status, 400);
  assert.equal((await api(`/sjablonen/${ids.eigen}`)).data.naam, 'Mijn sjabloon 3');
  assert.equal((await put('/sjablonen/999999', { naam: 'X', omschrijving: '' })).status, 404);

  // Kopie van een eigen sjabloon en van een standaardsjabloon: altijd een eigen sjabloon.
  const k1 = await post('/sjablonen', { kopie_van: ids.eigen });
  assert.equal(k1.status, 201);
  const kopie1 = (await api(`/sjablonen/${k1.data.id}`)).data;
  assert.equal(kopie1.naam, 'Mijn sjabloon 3 (kopie)');
  assert.deepEqual(kopie1.inhoud, na.inhoud);
  const k2 = await post('/sjablonen', { naam: 'MTO van mij', omschrijving: 'Aangepast', kopie_van: 'medewerkerstevredenheid' });
  assert.equal(k2.status, 201);
  const kopie2 = (await api(`/sjablonen/${k2.data.id}`)).data;
  assert.equal(kopie2.standaard, false);
  assert.equal(kopie2.bron, null);
  assert.equal(kopie2.inhoud.vragen.length, 25);
  assert.equal((await post('/sjablonen', { kopie_van: 999999 })).status, 404);

  // Leeg sjabloon (zonder inhoud) mag.
  const leeg = await post('/sjablonen', { naam: 'Leeg' });
  assert.equal(leeg.status, 201);
  assert.deepEqual((await api(`/sjablonen/${leeg.data.id}`)).data.inhoud, { vragenlijst: { titel: '', introtekst: '', bedanktekst: '' }, themas: [], vragen: [], acties: [] });

  for (const id of [k1.data.id, k2.data.id, leeg.data.id]) assert.equal((await del(`/sjablonen/${id}`)).status, 200);
  assert.equal((await del(`/sjablonen/${k1.data.id}`)).status, 404);
  assert.equal((await api(`/sjablonen/${k1.data.id}`)).status, 404);
});

test('standaardsjabloon aanpassen en het origineel herstellen', async () => {
  const origineel = (await api(`/sjablonen/${ids.arbo}`)).data;
  assert.equal(origineel.gewijzigd, false);

  // Opslaan zonder iets te veranderen telt niet als aangepast.
  const zelfde = await put(`/sjablonen/${ids.arbo}`, { naam: origineel.naam, omschrijving: origineel.omschrijving, inhoud: origineel.inhoud });
  assert.equal(zelfde.status, 200);
  assert.equal(zelfde.data.gewijzigd, false);

  const inhoud = structuredClone(origineel.inhoud);
  inhoud.vragen = inhoud.vragen.slice(0, 5);
  inhoud.acties.push('Eigen actie');
  const w = await put('/sjablonen/arbeidsvoorwaarden', { naam: 'Arbeidsvoorwaarden (kort)', omschrijving: origineel.omschrijving, inhoud });
  assert.equal(w.status, 200);
  assert.equal(w.data.gewijzigd, true);
  assert.equal(w.data.herstelbaar, true);
  const inLijst = (await api('/sjablonen')).data.sjablonen.find((s) => s.id === ids.arbo);
  assert.equal(inLijst.standaard, true);
  assert.equal(inLijst.gewijzigd, true);
  assert.equal(inLijst.naam, 'Arbeidsvoorwaarden (kort)');
  assert.equal(inLijst.samenvatting.vragen, 5);

  // Het aangepaste sjabloon wordt gebruikt bij een nieuw onderzoek via het oude kenmerk.
  const o = await post('/onderzoeken', { bedrijfsnaam: 'Kort BV', titel: 'Kort', sjablonen: ['arbeidsvoorwaarden'] });
  assert.equal(o.status, 201);
  const vl = (await api(`/onderzoeken/${o.data.id}/vragenlijsten`)).data.vragenlijsten;
  assert.equal(vl[0].aantal_vragen, 5);
  await ruimOnderzoekOp(o.data.id);

  const terug = await post(`/sjablonen/${ids.arbo}/origineel`);
  assert.equal(terug.status, 200);
  const na = (await api(`/sjablonen/${ids.arbo}`)).data;
  assert.equal(na.gewijzigd, false);
  assert.equal(na.naam, origineel.naam);
  assert.deepEqual(na.inhoud, origineel.inhoud);
  assert.equal(na.bijgewerkt_op, null);

  // Een eigen sjabloon heeft geen origineel.
  const eigen = await post(`/sjablonen/${ids.eigen}/origineel`);
  assert.equal(eigen.status, 400);
  assert.match(eigen.data.fout, /eigen sjabloon/);
  assert.equal((await post('/sjablonen/999999/origineel')).status, 404);
});

test('een verwijderd standaardsjabloon komt niet vanzelf terug; herstellen zet het terug', async () => {
  assert.equal((await del(`/sjablonen/${ids.arbo}`)).status, 200);
  for (let i = 0; i < 2; i++) {
    const r = (await api('/sjablonen')).data;
    assert.ok(!r.sjablonen.some((s) => s.bron === 'arbeidsvoorwaarden'), 'blijft weg');
    assert.deepEqual(r.ontbrekend, [{ bron: 'arbeidsvoorwaarden', naam: 'Arbeidsvoorwaarden' }]);
  }
  assert.equal((await api('/sjablonen/arbeidsvoorwaarden')).status, 404);
  const o = await post('/onderzoeken', { bedrijfsnaam: 'X', titel: 'Y', sjablonen: ['arbeidsvoorwaarden'] });
  assert.equal(o.status, 404);

  const h = await post('/sjablonen/herstellen');
  assert.equal(h.status, 200);
  assert.deepEqual(h.data.toegevoegd, ['Arbeidsvoorwaarden']);
  const na = (await api('/sjablonen')).data;
  assert.deepEqual(na.ontbrekend, []);
  assert.deepEqual(na.sjablonen.filter((s) => s.standaard).map((s) => s.bron), INGEBOUWD.map((s) => s.id));
  const terug = na.sjablonen.find((s) => s.bron === 'arbeidsvoorwaarden');
  assert.equal(terug.gewijzigd, false);
  assert.notEqual(terug.id, ids.arbo);
  ids.arbo = terug.id;
  assert.equal((await api('/sjablonen/arbeidsvoorwaarden')).data.id, ids.arbo);

  // Nog een keer herstellen voegt niets toe.
  assert.deepEqual((await post('/sjablonen/herstellen')).data.toegevoegd, []);
  assert.equal((await api('/sjablonen')).data.sjablonen.filter((s) => s.bron === 'arbeidsvoorwaarden').length, 1);
});

test('samenvoegen geeft dezelfde inhoud als toepassen op een nieuw onderzoek', async () => {
  const r = await post('/sjablonen/samenvoegen', { ids: [ids.mto, 'hr-processen'] });
  assert.equal(r.status, 200);
  const { inhoud } = r.data;
  assert.equal(r.data.aantal_vragen, 42);
  assert.equal(inhoud.vragen.length, 42); // 25 + 19, de twee achtergrondvragen één keer
  assert.equal(inhoud.themas.length, 14);
  assert.equal(inhoud.themas.at(-1).naam, 'Achtergrond');
  assert.equal(inhoud.themas.filter((t) => t.naam === 'Achtergrond').length, 1);
  assert.deepEqual(inhoud.vragen.slice(-2).map((v) => v.thema), ['Achtergrond', 'Achtergrond']);
  assert.equal(inhoud.themas.flatMap((t) => t.meetpunten).filter((m) => m.naam === 'Verzuimpercentage').length, 1);
  assert.equal(new Set(inhoud.acties).size, inhoud.acties.length);
  assert.equal(inhoud.acties.length, 9);
  assert.equal(inhoud.vragenlijst.titel, '');
  assert.match(inhoud.vragenlijst.introtekst, /\{bedrijf\}/);
  // De samengevoegde inhoud voldoet aan de regels: je kunt hem zo gebruiken of bewaren.
  assert.doesNotThrow(() => controleerSjabloonInhoud(inhoud));

  // Zelfde uitkomst als het onderzoek dat de server van dezelfde sjablonen maakt.
  const o = await post('/onderzoeken', { bedrijfsnaam: 'Zelfde BV', titel: 'Vergelijk', sjablonen: ['medewerkerstevredenheid', ids.hr] });
  assert.equal(o.status, 201);
  const det = (await api(`/onderzoeken/${o.data.id}`)).data;
  assert.deepEqual(det.themas.map((t) => t.naam), inhoud.themas.map((t) => t.naam));
  assert.deepEqual(det.themas.map((t) => t.meetpunten.map((m) => m.naam)), inhoud.themas.map((t) => t.meetpunten.map((m) => m.naam)));
  const vl = (await api(`/onderzoeken/${o.data.id}/vragenlijsten`)).data.vragenlijsten[0];
  assert.equal(vl.titel, 'Vergelijk');
  const vragen = (await api(`/vragenlijsten/${vl.id}`)).data.vragen;
  const opVolgorde = [...vragen].sort((a, b) => a.volgorde - b.volgorde);
  assert.deepEqual(opVolgorde.map((v) => v.tekst), inhoud.vragen.map((v) => v.tekst.replaceAll('{bedrijf}', 'Zelfde BV')));
  const acties = (await api(`/onderzoeken/${o.data.id}/acties`)).data.acties;
  assert.deepEqual(acties.map((a) => a.titel), inhoud.acties);
  await ruimOnderzoekOp(o.data.id);

  // Eén sjabloon: de titel van de vragenlijst blijft staan. Geen sjablonen: lege inhoud.
  const een = await post('/sjablonen/samenvoegen', { ids: [`eigen-${ids.mto}`] });
  assert.equal(een.data.inhoud.vragenlijst.titel, 'Medewerkersonderzoek');
  assert.equal(een.data.inhoud.vragen.length, 25);
  const geen = await post('/sjablonen/samenvoegen', { ids: [] });
  assert.deepEqual(geen.data.inhoud, { vragenlijst: { titel: '', introtekst: '', bedanktekst: '' }, themas: [], vragen: [], acties: [] });
  // Dubbele keuze telt één keer.
  assert.equal((await post('/sjablonen/samenvoegen', { ids: [ids.mto, ids.mto, String(ids.mto)] })).data.inhoud.vragen.length, 25);

  assert.equal((await post('/sjablonen/samenvoegen', { ids: [999999] })).status, 404);
  assert.equal((await post('/sjablonen/samenvoegen', { ids: 'x' })).status, 400);
  const teveel = await post('/sjablonen/samenvoegen', { ids: Array.from({ length: 11 }, (_, i) => i + 1) });
  assert.equal(teveel.status, 400);
  assert.match(teveel.data.fout, /maximaal 10 sjablonen/);
});

test('nieuw onderzoek met eigen inhoud: precies wat je hebt samengesteld', async () => {
  const r = await post('/onderzoeken', { bedrijfsnaam: 'Voorbeeld B.V.', titel: 'Peiling 2026', inhoud: voorbeeld() });
  assert.equal(r.status, 201);
  assert.equal(r.data.sjabloon_id, null);
  ids.onderzoek = r.data.id;

  const det = (await api(`/onderzoeken/${ids.onderzoek}`)).data;
  assert.deepEqual(det.themas.map((t) => t.naam), ['Werkdruk', 'Achtergrond']);
  // Dezelfde meetpuntnaam bij twee thema's blijft staan: je krijgt wat je hebt opgezet.
  assert.deepEqual(det.themas.map((t) => t.meetpunten.map((m) => `${m.naam}|${m.eenheid}`)), [['Ervaren werkdruk|score 1–5', 'Verzuim|%'], ['Verzuim|']]);
  assert.deepEqual(det.meetmomenten.map((m) => m.naam), ['Nulmeting']);

  const lijsten = (await api(`/onderzoeken/${ids.onderzoek}/vragenlijsten`)).data.vragenlijsten;
  assert.equal(lijsten.length, 1);
  assert.equal(lijsten[0].titel, 'Peiling Voorbeeld B.V.');
  assert.equal(lijsten[0].status, 'gesloten');
  assert.equal(lijsten[0].meetmoment_naam, 'Nulmeting');
  const vl = (await api(`/vragenlijsten/${lijsten[0].id}`)).data;
  assert.equal(vl.vragenlijst.introtekst, 'Welkom bij Voorbeeld B.V.');
  assert.equal(vl.vragenlijst.bedanktekst, 'Dank je wel!');
  assert.doesNotMatch(JSON.stringify(vl), /\{bedrijf\}/);
  const vragen = [...vl.vragen].sort((a, b) => a.volgorde - b.volgorde);
  assert.deepEqual(vragen.map((v) => v.tekst), ['Het werk bij Voorbeeld B.V. is goed te doen.', 'Wat helpt?', 'Werk je over?', 'Wat wil je kwijt?', 'Op welke afdeling werk je?']);
  const werkdruk = det.themas[0];
  const [schaal, meer, janee, open, afdeling] = vragen;
  assert.equal(schaal.thema_id, werkdruk.id);
  assert.equal(schaal.meetpunt_id, werkdruk.meetpunten[0].id);
  assert.equal(schaal.schaal_soort, 'frequentie');
  assert.equal(schaal.weet_niet, true);
  assert.equal(schaal.verplicht, true);
  assert.equal(meer.meerdere_antwoorden, true);
  assert.equal(meer.uitsplitsen, false);
  assert.deepEqual(meer.opties.map((o) => o.label), ['Rust', 'Hulp', 'Planning']);
  assert.equal(new Set(meer.opties.map((o) => o.id)).size, 3);
  assert.equal(janee.uitsplitsen, true);
  assert.equal(janee.meetpunt_id, null);
  assert.equal(open.toelichting, 'Noem geen namen.');
  assert.equal(afdeling.thema_id, det.themas[1].id);
  assert.equal(afdeling.uitsplitsen, true);

  const acties = (await api(`/onderzoeken/${ids.onderzoek}/acties`)).data.acties;
  assert.deepEqual(acties.map((a) => a.titel), ['Aankondiging sturen namens Voorbeeld B.V.', 'Resultaten bespreken']);
  const stukken = (await api(`/onderzoeken/${ids.onderzoek}/stukken`)).data.stukken;
  assert.equal(stukken.length, 3);

  // Zonder vragen komt er geen vragenlijst; een lege titel wordt de titel van het onderzoek.
  const zonder = voorbeeld();
  zonder.vragen = [];
  const o2 = await post('/onderzoeken', { bedrijfsnaam: 'Leeg BV', titel: 'Zonder vragen', inhoud: zonder });
  assert.equal((await api(`/onderzoeken/${o2.data.id}/vragenlijsten`)).data.vragenlijsten.length, 0);
  assert.equal((await api(`/onderzoeken/${o2.data.id}`)).data.themas.length, 2);
  await ruimOnderzoekOp(o2.data.id);
  const titelLeeg = voorbeeld();
  titelLeeg.vragenlijst = { titel: '', introtekst: '', bedanktekst: '' };
  const o3 = await post('/onderzoeken', { bedrijfsnaam: 'Titel BV', titel: 'Titel van het onderzoek', inhoud: titelLeeg });
  const vl3 = (await api(`/onderzoeken/${o3.data.id}/vragenlijsten`)).data.vragenlijsten[0];
  assert.equal(vl3.titel, 'Titel van het onderzoek');
  const intro3 = (await api(`/vragenlijsten/${vl3.id}`)).data.vragenlijst.introtekst;
  assert.match(intro3, /Titel BV/);
  assert.match(intro3, /minstens 5 personen/);
  await ruimOnderzoekOp(o3.data.id);

  // Lege inhoud geeft een leeg onderzoek.
  const o4 = await post('/onderzoeken', { bedrijfsnaam: 'Niets BV', titel: 'Leeg', inhoud: {} });
  assert.equal(o4.status, 201);
  assert.equal((await api(`/onderzoeken/${o4.data.id}`)).data.themas.length, 0);
  await ruimOnderzoekOp(o4.data.id);
});

test('nieuw onderzoek: inhoud ook bewaren als nieuw sjabloon', async () => {
  const aantalVoor = (await api('/onderzoeken')).data.onderzoeken.length;
  const sjablonenVoor = (await api('/sjablonen')).data.sjablonen.length;

  // Alles wordt gecontroleerd vóór er iets wordt aangemaakt.
  const zonderNaam = await post('/onderzoeken', { bedrijfsnaam: 'A', titel: 'B', inhoud: voorbeeld(), opslaan_als_sjabloon: { naam: ' ' } });
  assert.equal(zonderNaam.status, 400);
  assert.match(zonderNaam.data.fout, /Naam van het sjabloon is verplicht/);
  const zonderInhoud = await post('/onderzoeken', { bedrijfsnaam: 'A', titel: 'B', sjablonen: [ids.mto], opslaan_als_sjabloon: { naam: 'X' } });
  assert.equal(zonderInhoud.status, 400);
  const geenObject = await post('/onderzoeken', { bedrijfsnaam: 'A', titel: 'B', inhoud: voorbeeld(), opslaan_als_sjabloon: 'ja' });
  assert.equal(geenObject.status, 400);
  const onbekendSjabloon = await post('/onderzoeken', { bedrijfsnaam: 'A', titel: 'B', sjablonen: [999999], inhoud: voorbeeld() });
  assert.equal(onbekendSjabloon.status, 404);
  assert.equal((await api('/onderzoeken')).data.onderzoeken.length, aantalVoor);
  assert.equal((await api('/sjablonen')).data.sjablonen.length, sjablonenVoor);

  const r = await post('/onderzoeken', {
    bedrijfsnaam: 'Acme $& Co',
    titel: 'Met sjabloon',
    inhoud: voorbeeld(),
    opslaan_als_sjabloon: { naam: 'Bewaard bij aanmaken', omschrijving: 'Uit de test' },
  });
  assert.equal(r.status, 201);
  assert.equal(typeof r.data.sjabloon_id, 'number');
  const s = (await api(`/sjablonen/${r.data.sjabloon_id}`)).data;
  assert.equal(s.naam, 'Bewaard bij aanmaken');
  assert.equal(s.omschrijving, 'Uit de test');
  assert.equal(s.standaard, false);
  // In het sjabloon blijft {bedrijf} staan; in het onderzoek staat de bedrijfsnaam.
  assert.deepEqual(s.inhoud, controleerSjabloonInhoud(voorbeeld()));
  const vl = (await api(`/onderzoeken/${r.data.id}/vragenlijsten`)).data.vragenlijsten[0];
  assert.equal(vl.titel, 'Peiling Acme $& Co');
  await ruimOnderzoekOp(r.data.id);

  // Sjablonen én eigen inhoud samen: alles wordt samengevoegd.
  const beide = await post('/onderzoeken', { bedrijfsnaam: 'Beide BV', titel: 'Beide', sjablonen: [ids.mto], inhoud: voorbeeld() });
  assert.equal(beide.status, 201);
  const vlBeide = (await api(`/onderzoeken/${beide.data.id}/vragenlijsten`)).data.vragenlijsten;
  assert.equal(vlBeide.length, 1);
  assert.equal(vlBeide[0].aantal_vragen, 25 + 4); // "Op welke afdeling werk je?" staat in beide
  await ruimOnderzoekOp(beide.data.id);

  // Te veel vragen samen: geweigerd, niets aangemaakt.
  const veel = voorbeeld();
  veel.vragen = Array.from({ length: 90 }, (_, i) => ({ thema: 'Werkdruk', type: 'open', tekst: `Extra vraag ${i}?` }));
  const teveel = await post('/onderzoeken', { bedrijfsnaam: 'Teveel BV', titel: 'Teveel', sjablonen: [ids.mto], inhoud: veel });
  assert.equal(teveel.status, 400);
  assert.match(teveel.data.fout, /samen 115 vragen/);
  assert.ok(!(await api('/onderzoeken')).data.onderzoeken.some((o) => o.bedrijfsnaam === 'Teveel BV'));
  await del(`/sjablonen/${r.data.sjabloon_id}`);
});

test('opslaan als sjabloon vanuit een onderzoek en toepassen op een bestaand onderzoek (oude en nieuwe verwijzingen)', async () => {
  const s = await post(`/onderzoeken/${ids.onderzoek}/als-sjabloon`, { naam: 'Uit onderzoek' });
  assert.equal(s.status, 201);
  assert.equal(typeof s.data.id, 'number');
  const det = (await api(`/sjablonen/${s.data.id}`)).data;
  assert.equal(det.standaard, false);
  assert.match(JSON.stringify(det.inhoud), /\{bedrijf\}/);
  assert.doesNotMatch(JSON.stringify(det.inhoud), /Voorbeeld B\.V\./);
  assert.equal(det.inhoud.vragen.length, 5);
  // Het bewaarde sjabloon heeft de vaste vorm en is dus direct te bewerken en op te slaan.
  assert.deepEqual(controleerSjabloonInhoud(det.inhoud), det.inhoud);
  assert.equal((await put(`/sjablonen/${s.data.id}`, { naam: det.naam, omschrijving: det.omschrijving, inhoud: det.inhoud })).status, 200);
  assert.equal((await post(`/onderzoeken/${ids.onderzoek}/als-sjabloon`, {})).status, 400);

  // Toepassen op hetzelfde onderzoek: thema's, meetpunten en acties niet dubbel, wel een tweede vragenlijst.
  const voor = (await api(`/onderzoeken/${ids.onderzoek}`)).data;
  for (const ref of [s.data.id, `eigen-${s.data.id}`]) {
    const t = await post(`/onderzoeken/${ids.onderzoek}/sjabloon`, { sjabloon: ref, meetmoment_id: voor.meetmomenten[0].id });
    assert.equal(t.status, 200, String(ref));
    assert.equal(typeof t.data.vragenlijst_id, 'number');
  }
  const na = (await api(`/onderzoeken/${ids.onderzoek}`)).data;
  assert.deepEqual(na.themas.map((t) => [t.naam, t.meetpunten.length]), voor.themas.map((t) => [t.naam, t.meetpunten.length]));
  assert.equal((await api(`/onderzoeken/${ids.onderzoek}/vragenlijsten`)).data.vragenlijsten.length, 3);
  assert.equal((await api(`/onderzoeken/${ids.onderzoek}/acties`)).data.acties.length, 2);

  // Een standaardsjabloon erbij via het oude kenmerk: nieuwe thema's achteraan, bestaande blijven.
  const t = await post(`/onderzoeken/${ids.onderzoek}/sjabloon`, { sjabloon: 'hr-processen' });
  assert.equal(t.status, 200);
  const metHr = (await api(`/onderzoeken/${ids.onderzoek}`)).data;
  assert.equal(metHr.themas.filter((x) => x.naam === 'Achtergrond').length, 1);
  assert.ok(metHr.themas.some((x) => x.naam === 'Onboarding'));
  assert.deepEqual(metHr.themas.slice(0, 2).map((x) => x.naam), ['Werkdruk', 'Achtergrond']);
  const volgordes = metHr.themas.map((x) => x.volgorde);
  assert.equal(new Set(volgordes).size, volgordes.length, 'elk thema heeft een eigen volgnummer');
  const vragenHr = (await api(`/vragenlijsten/${t.data.vragenlijst_id}`)).data.vragen;
  assert.equal(vragenHr.length, 19);
  const themaIds = new Set(metHr.themas.map((x) => x.id));
  const meetpuntIds = new Set(metHr.themas.flatMap((x) => x.meetpunten.map((m) => m.id)));
  assert.ok(vragenHr.every((v) => themaIds.has(v.thema_id)));
  assert.ok(vragenHr.filter((v) => v.meetpunt_id).length >= 14);
  assert.ok(vragenHr.every((v) => !v.meetpunt_id || meetpuntIds.has(v.meetpunt_id)));

  assert.equal((await post(`/onderzoeken/${ids.onderzoek}/sjabloon`, { sjabloon: 'bestaat-niet' })).status, 404);
  assert.equal((await post(`/onderzoeken/${ids.onderzoek}/sjabloon`, { sjabloon: null })).status, 400);
  await del(`/sjablonen/${s.data.id}`);
});

test('sjablonen zijn afgeschermd zonder inlog', async () => {
  for (const [methode, pad] of [['GET', '/sjablonen'], ['POST', '/sjablonen'], ['POST', '/sjablonen/samenvoegen'], ['POST', '/sjablonen/herstellen'],
    ['PUT', '/sjablonen/1'], ['DELETE', '/sjablonen/1'], ['POST', '/sjablonen/1/origineel']]) {
    const r = await fetch(`${BASIS}/api/beheer${pad}`, {
      method: methode,
      headers: methode === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: methode === 'GET' ? undefined : '{}',
    });
    assert.equal(r.status, 401, `${methode} ${pad}`);
  }
});

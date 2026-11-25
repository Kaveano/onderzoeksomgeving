// Automatische test van de server (API). Start zelf een lokale testserver met een lege database.
// Uitvoeren: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const POORT = 8799;
const BASIS = `http://127.0.0.1:${POORT}`;
const WACHTWOORD = 'test-wachtwoord-voor-tests';
let server;
let map;
let cookie = '';

async function wacht(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

before(async () => {
  map = mkdtempSync(join(tmpdir(), 'onderzoek-test-'));
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
      if (r.ok) return;
    } catch {
      /* nog niet klaar */
    }
    await wacht(500);
  }
  throw new Error('Testserver start niet');
});

after(() => {
  try {
    process.kill(-server.pid);
  } catch {
    /* al gestopt */
  }
  rmSync(map, { recursive: true, force: true });
});

async function api(pad, { methode = 'GET', body, metCookie = true, koppen = {} } = {}) {
  const r = await fetch(BASIS + pad, {
    method: methode,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(metCookie && cookie ? { Cookie: cookie } : {}),
      ...koppen,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const tekst = await r.text();
  let data = null;
  try {
    data = JSON.parse(tekst);
  } catch {
    data = tekst;
  }
  return { status: r.status, data, koppen: r.headers };
}

const ids = {};

test('beheer is afgeschermd zonder inlog', async () => {
  const r = await api('/api/beheer/onderzoeken', { metCookie: false });
  assert.equal(r.status, 401);
  assert.match(r.data.fout, /niet \(meer\) ingelogd/);
});

test('verkeerd wachtwoord wordt geweigerd, juist wachtwoord geeft veilige cookie', async () => {
  const fout = await api('/api/inloggen', { methode: 'POST', body: { wachtwoord: 'fout' }, metCookie: false });
  assert.equal(fout.status, 401);
  const r = await fetch(`${BASIS}/api/inloggen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wachtwoord: WACHTWOORD }),
  });
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /^__Host-sessie=/);
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /Secure/);
  assert.match(sc, /SameSite=Strict/);
  cookie = sc.split(';')[0];
  const s = await api('/api/sessie');
  assert.equal(s.data.ingelogd, true);
});

test('verzoeken van een andere website worden geweigerd', async () => {
  const r = await api('/api/beheer/onderzoeken', {
    methode: 'POST',
    body: { bedrijfsnaam: 'X', titel: 'Y' },
    koppen: { Origin: 'https://kwaadaardig.example' },
  });
  assert.equal(r.status, 403);
});

test('beveiligingskoppen staan op API-antwoorden', async () => {
  const r = await api('/api/sessie');
  assert.equal(r.koppen.get('x-content-type-options'), 'nosniff');
  assert.equal(r.koppen.get('referrer-policy'), 'no-referrer');
  assert.match(r.koppen.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.koppen.get('cache-control'), 'no-store');
});

test('sjablonen zijn beschikbaar', async () => {
  const r = await api('/api/beheer/sjablonen');
  assert.equal(r.status, 200);
  const namen = r.data.sjablonen.map((s) => s.id);
  assert.deepEqual(namen, ['medewerkerstevredenheid', 'hr-processen', 'arbeidsvoorwaarden']);
});

test('invoer wordt gecontroleerd', async () => {
  const r = await api('/api/beheer/onderzoeken', { methode: 'POST', body: { titel: 'Zonder bedrijf' } });
  assert.equal(r.status, 400);
  assert.match(r.data.fout, /Bedrijfsnaam is verplicht/);
  const lang = await api('/api/beheer/onderzoeken', { methode: 'POST', body: { bedrijfsnaam: 'x'.repeat(151), titel: 't' } });
  assert.equal(lang.status, 400);
  const geenJson = await fetch(`${BASIS}/api/beheer/onderzoeken`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(geenJson.status, 415);
});

test('nieuw onderzoek met sjabloon maakt thema\'s, vragenlijst, meetmoment, stukken en acties', async () => {
  const r = await api('/api/beheer/onderzoeken', {
    methode: 'POST',
    body: { bedrijfsnaam: 'Testbedrijf BV', titel: 'MTO 2026', onderzoeksvraag: 'Hoe tevreden zijn medewerkers?', sjablonen: ['medewerkerstevredenheid'] },
  });
  assert.equal(r.status, 201);
  ids.onderzoek = r.data.id;
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}`);
  assert.equal(d.data.onderzoek.status, 'actief');
  assert.ok(d.data.themas.length >= 7);
  assert.equal(d.data.themas.at(-1).naam, 'Achtergrond');
  assert.equal(d.data.meetmomenten[0].naam, 'Nulmeting');
  ids.nulmeting = d.data.meetmomenten[0].id;
  ids.themaWerkdruk = d.data.themas.find((t) => t.naam === 'Werkdruk en balans').id;
  ids.themaVerzuim = d.data.themas.find((t) => t.naam === 'Verzuim en verloop').id;
  ids.meetpuntVerzuim = d.data.themas.find((t) => t.naam === 'Verzuim en verloop').meetpunten.find((m) => m.naam === 'Verzuimpercentage').id;

  const vl = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/vragenlijsten`);
  assert.equal(vl.data.vragenlijsten.length, 1);
  assert.equal(vl.data.vragenlijsten[0].status, 'gesloten');
  assert.match(vl.data.vragenlijsten[0].code, /^[A-Za-z0-9_-]{22}$/);
  ids.vragenlijst = vl.data.vragenlijsten[0].id;
  ids.code = vl.data.vragenlijsten[0].code;

  const st = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/stukken`);
  assert.deepEqual(st.data.stukken.map((s) => s.titel), ['Notities', 'Bevindingen', 'Conceptrapport']);
  const ac = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/acties`);
  assert.ok(ac.data.acties.length >= 5);

  const det = await api(`/api/beheer/vragenlijsten/${ids.vragenlijst}`);
  assert.match(det.data.vragenlijst.introtekst, /Testbedrijf BV/);
  assert.doesNotMatch(JSON.stringify(det.data), /\{bedrijf\}/);
});

test('openbare vragenlijst is gesloten tot je hem openzet', async () => {
  const r = await api(`/api/publiek/${ids.code}`, { metCookie: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'gesloten');
  const post = await api(`/api/publiek/${ids.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: { 1: 3 } } });
  assert.equal(post.status, 409);
  const open = await api(`/api/beheer/vragenlijsten/${ids.vragenlijst}/status`, { methode: 'POST', body: { status: 'open' } });
  assert.equal(open.status, 200);
});

test('onbekende of ongeldige code geeft 404', async () => {
  assert.equal((await api('/api/publiek/bestaatniet1234567890', { metCookie: false })).status, 404);
  assert.equal((await api('/api/publiek/x', { metCookie: false })).status, 404);
});

let vragen;
function vindVraag(pred) {
  return vragen.find(pred);
}

test('openbare vragenlijst toont alleen wat nodig is', async () => {
  const r = await api(`/api/publiek/${ids.code}`, { metCookie: false });
  assert.equal(r.data.status, 'open');
  assert.match(r.data.introtekst, /anoniem/);
  vragen = r.data.themas.flatMap((t) => t.vragen);
  const json = JSON.stringify(r.data);
  assert.doesNotMatch(json, /uitsplitsen|meetpunt|onderzoek_id|code/);
  assert.ok(vindVraag((q) => q.type === 'schaal').schaal_labels.length === 5);
});

function antwoordenVoor(afdelingIndex, score) {
  const a = {};
  for (const q of vragen) {
    if (q.type === 'schaal') a[q.id] = score;
    if (q.type === 'janee') a[q.id] = score >= 3 ? 'ja' : 'nee';
    if (q.type === 'open') a[q.id] = `Opmerking bij score ${score}`;
    if (q.type === 'meerkeuze') a[q.id] = q.opties[Math.min(afdelingIndex, q.opties.length - 1)].id;
  }
  return a;
}

test('ongeldige antwoorden worden geweigerd', async () => {
  const schaal = vindVraag((q) => q.type === 'schaal' && !q.weet_niet);
  const mk = vindVraag((q) => q.type === 'meerkeuze');
  for (const fout of [{ [schaal.id]: 6 }, { [schaal.id]: 'weet_niet' }, { [schaal.id]: 2.5 }, { [mk.id]: 'o999' }, { [mk.id]: ['o1'] }]) {
    const r = await api(`/api/publiek/${ids.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: fout } });
    assert.equal(r.status, 400, JSON.stringify(fout));
  }
  const leeg = await api(`/api/publiek/${ids.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: {} } });
  assert.equal(leeg.status, 400);
  const teLang = await api(`/api/publiek/${ids.code}`, {
    methode: 'POST', metCookie: false, body: { antwoorden: { [vindVraag((q) => q.type === 'open').id]: 'x'.repeat(5001) } },
  });
  assert.equal(teLang.status, 400);
});

test('lokaasveld: robot krijgt "ok" maar er wordt niets opgeslagen', async () => {
  const r = await api(`/api/publiek/${ids.code}`, {
    methode: 'POST', metCookie: false, body: { antwoorden: antwoordenVoor(0, 4), website: 'http://spam.example' },
  });
  assert.equal(r.status, 200);
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard`);
  assert.equal(d.data.respons[0].aantal, 0);
});

test('respondenten kunnen invullen; er wordt geen persoonsinformatie opgeslagen', async () => {
  // 6 respondenten in afdeling A (score 4), 2 in afdeling B (score 2), 1 in afdeling C (score 1)
  const plan = [...Array(6).fill([0, 4]), ...Array(2).fill([1, 2]), [2, 1]];
  for (const [afd, score] of plan) {
    const r = await api(`/api/publiek/${ids.code}`, {
      methode: 'POST',
      metCookie: false,
      body: { antwoorden: antwoordenVoor(afd, score) },
      koppen: { 'User-Agent': 'TestBrowser/1.0', 'X-Forwarded-For': '203.0.113.7', 'CF-Connecting-IP': '203.0.113.7' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.bedanktekst, /dank/i);
  }
  const exp = await fetch(`${BASIS}/api/beheer/onderzoeken/${ids.onderzoek}/export/data`, { headers: { Cookie: cookie } });
  const tekst = await exp.text();
  assert.doesNotMatch(tekst, /203\.0\.113\.7|TestBrowser/);
  const data = JSON.parse(tekst);
  const inz = data.inzendingen[0];
  assert.deepEqual(Object.keys(inz).sort(), ['antwoorden', 'datum', 'vragenlijst_id']);
  assert.match(inz.datum, /^\d{4}-\d{2}-\d{2}$/);
});

test('dashboard: respons, gemiddelden, verdeling en open antwoorden', async () => {
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard`);
  assert.equal(d.status, 200);
  assert.equal(d.data.respons[0].aantal, 9);
  const s = d.data.selectie;
  assert.equal(s.n, 9);
  assert.equal(s.klein, false);
  // (6*4 + 2*2 + 1*1)/9 = 3,22
  const werkdruk = s.themas.find((t) => t.thema_id === ids.themaWerkdruk);
  assert.ok(Math.abs(werkdruk.gemiddelde - 29 / 9) < 1e-9); // exact; het scherm rondt één keer af
  assert.equal(werkdruk.n, 9);
  const schaal = s.vragen.find((q) => q.type === 'schaal');
  assert.deepEqual(schaal.verdeling.slice(0, 5).map((x) => x.aantal), [1, 2, 0, 6, 0]);
  assert.equal(s.open[0].antwoorden.length, 9);
  assert.ok(s.uitsplitsvragen.length >= 1);
  assert.equal(d.data.verloop.themas.length > 0, true);
});

test('uitsplitsing verbergt groepen onder de 5 en voorkomt terugrekenen', async () => {
  const d0 = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard`);
  const afdeling = d0.data.selectie.uitsplitsvragen.find((q) => /afdeling/i.test(q.tekst));
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard?uitsplitsen=${afdeling.id}`);
  const g = d.data.selectie.uitsplitsing.groepen;
  // A (6) zichtbaar; B (2) + C (1) = 3 < 5 → A gaat er ook in op → alles samen = 9, geen losse groepen.
  const zichtbaar = g.filter((x) => !x.verborgen);
  for (const groep of zichtbaar) assert.ok(groep.n >= 5);
  assert.ok(!zichtbaar.some((x) => x.label === 'Afdeling B' || x.label === 'Afdeling C'));
  const tekst = JSON.stringify(g);
  assert.doesNotMatch(tekst, /"n":[1-4][,}]/);
  // Een groep van 6 zonder de rest mag niet los staan: dan is B+C = totaal - A terug te rekenen.
  assert.ok(!zichtbaar.some((x) => x.label === 'Afdeling A'));
});

test('uitsplitsing toont groepen van 5 of meer wel', async () => {
  // Nog 5 respondenten in afdeling B → B = 7, C = 1 (verborgen, samen met kleinste zichtbare)
  for (let i = 0; i < 5; i++) {
    await api(`/api/publiek/${ids.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: antwoordenVoor(1, 3) } });
  }
  const d0 = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard`);
  const afdeling = d0.data.selectie.uitsplitsvragen.find((q) => /afdeling/i.test(q.tekst));
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard?uitsplitsen=${afdeling.id}`);
  const g = d.data.selectie.uitsplitsing.groepen;
  // A=6, B=7, C=1 → C te klein; C+kleinste(A=6)=7 → "Overige groepen samen" (A+C) zichtbaar, B zichtbaar.
  const b = g.find((x) => x.label === 'Afdeling B');
  assert.equal(b.n, 7);
  const overig = g.find((x) => x.label === 'Overige groepen samen');
  assert.equal(overig.n, 7);
  assert.deepEqual(overig.samengevoegd.sort(), ['Afdeling A', 'Afdeling C']);
  assert.ok(!g.some((x) => x.label === 'Afdeling C' && !x.verborgen));
});

test('eigen invoer: cijfers verschijnen op het dashboard', async () => {
  const r = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/invoer`, {
    methode: 'POST',
    body: { soort: 'cijfer', thema_id: ids.themaVerzuim, meetpunt_id: ids.meetpuntVerzuim, datum: '2026-10-01', titel: 'Verzuim Q3', waarde: '5,4', eenheid: '%' },
  });
  assert.equal(r.status, 201);
  const zonder = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/invoer`, {
    methode: 'POST', body: { soort: 'cijfer', thema_id: ids.themaVerzuim, datum: '2026-10-01', titel: 'Geen waarde' },
  });
  assert.equal(zonder.status, 400);
  const foutDatum = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/invoer`, {
    methode: 'POST', body: { soort: 'interview', thema_id: ids.themaVerzuim, datum: '2026-02-30', titel: 'x' },
  });
  assert.equal(foutDatum.status, 400);
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard`);
  const reeks = d.data.eigen_cijfers.find((c) => c.meetpunt_id === ids.meetpuntVerzuim);
  assert.equal(reeks.punten[0].waarde, 5.4);
});

test('stukken: opslaan, cijfers toevoegen en conflict bij gelijktijdig bewerken', async () => {
  const st = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/stukken`);
  const stuk = st.data.stukken[1];
  const det = await api(`/api/beheer/stukken/${stuk.id}`);
  const versie = det.data.stuk.bijgewerkt_op;
  const r1 = await api(`/api/beheer/stukken/${stuk.id}`, { methode: 'PUT', body: { inhoud: 'Eerste versie', bijgewerkt_op: versie } });
  assert.equal(r1.status, 200);
  const r2 = await api(`/api/beheer/stukken/${stuk.id}`, { methode: 'PUT', body: { inhoud: 'Oude tab', bijgewerkt_op: versie } });
  assert.equal(r2.status, 409);
  assert.equal(r2.data.actueel.inhoud, 'Eerste versie');
  const t = await api(`/api/beheer/stukken/${stuk.id}/toevoegen`, { methode: 'POST', body: { tekst: 'Werkdruk: gemiddeld 3,2 (n=9)' } });
  assert.equal(t.status, 200);
  const na = await api(`/api/beheer/stukken/${stuk.id}`);
  assert.equal(na.data.stuk.inhoud, 'Eerste versie\n\nWerkdruk: gemiddeld 3,2 (n=9)\n');
  ids.stuk = stuk.id;
});

test('acties: aanmaken, status wijzigen en ongeldige status weigeren', async () => {
  const r = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/acties`, { methode: 'POST', body: { titel: 'Rapport afronden', datum: '2026-12-15' } });
  assert.equal(r.status, 201);
  const w = await api(`/api/beheer/acties/${r.data.id}`, { methode: 'PUT', body: { titel: 'Rapport afronden', status: 'klaar', datum: '2026-12-15' } });
  assert.equal(w.status, 200);
  const fout = await api(`/api/beheer/acties/${r.data.id}`, { methode: 'PUT', body: { titel: 'x', status: 'misschien' } });
  assert.equal(fout.status, 400);
});

test('vragen beheren: type niet wijzigen als er al antwoorden zijn', async () => {
  const det = await api(`/api/beheer/vragenlijsten/${ids.vragenlijst}`);
  const schaal = det.data.vragen.find((q) => q.type === 'schaal');
  const r = await api(`/api/beheer/vragen/${schaal.id}`, { methode: 'PUT', body: { ...schaal, type: 'open' } });
  assert.equal(r.status, 409);
  const ok = await api(`/api/beheer/vragen/${schaal.id}`, { methode: 'PUT', body: { ...schaal, tekst: 'Aangepaste vraagtekst' } });
  assert.equal(ok.status, 200);
  const mk = await api(`/api/beheer/vragenlijsten/${ids.vragenlijst}/vragen`, {
    methode: 'POST', body: { type: 'meerkeuze', thema_id: ids.themaWerkdruk, tekst: 'Te weinig opties', opties: ['Een'] },
  });
  assert.equal(mk.status, 400);
});

test('kopie voor vervolgmeting en verloop over meetmomenten', async () => {
  const mm = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/meetmomenten`, { methode: 'POST', body: { naam: 'Vervolgmeting', datum: '2027-06-01' } });
  assert.equal(mm.status, 201);
  await api(`/api/beheer/meetmomenten/${ids.nulmeting}`, { methode: 'PUT', body: { naam: 'Nulmeting', datum: '2026-11-01' } });
  const kopie = await api(`/api/beheer/vragenlijsten/${ids.vragenlijst}/kopie`, { methode: 'POST', body: { titel: 'Vervolgmeting', meetmoment_id: mm.data.id } });
  assert.equal(kopie.status, 201);
  const lijst = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/vragenlijsten`);
  const nieuw = lijst.data.vragenlijsten.find((l) => l.id === kopie.data.id);
  assert.notEqual(nieuw.code, ids.code);
  await api(`/api/beheer/vragenlijsten/${kopie.data.id}/status`, { methode: 'POST', body: { status: 'open' } });
  const pub = await api(`/api/publiek/${nieuw.code}`, { metCookie: false });
  const a = {};
  for (const q of pub.data.themas.flatMap((t) => t.vragen)) if (q.type === 'schaal') a[q.id] = 5;
  for (let i = 0; i < 3; i++) await api(`/api/publiek/${nieuw.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: a } });
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard?vragenlijst=${kopie.data.id}`);
  assert.equal(d.data.selectie.klein, true);
  const werkdruk = d.data.verloop.themas.find((t) => t.thema_id === ids.themaWerkdruk);
  assert.equal(werkdruk.punten.length, 2);
  assert.equal(werkdruk.punten[1].gemiddelde, 5);
  const vraag = d.data.selectie.vragen.find((q) => q.type === 'schaal');
  assert.equal(vraag.verloop.length, 2);
  ids.vervolg = kopie.data.id;
});

test('maximum aantal inzendingen per link', async () => {
  const det = await api(`/api/beheer/vragenlijsten/${ids.vervolg}`);
  const vl = det.data.vragenlijst;
  await api(`/api/beheer/vragenlijsten/${ids.vervolg}`, { methode: 'PUT', body: { ...vl, max_inzendingen: 3, status: 'open' } });
  const pub = await api(`/api/publiek/${vl.code}`, { metCookie: false });
  const q = pub.data.themas[0].vragen[0];
  const r = await api(`/api/publiek/${vl.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: { [q.id]: 3 } } });
  assert.equal(r.status, 409);
  assert.match(r.data.fout, /maximale aantal/);
});

test('export: gegevens voor de browser, CSV voor Nederlandse Excel zonder formules, stukken als leesbare tekst', async () => {
  await api(`/api/publiek/${ids.code}`, {
    methode: 'POST', metCookie: false,
    body: { antwoorden: { [vindVraag((q) => q.type === 'open').id]: '=HYPERLINK("http://kwaad.example")' } },
  });
  const exp = await import('../public/js/beheer/export.js');
  const r = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/export/data`);
  assert.equal(r.status, 200);
  const data = r.data;
  assert.equal(data.onderzoek.bedrijfsnaam, 'Testbedrijf BV');
  assert.ok(data.inzendingen.length >= 15);

  const breed = exp.antwoordenVragenlijstCsv(data, ids.vragenlijst);
  assert.equal(breed.charCodeAt(0), 0xfeff); // BOM: zo herkent Excel UTF-8
  assert.match(breed.split('\r\n')[0], /^\uFEFFRespondent;Datum;/);
  assert.match(breed, /"'=HYPERLINK\(""http:\/\/kwaad\.example""\)"/);
  const lang = exp.alleAntwoordenCsv(data);
  assert.match(lang, /Vragenlijst;Meetmoment;Respondent/);
  assert.match(lang, /;Schaal 1 tot 5;Eens;4/);
  assert.match(exp.eigenInvoerCsv(data), /Verzuim Q3;5,4;%/);
  const json = JSON.parse(exp.volledigeJson(data));
  assert.equal(json.vragenlijsten[0].inzendingen[0].respondent, 1);
  assert.match(exp.bestandsnaam(data, 'alle-antwoorden', 'csv'), /^testbedrijf-bv-alle-antwoorden-\d{4}-\d{2}-\d{2}\.csv$/);

  await api(`/api/beheer/stukken/${ids.stuk}`, { methode: 'PUT', body: { inhoud: '## Conclusie\n- **Werkdruk** is hoog\n\nWerkdruk: gemiddeld 3,2' , overschrijven: true } });
  const txt = await fetch(`${BASIS}/api/beheer/onderzoeken/${ids.onderzoek}/export/stukken.txt`, { headers: { Cookie: cookie } });
  const t = await txt.text();
  assert.match(t, /Conclusie\r\n-+\r\n• Werkdruk is hoog/);
  assert.doesNotMatch(t, /\*\*|## /);
});

test('opslaan als eigen sjabloon en weer toepassen op een nieuw onderzoek', async () => {
  const s = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/als-sjabloon`, { methode: 'POST', body: { naam: 'Mijn MTO' } });
  assert.equal(s.status, 201);
  const det = await api(`/api/beheer/sjablonen/${s.data.id}`);
  assert.match(JSON.stringify(det.data.inhoud), /\{bedrijf\}/);
  assert.doesNotMatch(JSON.stringify(det.data.inhoud), /Testbedrijf BV/);
  const n = await api('/api/beheer/onderzoeken', { methode: 'POST', body: { bedrijfsnaam: 'Ander Bedrijf', titel: 'MTO', sjablonen: [s.data.id] } });
  assert.equal(n.status, 201);
  const vl = await api(`/api/beheer/onderzoeken/${n.data.id}/vragenlijsten`);
  const v = await api(`/api/beheer/vragenlijsten/${vl.data.vragenlijsten[0].id}`);
  assert.ok(v.data.vragen.some((q) => q.tekst === 'Aangepaste vraagtekst'));
  assert.match(v.data.vragenlijst.introtekst, /Ander Bedrijf/);
  const standaard = await api('/api/beheer/sjablonen/medewerkerstevredenheid', { methode: 'DELETE' });
  assert.equal(standaard.status, 400);
  ids.tweede = n.data.id;
});

test('drempel per getal: een score in een groep alleen bij minstens 5 respondenten (en niet terug te rekenen)', async () => {
  const vl = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Celtest' } });
  const q1 = await api(`/api/beheer/vragenlijsten/${vl.data.id}/vragen`, {
    methode: 'POST', body: { type: 'janee', thema_id: ids.themaWerkdruk, tekst: 'Geef je leiding?', uitsplitsen: true },
  });
  const sv = await api(`/api/beheer/vragenlijsten/${vl.data.id}/vragen`, {
    methode: 'POST', body: { type: 'schaal', thema_id: ids.themaWerkdruk, tekst: 'Ik heb het naar mijn zin.' },
  });
  await api(`/api/beheer/vragenlijsten/${vl.data.id}/status`, { methode: 'POST', body: { status: 'open' } });
  const det = await api(`/api/beheer/vragenlijsten/${vl.data.id}`);
  const code = det.data.vragenlijst.code;
  const stuur = (a) => api(`/api/publiek/${code}`, { methode: 'POST', metCookie: false, body: { antwoorden: a } });
  for (let i = 0; i < 6; i++) await stuur({ [q1.data.id]: 'ja', [sv.data.id]: 4 });
  for (let i = 0; i < 4; i++) await stuur({ [q1.data.id]: 'nee' });
  await stuur({ [q1.data.id]: 'nee', [sv.data.id]: 1 });
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard?vragenlijst=${vl.data.id}&uitsplitsen=${q1.data.id}`);
  const g = d.data.selectie.uitsplitsing.groepen;
  const nee = g.find((x) => x.label === 'Nee');
  const ja = g.find((x) => x.label === 'Ja');
  assert.equal(nee.n, 5);
  // Bij "Nee" vulde maar 1 persoon de schaalvraag in: niet tonen.
  assert.equal(nee.themas[0].verborgen, true);
  assert.equal(nee.themas[0].gemiddelde, null);
  assert.equal(nee.vragen[0].gemiddelde, null);
  // En dan ook "Ja" niet, anders is "Nee" uit het totaal terug te rekenen.
  assert.equal(ja.themas[0].verborgen, true);
  assert.equal(ja.themas[0].gemiddelde, null);
  assert.doesNotMatch(JSON.stringify(g), /"antwoorden"/);
});

test('antwoordmogelijkheden: oude antwoorden schuiven nooit naar een nieuwe optie', async () => {
  const vl = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Optietest' } });
  const q = await api(`/api/beheer/vragenlijsten/${vl.data.id}/vragen`, {
    methode: 'POST', body: { type: 'meerkeuze', thema_id: ids.themaWerkdruk, tekst: 'Hoe kom je naar je werk?', opties: ['Auto', 'Fiets', 'OV'] },
  });
  await api(`/api/beheer/vragenlijsten/${vl.data.id}/status`, { methode: 'POST', body: { status: 'open' } });
  const det = await api(`/api/beheer/vragenlijsten/${vl.data.id}`);
  const vraag = det.data.vragen[0];
  const ov = vraag.opties.find((o) => o.label === 'OV').id;
  for (let i = 0; i < 4; i++) {
    await api(`/api/publiek/${det.data.vragenlijst.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: { [q.data.id]: ov } } });
  }
  const nieuw = [...vraag.opties.filter((o) => o.label !== 'OV'), { label: 'Thuiswerken' }];
  const w = await api(`/api/beheer/vragen/${q.data.id}`, { methode: 'PUT', body: { ...vraag, opties: nieuw } });
  assert.equal(w.status, 200);
  const na = await api(`/api/beheer/vragenlijsten/${vl.data.id}`);
  const thuis = na.data.vragen[0].opties.find((o) => o.label === 'Thuiswerken');
  assert.notEqual(thuis.id, ov);
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard?vragenlijst=${vl.data.id}`);
  const verdeling = d.data.selectie.vragen[0].verdeling;
  assert.equal(verdeling.find((x) => x.label === 'Thuiswerken').aantal, 0);
  // Laatste vraag van een open vragenlijst verwijderen: de vragenlijst gaat dicht.
  const del = await api(`/api/beheer/vragen/${q.data.id}`, { methode: 'DELETE' });
  assert.equal(del.data.vragenlijst_gesloten, true);
});

test('limieten houden stand bij gelijktijdige inzendingen', async () => {
  const vl = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/vragenlijsten`, { methode: 'POST', body: { titel: 'Limiettest' } });
  const q = await api(`/api/beheer/vragenlijsten/${vl.data.id}/vragen`, {
    methode: 'POST', body: { type: 'schaal', thema_id: ids.themaWerkdruk, tekst: 'Test' },
  });
  const det = await api(`/api/beheer/vragenlijsten/${vl.data.id}`);
  await api(`/api/beheer/vragenlijsten/${vl.data.id}`, { methode: 'PUT', body: { ...det.data.vragenlijst, max_inzendingen: 3, status: 'open' } });
  const pogingen = await Promise.all(Array.from({ length: 20 }, () =>
    api(`/api/publiek/${det.data.vragenlijst.code}`, { methode: 'POST', metCookie: false, body: { antwoorden: { [q.data.id]: 3 } } })));
  assert.equal(pogingen.filter((p) => p.status === 200).length, 3);
  const lijst = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/vragenlijsten`);
  assert.equal(lijst.data.vragenlijsten.find((l) => l.id === vl.data.id).aantal_inzendingen, 3);
});

test('meetmomenten staan in de volgorde waarin je ze aanmaakt (ook zonder datum)', async () => {
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}`);
  const namen = d.data.meetmomenten.map((m) => m.naam);
  assert.deepEqual(namen.slice(0, 2), ['Nulmeting', 'Vervolgmeting']);
  // Omdraaien kan met /volgorde
  const ids2 = d.data.meetmomenten.map((m) => m.id);
  const r = await api('/api/beheer/volgorde', { methode: 'POST', body: { soort: 'meetmomenten', ids: [...ids2].reverse() } });
  assert.equal(r.status, 200);
  await api('/api/beheer/volgorde', { methode: 'POST', body: { soort: 'meetmomenten', ids: ids2 } });
});

test('uitleg aan respondenten klopt met wat er wordt opgeslagen', async () => {
  const det = await api(`/api/beheer/vragenlijsten/${ids.vragenlijst}`);
  assert.match(det.data.vragenlijst.introtekst, /alleen de datum, niet het tijdstip/);
  assert.match(det.data.vragenlijst.introtekst, /minstens 5 personen/);
  const b = await api('/api/beheer/onderzoeken', { methode: 'POST', body: { bedrijfsnaam: 'Bakkerij De Korenschoof B.V.', titel: 'MTO', sjablonen: ['medewerkerstevredenheid', 'hr-processen'] } });
  const vl = await api(`/api/beheer/onderzoeken/${b.data.id}/vragenlijsten`);
  assert.equal(vl.data.vragenlijsten[0].titel, 'MTO');
  const v = await api(`/api/beheer/vragenlijsten/${vl.data.vragenlijsten[0].id}`);
  assert.doesNotMatch(v.data.vragenlijst.introtekst, /B\.V\.\./);
  const det2 = await api(`/api/beheer/onderzoeken/${b.data.id}`);
  const verzuim = det2.data.themas.flatMap((t) => t.meetpunten).filter((m) => m.naam === 'Verzuimpercentage');
  assert.equal(verzuim.length, 1);
  await api(`/api/beheer/onderzoeken/${b.data.id}/archiveren`, { methode: 'POST', body: {} });
  await api(`/api/beheer/onderzoeken/${b.data.id}`, { methode: 'DELETE', body: { bevestiging: 'Bakkerij De Korenschoof B.V.' } });
});

test('elk scherm waar de navigatie naar verwijst bestaat', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const app = readFileSync(new URL('../public/js/beheer/app.js', import.meta.url), 'utf8');
  const modules = [...app.matchAll(/import\('\.\/schermen\/([a-z-]+\.js)'\)/g)].map((m) => m[1]);
  assert.ok(modules.length >= 12);
  for (const m of modules) assert.ok(existsSync(new URL(`../public/js/beheer/schermen/${m}`, import.meta.url)), m);
});

test('ongeldige tekens in een adres geven een nette 404', async () => {
  const r = await api('/api/publiek/%E0%A4%A', { metCookie: false });
  assert.equal(r.status, 404);
});

test('meerdere onderzoeken naast elkaar', async () => {
  const r = await api('/api/beheer/onderzoeken');
  assert.ok(r.data.onderzoeken.filter((o) => o.status === 'actief').length >= 2);
});

test('thema met vragen kan niet zomaar weg', async () => {
  const r = await api(`/api/beheer/themas/${ids.themaWerkdruk}`, { methode: 'DELETE' });
  assert.equal(r.status, 409);
});

test('archiveren: alles alleen-lezen en de link werkt niet meer', async () => {
  const r = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/archiveren`, { methode: 'POST', body: {} });
  assert.equal(r.status, 200);
  const pub = await api(`/api/publiek/${ids.code}`, { metCookie: false });
  assert.equal(pub.data.status, 'gesloten');
  const pogingen = [
    api(`/api/beheer/onderzoeken/${ids.onderzoek}`, { methode: 'PUT', body: { bedrijfsnaam: 'X', titel: 'Y' } }),
    api(`/api/beheer/stukken/${ids.stuk}`, { methode: 'PUT', body: { inhoud: 'nieuw' } }),
    api(`/api/beheer/onderzoeken/${ids.onderzoek}/acties`, { methode: 'POST', body: { titel: 'x' } }),
    api(`/api/beheer/vragenlijsten/${ids.vragenlijst}/status`, { methode: 'POST', body: { status: 'open' } }),
    api(`/api/beheer/onderzoeken/${ids.onderzoek}/themas`, { methode: 'POST', body: { naam: 'x' } }),
  ];
  for (const p of await Promise.all(pogingen)) assert.equal(p.status, 409);
  const d = await api(`/api/beheer/onderzoeken/${ids.onderzoek}/dashboard`);
  assert.equal(d.status, 200);
});

test('definitief verwijderen alleen na archiveren en met bevestiging', async () => {
  const actief = await api(`/api/beheer/onderzoeken/${ids.tweede}`, { methode: 'DELETE', body: { bevestiging: 'Ander Bedrijf' } });
  assert.equal(actief.status, 409);
  const fout = await api(`/api/beheer/onderzoeken/${ids.onderzoek}`, { methode: 'DELETE', body: { bevestiging: 'verkeerd' } });
  assert.equal(fout.status, 400);
  const ok = await api(`/api/beheer/onderzoeken/${ids.onderzoek}`, { methode: 'DELETE', body: { bevestiging: 'Testbedrijf BV' } });
  assert.equal(ok.status, 200);
  assert.equal((await api(`/api/beheer/onderzoeken/${ids.onderzoek}`)).status, 404);
});

test('openbare pagina en beheerpagina worden geserveerd met beveiligingskoppen', async () => {
  const r = await fetch(`${BASIS}/v/${'a'.repeat(22)}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const onzin = await fetch(`${BASIS}/v/<script>`);
  assert.equal(onzin.status, 404);
});

test('uitloggen beëindigt de sessie', async () => {
  const r = await api('/api/uitloggen', { methode: 'POST', body: {} });
  assert.equal(r.status, 200);
  const na = await api('/api/beheer/onderzoeken');
  assert.equal(na.status, 401);
});

test('te veel mislukte inlogpogingen blokkeren tijdelijk', async () => {
  let laatste;
  for (let i = 0; i < 11; i++) {
    laatste = await api('/api/inloggen', { methode: 'POST', metCookie: false, body: { wachtwoord: `fout-${i}` } });
  }
  assert.equal(laatste.status, 429);
  const goed = await api('/api/inloggen', { methode: 'POST', metCookie: false, body: { wachtwoord: WACHTWOORD } });
  assert.equal(goed.status, 429);
});

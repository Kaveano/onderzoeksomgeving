#!/usr/bin/env node
// Belastingtest (BOUWPLAN B3, criterium 12 van P1): maakt een onderzoek met veel verzonnen respondenten en meet
// hoe lang de zware verzoeken duren. Zo weet je welke onderzoeksgrootte de gratis laag van Cloudflare aankan.
//
// Gebruik:
//   node scripts/belasting.mjs --doel http://127.0.0.1:8790 --respondenten 3000 --vragen 100 [--wachtwoord …] [--opruimen]
//
// Het wachtwoord komt uit --wachtwoord of uit de omgevingsvariabele BEHEER_WACHTWOORD.
// Doel is een lokale testserver (npx wrangler dev) of een aparte proef-Worker; NOOIT de echte omgeving, want het
// script maakt een onderzoek "Belastingtest" met duizenden verzonnen antwoorden. Met --opruimen wordt het daarna
// gearchiveerd en definitief verwijderd.
//
// Wat het meet (tijd van verzoek tot laatste byte, gezien vanaf deze computer):
// - export/data in één keer (de oude manier) en de kop (zonder_inzendingen=1);
// - alle delen van export/inzendingen, zoals de browser ze ophaalt (gegevens.js);
// - het dashboard (alle resultaten, met en zonder uitsplitsing) en het dashboard voor een meelezer;
// - in Node: hoe lang de browser rekent aan dashboardUitRijen (dashboard-rekenen.js) op dezelfde gegevens.
// Lokaal (wrangler dev) is dat een indicatie. De echte rekentijd (CPU-tijd, grens 10 ms op de gratis laag) lees je af
// in het Cloudflare-dashboard bij de proef-Worker (zie docs/beheer.md, "Belastingtest").

import { dashboardUitRijen, rijenUitExport } from '../public/js/beheer/dashboard-rekenen.js';

function leesArgumenten(argv) {
  const uit = { doel: 'http://127.0.0.1:8790', respondenten: 3000, vragen: 100, wachtwoord: process.env.BEHEER_WACHTWOORD || '', opruimen: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--opruimen') uit.opruimen = true;
    else if (a === '--doel') uit.doel = argv[++i];
    else if (a === '--respondenten') uit.respondenten = Number(argv[++i]);
    else if (a === '--vragen') uit.vragen = Number(argv[++i]);
    else if (a === '--wachtwoord') uit.wachtwoord = argv[++i];
    else throw new Error(`Onbekende optie: ${a}`);
  }
  if (!Number.isInteger(uit.respondenten) || uit.respondenten < 1 || uit.respondenten > 20000) throw new Error('--respondenten moet tussen 1 en 20000 liggen.');
  if (!Number.isInteger(uit.vragen) || uit.vragen < 5 || uit.vragen > 100) throw new Error('--vragen moet tussen 5 en 100 liggen (een vragenlijst heeft hooguit 100 vragen).');
  if (!uit.wachtwoord) throw new Error('Geef het beheerwachtwoord met --wachtwoord of BEHEER_WACHTWOORD.');
  uit.doel = uit.doel.replace(/\/+$/, '');
  return uit;
}

const opties = leesArgumenten(process.argv.slice(2));
const B = opties.doel;
let koekje = '';

// Vaste reeks "willekeurige" getallen: elke run geeft dezelfde antwoorden.
let zaad = 20261127;
const rnd = () => {
  zaad = (Math.imul(zaad, 1664525) + 1013904223) >>> 0;
  return zaad / 2 ** 32;
};

async function roep(pad, { methode = 'GET', body, cookie = koekje } = {}) {
  const start = performance.now();
  const r = await fetch(B + pad, {
    method: methode,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  const ms = performance.now() - start;
  let data = null;
  try {
    data = JSON.parse(tekst);
  } catch {
    data = null;
  }
  if (!r.ok) throw new Error(`${methode} ${pad}: ${r.status} ${data && data.fout ? data.fout : tekst.slice(0, 200)}`);
  return { data, ms, bytes: Buffer.byteLength(tekst), koppen: r.headers };
}

const beheer = (pad, o) => roep(`/api/beheer${pad}`, o);
const mb = (b) => `${(b / 1e6).toFixed(2)} MB`;
const metingen = [];
function meet(naam, { ms, bytes }, extra = '') {
  metingen.push({ naam, ms: Math.round(ms), grootte: mb(bytes), extra });
}

async function opzetten() {
  const li = await roep('/api/inloggen', { methode: 'POST', body: { wachtwoord: opties.wachtwoord }, cookie: '' });
  koekje = li.koppen.get('set-cookie').split(';')[0];
  const o = (await beheer('/onderzoeken', { methode: 'POST', body: { bedrijfsnaam: 'Belastingtest', titel: `Belastingtest ${opties.respondenten} × ${opties.vragen}`, onderzoeksvraag: 'Hoe groot kan een onderzoek worden?' } })).data;
  const themas = [];
  for (const naam of ['Werk', 'Werkdruk', 'Leiding', 'Samenwerking', 'Achtergrond']) {
    themas.push((await beheer(`/onderzoeken/${o.id}/themas`, { methode: 'POST', body: { naam } })).data.id);
  }
  const vl = (await beheer(`/onderzoeken/${o.id}/vragenlijsten`, { methode: 'POST', body: { titel: 'Medewerkersonderzoek' } })).data;
  // Vragen: 1 afdeling (uitsplitsen), 1 ja/nee, 3 open, de rest schaalvragen over vier thema's.
  const vragen = [
    { thema_id: themas[4], type: 'meerkeuze', tekst: 'Op welke afdeling werk je?', opties: ['Kantoor', 'Productie', 'Logistiek', 'Verkoop', 'Techniek', 'Service'], uitsplitsen: true },
    { thema_id: themas[4], type: 'janee', tekst: 'Geef je zelf leiding aan een of meer medewerkers?', uitsplitsen: true },
    ...[1, 2, 3].map((i) => ({ thema_id: themas[i % 4], type: 'open', tekst: `Open vraag ${i}` })),
  ];
  for (let i = vragen.length; i < opties.vragen; i++) {
    vragen.push({ thema_id: themas[i % 4], type: 'schaal', tekst: `Stelling ${i - 4}`, weet_niet: i % 7 === 0 });
  }
  await beheer(`/vragenlijsten/${vl.id}/vragen/reeks`, { methode: 'POST', body: { vragen } });
  const detail = (await beheer(`/vragenlijsten/${vl.id}`)).data;
  return { onderzoekId: o.id, vragenlijstId: vl.id, vragen: detail.vragen };
}

function antwoordenVoor(vragen, i) {
  const a = {};
  const persoon = rnd() - 0.5;
  for (const q of vragen) {
    if (rnd() < 0.03) continue; // af en toe een vraag overgeslagen
    if (q.type === 'schaal') a[q.id] = q.weet_niet && rnd() < 0.05 ? 'weet_niet' : Math.max(1, Math.min(5, Math.round(3.4 + persoon * 2 + (rnd() - 0.5) * 2)));
    else if (q.type === 'janee') a[q.id] = rnd() < 0.2 ? 'ja' : 'nee';
    else if (q.type === 'meerkeuze') a[q.id] = q.opties[Math.min(q.opties.length - 1, Math.floor(rnd() ** 1.6 * q.opties.length))].id;
    else if (q.type === 'open' && rnd() < 0.4) a[q.id] = `Antwoord ${i}: ${'iets over het werk en de sfeer '.repeat(1 + Math.floor(rnd() * 4))}`.trim();
  }
  return a;
}

async function vullen({ vragenlijstId, vragen }) {
  // Hooguit 6.000 antwoordcellen per verzoek (zoals het scherm Inlezen).
  const perKeer = Math.max(1, Math.min(300, Math.floor(6000 / vragen.length)));
  const start = performance.now();
  for (let i = 0; i < opties.respondenten; i += perKeer) {
    const deel = [];
    for (let j = i; j < Math.min(opties.respondenten, i + perKeer); j++) deel.push({ datum: `2026-10-${String(1 + (j % 28)).padStart(2, '0')}`, antwoorden: antwoordenVoor(vragen, j) });
    await beheer(`/vragenlijsten/${vragenlijstId}/inzendingen/reeks`, { methode: 'POST', body: { inzendingen: deel } });
    process.stdout.write(`\rInlezen: ${Math.min(opties.respondenten, i + perKeer)} van ${opties.respondenten}`);
  }
  process.stdout.write(`\n`);
  return performance.now() - start;
}

async function meten({ onderzoekId, vragenlijstId, vragen }) {
  // 1. De oude manier: alles in één keer.
  const heel = await beheer(`/onderzoeken/${onderzoekId}/export/data`);
  meet('export/data (alles in één keer)', heel, `${heel.data.inzendingen.length} inzendingen`);
  // 2. De kop en alle delen, zoals gegevens.js.
  const kop = await beheer(`/onderzoeken/${onderzoekId}/export/data?zonder_inzendingen=1`);
  meet('export/data?zonder_inzendingen=1 (kop)', kop);
  let na = 0;
  let delen = 0;
  let totaalMs = 0;
  let totaalBytes = 0;
  let langste = 0;
  const rijen = [];
  for (;;) {
    const d = await beheer(`/onderzoeken/${onderzoekId}/export/inzendingen?vragenlijst=${vragenlijstId}&na=${na}&max=1000`);
    delen++;
    totaalMs += d.ms;
    totaalBytes += d.bytes;
    langste = Math.max(langste, d.ms);
    rijen.push(...d.data.inzendingen);
    if (d.data.volgende === null) break;
    na = d.data.volgende;
  }
  meet(`export/inzendingen (${delen} delen samen)`, { ms: totaalMs, bytes: totaalBytes }, `langste deel ${Math.round(langste)} ms, ${rijen.length} inzendingen`);
  // 3. Dashboard (server) en meelezer.
  meet('dashboard (alle resultaten)', await beheer(`/onderzoeken/${onderzoekId}/dashboard?vragenlijst=${vragenlijstId}`));
  meet('dashboard met uitsplitsing (afdeling)', await beheer(`/onderzoeken/${onderzoekId}/dashboard?vragenlijst=${vragenlijstId}&uitsplitsen=${vragen[0].id}`));
  const link = (await beheer(`/onderzoeken/${onderzoekId}/deellinks`, { methode: 'POST', body: { naam: 'Belastingtest', onderdelen: { dashboard: true } } })).data;
  const toegang = await roep(`/api/kijk/${link.deellink.code}/toegang`, { methode: 'POST', body: { toegangscode: link.toegangscode }, cookie: '' });
  const kijkKoekje = toegang.koppen.get('set-cookie').split(';')[0];
  try {
    meet('meelezer: dashboard', await roep(`/api/kijk/${link.deellink.code}/dashboard?vragenlijst=${vragenlijstId}`, { cookie: kijkKoekje }));
  } catch (e) {
    metingen.push({ naam: 'meelezer: dashboard', ms: null, grootte: '', extra: /413/.test(e.message) ? 'geweigerd: te groot (KIJK_MAX_INZENDINGEN)' : e.message });
  }
  // 4. In de browser: zelf rekenen uit de gedeelde gegevens (hier in Node gemeten).
  rijen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id));
  const t0 = performance.now();
  const r = rijenUitExport({ ...kop.data, inzendingen: rijen });
  dashboardUitRijen(r, { vragenlijst: String(vragenlijstId), uitsplitsen: null });
  const t1 = performance.now();
  dashboardUitRijen(r, { vragenlijst: String(vragenlijstId), uitsplitsen: String(vragen[0].id) });
  const t2 = performance.now();
  metingen.push({ naam: 'browser: dashboardUitRijen (Node)', ms: Math.round(t1 - t0), grootte: '', extra: `met uitsplitsing ${Math.round(t2 - t1)} ms` });
}

async function opruimen(onderzoekId) {
  await beheer(`/onderzoeken/${onderzoekId}/archiveren`, { methode: 'POST', body: {} });
  await beheer(`/onderzoeken/${onderzoekId}`, { methode: 'DELETE', body: { bevestiging: 'Belastingtest' } });
}

const opzet = await opzetten();
console.log(`Onderzoek ${opzet.onderzoekId}: ${opties.respondenten} respondenten × ${opzet.vragen.length} vragen op ${B}`);
const inlezenMs = await vullen(opzet);
console.log(`Inlezen duurde ${(inlezenMs / 1000).toFixed(1)} s.`);
await meten(opzet);
console.log('');
console.log('| Verzoek | Tijd (ms) | Grootte | Opmerking |');
console.log('|---|---:|---:|---|');
for (const m of metingen) console.log(`| ${m.naam} | ${m.ms ?? '–'} | ${m.grootte} | ${m.extra} |`);
if (opties.opruimen) {
  await opruimen(opzet.onderzoekId);
  console.log('\nHet onderzoek "Belastingtest" is weer verwijderd.');
} else {
  console.log(`\nHet onderzoek "Belastingtest" (id ${opzet.onderzoekId}) staat er nog. Gebruik --opruimen om het na afloop te verwijderen.`);
}

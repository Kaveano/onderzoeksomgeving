// Inlezen uit Excel of CSV. Het bestand wordt in de browser gelezen; de server krijgt alleen de gegevens
// die de gebruiker heeft gekozen en controleert alles opnieuw (net als bij handmatige invoer).
// Elke reeks wordt in één ondeelbare batch opgeslagen: of alles lukt, of er verandert niets.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, haalBewerkbaarOnderzoek, bewerkbaarVia, onderzoekVan, nuIso, vandaagNL } from '../lib/db.js';
import { controleerAntwoord, haalVragen, willekeurigId } from './publiek.js';
import { vraagVeldenUit } from './vragenlijsten.js';

const MAX_REEKS = 300;
const MAX_CELLEN = 6000; // respondenten × vragen per verzoek, zodat het controleren binnen de rekentijd blijft
const MAX_VRAGEN = 100;
const MAX_INZENDINGEN = 20_000; // per vragenlijst
const MAX_DATASETS = 10;
const MAX_DATASET_RIJEN = 2000;
const MAX_DATASET_KOLOMMEN = 40;
const MAX_DATASET_TEKENS = 500_000;
const MAX_CEL = 300;

/** Leest een lijst uit de body en controleert het aantal. */
function lijstUit(body, sleutel, wat, max = MAX_REEKS) {
  const lijst = body && body[sleutel];
  if (!Array.isArray(lijst) || !lijst.length) throw new Fout(400, `Er zijn geen ${wat} om in te lezen.`);
  if (lijst.length > max) throw new Fout(400, `Je kunt maximaal ${max} ${wat} per keer inlezen. Verdeel het bestand in delen.`);
  return lijst;
}

/** Voert fn uit voor elk item; een fout krijgt het regelnummer erbij. */
function perRegel(lijst, fn) {
  return lijst.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Fout(400, `Regel ${i + 1} is ongeldig.`);
    try {
      return fn(item, i);
    } catch (e) {
      if (e instanceof Fout) throw new Fout(e.status, `Regel ${i + 1}: ${e.message}`);
      throw e;
    }
  });
}

/** INSERT-opdrachten met meerdere rijen per opdracht (maximaal 100 waarden per opdracht in D1). */
function invoegOpdrachten(env, tabel, kolommen, rijen) {
  const perOpdracht = Math.max(1, Math.floor(100 / kolommen.length));
  const een_rij = `(${kolommen.map(() => '?').join(', ')})`;
  const uit = [];
  for (let i = 0; i < rijen.length; i += perOpdracht) {
    const deel = rijen.slice(i, i + perOpdracht);
    uit.push(env.DB.prepare(`INSERT INTO ${tabel} (${kolommen.join(', ')}) VALUES ${deel.map(() => een_rij).join(', ')}`).bind(...deel.flat()));
  }
  return uit;
}

// ---------- Eigen cijfers ----------

export async function cijfers({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const items = lijstUit(await leesJson(request, 400_000), 'items', 'cijfers');
  const [themas, meetpunten, meetmomenten] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM themas WHERE onderzoek_id = ?').bind(onderzoekId),
    env.DB.prepare('SELECT m.id, m.thema_id FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ?').bind(onderzoekId),
    env.DB.prepare('SELECT id FROM meetmomenten WHERE onderzoek_id = ?').bind(onderzoekId),
  ]);
  const themaIds = new Set(themas.results.map((t) => t.id));
  const meetpuntThema = new Map(meetpunten.results.map((m) => [m.id, m.thema_id]));
  const meetmomentIds = new Set(meetmomenten.results.map((m) => m.id));
  const nu = nuIso();
  const rijen = perRegel(items, (it) => {
    const themaId = v.id(it.thema_id, 'thema');
    if (!themaIds.has(themaId)) throw new Fout(400, 'Kies een thema van dit onderzoek.');
    const meetpuntId = v.optioneelId(it.meetpunt_id, 'meetpunt');
    if (meetpuntId && meetpuntThema.get(meetpuntId) !== themaId) throw new Fout(400, 'Het gekozen meetpunt hoort niet bij het gekozen thema.');
    const meetmomentId = v.optioneelId(it.meetmoment_id, 'meetmoment');
    if (meetmomentId && !meetmomentIds.has(meetmomentId)) throw new Fout(400, 'Het gekozen meetmoment hoort niet bij dit onderzoek.');
    return [
      onderzoekId, themaId, meetpuntId, meetmomentId, 'cijfer',
      v.datum(it.datum, 'Datum', { verplicht: true }),
      v.tekst(it.titel, 'Titel', { verplicht: true, max: 200 }),
      v.langeTekst(it.tekst, 'Tekst', { max: 2000 }),
      v.getal(it.waarde, 'Waarde', { verplicht: true }),
      v.tekst(it.eenheid, 'Eenheid', { max: 30 }),
      nu,
    ];
  });
  await env.DB.batch(invoegOpdrachten(env, 'eigen_invoer',
    ['onderzoek_id', 'thema_id', 'meetpunt_id', 'meetmoment_id', 'soort', 'datum', 'titel', 'tekst', 'waarde', 'eenheid', 'aangemaakt_op'], rijen));
  return json({ ok: true, aantal: rijen.length }, 201);
}

// ---------- Vragen voor een vragenlijst ----------

export async function vragen({ request, env, params }) {
  const vragenlijstId = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vragenlijst', vragenlijstId);
  const lijst = lijstUit(await leesJson(request, 400_000), 'vragen', 'vragen', MAX_VRAGEN);
  const [themas, meetpunten, stand] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM themas WHERE onderzoek_id = ?').bind(o.id),
    env.DB.prepare('SELECT m.id, m.thema_id FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ?').bind(o.id),
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(volgorde), 0) AS laatste FROM vragen WHERE vragenlijst_id = ?').bind(vragenlijstId),
  ]);
  const { n, laatste } = stand.results[0];
  if (n + lijst.length > MAX_VRAGEN) {
    throw new Fout(409, `Een vragenlijst kan maximaal ${MAX_VRAGEN} vragen bevatten. Er staan er al ${n}; je kunt er nog ${Math.max(0, MAX_VRAGEN - n)} inlezen.`);
  }
  const themaIds = new Set(themas.results.map((t) => t.id));
  const meetpuntThema = new Map(meetpunten.results.map((m) => [m.id, m.thema_id]));
  const rijen = perRegel(lijst, (q, i) => {
    const f = vraagVeldenUit(q, themaIds, meetpuntThema);
    return [vragenlijstId, f.thema_id, f.meetpunt_id, f.type, f.tekst, f.toelichting, JSON.stringify(f.opties), f.schaal_soort,
      f.meerdere_antwoorden, f.verplicht, f.weet_niet, f.uitsplitsen, laatste + 1 + i];
  });
  await env.DB.batch(invoegOpdrachten(env, 'vragen',
    ['vragenlijst_id', 'thema_id', 'meetpunt_id', 'type', 'tekst', 'toelichting', 'opties', 'schaal_soort', 'meerdere_antwoorden', 'verplicht', 'weet_niet', 'uitsplitsen', 'volgorde'], rijen));
  return json({ ok: true, aantal: rijen.length }, 201);
}

// ---------- Antwoorden op een vragenlijst ----------

/**
 * Antwoorden inlezen, bijvoorbeeld van papieren formulieren of uit een ander programma.
 * Alleen antwoorden op bestaande vragen worden bewaard; al het andere uit het bestand (zoals een kolom
 * met namen) komt hier niet eens aan. Per respondent wordt alleen de datum en de antwoorden opgeslagen.
 */
export async function antwoorden({ request, env, params }) {
  const vragenlijstId = v.id(params.id);
  await bewerkbaarVia(env, 'vragenlijst', vragenlijstId);
  const lijst = lijstUit(await leesJson(request, 1_500_000), 'inzendingen', 'respondenten');
  const [vragenVanLijst, vl, tel] = await Promise.all([
    haalVragen(env, vragenlijstId),
    een(env, 'SELECT max_inzendingen FROM vragenlijsten WHERE id = ?', vragenlijstId),
    een(env, 'SELECT COUNT(*) AS n FROM inzendingen WHERE vragenlijst_id = ?', vragenlijstId),
  ]);
  if (!vragenVanLijst.length) throw new Fout(409, 'Deze vragenlijst heeft nog geen vragen.');
  if (lijst.length * vragenVanLijst.length > MAX_CELLEN) {
    throw new Fout(400, `Te veel antwoorden in één keer. Stuur maximaal ${Math.max(1, Math.floor(MAX_CELLEN / vragenVanLijst.length))} respondenten per keer.`);
  }
  // De antwoordmogelijkheden één keer per vraag inlezen, niet per antwoord.
  for (const q of vragenVanLijst) if (q.type === 'meerkeuze') q._geldig = new Set(JSON.parse(q.opties || '[]').map((o) => o.id));
  const max = Math.min(vl.max_inzendingen || MAX_INZENDINGEN, MAX_INZENDINGEN);
  if (tel.n + lijst.length > max) {
    throw new Fout(409, `Deze vragenlijst kan maximaal ${max.toLocaleString('nl-NL')} inzendingen hebben. Er zijn er al ${tel.n.toLocaleString('nl-NL')}.`);
  }
  const vandaag = vandaagNL();
  const ids = new Set();
  const rijen = perRegel(lijst, (it) => {
    const datum = v.datum(it.datum, 'Datum') || vandaag;
    if (datum > vandaag) throw new Fout(400, 'De datum ligt in de toekomst.');
    const ruw = it.antwoorden && typeof it.antwoorden === 'object' && !Array.isArray(it.antwoorden) ? it.antwoorden : {};
    const schoon = {};
    for (const q of vragenVanLijst) {
      let waarde;
      try {
        waarde = controleerAntwoord(q, ruw[String(q.id)]);
      } catch (e) {
        if (e instanceof Fout) throw new Fout(400, `${e.message} (vraag: "${q.tekst.slice(0, 60)}")`);
        throw e;
      }
      if (waarde !== undefined) schoon[String(q.id)] = waarde;
    }
    if (!Object.keys(schoon).length) throw new Fout(400, 'Deze respondent heeft geen enkel geldig antwoord.');
    let id;
    do id = willekeurigId(); while (ids.has(id));
    ids.add(id);
    return [id, vragenlijstId, datum, JSON.stringify(schoon)];
  });
  await env.DB.batch(invoegOpdrachten(env, 'inzendingen', ['id', 'vragenlijst_id', 'datum', 'antwoorden'], rijen));
  return json({ ok: true, aantal: rijen.length }, 201);
}

// ---------- Eigen datasets (voor Analyse) ----------

export async function datasetLijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const rijen = await alle(env, 'SELECT id, naam, kolommen, aantal_rijen, aangemaakt_op FROM datasets WHERE onderzoek_id = ? ORDER BY id', onderzoekId);
  return json({
    datasets: rijen.map((r) => {
      let kolommen = [];
      try {
        kolommen = JSON.parse(r.kolommen);
      } catch { /* leeg laten */ }
      return { id: r.id, naam: r.naam, kolommen, aantal_rijen: r.aantal_rijen, aangemaakt_op: r.aangemaakt_op };
    }),
  });
}

export async function datasetNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request, 1_000_000);
  const naam = v.tekst(body.naam, 'Naam', { verplicht: true, max: 150 });
  if (!Array.isArray(body.kolommen) || !body.kolommen.length) throw new Fout(400, 'De dataset heeft geen kolommen.');
  if (body.kolommen.length > MAX_DATASET_KOLOMMEN) throw new Fout(400, `Een dataset kan maximaal ${MAX_DATASET_KOLOMMEN} kolommen hebben. Kies welke kolommen je nodig hebt.`);
  const gezien = new Set();
  const kolommen = body.kolommen.map((k, i) => {
    const kolom = v.tekst(k, `Naam van kolom ${i + 1}`, { verplicht: true, max: 100 });
    if (gezien.has(kolom.toLowerCase())) throw new Fout(400, `De kolomnaam "${kolom}" komt twee keer voor.`);
    gezien.add(kolom.toLowerCase());
    return kolom;
  });
  if (!Array.isArray(body.rijen) || !body.rijen.length) throw new Fout(400, 'De dataset heeft geen rijen.');
  if (body.rijen.length > MAX_DATASET_RIJEN) throw new Fout(400, `Een dataset kan maximaal ${MAX_DATASET_RIJEN.toLocaleString('nl-NL')} rijen hebben.`);
  const breedte = kolommen.length;
  const rijen = body.rijen.map((rij, r) => {
    if (!Array.isArray(rij) || rij.length !== breedte) throw new Fout(400, `Rij ${r + 1} heeft niet evenveel cellen als er kolommen zijn.`);
    return rij.map((cel) => {
      if (cel === null || cel === undefined || cel === '') return null;
      if (typeof cel === 'number') {
        if (!Number.isFinite(cel)) throw new Fout(400, `Rij ${r + 1} bevat een ongeldig getal.`);
        return cel;
      }
      if (typeof cel === 'boolean') return cel ? 'ja' : 'nee';
      if (typeof cel !== 'string') throw new Fout(400, `Rij ${r + 1} bevat een ongeldige cel.`);
      // eslint-disable-next-line no-control-regex
      const t = cel.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      return t ? t.slice(0, MAX_CEL) : null;
    });
  });
  const tekst = JSON.stringify(rijen);
  if (tekst.length > MAX_DATASET_TEKENS) throw new Fout(413, 'Deze dataset is te groot om op te slaan. Kies minder kolommen of minder rijen.');
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM datasets WHERE onderzoek_id = ?', onderzoekId);
  if (tel.n >= MAX_DATASETS) throw new Fout(409, `Een onderzoek kan maximaal ${MAX_DATASETS} datasets hebben. Verwijder er eerst een.`);
  const rij = await env.DB.prepare(
    'INSERT INTO datasets (onderzoek_id, naam, kolommen, rijen, aantal_rijen, aangemaakt_op) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
  ).bind(onderzoekId, naam, JSON.stringify(kolommen), tekst, rijen.length, nuIso()).first();
  return json({ id: rij.id }, 201);
}

export async function datasetDetail({ env, params }) {
  const id = v.id(params.id);
  await onderzoekVan(env, 'dataset', id);
  const r = await een(env, 'SELECT id, onderzoek_id, naam, kolommen, rijen, aantal_rijen, aangemaakt_op FROM datasets WHERE id = ?', id);
  // Kolommen en rijen staan al als JSON in de database; die worden ongewijzigd doorgegeven.
  const kop = JSON.stringify({ id: r.id, onderzoek_id: r.onderzoek_id, naam: r.naam, aantal_rijen: r.aantal_rijen, aangemaakt_op: r.aangemaakt_op });
  return new Response(`{"dataset":${kop.slice(0, -1)},"kolommen":${r.kolommen},"rijen":${r.rijen}}}`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function datasetVerwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'dataset', id);
  await env.DB.prepare('DELETE FROM datasets WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

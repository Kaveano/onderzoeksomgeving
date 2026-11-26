// Onderzoeken: overzicht, aanmaken, wijzigen, archiveren, verwijderen en sjablonen.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { een, haalOnderzoek, haalBewerkbaarOnderzoek, nuIso, alle } from '../lib/db.js';
import {
  MAX_VRAGEN, pasSjablonenToe, maakSjabloonInhoud, controleerSjablonen, voegSjablonenSamen, legeInhoud,
} from '../lib/sjabloon-toepassen.js';
import {
  MAX_SAMENVOEGEN, MAX_SJABLONEN, controleerSjabloonInhoud, controleerSjabloonGegevens, haalSjabloon, haalSjablonen,
  inhoudVan, sjabloonUit, lijstSjablonen, nieuwSjabloon, opdrachtNieuwSjabloon, nieuwSjabloonId, wijzigSjabloon,
  verwijderSjabloon, zetOrigineelTerug, herstelStandaard,
} from '../lib/sjablonen-beheer.js';
import { STANDAARD_STUKKEN } from '../sjablonen.js';

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Lijst met verwijzingen naar sjablonen uit een verzoek (zonder dubbele, hooguit MAX_SAMENVOEGEN). */
function sjabloonVerwijzingen(waarde) {
  if (waarde === undefined || waarde === null) return [];
  if (!Array.isArray(waarde)) throw new Fout(400, 'Geef de sjablonen op als lijst.');
  const uniek = [...new Set(waarde.map((x) => (typeof x === 'number' ? String(x) : x)))];
  if (uniek.length > MAX_SAMENVOEGEN) throw new Fout(400, `Je kunt maximaal ${MAX_SAMENVOEGEN} sjablonen tegelijk kiezen.`);
  return uniek;
}

export async function lijst({ env }) {
  const rijen = await alle(
    env,
    `SELECT o.id, o.bedrijfsnaam, o.titel, o.onderzoeksvraag, o.status, o.aangemaakt_op, o.gearchiveerd_op,
       (SELECT COUNT(*) FROM vragenlijsten v WHERE v.onderzoek_id = o.id) AS aantal_vragenlijsten,
       (SELECT COUNT(*) FROM vragenlijsten v WHERE v.onderzoek_id = o.id AND v.status = 'open') AS open_vragenlijsten,
       (SELECT COUNT(*) FROM inzendingen i JOIN vragenlijsten v ON v.id = i.vragenlijst_id WHERE v.onderzoek_id = o.id) AS aantal_inzendingen,
       (SELECT COUNT(*) FROM acties a WHERE a.onderzoek_id = o.id AND a.status <> 'klaar') AS open_acties
     FROM onderzoeken o
     ORDER BY CASE o.status WHEN 'actief' THEN 0 ELSE 1 END, o.aangemaakt_op DESC`,
  );
  return json({ onderzoeken: rijen });
}

function velden(body) {
  return {
    bedrijfsnaam: v.tekst(body.bedrijfsnaam, 'Bedrijfsnaam', { verplicht: true, max: 150 }),
    titel: v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 }),
    onderzoeksvraag: v.tekst(body.onderzoeksvraag, 'Onderzoeksvraag', { max: 2000 }),
    toelichting: v.tekst(body.toelichting, 'Toelichting', { max: 5000 }),
  };
}

/**
 * Nieuw onderzoek. Naast de gegevens mag meekomen:
 * - sjablonen: [id, ...]   – sjablonen die worden samengevoegd en toegepast;
 * - inhoud: {...}          – inhoud die je zelf hebt samengesteld (zelfde opbouw als een sjabloon);
 * - opslaan_als_sjabloon: { naam, omschrijving } – bewaart die inhoud ook als nieuw eigen sjabloon.
 * Alles wordt gecontroleerd vóór er iets wordt aangemaakt.
 */
export async function nieuw({ request, env }) {
  const body = await leesJson(request);
  const f = velden(body);

  const inhouden = [];
  const refs = sjabloonVerwijzingen(body.sjablonen);
  if (refs.length) inhouden.push(...(await haalSjablonen(env, refs)).map(inhoudVan));

  let eigenInhoud = null;
  if (body.inhoud !== undefined && body.inhoud !== null) {
    eigenInhoud = controleerSjabloonInhoud(body.inhoud);
    inhouden.push(eigenInhoud);
  }

  let bewaren = null;
  if (body.opslaan_als_sjabloon !== undefined && body.opslaan_als_sjabloon !== null && body.opslaan_als_sjabloon !== false) {
    if (!isObject(body.opslaan_als_sjabloon)) throw new Fout(400, 'De gegevens van het nieuwe sjabloon zijn ongeldig.');
    if (!eigenInhoud) throw new Fout(400, 'Er is geen inhoud meegestuurd om als sjabloon te bewaren.');
    bewaren = controleerSjabloonGegevens(body.opslaan_als_sjabloon);
    const tel = await een(env, 'SELECT COUNT(*) AS n FROM sjablonen');
    if (tel.n >= MAX_SJABLONEN) {
      throw new Fout(409, `Je hebt het maximum van ${MAX_SJABLONEN} sjablonen bereikt. Verwijder eerst een sjabloon, of maak het onderzoek aan zonder het als sjabloon te bewaren.`);
    }
  }
  controleerSjablonen(inhouden, f.bedrijfsnaam);

  const nu = nuIso();
  const o = await env.DB.prepare(
    `INSERT INTO onderzoeken (bedrijfsnaam, titel, onderzoeksvraag, toelichting, status, aangemaakt_op)
     VALUES (?, ?, ?, ?, 'actief', ?) RETURNING *`,
  ).bind(f.bedrijfsnaam, f.titel, f.onderzoeksvraag, f.toelichting, nu).first();

  // Standaard: één meetmoment "Nulmeting" en drie lege stukken.
  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO meetmomenten (onderzoek_id, naam, datum, omschrijving, volgorde) VALUES (?, ?, NULL, ?, 1) RETURNING id')
      .bind(o.id, 'Nulmeting', 'Eerste meting'),
    ...STANDAARD_STUKKEN.map((s, i) =>
      env.DB.prepare(
        'INSERT INTO stukken (onderzoek_id, soort, titel, inhoud, volgorde, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(o.id, s.soort, s.titel, s.inhoud, i + 1, nu, nu),
    ),
    ...(bewaren ? [opdrachtNieuwSjabloon(env, bewaren, JSON.stringify(eigenInhoud))] : []),
  ]);

  if (inhouden.length) {
    await pasSjablonenToe(env, o, inhouden, { meetmomentId: res[0].results[0].id });
  }
  return json({ id: o.id, sjabloon_id: bewaren ? nieuwSjabloonId(res[res.length - 1]) : null }, 201);
}

export async function detail({ env, params }) {
  const id = v.id(params.id);
  const onderzoek = await haalOnderzoek(env, id);
  const [themas, meetpunten, meetmomenten, tellingen] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(id),
    env.DB.prepare(
      'SELECT m.* FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY m.volgorde, m.id',
    ).bind(id),
    env.DB.prepare(
      `SELECT mm.*, (SELECT COUNT(*) FROM vragenlijsten v WHERE v.meetmoment_id = mm.id) AS aantal_vragenlijsten
       FROM meetmomenten mm WHERE mm.onderzoek_id = ? ORDER BY mm.volgorde, mm.id`,
    ).bind(id),
    env.DB.prepare(
      `SELECT t.id AS thema_id,
         (SELECT COUNT(*) FROM vragen q WHERE q.thema_id = t.id) AS aantal_vragen,
         (SELECT COUNT(*) FROM eigen_invoer e WHERE e.thema_id = t.id) AS aantal_invoer
       FROM themas t WHERE t.onderzoek_id = ?`,
    ).bind(id),
  ]);
  const telPerThema = new Map(tellingen.results.map((r) => [r.thema_id, r]));
  return json({
    onderzoek,
    themas: themas.results.map((t) => ({
      ...t,
      aantal_vragen: telPerThema.get(t.id)?.aantal_vragen || 0,
      aantal_invoer: telPerThema.get(t.id)?.aantal_invoer || 0,
      meetpunten: meetpunten.results.filter((m) => m.thema_id === t.id),
    })),
    meetmomenten: meetmomenten.results,
  });
}

export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, id);
  const f = velden(await leesJson(request));
  await env.DB.prepare(
    'UPDATE onderzoeken SET bedrijfsnaam = ?, titel = ?, onderzoeksvraag = ?, toelichting = ? WHERE id = ?',
  ).bind(f.bedrijfsnaam, f.titel, f.onderzoeksvraag, f.toelichting, id).run();
  return json({ ok: true });
}

export async function archiveren({ env, params }) {
  const id = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, id);
  await env.DB.batch([
    env.DB.prepare("UPDATE onderzoeken SET status = 'gearchiveerd', gearchiveerd_op = ? WHERE id = ?").bind(nuIso(), id),
    env.DB.prepare("UPDATE vragenlijsten SET status = 'gesloten' WHERE onderzoek_id = ?").bind(id),
  ]);
  return json({ ok: true });
}

export async function verwijderen({ request, env, params }) {
  const id = v.id(params.id);
  const o = await haalOnderzoek(env, id);
  if (o.status !== 'gearchiveerd') {
    throw new Fout(409, 'Alleen gearchiveerde onderzoeken kunnen definitief worden verwijderd. Archiveer het onderzoek eerst.');
  }
  const body = await leesJson(request);
  if (typeof body.bevestiging !== 'string' || body.bevestiging.trim() !== o.bedrijfsnaam.trim()) {
    throw new Fout(400, 'Typ de bedrijfsnaam precies over om het verwijderen te bevestigen.');
  }
  // Volgorde van verwijderen houdt rekening met verwijzingen tussen tabellen.
  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM inzendingen WHERE vragenlijst_id IN (SELECT id FROM vragenlijsten WHERE onderzoek_id = ?)',
    ).bind(id),
    env.DB.prepare(
      'DELETE FROM inzendteller WHERE vragenlijst_id IN (SELECT id FROM vragenlijsten WHERE onderzoek_id = ?)',
    ).bind(id),
    env.DB.prepare('DELETE FROM vragen WHERE vragenlijst_id IN (SELECT id FROM vragenlijsten WHERE onderzoek_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM vragenlijsten WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM eigen_invoer WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM meetpunten WHERE thema_id IN (SELECT id FROM themas WHERE onderzoek_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM themas WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM meetmomenten WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM stukken WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM acties WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM kijksessies WHERE deellink_id IN (SELECT id FROM deellinks WHERE onderzoek_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM kijkpogingen WHERE deellink_id IN (SELECT id FROM deellinks WHERE onderzoek_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM deellinks WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM rapporten WHERE onderzoek_id = ?').bind(id),
    env.DB.prepare('DELETE FROM onderzoeken WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

export async function sjabloonToepassen({ request, env, params }) {
  const id = v.id(params.id);
  const o = await haalBewerkbaarOnderzoek(env, id);
  const body = await leesJson(request);
  const meetmomentId = v.optioneelId(body.meetmoment_id, 'meetmoment');
  if (meetmomentId) {
    const mm = await een(env, 'SELECT onderzoek_id FROM meetmomenten WHERE id = ?', meetmomentId);
    if (!mm || mm.onderzoek_id !== id) throw new Fout(400, 'Het gekozen meetmoment hoort niet bij dit onderzoek.');
  }
  const inhoud = inhoudVan(await haalSjabloon(env, body.sjabloon));
  const vragenlijstId = await pasSjablonenToe(env, o, [inhoud], { meetmomentId });
  return json({ ok: true, vragenlijst_id: vragenlijstId });
}

export async function alsSjabloon({ request, env, params }) {
  const id = v.id(params.id);
  const o = await haalOnderzoek(env, id);
  const body = await leesJson(request);
  const gegevens = controleerSjabloonGegevens(body);
  const vragenlijstId = v.optioneelId(body.vragenlijst_id, 'vragenlijst');
  if (vragenlijstId) {
    const vl = await een(env, 'SELECT onderzoek_id FROM vragenlijsten WHERE id = ?', vragenlijstId);
    if (!vl || vl.onderzoek_id !== id) throw new Fout(400, 'De gekozen vragenlijst hoort niet bij dit onderzoek.');
  }
  const inhoud = await maakSjabloonInhoud(env, o, vragenlijstId);
  // Zo mogelijk in de vaste, gecontroleerde vorm bewaren. Lukt dat niet (bijv. twee thema's met
  // dezelfde naam in het onderzoek), dan toch bewaren; bij het bewerken zie je wat er moet veranderen.
  let schoon = inhoud;
  try {
    schoon = controleerSjabloonInhoud(inhoud);
  } catch {
    /* ongecontroleerd bewaren */
  }
  const sjabloonId = await nieuwSjabloon(env, gegevens, JSON.stringify(schoon));
  return json({ id: sjabloonId }, 201);
}

// ---- Sjablonen beheren ----
// Alle sjablonen staan in de database en zijn volledig te wijzigen en te verwijderen, ook de
// standaardsjablonen. Een sjabloon is aan te wijzen met zijn nummer (12), de oude vorm 'eigen-12'
// of het kenmerk van een standaardsjabloon ('medewerkerstevredenheid').

export async function sjablonenLijst({ env }) {
  return json(await lijstSjablonen(env));
}

export async function sjabloonDetail({ env, params }) {
  return json(sjabloonUit(await haalSjabloon(env, params.sjabloon)));
}

/** Nieuw eigen sjabloon: leeg, met meegestuurde inhoud, of als kopie van een bestaand sjabloon. */
export async function sjabloonNieuw({ request, env }) {
  const body = await leesJson(request);
  let gegevens;
  let inhoudJson;
  if (body.kopie_van !== undefined && body.kopie_van !== null && body.kopie_van !== '') {
    const bron = await haalSjabloon(env, body.kopie_van);
    gegevens = controleerSjabloonGegevens({
      naam: body.naam === undefined || body.naam === null || body.naam === '' ? `${bron.naam.slice(0, 140)} (kopie)` : body.naam,
      omschrijving: body.omschrijving === undefined || body.omschrijving === null ? bron.omschrijving : body.omschrijving,
    });
    inhoudJson = bron.inhoud;
  } else {
    gegevens = controleerSjabloonGegevens(body);
    inhoudJson = JSON.stringify(
      body.inhoud === undefined || body.inhoud === null ? legeInhoud() : controleerSjabloonInhoud(body.inhoud),
    );
  }
  return json({ id: await nieuwSjabloon(env, gegevens, inhoudJson) }, 201);
}

export async function sjabloonWijzig({ request, env, params }) {
  const body = await leesJson(request);
  const gegevens = controleerSjabloonGegevens(body);
  // Zonder "inhoud" wijzig je alleen de naam en omschrijving.
  const inhoud = body.inhoud === undefined || body.inhoud === null ? null : controleerSjabloonInhoud(body.inhoud);
  return json({ ok: true, ...(await wijzigSjabloon(env, params.sjabloon, gegevens, inhoud)) });
}

export async function sjabloonVerwijder({ env, params }) {
  await verwijderSjabloon(env, params.sjabloon);
  return json({ ok: true });
}

/** Zet een (aangepast) standaardsjabloon terug naar de oorspronkelijke versie. */
export async function sjabloonOrigineel({ env, params }) {
  return json({ ok: true, id: await zetOrigineelTerug(env, params.sjabloon) });
}

/** Zet standaardsjablonen terug die je eerder hebt verwijderd. */
export async function sjablonenHerstellen({ env }) {
  return json({ ok: true, toegevoegd: await herstelStandaard(env) });
}

/**
 * Voegt de gekozen sjablonen samen tot één inhoud (zonder iets op te slaan), met precies dezelfde
 * regels als bij het toepassen. Het scherm "Nieuw onderzoek" laat je die inhoud daarna aanpassen.
 */
export async function sjablonenSamenvoegen({ request, env }) {
  const body = await leesJson(request);
  const refs = sjabloonVerwijzingen(body.ids);
  const inhoud = refs.length
    ? voegSjablonenSamen((await haalSjablonen(env, refs)).map(inhoudVan))
    : legeInhoud();
  return json({ inhoud, aantal_vragen: inhoud.vragen.length, max_vragen: MAX_VRAGEN });
}

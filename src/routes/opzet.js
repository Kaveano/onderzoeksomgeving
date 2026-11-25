// Opzet van een onderzoek: thema's, meetpunten, meetmomenten en volgorde.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { een, haalBewerkbaarOnderzoek, bewerkbaarVia, volgendeVolgorde } from '../lib/db.js';

// ---- Thema's ----

function themaVelden(body) {
  return {
    naam: v.tekst(body.naam, 'Naam van het thema', { verplicht: true, max: 150 }),
    omschrijving: v.tekst(body.omschrijving, 'Omschrijving', { max: 2000 }),
  };
}

export async function themaNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const f = themaVelden(await leesJson(request));
  const volgorde = await volgendeVolgorde(env, 'themas', 'onderzoek_id', onderzoekId);
  const rij = await env.DB.prepare(
    'INSERT INTO themas (onderzoek_id, naam, omschrijving, volgorde) VALUES (?, ?, ?, ?) RETURNING id',
  ).bind(onderzoekId, f.naam, f.omschrijving, volgorde).first();
  return json({ id: rij.id }, 201);
}

export async function themaWijzig({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'thema', id);
  const f = themaVelden(await leesJson(request));
  await env.DB.prepare('UPDATE themas SET naam = ?, omschrijving = ? WHERE id = ?').bind(f.naam, f.omschrijving, id).run();
  return json({ ok: true });
}

export async function themaVerwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'thema', id);
  const tel = await een(
    env,
    `SELECT (SELECT COUNT(*) FROM vragen WHERE thema_id = ?) AS vragen,
            (SELECT COUNT(*) FROM eigen_invoer WHERE thema_id = ?) AS invoer`,
    id,
    id,
  );
  if (tel.vragen || tel.invoer) {
    const delen = [];
    if (tel.vragen) delen.push(`${tel.vragen} ${tel.vragen === 1 ? 'vraag' : 'vragen'}`);
    if (tel.invoer) delen.push(`${tel.invoer} ${tel.invoer === 1 ? 'item' : 'items'} eigen invoer`);
    throw new Fout(
      409,
      `Dit thema wordt nog gebruikt door ${delen.join(' en ')}. Verplaats of verwijder die eerst naar een ander thema.`,
    );
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM meetpunten WHERE thema_id = ?').bind(id),
    env.DB.prepare('DELETE FROM themas WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ---- Meetpunten ----

function meetpuntVelden(body) {
  return {
    naam: v.tekst(body.naam, 'Naam van het meetpunt', { verplicht: true, max: 150 }),
    omschrijving: v.tekst(body.omschrijving, 'Omschrijving', { max: 2000 }),
    eenheid: v.tekst(body.eenheid, 'Eenheid', { max: 30 }),
  };
}

export async function meetpuntNieuw({ request, env, params }) {
  const themaId = v.id(params.id);
  await bewerkbaarVia(env, 'thema', themaId);
  const f = meetpuntVelden(await leesJson(request));
  const volgorde = await volgendeVolgorde(env, 'meetpunten', 'thema_id', themaId);
  const rij = await env.DB.prepare(
    'INSERT INTO meetpunten (thema_id, naam, omschrijving, eenheid, volgorde) VALUES (?, ?, ?, ?, ?) RETURNING id',
  ).bind(themaId, f.naam, f.omschrijving, f.eenheid, volgorde).first();
  return json({ id: rij.id }, 201);
}

export async function meetpuntWijzig({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'meetpunt', id);
  const f = meetpuntVelden(await leesJson(request));
  await env.DB.prepare('UPDATE meetpunten SET naam = ?, omschrijving = ?, eenheid = ? WHERE id = ?')
    .bind(f.naam, f.omschrijving, f.eenheid, id).run();
  return json({ ok: true });
}

export async function meetpuntVerwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'meetpunt', id);
  // Vragen en eigen invoer blijven bestaan, alleen de koppeling aan het meetpunt vervalt.
  await env.DB.batch([
    env.DB.prepare('UPDATE vragen SET meetpunt_id = NULL WHERE meetpunt_id = ?').bind(id),
    env.DB.prepare('UPDATE eigen_invoer SET meetpunt_id = NULL WHERE meetpunt_id = ?').bind(id),
    env.DB.prepare('DELETE FROM meetpunten WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ---- Meetmomenten ----

function meetmomentVelden(body) {
  return {
    naam: v.tekst(body.naam, 'Naam van het meetmoment', { verplicht: true, max: 150 }),
    datum: v.datum(body.datum, 'Datum'),
    omschrijving: v.tekst(body.omschrijving, 'Omschrijving', { max: 2000 }),
  };
}

export async function meetmomentNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const f = meetmomentVelden(await leesJson(request));
  const volgorde = await volgendeVolgorde(env, 'meetmomenten', 'onderzoek_id', onderzoekId);
  const rij = await env.DB.prepare(
    'INSERT INTO meetmomenten (onderzoek_id, naam, datum, omschrijving, volgorde) VALUES (?, ?, ?, ?, ?) RETURNING id',
  ).bind(onderzoekId, f.naam, f.datum, f.omschrijving, volgorde).first();
  return json({ id: rij.id }, 201);
}

export async function meetmomentWijzig({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'meetmoment', id);
  const f = meetmomentVelden(await leesJson(request));
  await env.DB.prepare('UPDATE meetmomenten SET naam = ?, datum = ?, omschrijving = ? WHERE id = ?')
    .bind(f.naam, f.datum, f.omschrijving, id).run();
  return json({ ok: true });
}

export async function meetmomentVerwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'meetmoment', id);
  await env.DB.batch([
    env.DB.prepare('UPDATE vragenlijsten SET meetmoment_id = NULL WHERE meetmoment_id = ?').bind(id),
    env.DB.prepare('UPDATE eigen_invoer SET meetmoment_id = NULL WHERE meetmoment_id = ?').bind(id),
    env.DB.prepare('DELETE FROM meetmomenten WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ---- Volgorde aanpassen ----

const VOLGORDE = {
  themas: { tabel: 'themas', ouder: 'onderzoek_id', soort: 'thema' },
  meetmomenten: { tabel: 'meetmomenten', ouder: 'onderzoek_id', soort: 'meetmoment' },
  meetpunten: { tabel: 'meetpunten', ouder: 'thema_id', soort: 'meetpunt' },
  vragen: { tabel: 'vragen', ouder: 'vragenlijst_id', soort: 'vraag' },
  acties: { tabel: 'acties', ouder: 'onderzoek_id', soort: 'actie' },
  stukken: { tabel: 'stukken', ouder: 'onderzoek_id', soort: 'stuk' },
};

/** Body: { soort: 'themas'|'meetmomenten'|'meetpunten'|'vragen'|'acties'|'stukken', ids: [..] } in de gewenste volgorde. */
export async function volgorde({ request, env }) {
  const body = await leesJson(request);
  const cfg = VOLGORDE[body.soort];
  if (!cfg) throw new Fout(400, 'Onbekend soort item.');
  const ids = v.idLijst(body.ids, 'Volgorde', { max: 100 }); // D1: max 100 parameters per query
  if (!ids.length) return json({ ok: true });

  const plekjes = ids.map(() => '?').join(',');
  const rijen = await env.DB.prepare(`SELECT id, ${cfg.ouder} AS ouder FROM ${cfg.tabel} WHERE id IN (${plekjes})`)
    .bind(...ids)
    .all();
  if (rijen.results.length !== ids.length) throw new Fout(404, 'Een of meer items bestaan niet (meer).');
  const ouders = new Set(rijen.results.map((r) => r.ouder));
  if (ouders.size !== 1) throw new Fout(400, 'Items horen niet bij elkaar.');
  await bewerkbaarVia(env, cfg.soort, ids[0]);

  await env.DB.batch(
    ids.map((itemId, i) => env.DB.prepare(`UPDATE ${cfg.tabel} SET volgorde = ? WHERE id = ?`).bind(i + 1, itemId)),
  );
  return json({ ok: true });
}

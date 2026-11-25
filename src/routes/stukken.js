// Stukken: notities, bevindingen en conceptrapport, met automatisch opslaan.

import { Fout, json, leesJson, bestand } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, haalBewerkbaarOnderzoek, bewerkbaarVia, nuIso, volgendeVolgorde } from '../lib/db.js';
import { slug, markdownNaarTekst } from '../lib/export-hulp.js';

const SOORTEN = ['notitie', 'bevindingen', 'rapport', 'overig'];
const MAX_INHOUD = 500_000;

export async function lijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const rijen = await alle(
    env,
    `SELECT id, soort, titel, volgorde, aangemaakt_op, bijgewerkt_op, LENGTH(inhoud) AS lengte
     FROM stukken WHERE onderzoek_id = ? ORDER BY volgorde, id`,
    onderzoekId,
  );
  return json({ stukken: rijen });
}

export async function nieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request);
  const titel = v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 });
  const soort = v.keuze(body.soort, 'Soort', SOORTEN, { standaard: 'notitie' });
  const nu = nuIso();
  const volgorde = await volgendeVolgorde(env, 'stukken', 'onderzoek_id', onderzoekId);
  const rij = await env.DB.prepare(
    `INSERT INTO stukken (onderzoek_id, soort, titel, inhoud, volgorde, aangemaakt_op, bijgewerkt_op)
     VALUES (?, ?, ?, '', ?, ?, ?) RETURNING id`,
  ).bind(onderzoekId, soort, titel, volgorde, nu, nu).first();
  return json({ id: rij.id }, 201);
}

export async function detail({ env, params }) {
  const id = v.id(params.id);
  const stuk = await een(env, 'SELECT * FROM stukken WHERE id = ?', id);
  if (!stuk) throw new Fout(404, 'Dit stuk bestaat niet (meer).');
  const o = await haalOnderzoek(env, stuk.onderzoek_id);
  return json({ stuk, onderzoek_status: o.status });
}

/**
 * Opslaan (ook automatisch). Stuur bijgewerkt_op mee zoals je het laatst ontving;
 * is het stuk intussen ergens anders gewijzigd, dan volgt een conflictmelding (409).
 */
export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'stuk', id);
  const body = await leesJson(request);
  const huidig = await een(env, 'SELECT * FROM stukken WHERE id = ?', id);
  if (body.bijgewerkt_op && body.bijgewerkt_op !== huidig.bijgewerkt_op && !body.overschrijven) {
    throw new Fout(409, 'Dit stuk is intussen op een andere plek (bijvoorbeeld een ander tabblad of apparaat) gewijzigd.', {
      conflict: true,
      actueel: { inhoud: huidig.inhoud, titel: huidig.titel, bijgewerkt_op: huidig.bijgewerkt_op },
    });
  }
  const titel = body.titel === undefined ? huidig.titel : v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 });
  const soort = body.soort === undefined ? huidig.soort : v.keuze(body.soort, 'Soort', SOORTEN);
  const inhoud = body.inhoud === undefined ? huidig.inhoud : v.langeTekst(body.inhoud, 'Tekst', { max: MAX_INHOUD });
  let nu = nuIso();
  if (nu <= huidig.bijgewerkt_op) nu = new Date(Date.parse(huidig.bijgewerkt_op) + 1).toISOString();
  await env.DB.prepare('UPDATE stukken SET titel = ?, soort = ?, inhoud = ?, bijgewerkt_op = ? WHERE id = ?')
    .bind(titel, soort, inhoud, nu, id).run();
  return json({ ok: true, bijgewerkt_op: nu });
}

/** Voegt een tekstblok (bijv. cijfers uit het dashboard) toe aan het eind van een stuk. */
export async function toevoegen({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'stuk', id);
  const body = await leesJson(request);
  const tekst = v.langeTekst(body.tekst, 'Tekst', { max: 50_000 }).trim();
  if (!tekst) throw new Fout(400, 'Er is geen tekst om toe te voegen.');
  const huidig = await een(env, 'SELECT inhoud, bijgewerkt_op FROM stukken WHERE id = ?', id);
  const nieuweInhoud = huidig.inhoud.replace(/\s*$/, '') + (huidig.inhoud.trim() ? '\n\n' : '') + tekst + '\n';
  if (nieuweInhoud.length > MAX_INHOUD) throw new Fout(400, 'Het stuk wordt hierdoor te lang.');
  let nu = nuIso();
  if (nu <= huidig.bijgewerkt_op) nu = new Date(Date.parse(huidig.bijgewerkt_op) + 1).toISOString();
  await env.DB.prepare('UPDATE stukken SET inhoud = ?, bijgewerkt_op = ? WHERE id = ?').bind(nieuweInhoud, nu, id).run();
  return json({ ok: true, bijgewerkt_op: nu });
}

export async function verwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'stuk', id);
  await env.DB.prepare('DELETE FROM stukken WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

export async function download({ env, params }) {
  const id = v.id(params.id);
  const stuk = await een(env, 'SELECT * FROM stukken WHERE id = ?', id);
  if (!stuk) throw new Fout(404, 'Dit stuk bestaat niet (meer).');
  const o = await haalOnderzoek(env, stuk.onderzoek_id);
  const naam = `${slug(o.bedrijfsnaam)}-${slug(stuk.titel)}.txt`;
  return bestand('﻿' + stuk.inhoud.replace(/\r?\n/g, '\r\n'), naam, 'text/plain; charset=utf-8');
}

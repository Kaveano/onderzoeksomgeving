// Eigen invoer: interviews, observaties, cijfers en overige bronnen.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, haalBewerkbaarOnderzoek, bewerkbaarVia, nuIso } from '../lib/db.js';

const SOORTEN = ['interview', 'observatie', 'cijfer', 'document', 'overig'];

async function velden(env, body, onderzoekId) {
  const soort = v.keuze(body.soort, 'Soort', SOORTEN);
  const themaId = v.id(body.thema_id, 'thema');
  const thema = await een(env, 'SELECT onderzoek_id FROM themas WHERE id = ?', themaId);
  if (!thema || thema.onderzoek_id !== onderzoekId) throw new Fout(400, 'Kies een thema van dit onderzoek.');
  const meetpuntId = v.optioneelId(body.meetpunt_id, 'meetpunt');
  if (meetpuntId) {
    const mp = await een(env, 'SELECT thema_id FROM meetpunten WHERE id = ?', meetpuntId);
    if (!mp || mp.thema_id !== themaId) throw new Fout(400, 'Het gekozen meetpunt hoort niet bij het gekozen thema.');
  }
  const meetmomentId = v.optioneelId(body.meetmoment_id, 'meetmoment');
  if (meetmomentId) {
    const mm = await een(env, 'SELECT onderzoek_id FROM meetmomenten WHERE id = ?', meetmomentId);
    if (!mm || mm.onderzoek_id !== onderzoekId) throw new Fout(400, 'Het gekozen meetmoment hoort niet bij dit onderzoek.');
  }
  const waarde = v.getal(body.waarde, 'Waarde', { verplicht: soort === 'cijfer' });
  return {
    soort,
    thema_id: themaId,
    meetpunt_id: meetpuntId,
    meetmoment_id: meetmomentId,
    datum: v.datum(body.datum, 'Datum', { verplicht: true }),
    titel: v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 }),
    tekst: v.langeTekst(body.tekst, 'Tekst', { max: 100_000 }),
    waarde,
    eenheid: v.tekst(body.eenheid, 'Eenheid', { max: 30 }),
  };
}

export async function lijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const rijen = await alle(
    env,
    `SELECT e.*, t.naam AS thema_naam, m.naam AS meetpunt_naam, mm.naam AS meetmoment_naam
     FROM eigen_invoer e
     JOIN themas t ON t.id = e.thema_id
     LEFT JOIN meetpunten m ON m.id = e.meetpunt_id
     LEFT JOIN meetmomenten mm ON mm.id = e.meetmoment_id
     WHERE e.onderzoek_id = ?
     ORDER BY e.datum DESC, e.id DESC`,
    onderzoekId,
  );
  return json({ invoer: rijen });
}

export async function nieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const f = await velden(env, await leesJson(request), onderzoekId);
  const rij = await env.DB.prepare(
    `INSERT INTO eigen_invoer (onderzoek_id, thema_id, meetpunt_id, meetmoment_id, soort, datum, titel, tekst, waarde, eenheid, aangemaakt_op)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(onderzoekId, f.thema_id, f.meetpunt_id, f.meetmoment_id, f.soort, f.datum, f.titel, f.tekst, f.waarde, f.eenheid, nuIso()).first();
  return json({ id: rij.id }, 201);
}

export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  const o = await bewerkbaarVia(env, 'invoer', id);
  const f = await velden(env, await leesJson(request), o.id);
  await env.DB.prepare(
    `UPDATE eigen_invoer SET thema_id = ?, meetpunt_id = ?, meetmoment_id = ?, soort = ?, datum = ?, titel = ?, tekst = ?,
       waarde = ?, eenheid = ? WHERE id = ?`,
  ).bind(f.thema_id, f.meetpunt_id, f.meetmoment_id, f.soort, f.datum, f.titel, f.tekst, f.waarde, f.eenheid, id).run();
  return json({ ok: true });
}

export async function verwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'invoer', id);
  await env.DB.prepare('DELETE FROM eigen_invoer WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

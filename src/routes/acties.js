// Actielijst: wat moet er nog gebeuren?

import { json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, haalOnderzoek, haalBewerkbaarOnderzoek, bewerkbaarVia, nuIso, volgendeVolgorde } from '../lib/db.js';

const STATUSSEN = ['te_doen', 'bezig', 'klaar'];

function velden(body) {
  return {
    titel: v.tekst(body.titel, 'Actie', { verplicht: true, max: 300 }),
    status: v.keuze(body.status, 'Status', STATUSSEN, { standaard: 'te_doen' }),
    datum: v.datum(body.datum, 'Datum'),
    notitie: v.tekst(body.notitie, 'Notitie', { max: 5000 }),
  };
}

export async function lijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const rijen = await alle(
    env,
    `SELECT * FROM acties WHERE onderzoek_id = ?
     ORDER BY CASE status WHEN 'bezig' THEN 0 WHEN 'te_doen' THEN 1 ELSE 2 END,
       COALESCE(datum, '9999-12-31'), volgorde, id`,
    onderzoekId,
  );
  return json({ acties: rijen });
}

export async function nieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const f = velden(await leesJson(request));
  const volgorde = await volgendeVolgorde(env, 'acties', 'onderzoek_id', onderzoekId);
  const rij = await env.DB.prepare(
    'INSERT INTO acties (onderzoek_id, titel, status, datum, notitie, volgorde, aangemaakt_op) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
  ).bind(onderzoekId, f.titel, f.status, f.datum, f.notitie, volgorde, nuIso()).first();
  return json({ id: rij.id }, 201);
}

export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'actie', id);
  const f = velden(await leesJson(request));
  await env.DB.prepare('UPDATE acties SET titel = ?, status = ?, datum = ?, notitie = ? WHERE id = ?')
    .bind(f.titel, f.status, f.datum, f.notitie, id).run();
  return json({ ok: true });
}

export async function verwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'actie', id);
  await env.DB.prepare('DELETE FROM acties WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

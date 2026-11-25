// Onderzoeken: overzicht, aanmaken, wijzigen, archiveren, verwijderen en sjablonen.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, haalBewerkbaarOnderzoek, nuIso } from '../lib/db.js';
import { pasSjablonenToe, maakSjabloonInhoud, controleerSjablonen } from '../lib/sjabloon-toepassen.js';
import { STANDAARD_SJABLONEN, STANDAARD_STUKKEN } from '../sjablonen.js';

/** Zoekt sjablooninhoud op id: 'medewerkerstevredenheid' of 'eigen-12'. */
async function zoekSjabloon(env, sjabloonId) {
  if (typeof sjabloonId !== 'string' || sjabloonId.length > 60) throw new Fout(400, 'Ongeldig sjabloon.');
  const standaard = STANDAARD_SJABLONEN.find((s) => s.id === sjabloonId);
  if (standaard) return standaard.inhoud;
  const m = /^eigen-(\d+)$/.exec(sjabloonId);
  if (m) {
    const rij = await een(env, 'SELECT inhoud FROM sjablonen WHERE id = ?', Number(m[1]));
    if (rij) return JSON.parse(rij.inhoud);
  }
  throw new Fout(404, 'Dit sjabloon bestaat niet (meer).');
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

export async function nieuw({ request, env }) {
  const body = await leesJson(request);
  const f = velden(body);
  const sjabloonIds = Array.isArray(body.sjablonen) ? body.sjablonen.slice(0, 10) : [];
  const inhouden = [];
  for (const sid of [...new Set(sjabloonIds)]) inhouden.push(await zoekSjabloon(env, sid));
  controleerSjablonen(inhouden, f.bedrijfsnaam);

  const nu = nuIso();
  const o = await env.DB.prepare(
    `INSERT INTO onderzoeken (bedrijfsnaam, titel, onderzoeksvraag, toelichting, status, aangemaakt_op)
     VALUES (?, ?, ?, ?, 'actief', ?) RETURNING *`,
  ).bind(f.bedrijfsnaam, f.titel, f.onderzoeksvraag, f.toelichting, nu).first();

  // Standaard: één meetmoment "Nulmeting" en drie lege stukken.
  const [mm] = await env.DB.batch([
    env.DB.prepare('INSERT INTO meetmomenten (onderzoek_id, naam, datum, omschrijving, volgorde) VALUES (?, ?, NULL, ?, 1) RETURNING id')
      .bind(o.id, 'Nulmeting', 'Eerste meting'),
    ...STANDAARD_STUKKEN.map((s, i) =>
      env.DB.prepare(
        'INSERT INTO stukken (onderzoek_id, soort, titel, inhoud, volgorde, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(o.id, s.soort, s.titel, s.inhoud, i + 1, nu, nu),
    ),
  ]);

  if (inhouden.length) {
    await pasSjablonenToe(env, o, inhouden, { meetmomentId: mm.results[0].id });
  }
  return json({ id: o.id }, 201);
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
    env.DB.prepare('DELETE FROM onderzoeken WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

export async function sjabloonToepassen({ request, env, params }) {
  const id = v.id(params.id);
  const o = await haalBewerkbaarOnderzoek(env, id);
  const body = await leesJson(request);
  const inhoud = await zoekSjabloon(env, body.sjabloon);
  const meetmomentId = v.optioneelId(body.meetmoment_id, 'meetmoment');
  if (meetmomentId) {
    const mm = await een(env, 'SELECT onderzoek_id FROM meetmomenten WHERE id = ?', meetmomentId);
    if (!mm || mm.onderzoek_id !== id) throw new Fout(400, 'Het gekozen meetmoment hoort niet bij dit onderzoek.');
  }
  const vragenlijstId = await pasSjablonenToe(env, o, [inhoud], { meetmomentId });
  return json({ ok: true, vragenlijst_id: vragenlijstId });
}

export async function alsSjabloon({ request, env, params }) {
  const id = v.id(params.id);
  const o = await haalOnderzoek(env, id);
  const body = await leesJson(request);
  const naam = v.tekst(body.naam, 'Naam van het sjabloon', { verplicht: true, max: 150 });
  const omschrijving = v.tekst(body.omschrijving, 'Omschrijving', { max: 1000 });
  const vragenlijstId = v.optioneelId(body.vragenlijst_id, 'vragenlijst');
  if (vragenlijstId) {
    const vl = await een(env, 'SELECT onderzoek_id FROM vragenlijsten WHERE id = ?', vragenlijstId);
    if (!vl || vl.onderzoek_id !== id) throw new Fout(400, 'De gekozen vragenlijst hoort niet bij dit onderzoek.');
  }
  const inhoud = await maakSjabloonInhoud(env, o, vragenlijstId);
  const rij = await env.DB.prepare(
    'INSERT INTO sjablonen (naam, omschrijving, inhoud, aangemaakt_op) VALUES (?, ?, ?, ?) RETURNING id',
  ).bind(naam, omschrijving, JSON.stringify(inhoud), nuIso()).first();
  return json({ id: `eigen-${rij.id}` }, 201);
}

// ---- Sjablonen beheren ----

function samenvatting(inhoud) {
  return {
    themas: (inhoud.themas || []).length,
    meetpunten: (inhoud.themas || []).reduce((n, t) => n + (t.meetpunten || []).length, 0),
    vragen: (inhoud.vragen || []).length,
    acties: (inhoud.acties || []).length,
  };
}

export async function sjablonenLijst({ env }) {
  const eigen = await alle(env, 'SELECT id, naam, omschrijving, inhoud, aangemaakt_op FROM sjablonen ORDER BY naam');
  return json({
    sjablonen: [
      ...STANDAARD_SJABLONEN.map((s) => ({
        id: s.id,
        naam: s.naam,
        omschrijving: s.omschrijving,
        standaard: true,
        samenvatting: samenvatting(s.inhoud),
      })),
      ...eigen.map((s) => ({
        id: `eigen-${s.id}`,
        naam: s.naam,
        omschrijving: s.omschrijving,
        standaard: false,
        aangemaakt_op: s.aangemaakt_op,
        samenvatting: samenvatting(JSON.parse(s.inhoud)),
      })),
    ],
  });
}

export async function sjabloonDetail({ env, params }) {
  const inhoud = await zoekSjabloon(env, params.sjabloon);
  return json({ id: params.sjabloon, inhoud });
}

function eigenSjabloonId(waarde) {
  const m = /^eigen-(\d+)$/.exec(String(waarde || ''));
  if (!m) throw new Fout(400, 'Standaardsjablonen kunnen niet worden gewijzigd of verwijderd. Pas ze toe en sla het resultaat op als eigen sjabloon.');
  return Number(m[1]);
}

export async function sjabloonWijzig({ request, env, params }) {
  const id = eigenSjabloonId(params.sjabloon);
  const body = await leesJson(request);
  const naam = v.tekst(body.naam, 'Naam van het sjabloon', { verplicht: true, max: 150 });
  const omschrijving = v.tekst(body.omschrijving, 'Omschrijving', { max: 1000 });
  const res = await env.DB.prepare('UPDATE sjablonen SET naam = ?, omschrijving = ? WHERE id = ?').bind(naam, omschrijving, id).run();
  if (!res.meta.changes) throw new Fout(404, 'Dit sjabloon bestaat niet (meer).');
  return json({ ok: true });
}

export async function sjabloonVerwijder({ env, params }) {
  const id = eigenSjabloonId(params.sjabloon);
  const res = await env.DB.prepare('DELETE FROM sjablonen WHERE id = ?').bind(id).run();
  if (!res.meta.changes) throw new Fout(404, 'Dit sjabloon bestaat niet (meer).');
  return json({ ok: true });
}

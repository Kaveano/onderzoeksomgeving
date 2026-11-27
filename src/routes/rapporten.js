// Rapporten: tussenrapport en eindrapport.
// De server bewaart alleen: de eigen tekst per hoofdstuk (inhoud) en de vastgelegde feiten (peildatum).
// De feiten worden in de browser samengesteld uit de gegevens van het onderzoek (dashboard en export);
// er wordt nergens tekst "verzonnen".

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, haalBewerkbaarOnderzoek, bewerkbaarVia, onderzoekVan, nuIso } from '../lib/db.js';
// Dezelfde regels als in de browser, zodat een kijker precies ziet wat de onderzoeker in het voorbeeld ziet.
import { rapportNaarBlokken } from '../../public/js/beheer/rapport-feiten.js';

const SOORTEN = ['tussen', 'eind'];
const MAX_RAPPORTEN = 20;
const MAX_SECTIES = 40;
const MAX_TEKST = 60_000;
const MAX_FEITEN = 900_000; // tekens JSON

/** Controleert de inhoud van een rapport en geeft een opgeschoonde kopie terug. */
export async function controleerInhoud(env, ruw, onderzoekId) {
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) throw new Fout(400, 'De inhoud van het rapport is ongeldig.');
  if (!Array.isArray(ruw.secties)) throw new Fout(400, 'Het rapport heeft geen hoofdstukken.');
  if (ruw.secties.length > MAX_SECTIES) throw new Fout(400, `Een rapport kan maximaal ${MAX_SECTIES} hoofdstukken hebben.`);
  const ids = new Set();
  const secties = ruw.secties.map((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Fout(400, `Hoofdstuk ${i + 1} is ongeldig.`);
    const id = typeof s.id === 'string' && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : null;
    if (!id || ids.has(id)) throw new Fout(400, `Hoofdstuk ${i + 1} heeft geen geldige, unieke aanduiding.`);
    ids.add(id);
    const soort = typeof s.soort === 'string' && /^[a-z-]{1,30}$/.test(s.soort) ? s.soort : 'eigen';
    return {
      id,
      soort,
      titel: v.tekst(s.titel, `Titel van hoofdstuk ${i + 1}`, { verplicht: true, max: 200 }),
      tekst: v.langeTekst(s.tekst, `Tekst van hoofdstuk ${i + 1}`, { max: MAX_TEKST }),
      aan: s.aan !== false,
      feiten: s.feiten !== false,
      beknopt: s.beknopt === true,
    };
  });
  let lijst = v.optioneelId(ruw.lijst, 'Vragenlijst');
  if (lijst) {
    const rij = await een(env, 'SELECT onderzoek_id FROM vragenlijsten WHERE id = ?', lijst);
    if (!rij || rij.onderzoek_id !== onderzoekId) lijst = null; // vragenlijst is intussen verwijderd
  }
  return {
    ondertitel: v.tekst(ruw.ondertitel, 'Ondertitel', { max: 200 }),
    opdrachtgever: v.tekst(ruw.opdrachtgever, 'Opdrachtgever', { max: 200 }),
    opsteller: v.tekst(ruw.opsteller, 'Opgesteld door', { max: 200 }),
    datum: v.datum(ruw.datum, 'Datum') || '',
    lijst,
    secties,
  };
}

function leesJsonVeld(tekst, standaard) {
  try {
    const w = JSON.parse(tekst || '');
    return w && typeof w === 'object' ? w : standaard;
  } catch {
    return standaard;
  }
}

export function rapportUitDb(rij) {
  return {
    id: rij.id,
    onderzoek_id: rij.onderzoek_id,
    soort: rij.soort,
    titel: rij.titel,
    inhoud: leesJsonVeld(rij.inhoud, { secties: [] }),
    feiten: leesJsonVeld(rij.feiten, null),
    aangemaakt_op: rij.aangemaakt_op,
    bijgewerkt_op: rij.bijgewerkt_op,
  };
}

/** [{id, n}] uit de database (klein: één regel per vragenlijst); bij iets onverwachts een lege lijst. */
function leesLijstenN(tekst) {
  try {
    const lijst = JSON.parse(tekst || '[]');
    return Array.isArray(lijst) ? lijst.filter((l) => Number.isInteger(l?.id)).map((l) => ({ id: l.id, n: Number.isFinite(l.n) ? l.n : 0 })) : [];
  } catch {
    return [];
  }
}

export async function lijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  // heeft_open: in de vastgelegde cijfers staat een vragenlijst met antwoorden die op de peildatum nog openstond
  // (het scherm Delen meldt dan dat een meelezer die uitkomsten alleen met de tussenstand ziet).
  // lijsten_n: per vragenlijst het vastgelegde aantal respondenten [{id, n}] (voor verschilwacht.js: een meelezer
  // mag niet twee uitkomsten kunnen vergelijken die 1 tot 4 respondenten verschillen).
  const rijen = await alle(
    env,
    `SELECT id, soort, titel, aangemaakt_op, bijgewerkt_op,
       CASE WHEN feiten = '' THEN NULL ELSE json_extract(feiten, '$.peildatum') END AS peildatum,
       CASE WHEN json_valid(feiten) THEN EXISTS (SELECT 1 FROM json_each(feiten, '$.lijsten')
         WHERE json_extract(value, '$.status') = 'open' AND json_extract(value, '$.n') > 0) ELSE 0 END AS heeft_open,
       CASE WHEN json_valid(feiten) THEN (SELECT json_group_array(json_object('id', json_extract(value, '$.id'), 'n', json_extract(value, '$.n')))
         FROM json_each(feiten, '$.lijsten')) ELSE '[]' END AS lijsten_n
     FROM rapporten WHERE onderzoek_id = ? ORDER BY id`,
    onderzoekId,
  );
  return json({ rapporten: rijen.map((r) => ({ ...r, heeft_open: !!r.heeft_open, lijsten_n: leesLijstenN(r.lijsten_n) })) });
}

export async function nieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request);
  const soort = v.keuze(body.soort, 'Soort rapport', SOORTEN);
  const titel = v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 });
  const inhoud = await controleerInhoud(env, body.inhoud, onderzoekId);
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM rapporten WHERE onderzoek_id = ?', onderzoekId);
  if (tel.n >= MAX_RAPPORTEN) throw new Fout(409, `Een onderzoek kan maximaal ${MAX_RAPPORTEN} rapporten hebben. Verwijder er eerst een.`);
  const nu = nuIso();
  const rij = await env.DB.prepare(
    'INSERT INTO rapporten (onderzoek_id, soort, titel, inhoud, aangemaakt_op, bijgewerkt_op) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
  ).bind(onderzoekId, soort, titel, JSON.stringify(inhoud), nu, nu).first();
  return json({ id: rij.id }, 201);
}

async function haalRapport(env, id) {
  const rij = await een(env, 'SELECT * FROM rapporten WHERE id = ?', id);
  if (!rij) throw new Fout(404, 'Dit rapport bestaat niet (meer).');
  return rij;
}

export async function detail({ env, params }) {
  const id = v.id(params.id);
  await onderzoekVan(env, 'rapport', id);
  return json({ rapport: rapportUitDb(await haalRapport(env, id)) });
}

export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  const o = await bewerkbaarVia(env, 'rapport', id);
  const body = await leesJson(request, 2_000_000);
  const huidig = await haalRapport(env, id);
  if (body.bijgewerkt_op && body.bijgewerkt_op !== huidig.bijgewerkt_op && !body.overschrijven) {
    throw new Fout(409, 'Dit rapport is intussen op een andere plek (bijvoorbeeld een ander tabblad of apparaat) gewijzigd.', { conflict: true });
  }
  const titel = body.titel === undefined ? huidig.titel : v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 });
  const inhoud = body.inhoud === undefined ? huidig.inhoud : JSON.stringify(await controleerInhoud(env, body.inhoud, o.id));
  let nu = nuIso();
  if (nu <= huidig.bijgewerkt_op) nu = new Date(Date.parse(huidig.bijgewerkt_op) + 1).toISOString();
  await env.DB.prepare('UPDATE rapporten SET titel = ?, inhoud = ?, bijgewerkt_op = ? WHERE id = ?').bind(titel, inhoud, nu, id).run();
  return json({ ok: true, bijgewerkt_op: nu });
}

/** Legt de feiten vast (de cijfers op de peildatum). De eigen tekst blijft ongemoeid. */
export async function feiten({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'rapport', id);
  const body = await leesJson(request, 2_000_000);
  const f = body.feiten;
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Fout(400, 'De feiten zijn ongeldig.');
  if (v.datum(f.peildatum, 'Peildatum', { verplicht: true }) !== f.peildatum) throw new Fout(400, 'De peildatum is ongeldig.');
  const tekst = JSON.stringify(f);
  if (tekst.length > MAX_FEITEN) throw new Fout(413, 'Dit onderzoek heeft te veel gegevens (vooral open antwoorden) om in één rapport vast te leggen.');
  await env.DB.prepare('UPDATE rapporten SET feiten = ? WHERE id = ?').bind(tekst, id).run();
  return json({ ok: true, peildatum: f.peildatum });
}

export async function verwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'rapport', id);
  await env.DB.prepare('DELETE FROM rapporten WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

/**
 * Rapport voor een kijker (deellink). De kijker krijgt alleen de kant-en-klare tekst en tabellen van de
 * hoofdstukken die aanstaan, precies zoals ze in het rapport staan; de ruwe, vastgelegde cijfers gaan niet mee.
 */
export function rapportVoorKijker(rij) {
  const r = rapportUitDb(rij);
  const blokken = rapportNaarBlokken({ titel: r.titel, soort: r.soort, inhoud: r.inhoud, feiten: r.feiten }, { markeerLeeg: false });
  return { id: r.id, soort: r.soort, titel: r.titel, blokken, bijgewerkt_op: r.bijgewerkt_op };
}

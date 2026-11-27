// Open antwoorden en interviews coderen (BOUWPLAN B24, §3.12): codes, coderingen en citaten van een onderzoek.
// Alleen voor de ingelogde onderzoeker. Antwoorden heten hier naar het (willekeurige) id van de inzending; dat id
// komt alleen via export/inzendingen bij de beheerder, nooit bij een meelezer.
//
// - Een codering hoort bij één antwoord (inzending + open vraag van die vragenlijst) of bij één stuk eigen invoer.
//   PUT …/coderingen vervangt de codes van één stuk in één batch (twee opdrachten).
// - Een citaat is een aanpasbare kopie. Het mag pas in_rapport zijn als het gecontroleerd is (anders 400). Pas je de
//   tekst aan, dan vervalt "gecontroleerd" (en dus "in rapport"), tenzij je het in hetzelfde verzoek opnieuw aanvinkt.
// - Een gearchiveerd onderzoek: alles alleen-lezen (409).
// Rekentijd: per route hooguit één losse query plus twee batches; geen antwoorden ingelezen in de Worker.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { een, haalOnderzoek, haalBewerkbaarOnderzoek, nuIso } from '../lib/db.js';
import {
  MAX_CODES, MAX_CODERINGEN, MAX_CITATEN, MAX_CITAAT, MAX_CODENAAM, MAX_OMSCHRIJVING, CITAAT_NIET_GECONTROLEERD,
} from '../../public/js/beheer/codering-regels.js';

const isUniekFout = (e) => /UNIQUE/i.test(String(e?.message || e));

async function haalCode(env, id) {
  const c = await een(env, 'SELECT * FROM codes WHERE id = ?', id);
  if (!c) throw new Fout(404, 'Deze code bestaat niet (meer).');
  return c;
}

async function haalCitaat(env, id) {
  const c = await een(env, 'SELECT * FROM citaten WHERE id = ?', id);
  if (!c) throw new Fout(404, 'Dit citaat bestaat niet (meer).');
  return c;
}

/**
 * Het stuk waar een codering of citaat bij hoort: { inzending_id, vraag_id } of { invoer_id }.
 * Controleert dat de inzending bij een vragenlijst van dit onderzoek hoort, dat de vraag een open vraag van die
 * vragenlijst is en (bij metAntwoord) dat er een antwoord op staat; of dat de invoer bij dit onderzoek hoort.
 */
async function controleerStuk(env, body, onderzoekId, { metAntwoord = true } = {}) {
  const invoerId = v.optioneelId(body.invoer_id, 'invoer');
  if (invoerId) {
    if (body.inzending_id || body.vraag_id) throw new Fout(400, 'Kies een antwoord óf een stuk eigen invoer.');
    const rij = await een(env, 'SELECT 1 AS ja FROM eigen_invoer WHERE id = ? AND onderzoek_id = ?', invoerId, onderzoekId);
    if (!rij) throw new Fout(400, 'Deze invoer hoort niet bij dit onderzoek.');
    return { invoer_id: invoerId };
  }
  const inzendingId = v.id(body.inzending_id, 'antwoord');
  const vraagId = v.id(body.vraag_id, 'vraag');
  const [inz, vraag] = await env.DB.batch([
    // Het pad naar het antwoord als tekst meegeven: een getal zou de database als 6002.0 in het pad zetten.
    env.DB.prepare(`SELECT json_type(i.antwoorden, ?2) AS soort, trim(json_extract(i.antwoorden, ?2)) AS tekst
      FROM inzendingen i JOIN vragenlijsten vl ON vl.id = i.vragenlijst_id WHERE i.id = ?1 AND vl.onderzoek_id = ?3`).bind(inzendingId, `$."${vraagId}"`, onderzoekId),
    env.DB.prepare(`SELECT 1 AS ja FROM vragen q WHERE q.id = ?1 AND q.type = 'open'
      AND q.vragenlijst_id = (SELECT vragenlijst_id FROM inzendingen WHERE id = ?2)`).bind(vraagId, inzendingId),
  ]);
  const i = inz.results[0];
  if (!i) throw new Fout(400, 'Dit antwoord hoort niet bij dit onderzoek.');
  if (!vraag.results.length) throw new Fout(400, 'Kies een open vraag van de vragenlijst van dit antwoord.');
  if (metAntwoord && (i.soort !== 'text' || !i.tekst)) throw new Fout(400, 'Op deze vraag staat in dit antwoord niets ingevuld.');
  return { inzending_id: inzendingId, vraag_id: vraagId };
}

// ---------- Overzicht ----------

/** GET /onderzoeken/:id/codering → { codes, coderingen, citaten } (zoals in export/data). */
export async function overzicht({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const q = (sql) => env.DB.prepare(sql).bind(onderzoekId);
  const [codes, coderingen, citaten] = await env.DB.batch([
    q('SELECT * FROM codes WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT id, code_id, inzending_id, vraag_id, invoer_id FROM coderingen WHERE onderzoek_id = ? ORDER BY id'),
    q('SELECT * FROM citaten WHERE onderzoek_id = ? ORDER BY volgorde, id'),
  ]);
  return json({ codes: codes.results, coderingen: coderingen.results, citaten: citaten.results });
}

// ---------- Codes ----------

function codeVelden(body, huidig = null) {
  return {
    naam: body.naam === undefined && huidig ? huidig.naam : v.tekst(body.naam, 'Naam van de code', { verplicht: true, max: MAX_CODENAAM }),
    omschrijving: body.omschrijving === undefined && huidig ? huidig.omschrijving : v.tekst(body.omschrijving, 'Omschrijving', { max: MAX_OMSCHRIJVING }),
    groep: body.groep === undefined && huidig ? huidig.groep : v.tekst(body.groep, 'Hoofdcode', { max: MAX_CODENAAM }),
  };
}

const naamBezet = (naam) => new Fout(409, `Er is al een code met de naam "${naam}".`);

/** POST /onderzoeken/:id/codes { naam, omschrijving?, groep? } → 201 { id } */
export async function codeNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const f = codeVelden(await leesJson(request, 10_000));
  let rij;
  try {
    rij = await env.DB.prepare(`INSERT INTO codes (onderzoek_id, naam, omschrijving, groep, volgorde, aangemaakt_op)
      SELECT ?1, ?2, ?3, ?4, COALESCE((SELECT MAX(volgorde) FROM codes WHERE onderzoek_id = ?1), 0) + 1, ?5
      WHERE (SELECT COUNT(*) FROM codes WHERE onderzoek_id = ?1) < ${MAX_CODES} RETURNING id`)
      .bind(onderzoekId, f.naam, f.omschrijving, f.groep, nuIso()).first();
  } catch (e) {
    if (isUniekFout(e)) throw naamBezet(f.naam);
    throw e;
  }
  if (!rij) throw new Fout(409, `Een onderzoek kan hooguit ${MAX_CODES} codes hebben. Voeg codes samen of verwijder er een.`);
  return json({ id: rij.id }, 201);
}

/**
 * PUT /codes/:id { naam?, omschrijving?, groep?, volgorde? } of { samenvoegen_in: <code-id> }.
 * Samenvoegen: de antwoorden en citaten van deze code gaan naar de andere code; daarna verdwijnt deze code.
 */
export async function codeWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const code = await haalCode(env, id);
  await haalBewerkbaarOnderzoek(env, code.onderzoek_id);
  const body = await leesJson(request, 10_000);
  if (body.samenvoegen_in !== undefined) {
    const doelId = v.id(body.samenvoegen_in, 'code');
    if (doelId === id) throw new Fout(400, 'Kies een andere code om mee samen te voegen.');
    const doel = await haalCode(env, doelId);
    if (doel.onderzoek_id !== code.onderzoek_id) throw new Fout(400, 'Kies een code van dit onderzoek.');
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO coderingen (onderzoek_id, code_id, inzending_id, vraag_id, invoer_id)
        SELECT onderzoek_id, ?, inzending_id, vraag_id, invoer_id FROM coderingen WHERE code_id = ?`).bind(doelId, id),
      env.DB.prepare('UPDATE citaten SET code_id = ? WHERE code_id = ?').bind(doelId, id),
      env.DB.prepare('DELETE FROM coderingen WHERE code_id = ?').bind(id),
      env.DB.prepare('DELETE FROM codes WHERE id = ?').bind(id),
    ]);
    return json({ ok: true, samengevoegd_in: doelId });
  }
  const f = codeVelden(body, code);
  const volgorde = body.volgorde === undefined ? code.volgorde : v.geheelGetal(body.volgorde, 'Volgorde', { min: 0, max: 100_000 }) ?? code.volgorde;
  try {
    await env.DB.prepare('UPDATE codes SET naam = ?, omschrijving = ?, groep = ?, volgorde = ? WHERE id = ?').bind(f.naam, f.omschrijving, f.groep, volgorde, id).run();
  } catch (e) {
    if (isUniekFout(e)) throw naamBezet(f.naam);
    throw e;
  }
  return json({ ok: true });
}

/** DELETE /codes/:id: de code verdwijnt van alle antwoorden; citaten blijven bestaan (zonder code). */
export async function codeVerwijder({ env, params }) {
  const id = v.id(params.id);
  const code = await haalCode(env, id);
  await haalBewerkbaarOnderzoek(env, code.onderzoek_id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM coderingen WHERE code_id = ?').bind(id),
    env.DB.prepare('UPDATE citaten SET code_id = NULL WHERE code_id = ?').bind(id),
    env.DB.prepare('DELETE FROM codes WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ---------- Coderingen ----------

/**
 * PUT /onderzoeken/:id/coderingen { inzending_id, vraag_id | invoer_id, code_ids: [] } → { ok, code_ids }
 * Vervangt de codes van één antwoord of één stuk eigen invoer (een lege lijst haalt alle codes weg).
 */
export async function coderingen({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request, 20_000);
  const codeIds = v.idLijst(body.code_ids ?? [], 'Codes', { max: MAX_CODES });
  const stuk = await controleerStuk(env, body, onderzoekId, { metAntwoord: codeIds.length > 0 });
  const lijst = JSON.stringify(codeIds);
  const [codesOk, totaal] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM codes WHERE onderzoek_id = ? AND id IN (SELECT value FROM json_each(?))').bind(onderzoekId, lijst),
    env.DB.prepare('SELECT COUNT(*) AS n FROM coderingen WHERE onderzoek_id = ?').bind(onderzoekId),
  ]);
  if (codesOk.results[0].n !== codeIds.length) throw new Fout(400, 'Kies codes van dit onderzoek.');
  if (totaal.results[0].n + codeIds.length > MAX_CODERINGEN) throw new Fout(409, `Een onderzoek kan hooguit ${MAX_CODERINGEN.toLocaleString('nl-NL')} gecodeerde antwoorden hebben.`);
  const opdrachten = stuk.invoer_id
    ? [
      env.DB.prepare('DELETE FROM coderingen WHERE onderzoek_id = ? AND invoer_id = ?').bind(onderzoekId, stuk.invoer_id),
      env.DB.prepare('INSERT INTO coderingen (onderzoek_id, code_id, invoer_id) SELECT ?, value, ? FROM json_each(?)').bind(onderzoekId, stuk.invoer_id, lijst),
    ]
    : [
      env.DB.prepare('DELETE FROM coderingen WHERE onderzoek_id = ? AND inzending_id = ? AND vraag_id = ?').bind(onderzoekId, stuk.inzending_id, stuk.vraag_id),
      env.DB.prepare('INSERT INTO coderingen (onderzoek_id, code_id, inzending_id, vraag_id) SELECT ?, value, ?, ? FROM json_each(?)')
        .bind(onderzoekId, stuk.inzending_id, stuk.vraag_id, lijst),
    ];
  await env.DB.batch(opdrachten);
  return json({ ok: true, code_ids: codeIds });
}

// ---------- Citaten ----------

function citaatTekst(waarde) {
  const t = v.langeTekst(waarde, 'Citaat', { max: MAX_CITAAT }).trim();
  if (!t) throw new Fout(400, 'Het citaat is leeg.');
  return t;
}

async function controleerCode(env, codeId, onderzoekId) {
  if (codeId === null) return;
  const rij = await een(env, 'SELECT onderzoek_id FROM codes WHERE id = ?', codeId);
  if (!rij || rij.onderzoek_id !== onderzoekId) throw new Fout(400, 'Kies een code van dit onderzoek.');
}

/** POST /onderzoeken/:id/citaten { inzending_id, vraag_id | invoer_id, code_id?, tekst, gecontroleerd?, in_rapport? } → 201 { id } */
export async function citaatNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request, 20_000);
  const tekst = citaatTekst(body.tekst);
  const gecontroleerd = v.vlag(body.gecontroleerd);
  const inRapport = v.vlag(body.in_rapport);
  if (inRapport && !gecontroleerd) throw new Fout(400, CITAAT_NIET_GECONTROLEERD);
  const codeId = v.optioneelId(body.code_id, 'code');
  const stuk = await controleerStuk(env, body, onderzoekId);
  await controleerCode(env, codeId, onderzoekId);
  const nu = nuIso();
  const rij = await env.DB.prepare(`INSERT INTO citaten (onderzoek_id, code_id, inzending_id, vraag_id, invoer_id, tekst, gecontroleerd, in_rapport,
      volgorde, aangemaakt_op, bijgewerkt_op)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, COALESCE((SELECT MAX(volgorde) FROM citaten WHERE onderzoek_id = ?1), 0) + 1, ?9, ?9
    WHERE (SELECT COUNT(*) FROM citaten WHERE onderzoek_id = ?1) < ${MAX_CITATEN} RETURNING id`)
    .bind(onderzoekId, codeId, stuk.inzending_id ?? null, stuk.vraag_id ?? null, stuk.invoer_id ?? null, tekst, gecontroleerd, inRapport, nu).first();
  if (!rij) throw new Fout(409, `Een onderzoek kan hooguit ${MAX_CITATEN} citaten hebben.`);
  return json({ id: rij.id }, 201);
}

/**
 * PUT /citaten/:id { tekst?, gecontroleerd?, in_rapport?, code_id?, volgorde? } → { ok, gecontroleerd, in_rapport }.
 * Een nieuwe tekst moet opnieuw gecontroleerd worden (gecontroleerd en in_rapport worden 0, tenzij gecontroleerd: true meekomt).
 */
export async function citaatWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const c = await haalCitaat(env, id);
  await haalBewerkbaarOnderzoek(env, c.onderzoek_id);
  const body = await leesJson(request, 20_000);
  const tekst = body.tekst === undefined ? c.tekst : citaatTekst(body.tekst);
  const nieuweTekst = tekst !== c.tekst;
  let gecontroleerd = body.gecontroleerd === undefined ? c.gecontroleerd : v.vlag(body.gecontroleerd);
  if (nieuweTekst && body.gecontroleerd !== true) gecontroleerd = 0;
  let inRapport = body.in_rapport === undefined ? c.in_rapport : v.vlag(body.in_rapport);
  if (body.in_rapport === undefined && !gecontroleerd) inRapport = 0;
  if (inRapport && !gecontroleerd) throw new Fout(400, CITAAT_NIET_GECONTROLEERD);
  const codeId = body.code_id === undefined ? c.code_id : v.optioneelId(body.code_id, 'code');
  if (body.code_id !== undefined) await controleerCode(env, codeId, c.onderzoek_id);
  const volgorde = body.volgorde === undefined ? c.volgorde : v.geheelGetal(body.volgorde, 'Volgorde', { min: 0, max: 100_000 }) ?? c.volgorde;
  await env.DB.prepare('UPDATE citaten SET tekst = ?, gecontroleerd = ?, in_rapport = ?, code_id = ?, volgorde = ?, bijgewerkt_op = ? WHERE id = ?')
    .bind(tekst, gecontroleerd, inRapport, codeId, volgorde, nuIso(), id).run();
  return json({ ok: true, gecontroleerd, in_rapport: inRapport });
}

/** DELETE /citaten/:id */
export async function citaatVerwijder({ env, params }) {
  const id = v.id(params.id);
  const c = await haalCitaat(env, id);
  await haalBewerkbaarOnderzoek(env, c.onderzoek_id);
  await env.DB.prepare('DELETE FROM citaten WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// Open antwoorden en interviews coderen (BOUWPLAN B24, §3.12): codes, coderingen en citaten van een onderzoek.
// Alleen voor de ingelogde onderzoeker. Antwoorden heten hier naar het (willekeurige) id van de inzending; dat id
// komt alleen via export/inzendingen bij de beheerder, nooit bij een meelezer.
//
// - Een codering hoort bij één antwoord (inzending + open vraag van die vragenlijst) of bij één stuk eigen invoer.
//   PUT …/coderingen vervangt de codes van één stuk.
// - Een citaat is een aanpasbare kopie. Het mag pas in_rapport zijn als het gecontroleerd is (anders 400). Pas je de
//   tekst aan, dan vervalt "gecontroleerd" (en dus "in rapport"), tenzij je het in hetzelfde verzoek opnieuw aanvinkt.
// - Een gearchiveerd onderzoek: alles alleen-lezen (409).
//
// Rekentijd (BOUWPLAN FT-02): per route hooguit één batch plus twee losse queries; de antwoorden worden niet in de
// Worker ingelezen. Controle en schrijven gaan samen in één batch: de schrijfopdrachten hebben dezelfde voorwaarden
// in hun WHERE (een "bewaakte" opdracht). Klopt er iets niet, dan schrijven ze niets en geeft de route de reden.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { een, haalOnderzoek, haalBewerkbaarOnderzoek, nuIso } from '../lib/db.js';
import {
  MAX_CODES, MAX_CODERINGEN, MAX_CITATEN, MAX_CITAAT, MAX_CODENAAM, MAX_OMSCHRIJVING, CITAAT_NIET_GECONTROLEERD, INTERVIEW_SOORTEN,
} from '../../public/js/beheer/codering-regels.js';

/** Alleen deze soorten eigen invoer kun je coderen of citeren (vaste tekst in de SQL; de lijst staat in codering-regels.js). */
const SOORTEN_SQL = INTERVIEW_SOORTEN.map((x) => `'${x.replace(/'/g, "''")}'`).join(', ');
export const ALLEEN_INTERVIEWS = 'Alleen interviews en observaties kun je coderen.';

const isUniekFout = (e) => /UNIQUE/i.test(String(e?.message || e));
const GEARCHIVEERD = 'Dit onderzoek is gearchiveerd en kan niet meer worden gewijzigd.';

/** Een code of citaat met de status van het onderzoek (één query); 404 als hij niet bestaat, 409 als gearchiveerd. */
async function haalMetStatus(env, tabel, id, nietGevonden) {
  const rij = await een(env, `SELECT x.*, o.status AS onderzoek_status FROM ${tabel} x JOIN onderzoeken o ON o.id = x.onderzoek_id WHERE x.id = ?`, id);
  if (!rij) throw new Fout(404, nietGevonden);
  if (rij.onderzoek_status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  return rij;
}
const haalCode = (env, id) => haalMetStatus(env, 'codes', id, 'Deze code bestaat niet (meer).');
const haalCitaat = (env, id) => haalMetStatus(env, 'citaten', id, 'Dit citaat bestaat niet (meer).');

/**
 * Het stuk waar een codering of citaat bij hoort, als SQL-voorwaarden voor één batch.
 * → { stuk: { inzending_id, vraag_id } | { invoer_id }, params: [...], controles: [[naam, sql, melding, status]] }.
 * De parameters zijn vast genummerd: ?1 onderzoek, ?2 extra (lijst met code-ids of code-id), ?3 extra (aantal),
 * ?4 inzending of invoer, ?5 vraag, ?6 pad naar het antwoord. metAntwoord: er moet iets zijn ingevuld.
 */
function stukControles(body, onderzoekId, { metAntwoord = '1' } = {}) {
  const invoerId = v.optioneelId(body.invoer_id, 'invoer');
  if (invoerId) {
    if (body.inzending_id || body.vraag_id) throw new Fout(400, 'Kies een antwoord óf een stuk eigen invoer.');
    return {
      stuk: { invoer_id: invoerId },
      params: [invoerId, null, null],
      controles: [
        ['stuk', 'EXISTS (SELECT 1 FROM eigen_invoer WHERE id = ?4 AND onderzoek_id = ?1 AND ?5 IS NULL AND ?6 IS NULL)', 'Deze invoer hoort niet bij dit onderzoek.', 400],
        ['soort', `EXISTS (SELECT 1 FROM eigen_invoer WHERE id = ?4 AND soort IN (${SOORTEN_SQL}))`, ALLEEN_INTERVIEWS, 400],
      ],
    };
  }
  const inzendingId = v.id(body.inzending_id, 'antwoord');
  const vraagId = v.id(body.vraag_id, 'vraag');
  return {
    stuk: { inzending_id: inzendingId, vraag_id: vraagId },
    // Het pad naar het antwoord als tekst: een getal zou de database als 6002.0 in het pad zetten.
    params: [inzendingId, vraagId, `$."${vraagId}"`],
    controles: [
      ['stuk', 'EXISTS (SELECT 1 FROM inzendingen i JOIN vragenlijsten vl ON vl.id = i.vragenlijst_id WHERE i.id = ?4 AND vl.onderzoek_id = ?1)',
        'Dit antwoord hoort niet bij dit onderzoek.', 400],
      ['vraag', "EXISTS (SELECT 1 FROM vragen q WHERE q.id = ?5 AND q.type = 'open' AND q.vragenlijst_id = (SELECT vragenlijst_id FROM inzendingen WHERE id = ?4))",
        'Kies een open vraag van de vragenlijst van dit antwoord.', 400],
      ['antwoord', `(${metAntwoord} = 0 OR EXISTS (SELECT 1 FROM inzendingen WHERE id = ?4 AND json_type(antwoorden, ?6) = 'text' AND trim(json_extract(antwoorden, ?6)) <> ''))`,
        'Op deze vraag staat in dit antwoord niets ingevuld.', 400],
    ],
  };
}

/** Voert de controles uit (eerste rij van de batch) en gooit de eerste fout. */
function gooiEersteFout(rij, controles) {
  for (const [naam, , melding, status] of controles) {
    if (!rij || !rij[naam]) throw new Fout(status, melding);
  }
}

// ---------- Overzicht ----------

/** Zoveel coderingen per deel van GET …/codering: ongeveer 1 MB JSON, ruim onder de 2 MB van één waarde in D1. */
export const CODERINGEN_PER_DEEL = 10_000;

const CODE_JSON = `json_object('id', id, 'onderzoek_id', onderzoek_id, 'naam', naam, 'omschrijving', omschrijving, 'groep', groep,
  'volgorde', volgorde, 'aangemaakt_op', aangemaakt_op)`;
const CITAAT_JSON = `json_object('id', id, 'onderzoek_id', onderzoek_id, 'code_id', code_id, 'inzending_id', inzending_id,
  'vraag_id', vraag_id, 'invoer_id', invoer_id, 'tekst', tekst, 'gecontroleerd', gecontroleerd, 'in_rapport', in_rapport,
  'volgorde', volgorde, 'aangemaakt_op', aangemaakt_op, 'bijgewerkt_op', bijgewerkt_op)`;
// ?1 onderzoek, ?2 na (id), ?3 hoeveel. Codes en citaten alleen in het eerste deel (?2 = 0).
const OVERZICHT = `WITH d AS (SELECT id, code_id, inzending_id, vraag_id, invoer_id FROM coderingen
    WHERE onderzoek_id = ?1 AND id > ?2 ORDER BY id LIMIT ?3)
  SELECT (SELECT json_group_array(json_object('id', id, 'code_id', code_id, 'inzending_id', inzending_id, 'vraag_id', vraag_id,
      'invoer_id', invoer_id)) FROM (SELECT * FROM d ORDER BY id)) AS coderingen,
    (SELECT MAX(id) FROM d) AS laatste,
    (SELECT COUNT(*) FROM coderingen WHERE onderzoek_id = ?1 AND id > ?2) - (SELECT COUNT(*) FROM d) AS rest,
    CASE WHEN ?2 = 0 THEN (SELECT json_group_array(json(j)) FROM (SELECT ${CODE_JSON} AS j FROM codes WHERE onderzoek_id = ?1 ORDER BY volgorde, id)) END AS codes,
    CASE WHEN ?2 = 0 THEN (SELECT json_group_array(json(j)) FROM (SELECT ${CITAAT_JSON} AS j FROM citaten WHERE onderzoek_id = ?1 ORDER BY volgorde, id)) END AS citaten`;

/**
 * GET /onderzoeken/:id/codering?na=<id>&max=<n> → { codes, coderingen, citaten, volgende } (dezelfde velden als in export/data).
 * De database bouwt de JSON op; de Worker plakt hem alleen door (geen werk per codering). Coderingen komen in delen van
 * hooguit CODERINGEN_PER_DEEL, in volgorde van id; volgende is het id om met ?na= verder te gaan, of null. Codes en
 * citaten staan alleen in het eerste deel (zonder na).
 */
export async function overzicht({ env, params, url, request }) {
  const onderzoekId = v.id(params.id);
  const p = (url || new URL(request.url)).searchParams;
  const na = v.geheelGetal(p.get('na'), 'na', { min: 0, max: Number.MAX_SAFE_INTEGER }) ?? 0;
  const max = v.geheelGetal(p.get('max'), 'max', { min: 1, max: CODERINGEN_PER_DEEL }) ?? CODERINGEN_PER_DEEL;
  await haalOnderzoek(env, onderzoekId);
  const rij = await een(env, OVERZICHT, onderzoekId, na, max);
  const volgende = rij.rest > 0 && rij.laatste !== null ? Number(rij.laatste) : null;
  const eersteDeel = na === 0 ? `"codes":${rij.codes || '[]'},` : '';
  const citaten = na === 0 ? `,"citaten":${rij.citaten || '[]'}` : '';
  return new Response(`{${eersteDeel}"coderingen":${rij.coderingen || '[]'}${citaten},"volgende":${volgende === null ? 'null' : volgende}}`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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
  const body = await leesJson(request, 10_000);
  if (body.samenvoegen_in !== undefined) {
    const doelId = v.id(body.samenvoegen_in, 'code');
    if (doelId === id) throw new Fout(400, 'Kies een andere code om mee samen te voegen.');
    const doel = await een(env, 'SELECT onderzoek_id FROM codes WHERE id = ?', doelId);
    if (!doel || doel.onderzoek_id !== code.onderzoek_id) throw new Fout(400, 'Kies een code van dit onderzoek.');
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
  await haalCode(env, id);
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
 * Eén batch: de controles, het verwijderen en het toevoegen (die laatste twee alleen als alle controles kloppen).
 */
export async function coderingen({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request, 20_000);
  const codeIds = v.idLijst(body.code_ids ?? [], 'Codes', { max: MAX_CODES });
  const { stuk, params: p, controles } = stukControles(body, onderzoekId, { metAntwoord: '(?3 > 0)' });
  const alle = [
    ...controles,
    ['codes', '(SELECT COUNT(*) FROM codes WHERE onderzoek_id = ?1 AND id IN (SELECT value FROM json_each(?2))) = ?3', 'Kies codes van dit onderzoek.', 400],
    ['ruimte', `(SELECT COUNT(*) FROM coderingen WHERE onderzoek_id = ?1) + ?3 <= ${MAX_CODERINGEN}`,
      `Een onderzoek kan hooguit ${MAX_CODERINGEN.toLocaleString('nl-NL')} gecodeerde antwoorden hebben.`, 409],
  ];
  const voorwaarde = alle.map(([, sql]) => sql).join(' AND ');
  const waarden = [onderzoekId, JSON.stringify(codeIds), codeIds.length, ...p];
  const [controle] = await env.DB.batch([
    env.DB.prepare(`SELECT ${alle.map(([naam, sql]) => `${sql} AS ${naam}`).join(', ')}`).bind(...waarden),
    stuk.invoer_id
      ? env.DB.prepare(`DELETE FROM coderingen WHERE onderzoek_id = ?1 AND invoer_id = ?4 AND ${voorwaarde}`).bind(...waarden)
      : env.DB.prepare(`DELETE FROM coderingen WHERE onderzoek_id = ?1 AND inzending_id = ?4 AND vraag_id = ?5 AND ${voorwaarde}`).bind(...waarden),
    stuk.invoer_id
      ? env.DB.prepare(`INSERT INTO coderingen (onderzoek_id, code_id, invoer_id) SELECT ?1, value, ?4 FROM json_each(?2) WHERE ${voorwaarde}`).bind(...waarden)
      : env.DB.prepare(`INSERT INTO coderingen (onderzoek_id, code_id, inzending_id, vraag_id) SELECT ?1, value, ?4, ?5 FROM json_each(?2) WHERE ${voorwaarde}`)
        .bind(...waarden),
  ]);
  gooiEersteFout(controle.results[0], alle);
  return json({ ok: true, code_ids: codeIds });
}

// ---------- Citaten ----------

function citaatTekst(waarde) {
  const t = v.langeTekst(waarde, 'Citaat', { max: MAX_CITAAT }).trim();
  if (!t) throw new Fout(400, 'Het citaat is leeg.');
  return t;
}

const CODE_VAN_ONDERZOEK = '(?2 IS NULL OR EXISTS (SELECT 1 FROM codes WHERE id = ?2 AND onderzoek_id = ?1))';

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
  const { stuk, params: p, controles } = stukControles(body, onderzoekId);
  const alle = [
    ...controles,
    ['code', CODE_VAN_ONDERZOEK, 'Kies een code van dit onderzoek.', 400],
    ['ruimte', `(SELECT COUNT(*) FROM citaten WHERE onderzoek_id = ?1) < ${MAX_CITATEN}`, `Een onderzoek kan hooguit ${MAX_CITATEN} citaten hebben.`, 409],
  ];
  const voorwaarde = alle.map(([, sql]) => sql).join(' AND ');
  const nu = nuIso();
  const waarden = [onderzoekId, codeId, null, ...p, tekst, gecontroleerd, inRapport, nu];
  const [controle, invoegen] = await env.DB.batch([
    // ?10 (de tijd) staat erin omdat de database het aantal parameters telt tot het hoogste nummer.
    env.DB.prepare(`SELECT ${alle.map(([naam, sql]) => `${sql} AS ${naam}`).join(', ')}, ?10 AS tijd`).bind(...waarden),
    env.DB.prepare(`INSERT INTO citaten (onderzoek_id, code_id, inzending_id, vraag_id, invoer_id, tekst, gecontroleerd, in_rapport,
        volgorde, aangemaakt_op, bijgewerkt_op)
      SELECT ?1, ?2, ${stuk.invoer_id ? 'NULL, NULL, ?4' : '?4, ?5, NULL'}, ?7, ?8, ?9,
        COALESCE((SELECT MAX(volgorde) FROM citaten WHERE onderzoek_id = ?1), 0) + 1, ?10, ?10
      WHERE ${voorwaarde} RETURNING id`).bind(...waarden),
  ]);
  gooiEersteFout(controle.results[0], alle);
  const rij = invoegen.results[0];
  if (!rij) throw new Fout(409, 'Het citaat kon niet worden opgeslagen. Probeer het opnieuw.');
  return json({ id: rij.id }, 201);
}

/**
 * PUT /citaten/:id { tekst?, gecontroleerd?, in_rapport?, code_id?, volgorde? } → { ok, gecontroleerd, in_rapport }.
 * Een nieuwe tekst moet opnieuw gecontroleerd worden (gecontroleerd en in_rapport worden 0, tenzij gecontroleerd: true meekomt).
 */
export async function citaatWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const c = await haalCitaat(env, id);
  const body = await leesJson(request, 20_000);
  const tekst = body.tekst === undefined ? c.tekst : citaatTekst(body.tekst);
  const nieuweTekst = tekst !== c.tekst;
  let gecontroleerd = body.gecontroleerd === undefined ? c.gecontroleerd : v.vlag(body.gecontroleerd);
  if (nieuweTekst && body.gecontroleerd !== true) gecontroleerd = 0;
  let inRapport = body.in_rapport === undefined ? c.in_rapport : v.vlag(body.in_rapport);
  if (body.in_rapport === undefined && !gecontroleerd) inRapport = 0;
  if (inRapport && !gecontroleerd) throw new Fout(400, CITAAT_NIET_GECONTROLEERD);
  const codeId = body.code_id === undefined ? c.code_id : v.optioneelId(body.code_id, 'code');
  const volgorde = body.volgorde === undefined ? c.volgorde : v.geheelGetal(body.volgorde, 'Volgorde', { min: 0, max: 100_000 }) ?? c.volgorde;
  // Bewaakt: alleen met een code van hetzelfde onderzoek (of geen code).
  const r = await env.DB.prepare(`UPDATE citaten SET tekst = ?3, gecontroleerd = ?4, in_rapport = ?5, code_id = ?2, volgorde = ?6, bijgewerkt_op = ?7
    WHERE id = ?8 AND ${CODE_VAN_ONDERZOEK}`).bind(c.onderzoek_id, codeId, tekst, gecontroleerd, inRapport, volgorde, nuIso(), id).run();
  if (!r.meta?.changes) throw new Fout(400, 'Kies een code van dit onderzoek.');
  return json({ ok: true, gecontroleerd, in_rapport: inRapport });
}

/** DELETE /citaten/:id */
export async function citaatVerwijder({ env, params }) {
  const id = v.id(params.id);
  await haalCitaat(env, id);
  await env.DB.prepare('DELETE FROM citaten WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

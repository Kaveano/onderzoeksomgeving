// Bibliotheek: bronnen voor alle onderzoeken samen, en welke bronnen bij welk onderzoek horen (BOUWPLAN §3.9,
// §3.12; D3 §2.6). Alleen voor de ingelogde onderzoeker: er is geen bibliotheekroute onder /api/kijk (PR-18).
//
// - Bronnen uit de startcollectie (collectie 'start', geplaatst door migratie 0016) zijn alleen-lezen: je kunt er
//   eigen notities bij zetten, ze koppelen, verbergen of er een eigen kopie van maken (B21).
// - Elke wijziging verhoogt instellingen.bibliotheek_versie in dezelfde batch. De browser vraagt de lijst op met
//   ?versie=<laatst bekende>; is die niet veranderd, dan komt er alleen { versie, ongewijzigd: true } terug.
// - De lijst wordt in de database als JSON opgebouwd en ongewijzigd doorgegeven (geen werk per bron in de Worker).
//
// Rekentijd: elke route is hooguit één losse query plus één of twee batches (FT-02).

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { een, alle, haalOnderzoek, haalBewerkbaarOnderzoek, nuIso } from '../lib/db.js';
import {
  controleerBron, controleerNotities, nieuweCiteersleutel, INSERT_KOLOMMEN, insertWaarden, bronUitRij, planReeks,
  START_ALLEEN_LEZEN, START_NIET_VERWIJDEREN, BIBLIOTHEEK_VOL,
} from '../lib/bibliotheek.js';
import { MAX_BRONNEN, MAX_PER_REEKS, MAX_REEKS_VERZOEK, LIMIETEN } from '../../public/js/beheer/bibliotheek-regels.js';

/** Zoveel tekens (length()) aan bronnen per deel van de lijst: ruim onder de 2 MB van één waarde in D1. */
export const MAX_PAGINA_TEKENS = 700_000;

const VERSIE_OPHOGEN = `INSERT INTO instellingen (sleutel, waarde) VALUES ('bibliotheek_versie', '1')
  ON CONFLICT(sleutel) DO UPDATE SET waarde = CAST(CAST(waarde AS INTEGER) + 1 AS TEXT)`;
const VERSIE_LEZEN = "SELECT CAST(COALESCE((SELECT waarde FROM instellingen WHERE sleutel = 'bibliotheek_versie'), '0') AS INTEGER) AS versie";

const JSON_KOPPEN = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

// Eén bron als JSON, opgebouwd door de database. json(...) houdt arrays en objecten als JSON (niet als tekst).
const BRON_JSON = `json_object(
  'id', b.id, 'collectie', b.collectie, 'sleutel', b.sleutel, 'citeersleutel', b.citeersleutel, 'soort', b.soort,
  'titel', b.titel, 'auteurs', json(b.auteurs), 'organisatie', b.organisatie, 'afkorting', b.afkorting,
  'jaar', b.jaar, 'taal', b.taal, 'url', b.url, 'doi', b.doi, 'details', json(b.details),
  'onderwerpen', json(b.onderwerpen), 'trefwoorden', json(b.trefwoorden), 'samenvatting', b.samenvatting,
  'kernpunten', json(b.kernpunten), 'betrouwbaarheid', b.betrouwbaarheid,
  'betrouwbaarheid_toelichting', b.betrouwbaarheid_toelichting, 'notities', b.notities,
  'verborgen', b.verborgen, 'kopie_van', b.kopie_van,
  'onderzoeken', json((SELECT json_group_array(k.onderzoek_id) FROM bron_koppelingen k WHERE k.bron_id = b.id)),
  'aangemaakt_op', b.aangemaakt_op, 'bijgewerkt_op', b.bijgewerkt_op)`;

// Eén deel van de lijst: bronnen met id > ?1, zolang de opgetelde lengte onder ?2 blijft (de eerste altijd).
const PAGINA = `WITH r AS (
    SELECT b.id, ${BRON_JSON} AS j FROM bronnen b WHERE b.id > ?1 ORDER BY b.id LIMIT ${MAX_BRONNEN}),
  c AS (SELECT id, j, SUM(length(j)) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING) AS cum FROM r),
  d AS (SELECT id, j FROM c WHERE cum <= ?2 OR id = (SELECT MIN(id) FROM c))
  SELECT (SELECT json_group_array(json(j)) FROM (SELECT j FROM d ORDER BY id)) AS lijst,
    (SELECT MAX(id) FROM d) AS laatste,
    (SELECT COUNT(*) FROM c) - (SELECT COUNT(*) FROM d) AS rest`;

const START_INFO = `SELECT (SELECT waarde FROM instellingen WHERE sleutel = 'bibliotheek_start') AS info,
  (SELECT COUNT(*) FROM bronnen WHERE collectie = 'start') AS aantal,
  (SELECT COUNT(*) FROM bronnen WHERE collectie = 'start' AND verborgen = 1) AS verborgen,
  (SELECT COUNT(*) FROM bronnen) AS totaal`;

// Rapporten waarin de citeersleutel ?1 staat. [^a-z0-9] erachter: @cbs2024 telt niet mee in @cbs2024b.
const RAPPORTEN_MET = `SELECT r.id, r.titel, r.onderzoek_id, o.titel AS onderzoek_titel
  FROM rapporten r JOIN onderzoeken o ON o.id = r.onderzoek_id
  WHERE r.inhoud GLOB '*@' || ?1 || '[^a-z0-9]*' ORDER BY r.id`;

const zoekParams = ({ url, request }) => (url || (request ? new URL(request.url) : null))?.searchParams || new URLSearchParams();

/** Body van een DELETE is optioneel (de browser stuurt er alleen een mee als dat nodig is). */
async function leesOptioneel(request) {
  return (request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json') ? leesJson(request, 10_000) : {};
}

function startInfo(rij) {
  let info = {};
  try {
    info = JSON.parse(rij?.info || '{}') || {};
  } catch {
    info = {};
  }
  return {
    aantal: rij?.aantal ?? 0,
    verborgen: rij?.verborgen ?? 0,
    totaal: rij?.totaal ?? 0,
    versie: Number.isInteger(info.versie) ? info.versie : null,
    datum: typeof info.datum === 'string' ? info.datum : null,
  };
}

/** De versie na een batch die eindigt met VERSIE_LEZEN. */
const versieUit = (resultaten) => resultaten[resultaten.length - 1].results[0].versie;

/** Een tijdstempel die altijd later is dan de vorige (voor de controle op gelijktijdig bewerken). */
function volgendeTijd(vorige) {
  const nu = nuIso();
  return nu > vorige ? nu : new Date(Date.parse(vorige) + 1).toISOString();
}

async function haalBron(env, id) {
  const rij = await een(env, 'SELECT * FROM bronnen WHERE id = ?', id);
  if (!rij) throw new Fout(404, 'Deze bron bestaat niet (meer).');
  return rij;
}

/** Bezette citeersleutels die met deze basis beginnen (klein: alleen die ene auteur en dat jaar). */
async function bezetteSleutels(env, basis) {
  const rijen = await alle(env, "SELECT citeersleutel FROM bronnen WHERE citeersleutel = ?1 OR citeersleutel GLOB ?1 || '[a-z]*'", basis);
  return new Set(rijen.map((r) => r.citeersleutel));
}

const INSERT_SQL = `INSERT INTO bronnen (${INSERT_KOLOMMEN.join(', ')})
  SELECT ${INSERT_KOLOMMEN.map(() => '?').join(', ')} WHERE (SELECT COUNT(*) FROM bronnen) < ${MAX_BRONNEN} RETURNING id`;

const isUniekFout = (e) => /UNIQUE/i.test(String(e?.message || e));

// ---------- De lijst ----------

/** GET /bibliotheek?vanaf=<id>&versie=<n> */
export async function lijst({ env, url, request }) {
  const p = zoekParams({ url, request });
  const vanaf = v.geheelGetal(p.get('vanaf'), 'vanaf', { min: 0, max: Number.MAX_SAFE_INTEGER }) ?? 0;
  const bekend = p.get('versie');
  if (bekend !== null && bekend !== '' && vanaf === 0) {
    const nu = await een(env, VERSIE_LEZEN);
    if (String(nu.versie) === bekend) return json({ versie: nu.versie, ongewijzigd: true });
  }
  const [versie, start, pagina] = await env.DB.batch([
    env.DB.prepare(VERSIE_LEZEN),
    env.DB.prepare(START_INFO),
    env.DB.prepare(PAGINA).bind(vanaf, MAX_PAGINA_TEKENS),
  ]);
  const rij = pagina.results[0] || {};
  const volgende = rij.rest > 0 && rij.laatste !== null ? Number(rij.laatste) : null;
  return new Response(
    `{"versie":${Number(versie.results[0].versie)},"start":${JSON.stringify(startInfo(start.results[0]))},` +
      `"bronnen":${rij.lijst || '[]'},"volgende":${volgende === null ? 'null' : volgende}}`,
    { headers: JSON_KOPPEN },
  );
}

// ---------- Eén bron ----------

/** POST /bibliotheek { bron } → 201 { id, citeersleutel, versie } */
export async function nieuw({ request, env }) {
  const body = await leesJson(request, 100_000);
  const schoon = controleerBron(body.bron);
  return json(await voegToe(env, schoon), 201);
}

async function voegToe(env, schoon, { kopieVan = null } = {}) {
  for (let poging = 0; poging < 2; poging++) {
    const bezet = await bezetteSleutels(env, nieuweCiteersleutel(schoon, new Set()));
    const citeersleutel = nieuweCiteersleutel(schoon, bezet);
    try {
      const res = await env.DB.batch([
        env.DB.prepare(INSERT_SQL).bind(...insertWaarden(schoon, { citeersleutel, kopieVan, nu: nuIso() })),
        env.DB.prepare(VERSIE_OPHOGEN),
        env.DB.prepare(VERSIE_LEZEN),
      ]);
      const nieuwe = res[0].results[0];
      if (!nieuwe) throw new Fout(409, BIBLIOTHEEK_VOL);
      return { id: nieuwe.id, citeersleutel, versie: versieUit(res) };
    } catch (e) {
      // Tegelijk een bron met dezelfde citeersleutel toegevoegd (een ander tabblad): één keer opnieuw.
      if (poging === 0 && isUniekFout(e)) continue;
      throw e;
    }
  }
  throw new Fout(409, 'De bron kon niet worden toegevoegd. Probeer het opnieuw.');
}

/** GET /bibliotheek/:id → { bron: Bron & { onderzoeken: [...], rapporten: [...] } } */
export async function detail({ env, params }) {
  const id = v.id(params.id);
  const rij = await een(env, `SELECT b.*, (SELECT json_group_array(k.onderzoek_id) FROM bron_koppelingen k WHERE k.bron_id = b.id) AS onderzoeken
    FROM bronnen b WHERE b.id = ?`, id);
  if (!rij) throw new Fout(404, 'Deze bron bestaat niet (meer).');
  const [onderzoeken, rapporten] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id, o.titel, o.bedrijfsnaam, o.status, k.notitie FROM bron_koppelingen k JOIN onderzoeken o ON o.id = k.onderzoek_id
      WHERE k.bron_id = ? ORDER BY o.titel`).bind(id),
    env.DB.prepare(RAPPORTEN_MET).bind(rij.citeersleutel),
  ]);
  const bron = bronUitRij(rij);
  return json({ bron: { ...bron, onderzoeken: onderzoeken.results, rapporten: rapporten.results } });
}

/** PUT /bibliotheek/:id { bron, bijgewerkt_op } → { ok, bijgewerkt_op, versie }. Bij een startbron alleen notities. */
export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  const body = await leesJson(request, 100_000);
  const huidig = await haalBron(env, id);
  if (body.bijgewerkt_op && body.bijgewerkt_op !== huidig.bijgewerkt_op) {
    throw new Fout(409, 'Deze bron is intussen op een andere plek (bijvoorbeeld een ander tabblad) gewijzigd.', { conflict: true });
  }
  const ruw = body.bron;
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) throw new Fout(400, 'De gegevens van de bron zijn ongeldig.');
  const nu = volgendeTijd(huidig.bijgewerkt_op);
  let opdracht;
  if (huidig.collectie === 'start') {
    if (Object.keys(ruw).some((k) => k !== 'notities')) throw new Fout(400, START_ALLEEN_LEZEN);
    opdracht = env.DB.prepare('UPDATE bronnen SET notities = ?, bijgewerkt_op = ? WHERE id = ?').bind(controleerNotities(ruw.notities), nu, id);
  } else {
    const s = controleerBron(ruw);
    opdracht = env.DB.prepare(`UPDATE bronnen SET soort = ?, titel = ?, auteurs = ?, organisatie = ?, afkorting = ?, jaar = ?, taal = ?, url = ?,
        doi = ?, details = ?, onderwerpen = ?, trefwoorden = ?, samenvatting = ?, kernpunten = ?, betrouwbaarheid = ?,
        betrouwbaarheid_toelichting = ?, notities = ?, bijgewerkt_op = ? WHERE id = ?`)
      .bind(s.soort, s.titel, JSON.stringify(s.auteurs), s.organisatie, s.afkorting, s.jaar, s.taal, s.url, s.doi, JSON.stringify(s.details),
        JSON.stringify(s.onderwerpen), JSON.stringify(s.trefwoorden), s.samenvatting, JSON.stringify(s.kernpunten), s.betrouwbaarheid,
        s.betrouwbaarheid_toelichting, s.notities, nu, id);
  }
  const res = await env.DB.batch([opdracht, env.DB.prepare(VERSIE_OPHOGEN), env.DB.prepare(VERSIE_LEZEN)]);
  return json({ ok: true, bijgewerkt_op: nu, versie: versieUit(res) });
}

/**
 * DELETE /bibliotheek/:id { bevestigd? } → { ok, versie }. Een startbron niet (verbergen). Wordt de bron in een
 * rapport genoemd, dan eerst 409 met de rapporten; met bevestigd: true gaat hij toch weg.
 */
export async function verwijder({ request, env, params }) {
  const id = v.id(params.id);
  const body = await leesOptioneel(request);
  const huidig = await haalBron(env, id);
  if (huidig.collectie === 'start') throw new Fout(400, START_NIET_VERWIJDEREN);
  if (body.bevestigd !== true) {
    const rapporten = await alle(env, RAPPORTEN_MET, huidig.citeersleutel);
    if (rapporten.length) {
      throw new Fout(409, `Deze bron wordt genoemd in ${rapporten.length === 1 ? '1 rapport' : `${rapporten.length} rapporten`}.`, { rapporten });
    }
  }
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM bron_koppelingen WHERE bron_id = ?').bind(id),
    env.DB.prepare('DELETE FROM bronnen WHERE id = ?').bind(id),
    env.DB.prepare(VERSIE_OPHOGEN),
    env.DB.prepare(VERSIE_LEZEN),
  ]);
  return json({ ok: true, versie: versieUit(res) });
}

/** POST /bibliotheek/:id/kopie → 201 { id, citeersleutel, versie }: een eigen, aanpasbare kopie van een startbron. */
export async function kopie({ env, params }) {
  const id = v.id(params.id);
  const huidig = await haalBron(env, id);
  if (huidig.collectie !== 'start') throw new Fout(400, 'Dit is al een eigen bron; die kun je zelf aanpassen.');
  const b = bronUitRij(huidig);
  const schoon = controleerBron(b);
  return json(await voegToe(env, schoon, { kopieVan: huidig.sleutel }), 201);
}

/** PUT /bibliotheek/:id/verbergen { verborgen } → { ok, versie } (alleen startbronnen). */
export async function verbergen({ request, env, params }) {
  const id = v.id(params.id);
  const body = await leesJson(request, 10_000);
  const huidig = await haalBron(env, id);
  if (huidig.collectie !== 'start') throw new Fout(400, 'Alleen bronnen uit de startcollectie kun je verbergen. Een eigen bron kun je verwijderen.');
  const res = await env.DB.batch([
    env.DB.prepare('UPDATE bronnen SET verborgen = ?, bijgewerkt_op = ? WHERE id = ?').bind(body.verborgen === false ? 0 : 1, volgendeTijd(huidig.bijgewerkt_op), id),
    env.DB.prepare(VERSIE_OPHOGEN),
    env.DB.prepare(VERSIE_LEZEN),
  ]);
  return json({ ok: true, versie: versieUit(res) });
}

// ---------- Meerdere bronnen ----------

/**
 * POST /bibliotheek/reeks { bronnen: [≤ 25], dubbel: 'overslaan' | 'toevoegen' }
 * → { toegevoegd: [{ rij, id, citeersleutel }], overgeslagen: [{ rij, reden, bestaand_id? }], versie }.
 * Een bron met een fout wordt overgeslagen (met de reden); de rest wordt toegevoegd. Dubbel = dezelfde DOI,
 * anders dezelfde titel en hetzelfde jaar (ook binnen dit verzoek). De browser verdeelt een groot bestand in delen
 * (reeksDelen), zodat één verzoek ruim binnen de rekentijd blijft (planReeks; FT-02).
 */
export async function reeks({ request, env }) {
  const body = await leesJson(request, MAX_REEKS_VERZOEK);
  if (!Array.isArray(body.bronnen)) throw new Fout(400, 'Stuur een lijst met bronnen.');
  if (body.bronnen.length > MAX_PER_REEKS) throw new Fout(400, `Je kunt hooguit ${MAX_PER_REEKS} bronnen tegelijk toevoegen.`);
  const dubbel = v.keuze(body.dubbel, 'Dubbel', ['overslaan', 'toevoegen'], { standaard: 'overslaan' });
  const bestaande = await alle(env, 'SELECT id, doi, titel, jaar, citeersleutel FROM bronnen');
  const { toevoegen, overgeslagen } = planReeks(body.bronnen, bestaande, { dubbel });
  if (bestaande.length + toevoegen.length > MAX_BRONNEN) throw new Fout(409, BIBLIOTHEEK_VOL);
  if (!toevoegen.length) {
    const nu = await een(env, VERSIE_LEZEN);
    return json({ toegevoegd: [], overgeslagen, versie: nu.versie });
  }
  const nu = nuIso();
  const res = await env.DB.batch([
    ...toevoegen.map((t) => env.DB.prepare(INSERT_SQL).bind(...insertWaarden(t.schoon, { citeersleutel: t.citeersleutel, nu }))),
    env.DB.prepare(VERSIE_OPHOGEN),
    env.DB.prepare(VERSIE_LEZEN),
  ]);
  const toegevoegd = toevoegen.map((t, i) => ({ rij: t.rij, id: res[i].results[0]?.id ?? null, citeersleutel: t.citeersleutel })).filter((t) => t.id);
  return json({ toegevoegd, overgeslagen, versie: versieUit(res) });
}

/** POST /bibliotheek/herstellen → { teruggezet, versie }: alle verborgen startbronnen weer tonen. */
export async function herstellen({ env }) {
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE bronnen SET verborgen = 0, bijgewerkt_op = ? WHERE collectie = 'start' AND verborgen = 1").bind(nuIso()),
    env.DB.prepare(VERSIE_OPHOGEN),
    env.DB.prepare(VERSIE_LEZEN),
  ]);
  return json({ teruggezet: res[0].meta?.changes ?? 0, versie: versieUit(res) });
}

// ---------- Bronnen bij een onderzoek ----------

/** GET /onderzoeken/:id/bronnen → { bronnen: [Bron & { koppeling: { notitie, aangemaakt_op } }] } */
export async function onderzoekBronnen({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const rijen = await alle(env, `SELECT b.*, k.notitie AS koppeling_notitie, k.aangemaakt_op AS koppeling_op,
      (SELECT json_group_array(x.onderzoek_id) FROM bron_koppelingen x WHERE x.bron_id = b.id) AS onderzoeken
    FROM bron_koppelingen k JOIN bronnen b ON b.id = k.bron_id WHERE k.onderzoek_id = ? ORDER BY k.aangemaakt_op, b.id`, onderzoekId);
  return json({
    bronnen: rijen.map((r) => ({ ...bronUitRij(r), koppeling: { notitie: r.koppeling_notitie, aangemaakt_op: r.koppeling_op } })),
  });
}

/** PUT /onderzoeken/:id/bronnen/:bron { notitie? } → { ok, versie }. Zonder notitie blijft een bestaande notitie staan. */
export async function koppel({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const bronId = v.id(params.bron, 'bron');
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request, 10_000);
  await haalBron(env, bronId);
  const metNotitie = body.notitie !== undefined && body.notitie !== null;
  const notitie = metNotitie ? v.tekst(body.notitie, 'Waarvoor gebruik je deze bron?', { max: LIMIETEN.koppeling_notitie }) : '';
  const opdracht = metNotitie
    ? env.DB.prepare(`INSERT INTO bron_koppelingen (onderzoek_id, bron_id, notitie, aangemaakt_op) VALUES (?, ?, ?, ?)
        ON CONFLICT(onderzoek_id, bron_id) DO UPDATE SET notitie = excluded.notitie`).bind(onderzoekId, bronId, notitie, nuIso())
    : env.DB.prepare('INSERT OR IGNORE INTO bron_koppelingen (onderzoek_id, bron_id, notitie, aangemaakt_op) VALUES (?, ?, \'\', ?)')
      .bind(onderzoekId, bronId, nuIso());
  const res = await env.DB.batch([opdracht, env.DB.prepare(VERSIE_OPHOGEN), env.DB.prepare(VERSIE_LEZEN)]);
  return json({ ok: true, versie: versieUit(res) });
}

/** DELETE /onderzoeken/:id/bronnen/:bron → { ok, versie } */
export async function ontkoppel({ env, params }) {
  const onderzoekId = v.id(params.id);
  const bronId = v.id(params.bron, 'bron');
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM bron_koppelingen WHERE onderzoek_id = ? AND bron_id = ?').bind(onderzoekId, bronId),
    env.DB.prepare(VERSIE_OPHOGEN),
    env.DB.prepare(VERSIE_LEZEN),
  ]);
  return json({ ok: true, versie: versieUit(res) });
}

// HR-analytics (Dashboard · Overzicht): instellingen per onderzoek en personeelscijfers (BOUWPLAN §3.4, §3.5, §3.12).
// De server bewaart alleen instellingen en groepscijfers; alle kerncijfers rekent de browser uit (hr-analytics.js).
// Van een personeelsbestand komen hier ALLEEN groepscijfers binnen (het Personeelsaggregaat, gemaakt in de browser);
// de vorm wordt streng gecontroleerd (src/lib/hr-validatie.js), dus rijen, namen of datums per medewerker kunnen er
// niet in. Elk aggregaat heeft een datum "Bewaren tot"; daarna toont het Overzicht en Afronden een melding.
//
// Rekentijd (BOUWPLAN §5.2): elke route doet hooguit één batch of twee losse opdrachten; JSON uit de database wordt
// ongewijzigd doorgegeven (niet ingelezen). Een gearchiveerd onderzoek kan niet meer worden gewijzigd (409), maar een
// personeelsbestand verwijderen kan altijd: gegevens weghalen mag nooit geblokkeerd zijn (bewaartermijn, AVG).
//
// Routes:
//   GET    /onderzoeken/:id/hr                  → { instellingen, bijgewerkt_op, personeelscijfers: [meta], limieten }
//   PUT    /onderzoeken/:id/hr                  { instellingen, bijgewerkt_op? } → { ok, bijgewerkt_op }
//   GET    /onderzoeken/:id/personeelscijfers   → { personeelscijfers: [meta], limieten }
//   POST   /onderzoeken/:id/personeelscijfers   { aggregaat, bewaren_tot, naam? } → 201 { id, bewaren_tot }
//   GET    /personeelscijfers/:id               → { personeelscijfers: { …meta, onderzoek_id, inhoud } }
//   PUT    /personeelscijfers/:id               { naam?, bewaren_tot? } → { ok }
//   DELETE /personeelscijfers/:id               → { ok }

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { nuIso, vandaagNL, haalBewerkbaarOnderzoek } from '../lib/db.js';
import { controleerHrInstellingen, controleerPersoneelsaggregaat, MAX_AGGREGAAT } from '../lib/hr-validatie.js';

/** Hooguit zoveel personeelsbestanden per onderzoek (BOUWPLAN §2.2). */
export const MAX_PERSONEELSCIJFERS = 5;
/** "Bewaren tot" ligt hooguit zoveel maanden na vandaag. */
export const MAX_BEWAREN_MAANDEN = 36;
/** Standaard bewaren: 6 maanden na het inlezen (de browser vult dit voor; zie standaardBewarenTot). */
export const STANDAARD_BEWAREN_MAANDEN = 6;

const JSON_KOPPEN = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const GEARCHIVEERD = 'Dit onderzoek is gearchiveerd en kan niet meer worden gewijzigd.';
const CONFLICT = 'De HR-instellingen zijn intussen op een andere plek (bijvoorbeeld een ander tabblad of apparaat) gewijzigd.';
const tekst = (s) => JSON.stringify(s ?? null);
const ruwObject = (t, reserve) => (typeof t === 'string' && /^\s*\{/.test(t) ? t : reserve);

/** Een datum (JJJJ-MM-DD) een aantal maanden later; de dag schuift terug als die maand korter is. */
export function maandenLater(datum, maanden) {
  const [j, m, d] = datum.split('-').map(Number);
  const doel = new Date(Date.UTC(j, m - 1 + maanden, 1));
  const laatste = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate();
  doel.setUTCDate(Math.min(d, laatste));
  return doel.toISOString().slice(0, 10);
}
/** De standaard voor "Bewaren tot": 6 maanden na vandaag. */
export const standaardBewarenTot = (vandaag = vandaagNL()) => maandenLater(vandaag, STANDAARD_BEWAREN_MAANDEN);

/** Controleert "Bewaren tot": een datum vanaf vandaag tot hooguit 36 maanden later. */
function bewarenTot(waarde, vandaag) {
  const d = v.datum(waarde, 'Bewaren tot', { verplicht: true });
  if (d < vandaag) throw new Fout(400, 'Kies bij "Bewaren tot" een datum vanaf vandaag.');
  if (d > maandenLater(vandaag, MAX_BEWAREN_MAANDEN)) throw new Fout(400, `Bewaar personeelscijfers hooguit ${MAX_BEWAREN_MAANDEN / 12} jaar.`);
  return d;
}

const metaJson = (r, vandaag) => `{"id":${Number(r.id)},"naam":${tekst(r.naam)},"periode_van":${tekst(r.periode_van)},"periode_tot":${tekst(r.periode_tot)},`
  + `"bewaren_tot":${tekst(r.bewaren_tot)},"aangemaakt_op":${tekst(r.aangemaakt_op)},"verlopen":${r.bewaren_tot < vandaag ? 'true' : 'false'}}`;
const LIMIETEN = `{"personeelscijfers":${MAX_PERSONEELSCIJFERS},"bewaren_maanden":${MAX_BEWAREN_MAANDEN}}`;

/** Een tijdstip dat altijd later is dan het vorige (voor de controle op gelijktijdig wijzigen). */
function later(vorige) {
  let nu = nuIso();
  if (vorige && nu <= vorige) nu = new Date(Date.parse(vorige) + 1).toISOString();
  return nu;
}

// ---------- Instellingen ----------

export async function lees({ env, params }) {
  const onderzoekId = v.id(params.id);
  const [onderzoek, hr, personeel] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM onderzoeken WHERE id = ?').bind(onderzoekId),
    env.DB.prepare('SELECT inhoud, bijgewerkt_op FROM hr_instellingen WHERE onderzoek_id = ?').bind(onderzoekId),
    env.DB.prepare('SELECT id, naam, periode_van, periode_tot, bewaren_tot, aangemaakt_op FROM personeelscijfers WHERE onderzoek_id = ? ORDER BY id').bind(onderzoekId),
  ]);
  if (!onderzoek.results.length) throw new Fout(404, 'Dit onderzoek bestaat niet (meer).');
  const vandaag = vandaagNL();
  const rij = hr.results[0];
  return new Response(
    `{"instellingen":${ruwObject(rij?.inhoud, '{}')},"bijgewerkt_op":${tekst(rij?.bijgewerkt_op ?? null)},`
    + `"personeelscijfers":[${personeel.results.map((r) => metaJson(r, vandaag)).join(',')}],"limieten":${LIMIETEN}}`,
    { headers: JSON_KOPPEN },
  );
}

export async function wijzig({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const body = await leesJson(request, 150_000);
  const instellingen = controleerHrInstellingen(body.instellingen);
  const vorige = body.bijgewerkt_op === undefined || body.bijgewerkt_op === null ? null : v.tekst(body.bijgewerkt_op, 'bijgewerkt_op', { max: 40 });
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const nu = later(vorige);
  // Eén opdracht: nieuw, of bijwerken als niemand anders er intussen iets aan veranderde.
  const rij = await env.DB.prepare(
    `INSERT INTO hr_instellingen (onderzoek_id, inhoud, bijgewerkt_op) VALUES (?1, ?2, ?3)
     ON CONFLICT(onderzoek_id) DO UPDATE SET inhoud = excluded.inhoud, bijgewerkt_op = excluded.bijgewerkt_op
     WHERE ?4 IS NULL OR hr_instellingen.bijgewerkt_op = ?4
     RETURNING bijgewerkt_op`,
  ).bind(onderzoekId, JSON.stringify(instellingen), nu, vorige).first();
  if (!rij) throw new Fout(409, CONFLICT, { conflict: true });
  return json({ ok: true, bijgewerkt_op: rij.bijgewerkt_op, instellingen });
}

// ---------- Personeelscijfers ----------

export async function personeelLijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  const [onderzoek, rijen] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM onderzoeken WHERE id = ?').bind(onderzoekId),
    env.DB.prepare('SELECT id, naam, periode_van, periode_tot, bewaren_tot, aangemaakt_op FROM personeelscijfers WHERE onderzoek_id = ? ORDER BY id').bind(onderzoekId),
  ]);
  if (!onderzoek.results.length) throw new Fout(404, 'Dit onderzoek bestaat niet (meer).');
  const vandaag = vandaagNL();
  return new Response(`{"personeelscijfers":[${rijen.results.map((r) => metaJson(r, vandaag)).join(',')}],"limieten":${LIMIETEN}}`, { headers: JSON_KOPPEN });
}

export async function personeelNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const body = await leesJson(request, MAX_AGGREGAAT + 50_000);
  const aggregaat = controleerPersoneelsaggregaat(body.aggregaat);
  if (body.naam !== undefined) aggregaat.naam = v.tekst(body.naam, 'Naam', { verplicht: true, max: 100 });
  const vandaag = vandaagNL();
  const tot = bewarenTot(body.bewaren_tot, vandaag);
  await haalBewerkbaarOnderzoek(env, onderzoekId);
  const rij = await env.DB.prepare(
    `INSERT INTO personeelscijfers (onderzoek_id, naam, periode_van, periode_tot, inhoud, bewaren_tot, aangemaakt_op)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE (SELECT COUNT(*) FROM personeelscijfers WHERE onderzoek_id = ?1) < ${MAX_PERSONEELSCIJFERS}
     RETURNING id`,
  ).bind(onderzoekId, aggregaat.naam, aggregaat.periode.van, aggregaat.periode.tot, JSON.stringify(aggregaat), tot, nuIso()).first();
  if (!rij) throw new Fout(409, `Een onderzoek kan hooguit ${MAX_PERSONEELSCIJFERS} personeelsbestanden hebben. Verwijder er eerst een.`);
  return json({ id: rij.id, bewaren_tot: tot }, 201);
}

async function haalPersoneel(env, id, kolommen = 'p.id, p.onderzoek_id, o.status') {
  const rij = await env.DB.prepare(`SELECT ${kolommen} FROM personeelscijfers p JOIN onderzoeken o ON o.id = p.onderzoek_id WHERE p.id = ?`).bind(id).first();
  if (!rij) throw new Fout(404, 'Dit personeelsbestand bestaat niet (meer).');
  return rij;
}

export async function personeelDetail({ env, params }) {
  const id = v.id(params.id);
  const r = await haalPersoneel(env, id, 'p.id, p.onderzoek_id, p.naam, p.periode_van, p.periode_tot, p.bewaren_tot, p.aangemaakt_op, p.inhoud');
  const vandaag = vandaagNL();
  return new Response(
    `{"personeelscijfers":${metaJson(r, vandaag).slice(0, -1)},"onderzoek_id":${Number(r.onderzoek_id)},"inhoud":${ruwObject(r.inhoud, 'null')}}}`,
    { headers: JSON_KOPPEN },
  );
}

export async function personeelWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const body = await leesJson(request, 10_000);
  const r = await haalPersoneel(env, id, 'p.id, p.onderzoek_id, p.naam, p.bewaren_tot, o.status');
  if (r.status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  const naam = body.naam === undefined ? r.naam : v.tekst(body.naam, 'Naam', { verplicht: true, max: 100 });
  const tot = body.bewaren_tot === undefined ? r.bewaren_tot : bewarenTot(body.bewaren_tot, vandaagNL());
  // De naam staat ook in het aggregaat (zoals de browser het gebruikt); json_set houdt die gelijk.
  await env.DB.prepare("UPDATE personeelscijfers SET naam = ?1, bewaren_tot = ?2, inhoud = json_set(inhoud, '$.naam', ?1) WHERE id = ?3").bind(naam, tot, id).run();
  return json({ ok: true, naam, bewaren_tot: tot });
}

export async function personeelVerwijder({ env, params }) {
  const id = v.id(params.id);
  const r = await haalPersoneel(env, id);
  // Ook bij een gearchiveerd onderzoek: weghalen van personeelscijfers mag altijd. De verwijzing in de instellingen gaat mee.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM personeelscijfers WHERE id = ?').bind(id),
    env.DB.prepare(`UPDATE hr_instellingen SET inhoud = json_remove(inhoud, '$.personeel'), bijgewerkt_op = ?
      WHERE onderzoek_id = ? AND json_extract(inhoud, '$.personeel.id') = ?`).bind(nuIso(), r.onderzoek_id, id),
  ]);
  return json({ ok: true });
}

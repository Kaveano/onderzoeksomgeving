// Werkbank (Analyse > Werkbank): eigen variabelen, selecties en bewaarde analyses (D2 §10.2, BOUWPLAN §3.7).
// De server bewaart alleen definities en specs; alle waarden en uitkomsten rekent de browser uit.
// Rekentijd: elke route doet hooguit één batch om te lezen en één schrijfopdracht. De JSON-kolommen worden bij
// het ophalen ongewijzigd doorgegeven (niet ingelezen). De vorm van definities en specs wordt gecontroleerd met
// dezelfde module als in de browser (public/js/beheer/werkbank/definities.js).

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { nuIso } from '../lib/db.js';
import {
  SOORTEN, MAX_DEFINITIES, MAX_ANALYSES, MAX_JSON, MAX_TITEL, EIGENSCHAPPEN_NAAM, DefinitieFout,
  controleerDefinitie, controleerSpec, naamFout, gereserveerdeNamen, eigenRefs, zoekKring,
} from '../../public/js/beheer/werkbank/definities.js';
import { spssVariabeleNamen } from '../../public/js/beheer/export-bestanden.js';
import { spssNaam } from '../../public/js/beheer/bestanden.js';
import { KENMERKEN } from '../../public/js/beheer/kenmerken.js';
import { SCHALEN, CIJFERSCHALEN } from '../lib/schalen.js';

const JSON_KOPPEN = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const GEARCHIVEERD = 'Dit onderzoek is gearchiveerd en kan niet meer worden gewijzigd.';
const CONFLICT = 'Dit is intussen op een andere plek (bijvoorbeeld een ander tabblad of apparaat) gewijzigd.';

/** Een DefinitieFout (vorm) wordt een 400 met dezelfde tekst. */
function controleer(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof DefinitieFout) throw new Fout(400, e.message);
    throw e;
  }
}

const tekst = (s) => JSON.stringify(s ?? null);

/** Een rij als JSON-tekst, met de JSON-kolom ongewijzigd erin geplakt (de kolom heeft CHECK json_valid). */
function definitieJson(r) {
  return `{"id":${Number(r.id)},"dataset_id":${r.dataset_id === null ? 'null' : Number(r.dataset_id)},"soort":${tekst(r.soort)},"naam":${tekst(r.naam)},`
    + `"label":${tekst(r.label)},"definitie":${r.definitie},"volgorde":${Number(r.volgorde) || 0},"verwijderd":${r.verwijderd_op ? 'true' : 'false'},`
    + `"verwijderd_op":${tekst(r.verwijderd_op)},"aangemaakt_op":${tekst(r.aangemaakt_op)},"bijgewerkt_op":${tekst(r.bijgewerkt_op)}}`;
}

function analyseJson(r) {
  return `{"id":${Number(r.id)},"dataset_id":${r.dataset_id === null ? 'null' : Number(r.dataset_id)},"titel":${tekst(r.titel)},"procedure":${tekst(r.procedure)},`
    + `"spec":${r.spec},"notitie":${tekst(r.notitie)},"volgorde":${Number(r.volgorde) || 0},"aangemaakt_op":${tekst(r.aangemaakt_op)},"bijgewerkt_op":${tekst(r.bijgewerkt_op)}}`;
}

/** Een tijdstip dat altijd later is dan het vorige (voor de controle op gelijktijdig wijzigen). */
function later(vorige) {
  let nu = nuIso();
  if (vorige && nu <= vorige) nu = new Date(Date.parse(vorige) + 1).toISOString();
  return nu;
}

export async function overzicht({ env, params }) {
  const onderzoekId = v.id(params.id);
  const [onderzoek, definities, analyses] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM onderzoeken WHERE id = ?').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM werkbank_definities WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM werkbank_analyses WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
  ]);
  if (!onderzoek.results.length) throw new Fout(404, 'Dit onderzoek bestaat niet (meer).');
  return new Response(
    `{"definities":[${definities.results.map(definitieJson).join(',')}],"analyses":[${analyses.results.map(analyseJson).join(',')}],`
    + `"limieten":{"definities":${MAX_DEFINITIES},"analyses":${MAX_ANALYSES}}}`,
    { headers: JSON_KOPPEN },
  );
}

// ---------- Definities ----------

/**
 * Alles wat nodig is om een definitie te controleren, in één batch. sleutel = de SQL die het onderzoek-id geeft
 * (een '?' of een subquery via het id van de definitie) met de bijbehorende waarde.
 */
async function leesContext(env, { onderzoekSql, waarde, datasetId, definitieId = null }) {
  const viaDefinitie = definitieId !== null;
  const p = (sql) => env.DB.prepare(sql.replaceAll('{O}', onderzoekSql)).bind(...Array.from({ length: (sql.match(/\{O\}/g) || []).length }, () => waarde));
  const opdrachten = [
    p('SELECT id, status FROM onderzoeken WHERE id = {O}'),
    p('SELECT id, dataset_id, soort, naam, verwijderd_op, bijgewerkt_op FROM werkbank_definities WHERE onderzoek_id = {O} ORDER BY id'),
    // Alleen de verwijzingen naar eigen variabelen (w:…), niet de hele definities: die kunnen groot zijn.
    p(`SELECT d.id AS id, j.value AS ref FROM werkbank_definities d, json_tree(d.definitie) j
       WHERE d.onderzoek_id = {O} AND d.soort <> 'eigenschappen' AND j.type = 'text' AND j.value LIKE 'w:%'`),
    p('SELECT id, naam, volgorde FROM themas WHERE onderzoek_id = {O} ORDER BY volgorde, id'),
    p('SELECT m.id, m.thema_id, m.naam, m.volgorde FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = {O} ORDER BY m.volgorde, m.id'),
    p('SELECT id, naam FROM meetmomenten WHERE onderzoek_id = {O} ORDER BY volgorde, id'),
    p('SELECT id, titel, meetmoment_id FROM vragenlijsten WHERE onderzoek_id = {O} ORDER BY id'),
    p(`SELECT q.* FROM vragen q JOIN vragenlijsten vl ON vl.id = q.vragenlijst_id JOIN themas t ON t.id = q.thema_id
       WHERE vl.onderzoek_id = {O} ORDER BY t.volgorde, t.id, q.volgorde, q.id`),
  ];
  if (viaDefinitie) {
    // Bij wijzigen: de definitie zelf en (als die bij een dataset hoort) de kolomnamen van die dataset.
    opdrachten.push(env.DB.prepare('SELECT * FROM werkbank_definities WHERE id = ?').bind(definitieId));
    opdrachten.push(env.DB.prepare('SELECT id, kolommen FROM datasets WHERE id = (SELECT dataset_id FROM werkbank_definities WHERE id = ?)').bind(definitieId));
  } else if (datasetId !== null && datasetId !== undefined) {
    opdrachten.push(env.DB.prepare(`SELECT id, kolommen FROM datasets WHERE id = ? AND onderzoek_id = ${onderzoekSql}`).bind(datasetId, waarde));
  }
  const uit = await env.DB.batch(opdrachten);
  const [onderzoek, definities, refs, themas, meetpunten, meetmomenten, vragenlijsten, vragen] = uit;
  const rest = uit.slice(8);
  const rij = viaDefinitie ? rest.shift().results[0] || null : undefined;
  const dataset = viaDefinitie || (datasetId !== null && datasetId !== undefined) ? rest.shift().results[0] || null : null;
  return {
    onderzoek: onderzoek.results[0] || null,
    definities: definities.results,
    refs: refs.results,
    data: {
      lijsten: { schalen: SCHALEN, cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN },
      themas: themas.results, meetpunten: meetpunten.results, meetmomenten: meetmomenten.results,
      vragenlijsten: vragenlijsten.results, vragen: vragen.results, inzendingen: [],
    },
    dataset,
    rij,
  };
}

/** De namen die een eigen variabele niet mag hebben in deze gegevensbron. */
function gereserveerd(ctx) {
  if (ctx.dataset) {
    let kolommen = [];
    try {
      kolommen = JSON.parse(ctx.dataset.kolommen || '[]');
    } catch { /* geen kolommen */ }
    const gebruikt = new Set();
    for (const k of kolommen) spssNaam(k, gebruikt);
    return gereserveerdeNamen(gebruikt, Object.keys(KENMERKEN));
  }
  return gereserveerdeNamen(spssVariabeleNamen(ctx.data).gebruikt, Object.keys(KENMERKEN));
}

/** Controleert naam, verwijzingen en kringen; geeft de schone velden. */
function controleerVelden(ctx, { id = null, soort, datasetId, naam, label, definitie }) {
  const schoon = controleer(() => controleerDefinitie(soort, definitie));
  if (JSON.stringify(schoon).length > MAX_JSON) throw new Fout(400, 'De definitie is te groot.');
  const zelfdeBron = ctx.definities.filter((d) => (d.dataset_id ?? null) === datasetId && d.id !== id);
  let schoneNaam = EIGENSCHAPPEN_NAAM;
  if (soort === 'eigenschappen') {
    if (zelfdeBron.some((d) => d.soort === 'eigenschappen')) throw new Fout(409, 'Voor deze gegevens zijn er al eigenschappen. Pas die aan.');
  } else {
    schoneNaam = typeof naam === 'string' ? naam.trim() : '';
    const fout = naamFout(schoneNaam, { gereserveerd: gereserveerd(ctx), bestaande: zelfdeBron.filter((d) => !d.verwijderd_op && d.soort !== 'eigenschappen').map((d) => d.naam) });
    if (fout) throw new Fout(400, fout);
  }
  const schoonLabel = v.tekst(label, 'De omschrijving', { max: MAX_TITEL });
  // Verwijzingen naar eigen variabelen: in hetzelfde onderzoek, dezelfde gegevensbron en niet verwijderd.
  const perId = new Map(ctx.definities.map((d) => [d.id, d]));
  for (const ref of eigenRefs(soort, schoon)) {
    const d = perId.get(ref);
    if (!d || (d.dataset_id ?? null) !== datasetId) throw new Fout(400, 'De definitie verwijst naar een eigen variabele die niet (meer) bestaat.');
    if (d.verwijderd_op) throw new Fout(400, `De definitie verwijst naar de verwijderde variabele “${d.naam}”.`);
    if (d.soort === 'filter' || d.soort === 'eigenschappen') throw new Fout(400, 'Een selectie kun je niet als variabele gebruiken.');
  }
  // Kringen: de bestaande verwijzingen plus die van deze definitie.
  if (id !== null) {
    const naar = new Map();
    for (const r of ctx.refs) {
      if (r.id === id) continue;
      if (!naar.has(r.id)) naar.set(r.id, []);
      naar.get(r.id).push(r.ref);
    }
    const alle = [...naar.entries()].map(([did, refs]) => ({ id: did, soort: 'bereken', definitie: { functie: 'som', variabelen: refs } }));
    alle.push({ id, soort, definitie: schoon });
    if (zoekKring(alle)) throw new Fout(400, 'Deze variabelen verwijzen naar elkaar. Pas een van beide aan.');
  }
  return { naam: schoneNaam, label: schoonLabel, definitie: JSON.stringify(schoon) };
}

export async function definitieNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const body = await leesJson(request, 100_000);
  const soort = v.keuze(body.soort, 'Soort', SOORTEN);
  const datasetId = v.optioneelId(body.dataset_id, 'Dataset');
  const ctx = await leesContext(env, { onderzoekSql: '?', waarde: onderzoekId, datasetId });
  if (!ctx.onderzoek) throw new Fout(404, 'Dit onderzoek bestaat niet (meer).');
  if (ctx.onderzoek.status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  if (datasetId !== null && !ctx.dataset) throw new Fout(400, 'Deze dataset hoort niet bij dit onderzoek.');
  if (ctx.definities.length >= MAX_DEFINITIES) throw new Fout(409, `Een onderzoek kan maximaal ${MAX_DEFINITIES} eigen variabelen en selecties hebben. Verwijder er eerst een.`);
  const velden = controleerVelden(ctx, { soort, datasetId, naam: body.naam, label: body.label, definitie: body.definitie });
  const nu = nuIso();
  const volgorde = ctx.definities.length + 1;
  const rij = await env.DB.prepare(
    `INSERT INTO werkbank_definities (onderzoek_id, dataset_id, soort, naam, label, definitie, volgorde, aangemaakt_op, bijgewerkt_op)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(onderzoekId, datasetId, soort, velden.naam, velden.label, velden.definitie, volgorde, nu, nu).first();
  return json({ id: rij.id, bijgewerkt_op: nu }, 201);
}

const VIA_DEFINITIE = '(SELECT onderzoek_id FROM werkbank_definities WHERE id = ?)';
const VIA_ANALYSE = '(SELECT onderzoek_id FROM werkbank_analyses WHERE id = ?)';

export async function definitieWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const body = await leesJson(request, 100_000);
  // dataset_id hoort bij de definitie en verandert niet; die halen we eerst uit de batch zelf.
  const ctx = await leesContext(env, { onderzoekSql: VIA_DEFINITIE, waarde: id, datasetId: null, definitieId: id });
  const rij = ctx.rij;
  if (!rij) throw new Fout(404, 'Deze variabele of selectie bestaat niet (meer).');
  if (ctx.onderzoek?.status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  if (rij.verwijderd_op) throw new Fout(409, 'Deze indeling of selectie is verwijderd en kan niet meer worden aangepast.');
  if (body.bijgewerkt_op && body.bijgewerkt_op !== rij.bijgewerkt_op && !body.overschrijven) throw new Fout(409, CONFLICT, { conflict: true });
  if (body.soort !== undefined && body.soort !== rij.soort) throw new Fout(400, 'De soort van een definitie kan niet veranderen.');
  if (body.dataset_id !== undefined && (body.dataset_id ?? null) !== (rij.dataset_id ?? null)) throw new Fout(400, 'De gegevensbron van een definitie kan niet veranderen.');
  let definitie;
  try {
    definitie = body.definitie === undefined ? JSON.parse(rij.definitie) : body.definitie;
  } catch {
    throw new Fout(400, 'De definitie is ongeldig.');
  }
  const velden = controleerVelden(ctx, {
    id, soort: rij.soort, datasetId: rij.dataset_id ?? null,
    naam: body.naam === undefined ? rij.naam : body.naam,
    label: body.label === undefined ? rij.label : body.label,
    definitie,
  });
  const nu = later(rij.bijgewerkt_op);
  await env.DB.prepare('UPDATE werkbank_definities SET naam = ?, label = ?, definitie = ?, bijgewerkt_op = ? WHERE id = ?')
    .bind(velden.naam, velden.label, velden.definitie, nu, id).run();
  return json({ ok: true, bijgewerkt_op: nu });
}

export async function definitieVerwijder({ env, params, url, request }) {
  const id = v.id(params.id);
  const zoek = (url || new URL(request.url)).searchParams;
  const definitief = zoek.get('definitief') === '1';
  const patroon = `%"w:${id}"%`;
  const [rij, onderzoek, definities, analyses] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM werkbank_definities WHERE id = ?').bind(id),
    env.DB.prepare(`SELECT status FROM onderzoeken WHERE id = ${VIA_DEFINITIE}`).bind(id),
    // In gebruik: een andere (niet verwijderde) definitie of een bewaarde analyse verwijst ernaar.
    env.DB.prepare(`SELECT id, soort, naam FROM werkbank_definities WHERE onderzoek_id = ${VIA_DEFINITIE} AND id <> ?
       AND soort <> 'eigenschappen' AND verwijderd_op IS NULL AND definitie LIKE ? ORDER BY id LIMIT 20`).bind(id, id, patroon),
    env.DB.prepare(`SELECT id, titel FROM werkbank_analyses WHERE onderzoek_id = ${VIA_DEFINITIE}
       AND (spec LIKE ? OR json_extract(spec, '$.filter') = ?) ORDER BY id LIMIT 20`).bind(id, patroon, id),
  ]);
  const d = rij.results[0];
  if (!d) throw new Fout(404, 'Deze variabele of selectie bestaat niet (meer).');
  if (onderzoek.results[0]?.status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  const gebruikt = [
    ...definities.results.map((x) => ({ soort: x.soort === 'filter' ? 'selectie' : 'variabele', id: x.id, naam: x.naam })),
    ...analyses.results.map((x) => ({ soort: 'analyse', id: x.id, naam: x.titel })),
  ];
  if (gebruikt.length) {
    throw new Fout(409, `Deze variabele wordt nog gebruikt door: ${gebruikt.map((x) => `“${x.naam}”`).join(', ')}. Pas die eerst aan of verwijder ze.`, { gebruikt_door: gebruikt });
  }
  // Een indeling of selectie verdwijnt eerst "zacht": ze telt nog mee bij de controle op terugrekenen (regel E).
  if ((d.soort === 'hercoderen' || d.soort === 'filter') && !definitief) {
    if (!d.verwijderd_op) await env.DB.prepare('UPDATE werkbank_definities SET verwijderd_op = ?, bijgewerkt_op = ? WHERE id = ?').bind(nuIso(), later(d.bijgewerkt_op), id).run();
    return json({ ok: true, verwijderd: 'zacht' });
  }
  await env.DB.prepare('DELETE FROM werkbank_definities WHERE id = ?').bind(id).run();
  return json({ ok: true, verwijderd: 'definitief' });
}

// ---------- Bewaarde analyses ----------

function controleerAnalyse(body, { titelVerplicht = true } = {}) {
  const uit = {};
  if (body.titel !== undefined || titelVerplicht) uit.titel = v.tekst(body.titel, 'Titel', { verplicht: true, max: MAX_TITEL });
  if (body.notitie !== undefined) uit.notitie = v.langeTekst(body.notitie, 'Notitie', { max: MAX_JSON });
  if (body.spec !== undefined) {
    uit.spec = controleer(() => controleerSpec(body.spec));
    if (body.procedure !== undefined && body.procedure !== uit.spec.procedure) throw new Fout(400, 'De soort analyse past niet bij de analyse.');
  }
  return uit;
}

/** Controleert dat bron en selectie van een spec bij het onderzoek horen (één batch, met de status erbij). */
async function controleerBronnen(env, onderzoekSql, waarde, specOfNull, extra = []) {
  const p = (sql, ...rest) => env.DB.prepare(sql.replaceAll('{O}', onderzoekSql)).bind(...rest);
  const spec = specOfNull || { bron: { soort: 'gestapeld', lijsten: 'alle' }, filter: null };
  const lijstIds = spec.bron.soort === 'lijst' ? [spec.bron.id] : spec.bron.soort === 'gestapeld' && Array.isArray(spec.bron.lijsten) ? spec.bron.lijsten : [];
  const uit = await env.DB.batch([
    p('SELECT id, status FROM onderzoeken WHERE id = {O}', waarde),
    p('SELECT COUNT(*) AS n FROM werkbank_analyses WHERE onderzoek_id = {O}', waarde),
    p('SELECT COUNT(*) AS n FROM vragenlijsten WHERE onderzoek_id = {O} AND id IN (SELECT value FROM json_each(?))', waarde, JSON.stringify(lijstIds)),
    p('SELECT id FROM datasets WHERE onderzoek_id = {O} AND id = ?', waarde, spec.bron.soort === 'dataset' ? spec.bron.id : 0),
    p("SELECT id, dataset_id FROM werkbank_definities WHERE onderzoek_id = {O} AND id = ? AND soort = 'filter'", waarde, spec.filter ?? 0),
    ...extra,
  ]);
  const [onderzoek, telling, lijsten, dataset, filter, ...rest] = uit;
  const o = onderzoek.results[0] || null;
  if (o && o.status !== 'gearchiveerd') {
    if (lijsten.results[0].n !== lijstIds.length) throw new Fout(400, 'Een gekozen vragenlijst hoort niet bij dit onderzoek.');
    if (spec.bron.soort === 'dataset' && !dataset.results.length) throw new Fout(400, 'Deze dataset hoort niet bij dit onderzoek.');
    if (spec.filter !== null) {
      const f = filter.results[0];
      const datasetId = spec.bron.soort === 'dataset' ? spec.bron.id : null;
      if (!f || (f.dataset_id ?? null) !== datasetId) throw new Fout(400, 'Deze selectie hoort niet bij dit onderzoek of deze gegevens.');
    }
  }
  return { onderzoek: o, aantal: telling.results[0]?.n || 0, rest };
}

export async function analyseNieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const body = await leesJson(request, 100_000);
  if (body.spec === undefined) throw new Fout(400, 'De analyse is ongeldig.');
  const velden = controleerAnalyse(body);
  const { onderzoek, aantal } = await controleerBronnen(env, '?', onderzoekId, velden.spec);
  if (!onderzoek) throw new Fout(404, 'Dit onderzoek bestaat niet (meer).');
  if (onderzoek.status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  if (aantal >= MAX_ANALYSES) throw new Fout(409, `Een onderzoek kan maximaal ${MAX_ANALYSES} bewaarde analyses hebben. Verwijder er eerst een.`);
  const nu = nuIso();
  const datasetId = velden.spec.bron.soort === 'dataset' ? velden.spec.bron.id : null;
  const rij = await env.DB.prepare(
    `INSERT INTO werkbank_analyses (onderzoek_id, dataset_id, titel, procedure, spec, notitie, volgorde, aangemaakt_op, bijgewerkt_op)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(onderzoekId, datasetId, velden.titel, velden.spec.procedure, JSON.stringify(velden.spec), velden.notitie || '', aantal + 1, nu, nu).first();
  return json({ id: rij.id, bijgewerkt_op: nu }, 201);
}

export async function analyseWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const body = await leesJson(request, 100_000);
  const velden = controleerAnalyse(body, { titelVerplicht: false });
  const { onderzoek, rest } = await controleerBronnen(env, VIA_ANALYSE, id, velden.spec || null, [env.DB.prepare('SELECT * FROM werkbank_analyses WHERE id = ?').bind(id)]);
  const rij = rest[0].results[0];
  if (!rij) throw new Fout(404, 'Deze analyse bestaat niet (meer).');
  if (onderzoek?.status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  if (body.bijgewerkt_op && body.bijgewerkt_op !== rij.bijgewerkt_op && !body.overschrijven) throw new Fout(409, CONFLICT, { conflict: true });
  const nu = later(rij.bijgewerkt_op);
  const spec = velden.spec ? JSON.stringify(velden.spec) : rij.spec;
  const procedure = velden.spec ? velden.spec.procedure : rij.procedure;
  const datasetId = velden.spec ? (velden.spec.bron.soort === 'dataset' ? velden.spec.bron.id : null) : rij.dataset_id;
  await env.DB.prepare('UPDATE werkbank_analyses SET titel = ?, procedure = ?, spec = ?, notitie = ?, dataset_id = ?, bijgewerkt_op = ? WHERE id = ?')
    .bind(velden.titel ?? rij.titel, procedure, spec, velden.notitie ?? rij.notitie, datasetId, nu, id).run();
  return json({ ok: true, bijgewerkt_op: nu });
}

export async function analyseVerwijder({ env, params }) {
  const id = v.id(params.id);
  const [rij, onderzoek] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM werkbank_analyses WHERE id = ?').bind(id),
    env.DB.prepare(`SELECT status FROM onderzoeken WHERE id = ${VIA_ANALYSE}`).bind(id),
  ]);
  if (!rij.results.length) throw new Fout(404, 'Deze analyse bestaat niet (meer).');
  if (onderzoek.results[0]?.status === 'gearchiveerd') throw new Fout(409, GEARCHIVEERD);
  await env.DB.prepare('DELETE FROM werkbank_analyses WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

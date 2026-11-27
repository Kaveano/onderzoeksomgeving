// Exporteren.
// - GET .../export/data: alle gegevens van een onderzoek in één keer. De browser maakt daar
//   zelf CSV- en JSON-bestanden van; zo blijft de server binnen de gratis rekentijd (10 ms).
//   De antwoorden worden ongewijzigd doorgegeven (niet ingelezen en opnieuw opgebouwd).
//   Met ?zonder_inzendingen=1 komt alleen de kop (alles behalve de antwoorden). In beide gevallen staat er
//   inzendingen_stand in: per vragenlijst het aantal inzendingen en een controlegetal. Daarmee ziet de browser
//   (public/js/beheer/gegevens.js) welke vragenlijsten veranderd zijn; alleen die haalt hij opnieuw op.
// - GET .../export/inzendingen?vragenlijst=<id>&na=<id>&max=<n>: één deel van de antwoorden van één vragenlijst,
//   met het (willekeurige) id van elke inzending. Alleen voor de ingelogde onderzoeker; nooit voor een meelezer.
// - GET .../export/stukken.txt: alle stukken als één leesbaar tekstbestand.
//
// Rekentijd (BOUWPLAN §5.2): elke route is één batch, plus één losse query voor het onderzoek bij export/data.
// Antwoorden en JSON-velden (HR-instellingen, personeelscijfers) worden nooit ingelezen, alleen doorgeplakt.

import { bestand, Fout } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { haalOnderzoek, vandaagNL } from '../lib/db.js';
import { slug, markdownNaarTekst } from '../lib/export-hulp.js';
import { SCHALEN, VRAAGTYPEN, INVOERSOORTEN, STUKSOORTEN, ACTIESTATUSSEN, CIJFERSCHALEN } from '../lib/schalen.js';
import { KENMERKEN } from '../../public/js/beheer/kenmerken.js';

/** Eén deel van export/inzendingen: hooguit zoveel inzendingen … */
export const MAX_PER_DEEL = 1000;
/** … en ongeveer zoveel tekens aan antwoorden (de inzending die over de grens gaat, komt nog mee). */
export const MAX_TEKENS_PER_DEEL = 1_500_000;
/** Controlegetal per vragenlijst: SUM(id % m) % m. De browser rekent het net zo uit (gegevens.js). */
export const CONTROLE_MODULUS = 2147483647;

const JSON_KOPPEN = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

/** Een JSON-object uit de database ongewijzigd doorgeven (de kolom heeft CHECK json_valid); anders de reserve. */
const ruwObject = (tekst, reserve) => (typeof tekst === 'string' && /^\s*\{/.test(tekst) ? tekst : reserve);

/** De zoekparameters (de router geeft url mee; bij een directe aanroep, zoals in de tests, alleen request). */
const zoekParams = ({ url, request }) => (url || (request ? new URL(request.url) : null))?.searchParams || new URLSearchParams();

export async function data({ env, params, url, request }) {
  const onderzoekId = v.id(params.id);
  const zonderInzendingen = zoekParams({ url, request }).get('zonder_inzendingen') === '1';
  const o = await haalOnderzoek(env, onderzoekId);
  const q = (sql) => env.DB.prepare(sql).bind(onderzoekId);
  const opdrachten = [
    q('SELECT * FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT m.* FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY m.volgorde, m.id'),
    q('SELECT * FROM meetmomenten WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT * FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id'),
    q(`SELECT q.* FROM vragen q JOIN vragenlijsten vl ON vl.id = q.vragenlijst_id JOIN themas t ON t.id = q.thema_id
       WHERE vl.onderzoek_id = ? ORDER BY t.volgorde, t.id, q.volgorde, q.id`),
    q('SELECT * FROM eigen_invoer WHERE onderzoek_id = ? ORDER BY datum, id'),
    q('SELECT * FROM stukken WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT * FROM acties WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    // Rapporten: de eigen tekst; de vastgelegde cijfers zijn opnieuw te maken uit de gegevens hierboven.
    q('SELECT id, soort, titel, inhoud, aangemaakt_op, bijgewerkt_op FROM rapporten WHERE onderzoek_id = ? ORDER BY id'),
    // Uitbreidingen (BOUWPLAN §3.2). Werkbank: ook verwijderde indelingen (verwijderd_op); die tellen nog mee bij
    // de controle op terugrekenen. Wie alleen de actieve wil, kiest die met verwijderd_op === null.
    q('SELECT inhoud FROM hr_instellingen WHERE onderzoek_id = ?'),
    q('SELECT id, naam, periode_van, periode_tot, bewaren_tot, inhoud FROM personeelscijfers WHERE onderzoek_id = ? ORDER BY id'),
    q('SELECT * FROM werkbank_definities WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT * FROM werkbank_analyses WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT * FROM codes WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT id, code_id, inzending_id, vraag_id, invoer_id FROM coderingen WHERE onderzoek_id = ? ORDER BY id'),
    q('SELECT * FROM citaten WHERE onderzoek_id = ? ORDER BY volgorde, id'),
    q('SELECT bron_id, notitie FROM bron_koppelingen WHERE onderzoek_id = ? ORDER BY bron_id'),
    // Stand per vragenlijst (ook bij 0 inzendingen): leest alleen de index op vragenlijst_id, niet de antwoorden.
    q(`SELECT vl.id AS vragenlijst_id, COUNT(i.id) AS aantal,
         COALESCE(SUM(i.id % ${CONTROLE_MODULUS}) % ${CONTROLE_MODULUS}, 0) AS controle
       FROM vragenlijsten vl LEFT JOIN inzendingen i ON i.vragenlijst_id = vl.id
       WHERE vl.onderzoek_id = ? GROUP BY vl.id ORDER BY vl.id`),
  ];
  if (!zonderInzendingen) {
    // Willekeurige id's: binnen een dag zegt de volgorde niets over wie wanneer invulde.
    opdrachten.push(q(
      `SELECT i.vragenlijst_id, i.datum, i.antwoorden FROM inzendingen i JOIN vragenlijsten vl ON vl.id = i.vragenlijst_id
       WHERE vl.onderzoek_id = ? ORDER BY i.vragenlijst_id, i.datum, i.id`,
    ));
  }
  const [themas, meetpunten, meetmomenten, lijsten, vragen, invoer, stukken, acties, rapporten,
    hr, personeel, definities, analyses, codes, coderingen, citaten, bronnen, stand, inzendingen] = await env.DB.batch(opdrachten);

  const kop = JSON.stringify({
    export: { versie: 1, bron: 'Onderzoeksomgeving', geexporteerd_op: new Date().toISOString(), datum: vandaagNL() },
    lijsten: {
      schalen: SCHALEN, vraagtypen: VRAAGTYPEN, invoersoorten: INVOERSOORTEN, stuksoorten: STUKSOORTEN, actiestatussen: ACTIESTATUSSEN,
      cijferschalen: CIJFERSCHALEN, kenmerken: KENMERKEN,
    },
    onderzoek: o,
    themas: themas.results,
    meetpunten: meetpunten.results,
    meetmomenten: meetmomenten.results,
    vragenlijsten: lijsten.results,
    vragen: vragen.results,
    eigen_invoer: invoer.results,
    stukken: stukken.results,
    acties: acties.results,
    rapporten: rapporten.results,
    werkbank_definities: definities.results,
    werkbank_analyses: analyses.results,
    codes: codes.results,
    coderingen: coderingen.results,
    citaten: citaten.results,
    bronnen_gekoppeld: bronnen.results,
    inzendingen_stand: stand.results,
  });
  // HR-instellingen en personeelscijfers staan al als JSON in de database; die plakken we er ongewijzigd in.
  const hrTekst = ruwObject(hr.results[0]?.inhoud, '{}');
  const personeelTekst = personeel.results
    .map((r) => `{"id":${Number(r.id)},"naam":${JSON.stringify(r.naam)},"periode_van":${JSON.stringify(r.periode_van)},`
      + `"periode_tot":${JSON.stringify(r.periode_tot)},"bewaren_tot":${JSON.stringify(r.bewaren_tot)},"inhoud":${ruwObject(r.inhoud, 'null')}}`)
    .join(',');
  // De antwoorden ook.
  const inz = zonderInzendingen ? '' : inzendingen.results
    .map((r) => `{"vragenlijst_id":${Number(r.vragenlijst_id)},"datum":${JSON.stringify(r.datum)},"antwoorden":${r.antwoorden}}`)
    .join(',');
  return new Response(
    `${kop.slice(0, -1)},"hr_instellingen":${hrTekst},"personeelscijfers":[${personeelTekst}],"inzendingen":[${inz}]}`,
    { headers: JSON_KOPPEN },
  );
}

/**
 * Eén deel van de antwoorden van één vragenlijst, in volgorde van het (willekeurige) id:
 * { inzendingen: [{id, vragenlijst_id, datum, antwoorden}], volgende: <id>|null }. Het volgende deel vraag je op
 * met na=<volgende>; bij volgende = null is alles binnen.
 * Een deel stopt bij max inzendingen (hooguit 1.000) of zodra er ongeveer 1,5 miljoen tekens aan antwoorden in
 * zitten. Dat laatste telt de database (SUM(length(...)) over de voorgaande rijen), zodat de Worker nooit veel
 * meer dan dat binnenkrijgt. De database leest via de index op (vragenlijst_id, id) alleen de rijen van dit deel.
 */
export async function inzendingen({ env, params, url, request }) {
  const onderzoekId = v.id(params.id);
  const p = zoekParams({ url, request });
  if (!p.get('vragenlijst')) throw new Fout(400, 'Geef aan van welke vragenlijst je de antwoorden wilt.');
  const vragenlijstId = v.id(p.get('vragenlijst'), 'vragenlijst');
  const na = v.geheelGetal(p.get('na'), 'na', { min: 0, max: Number.MAX_SAFE_INTEGER }) ?? 0;
  const max = Math.min(MAX_PER_DEEL, v.geheelGetal(p.get('max'), 'max', { min: 1, max: Number.MAX_SAFE_INTEGER }) ?? MAX_PER_DEEL);

  const [hoort, deel] = await env.DB.batch([
    env.DB.prepare('SELECT 1 AS ja FROM vragenlijsten WHERE id = ? AND onderzoek_id = ?').bind(vragenlijstId, onderzoekId),
    // ervoor = het aantal tekens van de eerdere inzendingen in dit deel. De inzending die over de grens gaat,
    // komt nog mee (dus altijd minstens één, ook als die ene groter is dan de grens).
    env.DB.prepare(
      `SELECT id, vragenlijst_id, datum, antwoorden FROM (
         SELECT i.id, i.vragenlijst_id, i.datum, i.antwoorden,
           SUM(length(i.antwoorden)) OVER (ORDER BY i.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS ervoor
         FROM inzendingen i WHERE i.vragenlijst_id = ? AND i.id > ? ORDER BY i.id LIMIT ?)
       WHERE ervoor IS NULL OR ervoor < ? ORDER BY id`,
    ).bind(vragenlijstId, na, max, MAX_TEKENS_PER_DEEL),
  ]);
  // Hoort de vragenlijst niet bij dit onderzoek, dan geven we niets terug (de rijen zijn wel al gelezen).
  if (!hoort.results.length) throw new Fout(404, 'Deze vragenlijst bestaat niet (meer).');

  let tekens = 0;
  const stukken = deel.results.map((r) => {
    tekens += r.antwoorden.length;
    return `{"id":${Number(r.id)},"vragenlijst_id":${Number(r.vragenlijst_id)},"datum":${JSON.stringify(r.datum)},"antwoorden":${r.antwoorden}}`;
  });
  // Vol (op aantal of op tekens): er kan meer zijn. Eindigt het precies op de grens, dan volgt hooguit één leeg deel.
  const laatste = deel.results.length ? Number(deel.results[deel.results.length - 1].id) : null;
  const volgende = laatste !== null && (deel.results.length >= max || tekens >= MAX_TEKENS_PER_DEEL) ? laatste : null;
  return new Response(`{"inzendingen":[${stukken.join(',')}],"volgende":${volgende === null ? 'null' : volgende}}`, { headers: JSON_KOPPEN });
}

export async function stukkenTxt({ env, params }) {
  const onderzoekId = v.id(params.id);
  const o = await haalOnderzoek(env, onderzoekId);
  const [stukken, acties] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM stukken WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM acties WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
  ]);
  const streep = '='.repeat(60);
  let tekst =
    `Onderzoek: ${o.titel}\nBedrijf: ${o.bedrijfsnaam}\nOnderzoeksvraag: ${o.onderzoeksvraag || '-'}\n` +
    `Geëxporteerd op: ${vandaagNL()}\n\n`;
  for (const s of stukken.results) {
    tekst += `${streep}\n${s.titel} (${STUKSOORTEN[s.soort] || s.soort}, laatst bijgewerkt ${s.bijgewerkt_op.slice(0, 10)})\n${streep}\n\n${markdownNaarTekst(s.inhoud).trim()}\n\n`;
  }
  if (acties.results.length) {
    tekst += `${streep}\nActielijst\n${streep}\n\n`;
    for (const a of acties.results) {
      tekst += `- [${ACTIESTATUSSEN[a.status]}] ${a.titel}${a.datum ? ` (${a.datum})` : ''}${a.notitie ? `\n  ${a.notitie}` : ''}\n`;
    }
  }
  return bestand('﻿' + tekst.replace(/\r?\n/g, '\r\n'), `${slug(o.bedrijfsnaam)}-stukken-${vandaagNL()}.txt`, 'text/plain; charset=utf-8');
}

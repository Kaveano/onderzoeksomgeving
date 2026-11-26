// Exporteren.
// - GET .../export/data: alle gegevens van een onderzoek in één keer. De browser maakt daar
//   zelf CSV- en JSON-bestanden van; zo blijft de server binnen de gratis rekentijd (10 ms).
//   De antwoorden worden ongewijzigd doorgegeven (niet ingelezen en opnieuw opgebouwd).
// - GET .../export/stukken.txt: alle stukken als één leesbaar tekstbestand.

import { bestand } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { haalOnderzoek, vandaagNL } from '../lib/db.js';
import { slug, markdownNaarTekst } from '../lib/export-hulp.js';
import { SCHALEN, VRAAGTYPEN, INVOERSOORTEN, STUKSOORTEN, ACTIESTATUSSEN } from '../lib/schalen.js';

export async function data({ env, params }) {
  const onderzoekId = v.id(params.id);
  const o = await haalOnderzoek(env, onderzoekId);
  const [themas, meetpunten, meetmomenten, lijsten, vragen, inzendingen, invoer, stukken, acties, rapporten] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare(
      'SELECT m.* FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY m.volgorde, m.id',
    ).bind(onderzoekId),
    env.DB.prepare('SELECT * FROM meetmomenten WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id').bind(onderzoekId),
    env.DB.prepare(
      `SELECT q.* FROM vragen q JOIN vragenlijsten vl ON vl.id = q.vragenlijst_id JOIN themas t ON t.id = q.thema_id
       WHERE vl.onderzoek_id = ? ORDER BY t.volgorde, t.id, q.volgorde, q.id`,
    ).bind(onderzoekId),
    // Willekeurige id's: binnen een dag zegt de volgorde niets over wie wanneer invulde.
    env.DB.prepare(
      `SELECT i.vragenlijst_id, i.datum, i.antwoorden FROM inzendingen i JOIN vragenlijsten vl ON vl.id = i.vragenlijst_id
       WHERE vl.onderzoek_id = ? ORDER BY i.vragenlijst_id, i.datum, i.id`,
    ).bind(onderzoekId),
    env.DB.prepare('SELECT * FROM eigen_invoer WHERE onderzoek_id = ? ORDER BY datum, id').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM stukken WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM acties WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    // Rapporten: de eigen tekst; de vastgelegde cijfers zijn opnieuw te maken uit de gegevens hierboven.
    env.DB.prepare('SELECT id, soort, titel, inhoud, aangemaakt_op, bijgewerkt_op FROM rapporten WHERE onderzoek_id = ? ORDER BY id').bind(onderzoekId),
  ]);

  const kop = JSON.stringify({
    export: { versie: 1, bron: 'Onderzoeksomgeving', geexporteerd_op: new Date().toISOString(), datum: vandaagNL() },
    lijsten: { schalen: SCHALEN, vraagtypen: VRAAGTYPEN, invoersoorten: INVOERSOORTEN, stuksoorten: STUKSOORTEN, actiestatussen: ACTIESTATUSSEN },
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
  });
  // De antwoorden staan al als JSON in de database; die plakken we er ongewijzigd in.
  const inz = inzendingen.results
    .map((r) => `{"vragenlijst_id":${Number(r.vragenlijst_id)},"datum":${JSON.stringify(r.datum)},"antwoorden":${r.antwoorden}}`)
    .join(',');
  return new Response(`${kop.slice(0, -1)},"inzendingen":[${inz}]}`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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
  return bestand('\uFEFF' + tekst.replace(/\r?\n/g, '\r\n'), `${slug(o.bedrijfsnaam)}-stukken-${vandaagNL()}.txt`, 'text/plain; charset=utf-8');
}


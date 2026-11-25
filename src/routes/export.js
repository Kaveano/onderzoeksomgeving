// Exporteren: antwoorden als CSV, stukken als tekstbestand, alles samen als JSON.

import { Fout, bestand } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { haalOnderzoek, vandaagNL } from '../lib/db.js';
import { slug, maakCsv } from '../lib/export-hulp.js';
import { SCHALEN, WEET_NIET, INVOERSOORTEN, STUKSOORTEN, ACTIESTATUSSEN } from '../lib/schalen.js';

async function laadAlles(env, onderzoekId) {
  const [themas, meetpunten, meetmomenten, lijsten, vragen, inzendingen, invoer, stukken, acties] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare(
      'SELECT m.* FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY m.volgorde, m.id',
    ).bind(onderzoekId),
    env.DB.prepare("SELECT * FROM meetmomenten WHERE onderzoek_id = ? ORDER BY COALESCE(datum, '9999-12-31'), volgorde, id").bind(onderzoekId),
    env.DB.prepare('SELECT * FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id').bind(onderzoekId),
    env.DB.prepare(
      `SELECT q.* FROM vragen q JOIN vragenlijsten vl ON vl.id = q.vragenlijst_id JOIN themas t ON t.id = q.thema_id
       WHERE vl.onderzoek_id = ? ORDER BY t.volgorde, t.id, q.volgorde, q.id`,
    ).bind(onderzoekId),
    env.DB.prepare(
      'SELECT i.* FROM inzendingen i JOIN vragenlijsten vl ON vl.id = i.vragenlijst_id WHERE vl.onderzoek_id = ? ORDER BY i.id',
    ).bind(onderzoekId),
    env.DB.prepare('SELECT * FROM eigen_invoer WHERE onderzoek_id = ? ORDER BY datum, id').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM stukken WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare('SELECT * FROM acties WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
  ]);
  return {
    themas: themas.results,
    meetpunten: meetpunten.results,
    meetmomenten: meetmomenten.results,
    lijsten: lijsten.results,
    vragen: vragen.results.map((q) => ({ ...q, opties: JSON.parse(q.opties || '[]') })),
    inzendingen: inzendingen.results.map((i) => {
      let a = {};
      try {
        a = JSON.parse(i.antwoorden);
      } catch {
        /* overslaan */
      }
      return { ...i, antwoorden: a };
    }),
    invoer: invoer.results,
    stukken: stukken.results,
    acties: acties.results,
  };
}

/** Antwoord leesbaar maken voor CSV. */
function antwoordTekst(q, a) {
  if (a === undefined || a === null) return '';
  if (q.type === 'schaal') return a === WEET_NIET ? 'weet niet / n.v.t.' : a;
  if (q.type === 'janee') return a;
  if (q.type === 'meerkeuze') {
    const labels = new Map(q.opties.map((o) => [o.id, o.label]));
    const keuzes = Array.isArray(a) ? a : [a];
    return keuzes.map((k) => labels.get(k) || '(verwijderde optie)').join(' | ');
  }
  return String(a);
}

function bestandsnaam(o, deel, extensie) {
  return `${slug(o.bedrijfsnaam)}-${deel}-${vandaagNL()}.${extensie}`;
}

/** CSV met antwoorden. ?vragenlijst=<id> = één rij per respondent; zonder = alle antwoorden onder elkaar. */
export async function antwoordenCsv({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const o = await haalOnderzoek(env, onderzoekId);
  const d = await laadAlles(env, onderzoekId);
  const themaNaam = new Map(d.themas.map((t) => [t.id, t.naam]));
  const meetpuntNaam = new Map(d.meetpunten.map((m) => [m.id, m.naam]));
  const mmNaam = new Map(d.meetmomenten.map((m) => [m.id, m.naam]));
  const vlParam = new URL(request.url).searchParams.get('vragenlijst');

  if (vlParam) {
    const vlId = v.id(vlParam, 'vragenlijst');
    const vl = d.lijsten.find((l) => l.id === vlId);
    if (!vl) throw new Fout(404, 'Deze vragenlijst hoort niet bij dit onderzoek.');
    const vragen = d.vragen.filter((q) => q.vragenlijst_id === vlId);
    const inz = d.inzendingen.filter((i) => i.vragenlijst_id === vlId);
    const kop = ['Respondent', 'Datum', ...vragen.map((q) => `${themaNaam.get(q.thema_id)} – ${q.tekst}`)];
    const rijen = inz.map((i, n) => [n + 1, i.datum, ...vragen.map((q) => antwoordTekst(q, i.antwoorden[q.id]))]);
    return bestand(maakCsv([kop, ...rijen]), bestandsnaam(o, `antwoorden-${slug(vl.titel)}`, 'csv'), 'text/csv; charset=utf-8');
  }

  const kop = ['Vragenlijst', 'Meetmoment', 'Respondent', 'Datum', 'Thema', 'Meetpunt', 'Vraag', 'Vraagtype', 'Antwoord', 'Score (1-5)'];
  const rijen = [];
  for (const vl of d.lijsten) {
    const vragen = d.vragen.filter((q) => q.vragenlijst_id === vl.id);
    const inz = d.inzendingen.filter((i) => i.vragenlijst_id === vl.id);
    inz.forEach((i, n) => {
      for (const q of vragen) {
        const a = i.antwoorden[q.id];
        if (a === undefined) continue;
        rijen.push([
          vl.titel,
          mmNaam.get(vl.meetmoment_id) || '',
          n + 1,
          i.datum,
          themaNaam.get(q.thema_id),
          meetpuntNaam.get(q.meetpunt_id) || '',
          q.tekst,
          q.type,
          antwoordTekst(q, a),
          q.type === 'schaal' && Number.isInteger(a) ? a : null,
        ]);
      }
    });
  }
  return bestand(maakCsv([kop, ...rijen]), bestandsnaam(o, 'alle-antwoorden', 'csv'), 'text/csv; charset=utf-8');
}

export async function invoerCsv({ env, params }) {
  const onderzoekId = v.id(params.id);
  const o = await haalOnderzoek(env, onderzoekId);
  const d = await laadAlles(env, onderzoekId);
  const themaNaam = new Map(d.themas.map((t) => [t.id, t.naam]));
  const meetpuntNaam = new Map(d.meetpunten.map((m) => [m.id, m.naam]));
  const mmNaam = new Map(d.meetmomenten.map((m) => [m.id, m.naam]));
  const kop = ['Datum', 'Soort', 'Thema', 'Meetpunt', 'Meetmoment', 'Titel', 'Waarde', 'Eenheid', 'Tekst'];
  const rijen = d.invoer.map((e) => [
    e.datum,
    INVOERSOORTEN[e.soort] || e.soort,
    themaNaam.get(e.thema_id),
    meetpuntNaam.get(e.meetpunt_id) || '',
    mmNaam.get(e.meetmoment_id) || '',
    e.titel,
    e.waarde,
    e.eenheid,
    e.tekst,
  ]);
  return bestand(maakCsv([kop, ...rijen]), bestandsnaam(o, 'eigen-invoer', 'csv'), 'text/csv; charset=utf-8');
}

export async function stukkenTxt({ env, params }) {
  const onderzoekId = v.id(params.id);
  const o = await haalOnderzoek(env, onderzoekId);
  const d = await laadAlles(env, onderzoekId);
  const streep = '='.repeat(60);
  let tekst =
    `Onderzoek: ${o.titel}\nBedrijf: ${o.bedrijfsnaam}\nOnderzoeksvraag: ${o.onderzoeksvraag || '-'}\n` +
    `Geëxporteerd op: ${vandaagNL()}\n\n`;
  for (const s of d.stukken) {
    tekst += `${streep}\n${s.titel} (${STUKSOORTEN[s.soort] || s.soort}, laatst bijgewerkt ${s.bijgewerkt_op.slice(0, 10)})\n${streep}\n\n${s.inhoud.trim()}\n\n`;
  }
  if (d.acties.length) {
    tekst += `${streep}\nActielijst\n${streep}\n\n`;
    for (const a of d.acties) {
      tekst += `- [${ACTIESTATUSSEN[a.status]}] ${a.titel}${a.datum ? ` (${a.datum})` : ''}${a.notitie ? `\n  ${a.notitie}` : ''}\n`;
    }
  }
  return bestand('﻿' + tekst.replace(/\r?\n/g, '\r\n'), bestandsnaam(o, 'stukken', 'txt'), 'text/plain; charset=utf-8');
}

export async function volledigJson({ env, params }) {
  const onderzoekId = v.id(params.id);
  const o = await haalOnderzoek(env, onderzoekId);
  const d = await laadAlles(env, onderzoekId);
  const data = {
    export: {
      versie: 1,
      bron: 'Onderzoeksomgeving',
      geexporteerd_op: new Date().toISOString(),
      toelichting: 'Volledige export van één onderzoek. Antwoorden zijn anoniem; schaalantwoorden zijn 1 t/m 5 of "weet_niet".',
    },
    schalen: SCHALEN,
    onderzoek: o,
    themas: d.themas.map((t) => ({ ...t, meetpunten: d.meetpunten.filter((m) => m.thema_id === t.id) })),
    meetmomenten: d.meetmomenten,
    vragenlijsten: d.lijsten.map((l) => ({
      ...l,
      vragen: d.vragen.filter((q) => q.vragenlijst_id === l.id).map((q) => ({
        ...q,
        meerdere_antwoorden: !!q.meerdere_antwoorden,
        verplicht: !!q.verplicht,
        weet_niet: !!q.weet_niet,
        uitsplitsen: !!q.uitsplitsen,
      })),
      inzendingen: d.inzendingen
        .filter((i) => i.vragenlijst_id === l.id)
        .map((i, n) => ({ respondent: n + 1, datum: i.datum, antwoorden: i.antwoorden })),
    })),
    eigen_invoer: d.invoer,
    stukken: d.stukken,
    acties: d.acties,
  };
  return bestand(JSON.stringify(data, null, 2), bestandsnaam(o, 'volledig', 'json'), 'application/json; charset=utf-8');
}

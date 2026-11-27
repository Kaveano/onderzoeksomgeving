// Vragenlijsten en vragen beheren.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, haalBewerkbaarOnderzoek, bewerkbaarVia, nuIso, volgendeVolgorde } from '../lib/db.js';
import { willekeurigeCode } from '../lib/auth.js';
import { standaardIntro, STANDAARD_BEDANKT, optiesMetIds, vervang } from '../lib/sjabloon-toepassen.js';
import { SCHALEN, VRAAGTYPEN, CIJFERSCHALEN } from '../lib/schalen.js';
import { KENMERKEN, KENMERKVRAGEN, KENMERK_THEMA, KENMERK_TOELICHTING, magKenmerk } from '../../public/js/beheer/kenmerken.js';

const MAX_VRAGEN = 100;

// Vaste meldingen bij achtergrondkenmerken en cijfervragen (BOUWPLAN §4 P2).
export const FOUT_KENMERK = 'Kies een geldig kenmerk.';
export const FOUT_KENMERK_SOORT = 'Een kenmerk kan alleen bij een meerkeuzevraag met één antwoord of bij een ja/nee-vraag.';
export const FOUT_CIJFERSCHAAL = 'Deze vragenlijst heeft al antwoorden. De cijferschaal kan daarom niet meer veranderen.';
export const kenmerkDubbel = (sleutels) => (sleutels.length === 1
  ? `Deze vragenlijst heeft al een vraag met het kenmerk ${KENMERKEN[sleutels[0]].naam}.`
  : `Deze vragenlijst heeft al vragen met de kenmerken ${sleutels.map((k) => KENMERKEN[k].naam).join(', ').replace(/, ([^,]*)$/, ' en $1')}.`);

/** Controleert een kenmerk ('' = geen) voor een vraag met deze velden. */
export function controleerKenmerk(waarde, f) {
  if (waarde === undefined || waarde === null || waarde === '') return '';
  if (typeof waarde !== 'string' || !Object.hasOwn(KENMERKEN, waarde)) throw new Fout(400, FOUT_KENMERK);
  if (!magKenmerk(f)) throw new Fout(400, FOUT_KENMERK_SOORT);
  return waarde;
}

/** 409 als een andere vraag van de vragenlijst dit kenmerk al heeft (behalve 'overig', dat mag vaker). */
async function controleerKenmerkUniek(env, vragenlijstId, kenmerk, vraagId = 0) {
  if (!kenmerk || KENMERKEN[kenmerk].meerdere) return;
  const ander = await een(env, 'SELECT id FROM vragen WHERE vragenlijst_id = ? AND kenmerk = ? AND id <> ?', vragenlijstId, kenmerk, vraagId);
  if (ander) throw new Fout(409, kenmerkDubbel([kenmerk]));
}

function vraagUitDb(r) {
  return {
    ...r,
    opties: JSON.parse(r.opties || '[]'),
    meerdere_antwoorden: !!r.meerdere_antwoorden,
    verplicht: !!r.verplicht,
    weet_niet: !!r.weet_niet,
    uitsplitsen: !!r.uitsplitsen,
  };
}

async function meetmomentVanOnderzoek(env, meetmomentId, onderzoekId) {
  if (!meetmomentId) return null;
  const mm = await een(env, 'SELECT onderzoek_id FROM meetmomenten WHERE id = ?', meetmomentId);
  if (!mm || mm.onderzoek_id !== onderzoekId) throw new Fout(400, 'Het gekozen meetmoment hoort niet bij dit onderzoek.');
  return meetmomentId;
}

// ---- Vragenlijsten ----

export async function lijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const rijen = await alle(
    env,
    `SELECT vl.id, vl.titel, vl.status, vl.code, vl.meetmoment_id, vl.aantal_uitgenodigd, vl.max_inzendingen, vl.aangemaakt_op, vl.uitnodiging,
       mm.naam AS meetmoment_naam, mm.datum AS meetmoment_datum,
       (SELECT COUNT(*) FROM vragen q WHERE q.vragenlijst_id = vl.id) AS aantal_vragen,
       (SELECT COUNT(*) FROM inzendingen i WHERE i.vragenlijst_id = vl.id) AS aantal_inzendingen
     FROM vragenlijsten vl LEFT JOIN meetmomenten mm ON mm.id = vl.meetmoment_id
     WHERE vl.onderzoek_id = ?
     ORDER BY mm.volgorde IS NULL, mm.volgorde, vl.id`,
    onderzoekId,
  );
  return json({ vragenlijsten: rijen.map((r) => ({ ...r, uitnodiging: leesUitnodiging(r.uitnodiging) })) });
}

function leesUitnodiging(ruw) {
  try {
    const u = JSON.parse(ruw || '{}');
    return u && typeof u === 'object' && !Array.isArray(u) ? u : {};
  } catch {
    return {};
  }
}

/** Bewaart de (zelf aan te passen) tekst van de uitnodiging en de herinnering. Geen e-mailadressen. */
export async function uitnodiging({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'vragenlijst', id);
  const body = await leesJson(request, 40_000);
  const u = {
    onderwerp: v.tekst(body.onderwerp, 'Onderwerp', { max: 200 }),
    tekst: v.langeTekst(body.tekst, 'Tekst van de uitnodiging', { max: 5000 }),
    herinnering_onderwerp: v.tekst(body.herinnering_onderwerp, 'Onderwerp van de herinnering', { max: 200 }),
    herinnering_tekst: v.langeTekst(body.herinnering_tekst, 'Tekst van de herinnering', { max: 5000 }),
  };
  await env.DB.prepare('UPDATE vragenlijsten SET uitnodiging = ? WHERE id = ?').bind(JSON.stringify(u), id).run();
  return json({ ok: true });
}

export async function nieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const o = await haalBewerkbaarOnderzoek(env, onderzoekId);
  const body = await leesJson(request);
  const titel = v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 });
  const meetmomentId = await meetmomentVanOnderzoek(env, v.optioneelId(body.meetmoment_id, 'meetmoment'), onderzoekId);
  const rij = await env.DB.prepare(
    `INSERT INTO vragenlijsten (onderzoek_id, meetmoment_id, titel, introtekst, bedanktekst, code, status, aangemaakt_op)
     VALUES (?, ?, ?, ?, ?, ?, 'gesloten', ?) RETURNING id`,
  ).bind(onderzoekId, meetmomentId, titel, standaardIntro(o.bedrijfsnaam), STANDAARD_BEDANKT, willekeurigeCode(16), nuIso()).first();
  return json({ id: rij.id }, 201);
}

export async function detail({ env, params }) {
  const id = v.id(params.id);
  const vl = await een(env, 'SELECT * FROM vragenlijsten WHERE id = ?', id);
  if (!vl) throw new Fout(404, 'Deze vragenlijst bestaat niet (meer).');
  const o = await haalOnderzoek(env, vl.onderzoek_id);
  const [vragen, telling] = await env.DB.batch([
    env.DB.prepare(
      `SELECT q.* FROM vragen q JOIN themas t ON t.id = q.thema_id
       WHERE q.vragenlijst_id = ? ORDER BY t.volgorde, t.id, q.volgorde, q.id`,
    ).bind(id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM inzendingen WHERE vragenlijst_id = ?').bind(id),
  ]);
  return json({
    vragenlijst: vl,
    onderzoek: { id: o.id, bedrijfsnaam: o.bedrijfsnaam, titel: o.titel, status: o.status },
    vragen: vragen.results.map(vraagUitDb),
    aantal_inzendingen: telling.results[0].n,
  });
}

export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vragenlijst', id);
  const body = await leesJson(request);
  const f = {
    titel: v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 }),
    introtekst: v.tekst(body.introtekst, 'Uitleg voor respondenten', { max: 5000 }),
    bedanktekst: v.tekst(body.bedanktekst, 'Bedanktekst', { max: 2000 }),
    meetmoment_id: await meetmomentVanOnderzoek(env, v.optioneelId(body.meetmoment_id, 'meetmoment'), o.id),
    aantal_uitgenodigd: v.geheelGetal(body.aantal_uitgenodigd, 'Aantal uitgenodigden', { min: 1, max: 1_000_000 }),
    max_inzendingen: v.geheelGetal(body.max_inzendingen, 'Maximum aantal inzendingen', { min: 1, max: 1_000_000 }),
    status: v.keuze(body.status, 'Status', ['open', 'gesloten'], { standaard: 'gesloten' }),
  };
  if (f.status === 'open') {
    const tel = await een(env, 'SELECT COUNT(*) AS n FROM vragen WHERE vragenlijst_id = ?', id);
    if (!tel.n) throw new Fout(409, 'Voeg eerst minimaal één vraag toe voordat je de vragenlijst openzet.');
  }
  await env.DB.prepare(
    `UPDATE vragenlijsten SET titel = ?, introtekst = ?, bedanktekst = ?, meetmoment_id = ?,
       aantal_uitgenodigd = ?, max_inzendingen = ?, status = ? WHERE id = ?`,
  ).bind(f.titel, f.introtekst, f.bedanktekst, f.meetmoment_id, f.aantal_uitgenodigd, f.max_inzendingen, f.status, id).run();
  return json({ ok: true });
}

export async function status({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'vragenlijst', id);
  const body = await leesJson(request);
  const nieuw = v.keuze(body.status, 'Status', ['open', 'gesloten']);
  if (nieuw === 'open') {
    const tel = await een(env, 'SELECT COUNT(*) AS n FROM vragen WHERE vragenlijst_id = ?', id);
    if (!tel.n) throw new Fout(409, 'Voeg eerst minimaal één vraag toe voordat je de vragenlijst openzet.');
  }
  await env.DB.prepare('UPDATE vragenlijsten SET status = ? WHERE id = ?').bind(nieuw, id).run();
  return json({ ok: true, status: nieuw });
}

export async function verwijder({ request, env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'vragenlijst', id);
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM inzendingen WHERE vragenlijst_id = ?', id);
  const bevestigd = new URL(request.url).searchParams.get('bevestig') === '1';
  if (tel.n && !bevestigd) {
    throw new Fout(409, `Deze vragenlijst heeft al ${tel.n} ingevulde ${tel.n === 1 ? 'vragenlijst' : 'vragenlijsten'}. Bevestig dat je die ook wilt verwijderen.`, { aantal_inzendingen: tel.n });
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM inzendingen WHERE vragenlijst_id = ?').bind(id),
    env.DB.prepare('DELETE FROM inzendteller WHERE vragenlijst_id = ?').bind(id),
    env.DB.prepare('DELETE FROM vragen WHERE vragenlijst_id = ?').bind(id),
    env.DB.prepare('DELETE FROM vragenlijsten WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

/** Wist alle antwoorden (bijv. testantwoorden) maar laat de vragenlijst staan. */
export async function wisInzendingen({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'vragenlijst', id);
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM inzendingen WHERE vragenlijst_id = ?').bind(id),
    env.DB.prepare('DELETE FROM inzendteller WHERE vragenlijst_id = ?').bind(id),
  ]);
  return json({ ok: true, verwijderd: res[0].meta.changes });
}

export async function nieuweCode({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'vragenlijst', id);
  const code = willekeurigeCode(16);
  await env.DB.prepare('UPDATE vragenlijsten SET code = ? WHERE id = ?').bind(code, id).run();
  return json({ ok: true, code });
}

/** Kopie voor een volgend meetmoment; vragen blijven gekoppeld voor vergelijking. */
export async function kopie({ request, env, params }) {
  const id = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vragenlijst', id);
  const body = await leesJson(request);
  const titel = v.tekst(body.titel, 'Titel', { verplicht: true, max: 200 });
  const meetmomentId = await meetmomentVanOnderzoek(env, v.optioneelId(body.meetmoment_id, 'meetmoment'), o.id);
  const bron = await een(env, 'SELECT * FROM vragenlijsten WHERE id = ?', id);
  const vragen = await alle(env, 'SELECT * FROM vragen WHERE vragenlijst_id = ? ORDER BY volgorde, id', id);

  const nieuw = await env.DB.prepare(
    `INSERT INTO vragenlijsten (onderzoek_id, meetmoment_id, titel, introtekst, bedanktekst, code, status,
       aantal_uitgenodigd, max_inzendingen, aangemaakt_op)
     VALUES (?, ?, ?, ?, ?, ?, 'gesloten', ?, ?, ?) RETURNING id`,
  ).bind(o.id, meetmomentId, titel, bron.introtekst, bron.bedanktekst, willekeurigeCode(16),
    bron.aantal_uitgenodigd, bron.max_inzendingen, nuIso()).first();

  if (vragen.length) {
    await env.DB.batch(
      vragen.map((q) =>
        env.DB.prepare(
          `INSERT INTO vragen (vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
             meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, bron_vraag_id, volgorde, kenmerk)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(nieuw.id, q.thema_id, q.meetpunt_id, q.type, q.tekst, q.toelichting, q.opties, q.schaal_soort,
          q.meerdere_antwoorden, q.verplicht, q.weet_niet, q.uitsplitsen, q.bron_vraag_id || q.id, q.volgorde, q.kenmerk || ''),
      ),
    );
  }
  return json({ id: nieuw.id }, 201);
}

// ---- Vragen ----

/** Controleert en normaliseert meerkeuze-opties; behoudt bestaande id's. */
function controleerOpties(ruw) {
  if (!Array.isArray(ruw)) throw new Fout(400, 'Geef de antwoordmogelijkheden op als lijst.');
  const opties = [];
  const ids = new Set();
  for (const o of ruw) {
    const label = v.tekst(typeof o === 'string' ? o : o && o.label, 'Antwoordmogelijkheid', { max: 200 });
    if (!label) continue;
    let oid = typeof o === 'object' && o && typeof o.id === 'string' && /^o[a-z0-9]{1,12}$/.test(o.id) ? o.id : null;
    if (oid && ids.has(oid)) oid = null;
    opties.push({ id: oid, label });
    if (oid) ids.add(oid);
  }
  if (opties.length < 2) throw new Fout(400, 'Geef minimaal twee antwoordmogelijkheden op.');
  if (opties.length > 30) throw new Fout(400, 'Maximaal 30 antwoordmogelijkheden.');
  const labels = new Set();
  for (const o of opties) {
    if (labels.has(o.label.toLowerCase())) throw new Fout(400, `De antwoordmogelijkheid "${o.label}" staat er dubbel in.`);
    labels.add(o.label.toLowerCase());
  }
  // Nieuwe opties krijgen een willekeurig id, zodat een id nooit opnieuw wordt gebruikt
  // (anders zouden oude antwoorden op een verwijderde optie bij een nieuwe optie gaan horen).
  for (const o of opties) {
    if (!o.id) {
      do {
        o.id = `o${[...crypto.getRandomValues(new Uint8Array(6))].map((b) => (b % 36).toString(36)).join('')}`;
      } while (ids.has(o.id));
      ids.add(o.id);
    }
  }
  return opties;
}

async function vraagVelden(env, body, onderzoekId) {
  const themaId = v.id(body.thema_id, 'thema');
  const thema = await een(env, 'SELECT onderzoek_id FROM themas WHERE id = ?', themaId);
  const meetpuntId = v.optioneelId(body.meetpunt_id, 'meetpunt');
  const mp = meetpuntId ? await een(env, 'SELECT thema_id FROM meetpunten WHERE id = ?', meetpuntId) : null;
  return vraagVeldenUit(
    body,
    new Set(thema && thema.onderzoek_id === onderzoekId ? [themaId] : []),
    new Map(mp ? [[meetpuntId, mp.thema_id]] : []),
  );
}

/**
 * Controleert de velden van één vraag. themaIds: de thema's van het onderzoek;
 * meetpuntThema: per meetpunt-id het thema waar het bij hoort. Doet zelf geen databaseverzoeken,
 * zodat ook een hele reeks vragen (inlezen uit Excel) in één keer te controleren is.
 */
export function vraagVeldenUit(body, themaIds, meetpuntThema) {
  const type = v.keuze(body.type, 'Vraagtype', Object.keys(VRAAGTYPEN));
  const themaId = v.id(body.thema_id, 'thema');
  if (!themaIds.has(themaId)) throw new Fout(400, 'Kies een thema van dit onderzoek.');
  const meetpuntId = v.optioneelId(body.meetpunt_id, 'meetpunt');
  if (meetpuntId && meetpuntThema.get(meetpuntId) !== themaId) throw new Fout(400, 'Het gekozen meetpunt hoort niet bij het gekozen thema.');
  const meerdere = type === 'meerkeuze' ? v.vlag(body.meerdere_antwoorden) : 0;
  const uitsplitsen = (type === 'meerkeuze' && !meerdere) || type === 'janee' ? v.vlag(body.uitsplitsen) : 0;
  // schaal: eens|tevreden|frequentie|kwaliteit; cijfer: nps (0 tot 10) of rapport (1 tot 10); anders 'eens'.
  let schaalSoort = 'eens';
  if (type === 'schaal') schaalSoort = v.keuze(body.schaal_soort, 'Schaal', Object.keys(SCHALEN), { standaard: 'eens' });
  if (type === 'cijfer') schaalSoort = v.keuze(body.schaal_soort, 'Cijferschaal', Object.keys(CIJFERSCHALEN), { standaard: 'rapport' });
  return {
    type,
    thema_id: themaId,
    meetpunt_id: meetpuntId,
    tekst: v.tekst(body.tekst, 'Vraag', { verplicht: true, max: 1000 }),
    toelichting: v.tekst(body.toelichting, 'Toelichting', { max: 1000 }),
    opties: type === 'meerkeuze' ? controleerOpties(body.opties) : [],
    schaal_soort: schaalSoort,
    meerdere_antwoorden: meerdere,
    verplicht: v.vlag(body.verplicht),
    weet_niet: type === 'schaal' || type === 'cijfer' ? v.vlag(body.weet_niet) : 0,
    uitsplitsen,
    kenmerk: controleerKenmerk(body.kenmerk, { type, meerdere_antwoorden: meerdere }),
  };
}

export async function vraagNieuw({ request, env, params }) {
  const vragenlijstId = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vragenlijst', vragenlijstId);
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM vragen WHERE vragenlijst_id = ?', vragenlijstId);
  if (tel.n >= MAX_VRAGEN) throw new Fout(409, `Een vragenlijst kan maximaal ${MAX_VRAGEN} vragen bevatten.`);
  const f = await vraagVelden(env, await leesJson(request), o.id);
  await controleerKenmerkUniek(env, vragenlijstId, f.kenmerk);
  const volgorde = await volgendeVolgorde(env, 'vragen', 'vragenlijst_id', vragenlijstId);
  const rij = await env.DB.prepare(
    `INSERT INTO vragen (vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
       meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, volgorde, kenmerk)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(vragenlijstId, f.thema_id, f.meetpunt_id, f.type, f.tekst, f.toelichting, JSON.stringify(f.opties),
    f.schaal_soort, f.meerdere_antwoorden, f.verplicht, f.weet_niet, f.uitsplitsen, volgorde, f.kenmerk).first();
  return json({ id: rij.id }, 201);
}

export async function vraagWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vraag', id);
  const huidig = await een(env, 'SELECT * FROM vragen WHERE id = ?', id);
  const body = await leesJson(request);
  // Zonder het veld kenmerk (een ouder scherm) blijft het kenmerk staan, zolang de vraag het nog mag hebben.
  if (body.kenmerk === undefined) {
    body.kenmerk = huidig.kenmerk && magKenmerk({ type: body.type, meerdere_antwoorden: body.type === 'meerkeuze' && v.vlag(body.meerdere_antwoorden) })
      ? huidig.kenmerk : '';
  }
  const f = await vraagVelden(env, body, o.id);
  await controleerKenmerkUniek(env, huidig.vragenlijst_id, f.kenmerk, id);
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM inzendingen WHERE vragenlijst_id = ?', huidig.vragenlijst_id);
  if (tel.n > 0) {
    if (f.type !== huidig.type) {
      throw new Fout(409, 'Deze vragenlijst heeft al antwoorden. Het vraagtype kan daarom niet meer veranderen; maak zo nodig een nieuwe vraag.');
    }
    if (f.meerdere_antwoorden !== huidig.meerdere_antwoorden) {
      throw new Fout(409, 'Deze vragenlijst heeft al antwoorden. Je kunt niet meer wisselen tussen één en meerdere antwoorden.');
    }
    // Van 0–10 naar 1–10 (of andersom) zou bewaarde antwoorden ongeldig maken of anders laten lezen.
    if (f.type === 'cijfer' && f.schaal_soort !== huidig.schaal_soort) throw new Fout(409, FOUT_CIJFERSCHAAL);
  }
  await env.DB.prepare(
    `UPDATE vragen SET thema_id = ?, meetpunt_id = ?, type = ?, tekst = ?, toelichting = ?, opties = ?, schaal_soort = ?,
       meerdere_antwoorden = ?, verplicht = ?, weet_niet = ?, uitsplitsen = ?, kenmerk = ? WHERE id = ?`,
  ).bind(f.thema_id, f.meetpunt_id, f.type, f.tekst, f.toelichting, JSON.stringify(f.opties), f.schaal_soort,
    f.meerdere_antwoorden, f.verplicht, f.weet_niet, f.uitsplitsen, f.kenmerk, id).run();
  return json({ ok: true });
}

export async function vraagVerwijder({ env, params }) {
  const id = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vraag', id);
  const vraag = await een(env, 'SELECT vragenlijst_id FROM vragen WHERE id = ?', id);
  // Een open vragenlijst zonder vragen werkt niet voor respondenten: dan gaat hij dicht.
  // Codes en citaten bij de antwoorden op deze vraag gaan mee weg (vraag_id heeft bewust geen verwijzing).
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM vragen WHERE id = ?').bind(id),
    env.DB.prepare(
      "UPDATE vragenlijsten SET status = 'gesloten' WHERE id = ? AND status = 'open' AND NOT EXISTS (SELECT 1 FROM vragen WHERE vragenlijst_id = ?)",
    ).bind(vraag.vragenlijst_id, vraag.vragenlijst_id),
    env.DB.prepare('DELETE FROM coderingen WHERE onderzoek_id = ? AND vraag_id = ?').bind(o.id, id),
    env.DB.prepare('DELETE FROM citaten WHERE onderzoek_id = ? AND vraag_id = ?').bind(o.id, id),
  ]);
  return json({ ok: true, vragenlijst_gesloten: res[1].meta.changes > 0 });
}


// ---- Achtergrondkenmerken (BOUWPLAN §3.12, D1 §3.4) ----

const MAX_KENMERKVRAGEN = Object.keys(KENMERKVRAGEN).length;

const FOUT_GEARCHIVEERD = 'Dit onderzoek is gearchiveerd en kan niet meer worden gewijzigd.';

/**
 * Voegt standaard achtergrondvragen toe ("Achtergrondvragen toevoegen"). Body: { kenmerken: [{ kenmerk, variant? }] }.
 * De vragen komen in het thema Achtergrond (dat wordt zo nodig aangemaakt), met uitsplitsen aan en het kenmerk
 * erbij. Gratis laag (FT-02): één leesopdracht (onderzoek, aantal vragen, aanwezige kenmerken en het thema samen) en
 * één batch om te schrijven.
 */
export async function kenmerkVragen({ request, env, params }) {
  const vragenlijstId = v.id(params.id);
  const o = await een(env,
    `SELECT o.id, o.status, o.bedrijfsnaam,
       (SELECT COUNT(*) FROM vragen WHERE vragenlijst_id = vl.id) AS n,
       (SELECT COALESCE(MAX(volgorde), 0) FROM vragen WHERE vragenlijst_id = vl.id) AS laatste,
       (SELECT group_concat(DISTINCT kenmerk) FROM vragen WHERE vragenlijst_id = vl.id AND kenmerk <> '') AS kenmerken,
       (SELECT id FROM themas WHERE onderzoek_id = o.id AND lower(trim(naam)) = lower(?) ORDER BY id LIMIT 1) AS thema_id,
       (SELECT COALESCE(MAX(volgorde), 0) FROM themas WHERE onderzoek_id = o.id) AS thema_laatste
     FROM vragenlijsten vl JOIN onderzoeken o ON o.id = vl.onderzoek_id WHERE vl.id = ?`,
    KENMERK_THEMA, vragenlijstId);
  if (!o) throw new Fout(404, 'Deze vragenlijst bestaat niet (meer).');
  if (o.status === 'gearchiveerd') throw new Fout(409, FOUT_GEARCHIVEERD);
  const body = await leesJson(request, 10_000);
  const ruw = body && body.kenmerken;
  if (!Array.isArray(ruw) || !ruw.length) throw new Fout(400, 'Kies minstens één achtergrondvraag.');
  if (ruw.length > MAX_KENMERKVRAGEN) throw new Fout(400, `Kies hooguit ${MAX_KENMERKVRAGEN} achtergrondvragen.`);
  const gekozen = [];
  for (const item of ruw) {
    const sleutel = item && typeof item === 'object' ? item.kenmerk : item;
    if (typeof sleutel !== 'string' || !Object.hasOwn(KENMERKVRAGEN, sleutel)) throw new Fout(400, FOUT_KENMERK);
    if (gekozen.some((g) => g.sleutel === sleutel)) continue;
    const bron = KENMERKVRAGEN[sleutel];
    let opties = bron.opties;
    if (bron.varianten) {
      const variant = item && typeof item === 'object' && item.variant !== undefined ? item.variant : bron.standaard;
      if (typeof variant !== 'string' || !Object.hasOwn(bron.varianten, variant)) throw new Fout(400, 'Kies een geldige indeling van de groepen.');
      opties = bron.varianten[variant];
    }
    gekozen.push({ sleutel, bron, opties });
  }

  const al = new Set(String(o.kenmerken || '').split(',').filter(Boolean));
  const dubbel = gekozen.filter((g) => al.has(g.sleutel)).map((g) => g.sleutel);
  if (dubbel.length) throw new Fout(409, kenmerkDubbel(dubbel));
  const { n, laatste } = o;
  if (n + gekozen.length > MAX_VRAGEN) {
    throw new Fout(409, `Een vragenlijst kan maximaal ${MAX_VRAGEN} vragen bevatten. Er staan er al ${n}; je kunt er nog ${Math.max(0, MAX_VRAGEN - n)} toevoegen.`);
  }

  const thema = o.thema_id ? { id: o.thema_id } : null;
  const opdrachten = [];
  if (!thema) {
    const volgorde = (o.thema_laatste || 0) + 1;
    opdrachten.push(env.DB.prepare('INSERT INTO themas (onderzoek_id, naam, omschrijving, volgorde) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(o.id, KENMERK_THEMA, 'Algemene vragen om de resultaten per groep te kunnen bekijken (alleen bij minimaal 5 respondenten per groep).', volgorde));
  }
  // Een thema dat in dezelfde batch wordt aangemaakt heeft nog geen id; dan zoekt de database het op naam op.
  const THEMA_ID = 'COALESCE(?, (SELECT id FROM themas WHERE onderzoek_id = ? AND naam = ? ORDER BY id DESC LIMIT 1))';
  gekozen.forEach((g, i) => {
    opdrachten.push(env.DB.prepare(
      `INSERT INTO vragen (vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
         meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, volgorde, kenmerk)
       VALUES (?, ${THEMA_ID}, NULL, ?, ?, ?, ?, 'eens', 0, 0, 0, 1, ?, ?)`,
    ).bind(vragenlijstId, thema ? thema.id : null, o.id, KENMERK_THEMA, g.bron.type, vervang(g.bron.tekst, o.bedrijfsnaam).trim(),
      KENMERK_TOELICHTING, JSON.stringify(g.bron.type === 'meerkeuze' ? optiesMetIds(g.opties.map((x) => x.label)) : []),
      laatste + 1 + i, g.sleutel));
  });
  const res = await env.DB.batch(opdrachten);
  return json({ ok: true, aantal: gekozen.length, thema_id: thema ? thema.id : res[0].results[0].id }, 201);
}

/**
 * Zet het kenmerk van één vraag (of haalt het weg met ''). Mag ook als er al antwoorden zijn. Let op: haal je het
 * kenmerk weg bij een vraag zonder uitsplitsing, dan is de verdeling van die vraag niet meer beschermd (isBeschermd).
 * Gratis laag (FT-02): één leesopdracht (vraag en onderzoek samen) en één schrijfopdracht; de controle op een dubbel
 * kenmerk zit in de UPDATE zelf.
 */
export async function vraagKenmerk({ request, env, params }) {
  const id = v.id(params.id);
  const q = await een(env,
    `SELECT q.vragenlijst_id, q.type, q.meerdere_antwoorden, o.status AS onderzoek_status
     FROM vragen q JOIN vragenlijsten vl ON vl.id = q.vragenlijst_id JOIN onderzoeken o ON o.id = vl.onderzoek_id WHERE q.id = ?`, id);
  if (!q) throw new Fout(404, 'Deze vraag bestaat niet (meer).');
  if (q.onderzoek_status === 'gearchiveerd') throw new Fout(409, FOUT_GEARCHIVEERD);
  const body = await leesJson(request, 2_000);
  const kenmerk = controleerKenmerk(body.kenmerk ?? '', q);
  const uniek = !!kenmerk && !KENMERKEN[kenmerk].meerdere;
  const res = uniek
    ? await env.DB.prepare(
      'UPDATE vragen SET kenmerk = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM vragen WHERE vragenlijst_id = ? AND kenmerk = ? AND id <> ?)',
    ).bind(kenmerk, id, q.vragenlijst_id, kenmerk, id).run()
    : await env.DB.prepare('UPDATE vragen SET kenmerk = ? WHERE id = ?').bind(kenmerk, id).run();
  if (!res.meta?.changes) throw uniek ? new Fout(409, kenmerkDubbel([kenmerk])) : new Fout(404, 'Deze vraag bestaat niet (meer).');
  return json({ ok: true });
}

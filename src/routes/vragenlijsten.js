// Vragenlijsten en vragen beheren.

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, haalBewerkbaarOnderzoek, bewerkbaarVia, nuIso, volgendeVolgorde } from '../lib/db.js';
import { willekeurigeCode } from '../lib/auth.js';
import { standaardIntro, STANDAARD_BEDANKT } from '../lib/sjabloon-toepassen.js';
import { SCHALEN } from '../lib/schalen.js';

const MAX_VRAGEN = 100;

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
    `SELECT vl.id, vl.titel, vl.status, vl.code, vl.meetmoment_id, vl.aantal_uitgenodigd, vl.max_inzendingen, vl.aangemaakt_op,
       mm.naam AS meetmoment_naam, mm.datum AS meetmoment_datum,
       (SELECT COUNT(*) FROM vragen q WHERE q.vragenlijst_id = vl.id) AS aantal_vragen,
       (SELECT COUNT(*) FROM inzendingen i WHERE i.vragenlijst_id = vl.id) AS aantal_inzendingen
     FROM vragenlijsten vl LEFT JOIN meetmomenten mm ON mm.id = vl.meetmoment_id
     WHERE vl.onderzoek_id = ?
     ORDER BY mm.volgorde IS NULL, mm.volgorde, vl.id`,
    onderzoekId,
  );
  return json({ vragenlijsten: rijen });
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
             meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, bron_vraag_id, volgorde)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(nieuw.id, q.thema_id, q.meetpunt_id, q.type, q.tekst, q.toelichting, q.opties, q.schaal_soort,
          q.meerdere_antwoorden, q.verplicht, q.weet_niet, q.uitsplitsen, q.bron_vraag_id || q.id, q.volgorde),
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
  const type = v.keuze(body.type, 'Vraagtype', ['schaal', 'meerkeuze', 'janee', 'open']);
  const themaId = v.id(body.thema_id, 'thema');
  const thema = await een(env, 'SELECT onderzoek_id FROM themas WHERE id = ?', themaId);
  if (!thema || thema.onderzoek_id !== onderzoekId) throw new Fout(400, 'Kies een thema van dit onderzoek.');
  const meetpuntId = v.optioneelId(body.meetpunt_id, 'meetpunt');
  if (meetpuntId) {
    const mp = await een(env, 'SELECT thema_id FROM meetpunten WHERE id = ?', meetpuntId);
    if (!mp || mp.thema_id !== themaId) throw new Fout(400, 'Het gekozen meetpunt hoort niet bij het gekozen thema.');
  }
  const meerdere = type === 'meerkeuze' ? v.vlag(body.meerdere_antwoorden) : 0;
  const uitsplitsen = (type === 'meerkeuze' && !meerdere) || type === 'janee' ? v.vlag(body.uitsplitsen) : 0;
  return {
    type,
    thema_id: themaId,
    meetpunt_id: meetpuntId,
    tekst: v.tekst(body.tekst, 'Vraag', { verplicht: true, max: 1000 }),
    toelichting: v.tekst(body.toelichting, 'Toelichting', { max: 1000 }),
    opties: type === 'meerkeuze' ? controleerOpties(body.opties) : [],
    schaal_soort: type === 'schaal' ? v.keuze(body.schaal_soort, 'Schaal', Object.keys(SCHALEN), { standaard: 'eens' }) : 'eens',
    meerdere_antwoorden: meerdere,
    verplicht: v.vlag(body.verplicht),
    weet_niet: type === 'schaal' ? v.vlag(body.weet_niet) : 0,
    uitsplitsen,
  };
}

export async function vraagNieuw({ request, env, params }) {
  const vragenlijstId = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vragenlijst', vragenlijstId);
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM vragen WHERE vragenlijst_id = ?', vragenlijstId);
  if (tel.n >= MAX_VRAGEN) throw new Fout(409, `Een vragenlijst kan maximaal ${MAX_VRAGEN} vragen bevatten.`);
  const f = await vraagVelden(env, await leesJson(request), o.id);
  const volgorde = await volgendeVolgorde(env, 'vragen', 'vragenlijst_id', vragenlijstId);
  const rij = await env.DB.prepare(
    `INSERT INTO vragen (vragenlijst_id, thema_id, meetpunt_id, type, tekst, toelichting, opties, schaal_soort,
       meerdere_antwoorden, verplicht, weet_niet, uitsplitsen, volgorde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(vragenlijstId, f.thema_id, f.meetpunt_id, f.type, f.tekst, f.toelichting, JSON.stringify(f.opties),
    f.schaal_soort, f.meerdere_antwoorden, f.verplicht, f.weet_niet, f.uitsplitsen, volgorde).first();
  return json({ id: rij.id }, 201);
}

export async function vraagWijzig({ request, env, params }) {
  const id = v.id(params.id);
  const o = await bewerkbaarVia(env, 'vraag', id);
  const huidig = await een(env, 'SELECT * FROM vragen WHERE id = ?', id);
  const f = await vraagVelden(env, await leesJson(request), o.id);
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM inzendingen WHERE vragenlijst_id = ?', huidig.vragenlijst_id);
  if (tel.n > 0) {
    if (f.type !== huidig.type) {
      throw new Fout(409, 'Deze vragenlijst heeft al antwoorden. Het vraagtype kan daarom niet meer veranderen; maak zo nodig een nieuwe vraag.');
    }
    if (f.meerdere_antwoorden !== huidig.meerdere_antwoorden) {
      throw new Fout(409, 'Deze vragenlijst heeft al antwoorden. Je kunt niet meer wisselen tussen één en meerdere antwoorden.');
    }
  }
  await env.DB.prepare(
    `UPDATE vragen SET thema_id = ?, meetpunt_id = ?, type = ?, tekst = ?, toelichting = ?, opties = ?, schaal_soort = ?,
       meerdere_antwoorden = ?, verplicht = ?, weet_niet = ?, uitsplitsen = ? WHERE id = ?`,
  ).bind(f.thema_id, f.meetpunt_id, f.type, f.tekst, f.toelichting, JSON.stringify(f.opties), f.schaal_soort,
    f.meerdere_antwoorden, f.verplicht, f.weet_niet, f.uitsplitsen, id).run();
  return json({ ok: true });
}

export async function vraagVerwijder({ env, params }) {
  const id = v.id(params.id);
  await bewerkbaarVia(env, 'vraag', id);
  const vraag = await een(env, 'SELECT vragenlijst_id FROM vragen WHERE id = ?', id);
  // Een open vragenlijst zonder vragen werkt niet voor respondenten: dan gaat hij dicht.
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM vragen WHERE id = ?').bind(id),
    env.DB.prepare(
      "UPDATE vragenlijsten SET status = 'gesloten' WHERE id = ? AND status = 'open' AND NOT EXISTS (SELECT 1 FROM vragen WHERE vragenlijst_id = ?)",
    ).bind(vraag.vragenlijst_id, vraag.vragenlijst_id),
  ]);
  return json({ ok: true, vragenlijst_gesloten: res[1].meta.changes > 0 });
}


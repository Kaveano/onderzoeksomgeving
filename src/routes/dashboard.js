// Dashboard: respons, gemiddelden per thema, verdeling, verloop, eigen cijfers,
// open antwoorden en uitsplitsing.
//
// Deze route haalt alleen de gegevens op (één batch). Het rekenwerk, inclusief alle privacyregels, staat in
// public/js/beheer/dashboard-rekenen.js, zodat de browser precies hetzelfde kan uitrekenen uit de export.
//
// Rekenwerk: elke inzending wordt één keer ingelezen en één keer doorlopen (gratis laag: 10 ms rekentijd per verzoek).

import { json } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { haalOnderzoek } from '../lib/db.js';
import { SCHALEN } from '../lib/schalen.js';
import { dashboardUitRijen } from '../../public/js/beheer/dashboard-rekenen.js';

export async function dashboard({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  const onderzoek = await haalOnderzoek(env, onderzoekId);
  const url = new URL(request.url);
  return json(await berekenDashboard(env, onderzoek, {
    vragenlijst: url.searchParams.get('vragenlijst'),
    uitsplitsen: url.searchParams.get('uitsplitsen'),
  }));
}

/**
 * Berekent alle dashboardgegevens van een onderzoek. Ook gebruikt voor de alleen-lezen
 * deellink (src/routes/delen.js), die er daarna nog onderdelen uit weglaat.
 */
export async function berekenDashboard(env, onderzoek, keuze = {}) {
  const onderzoekId = onderzoek.id;

  const [themasR, meetpuntenR, meetmomentenR, lijstenR, vragenR, inzR, invoerR] = await env.DB.batch([
    env.DB.prepare('SELECT id, naam FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare(
      'SELECT m.id, m.naam, m.eenheid, m.thema_id FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE t.onderzoek_id = ? ORDER BY t.volgorde, m.volgorde, m.id',
    ).bind(onderzoekId),
    env.DB.prepare('SELECT id, naam, datum FROM meetmomenten WHERE onderzoek_id = ? ORDER BY volgorde, id').bind(onderzoekId),
    env.DB.prepare(
      'SELECT id, titel, status, code, meetmoment_id, aantal_uitgenodigd FROM vragenlijsten WHERE onderzoek_id = ? ORDER BY id',
    ).bind(onderzoekId),
    env.DB.prepare(
      `SELECT q.* FROM vragen q JOIN vragenlijsten vl ON vl.id = q.vragenlijst_id JOIN themas t ON t.id = q.thema_id
       WHERE vl.onderzoek_id = ? ORDER BY t.volgorde, t.id, q.volgorde, q.id`,
    ).bind(onderzoekId),
    env.DB.prepare(
      'SELECT i.vragenlijst_id, i.datum, i.antwoorden FROM inzendingen i JOIN vragenlijsten vl ON vl.id = i.vragenlijst_id WHERE vl.onderzoek_id = ?',
    ).bind(onderzoekId),
    env.DB.prepare(
      'SELECT id, thema_id, meetpunt_id, meetmoment_id, soort, datum, titel, waarde, eenheid FROM eigen_invoer WHERE onderzoek_id = ? ORDER BY datum, id',
    ).bind(onderzoekId),
  ]);

  const inzendingen = inzR.results.map((r) => {
    let a = {};
    try {
      a = JSON.parse(r.antwoorden);
    } catch {
      /* beschadigde rij: telt mee als lege inzending */
    }
    return { vragenlijst_id: r.vragenlijst_id, datum: r.datum, a };
  });

  return dashboardUitRijen({
    onderzoek,
    schalen: SCHALEN,
    themas: themasR.results,
    meetpunten: meetpuntenR.results,
    meetmomenten: meetmomentenR.results,
    vragenlijsten: lijstenR.results,
    vragen: vragenR.results,
    inzendingen,
    eigen_invoer: invoerR.results,
  }, keuze);
}

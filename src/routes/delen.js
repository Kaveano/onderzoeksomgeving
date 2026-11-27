// Deellinks: een onderzoek alleen-lezen laten inzien met een link én een toegangscode.
//
// Beheer (ingelogd):  /api/beheer/onderzoeken/:id/deellinks, /api/beheer/deellinks/:id ...
// Kijker (openbaar):  /api/kijk/:code ...  (pagina: /d/<code>)
//
// Veiligheid en privacy:
// - de link bevat een niet te raden code; daarnaast is een toegangscode nodig;
// - van de toegangscode staat alleen een hash in de database; te veel foute pogingen blokkeren tijdelijk;
// - een kijker kan niets wijzigen en krijgt nooit losse antwoorden of exports;
// - resultaten van vragenlijsten of meetmomenten met minder dan 5 respondenten worden niet getoond;
// - open antwoorden en stukken alleen als de beheerder die heeft vrijgegeven;
// - uitkomsten van vragenlijsten die (op de peildatum) nog openstaan alleen met de tussenstand, ook in rapporten;
// - van kijkers wordt niets bewaard (alleen de datum waarop de link het laatst is bekeken).

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, nuIso, vandaagNL } from '../lib/db.js';
import { willekeurigeCode, afzenderCode } from '../lib/auth.js';
import { berekenDashboard } from './dashboard.js';
import { rapportVoorKijker } from './rapporten.js';
import { DREMPEL } from '../lib/schalen.js';

const SESSIEDUUR_SEC = 8 * 60 * 60;
const POGING_VENSTER_MS = 15 * 60 * 1000;
const MAX_POGINGEN = 5; // per afzender per link
const MAX_POGINGEN_LINK = 50; // alle afzenders samen per link (remt raden vanaf veel adressen)
const MAX_LINKS_PER_ONDERZOEK = 20;
const CODE_PATROON = /^[A-Za-z0-9_-]{16,40}$/;
// Boven deze grenzen rekent de server het dashboard niet live uit voor een kijker: dat kost te veel rekentijd op
// de gratis laag (10 ms per verzoek). De rekentijd groeit met het aantal antwoordcellen: per vragenlijst het aantal
// inzendingen × het aantal vragen, opgeteld over alle vragenlijsten van het onderzoek (het dashboard telt ze
// allemaal, ook als de kijker er één bekijkt). Gemeten (docs/beheer.md, "Rekentijd voor meelezers"): warm ongeveer
// 5 ms bij 50.000 cellen, 7 ms bij 80.000 en 9 ms bij 100.000. Daarom 60.000, met ruimte voor het inlezen van de
// databaserijen. Instelbaar met de variabelen KIJK_MAX_CELLEN en KIJK_MAX_INZENDINGEN (hoger of lager, nooit uit).
export const KIJK_MAX_CELLEN = 60_000;
export const KIJK_MAX_INZENDINGEN = 3000;
export const TE_GROOT = 'Deze resultaten zijn te groot om hier live te tonen. Vraag de onderzoeker om een rapport.';
// Zonder tekens die op elkaar lijken (0/O, 1/I/L).
const ALFABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const encoder = new TextEncoder();
async function sha256Hex(tekst) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(tekst)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Toegangscode van 10 tekens, getoond als XXXXX-XXXXX. */
function nieuweToegangscode() {
  const uit = [];
  while (uit.length < 10) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      // Verwerp waarden die de verdeling scheef maken.
      if (b < 248 && uit.length < 10) uit.push(ALFABET[b % ALFABET.length]);
    }
  }
  return `${uit.slice(0, 5).join('')}-${uit.slice(5).join('')}`;
}

const normaliseer = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashToegang = (zout, code) => sha256Hex(`toegang|${zout}|${normaliseer(code)}`);

function cookieNaam(linkId) {
  return `__Host-kijk-${linkId}`;
}

function leesCookie(request, naam) {
  for (const deel of (request.headers.get('Cookie') || '').split(';')) {
    const [k, ...rest] = deel.trim().split('=');
    if (k === naam) return rest.join('=');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Beheer
// ---------------------------------------------------------------------------

/** Controleert en normaliseert wat een kijker mag zien. */
async function controleerOnderdelen(env, ruw, onderzoekId, { magLeeg = false } = {}) {
  const o = ruw && typeof ruw === 'object' && !Array.isArray(ruw) ? ruw : {};
  const stukIds = Array.isArray(o.stukken) ? v.idLijst(o.stukken, 'Stukken', { max: 50 }) : [];
  if (stukIds.length) {
    const rijen = await alle(env, 'SELECT id FROM stukken WHERE onderzoek_id = ?', onderzoekId);
    const eigen = new Set(rijen.map((r) => r.id));
    if (stukIds.some((id) => !eigen.has(id))) throw new Fout(400, 'Een gekozen stuk hoort niet bij dit onderzoek.');
  }
  const rapportIds = Array.isArray(o.rapporten) ? v.idLijst(o.rapporten, 'Rapporten', { max: 20 }) : [];
  if (rapportIds.length) {
    const rijen = await alle(env, 'SELECT id FROM rapporten WHERE onderzoek_id = ?', onderzoekId);
    const eigen = new Set(rijen.map((r) => r.id));
    if (rapportIds.some((id) => !eigen.has(id))) throw new Fout(400, 'Een gekozen rapport hoort niet bij dit onderzoek.');
  }
  const onderdelen = {
    dashboard: o.dashboard !== false,
    open_antwoorden: o.open_antwoorden === true && o.dashboard !== false,
    // Tussenstand: ook uitkomsten van vragenlijsten die nog openstaan (standaard niet; zie kijkerDashboard).
    // Los van het dashboard: de keuze geldt ook voor gedeelde rapporten (BOUWPLAN B8).
    tussenstand: o.tussenstand === true,
    stukken: stukIds,
    rapporten: rapportIds,
  };
  if (!magLeeg && !onderdelen.dashboard && !onderdelen.stukken.length && !onderdelen.rapporten.length) {
    throw new Fout(400, 'Kies minstens één onderdeel dat de kijker mag zien.');
  }
  return onderdelen;
}

/** De opgeslagen onderdelen van een link, zoals beheer en kijker ze gebruiken. De tussenstand staat los van het dashboard. */
function leesOnderdelen(onderdelen) {
  return {
    dashboard: onderdelen.dashboard === true,
    open_antwoorden: onderdelen.dashboard === true && onderdelen.open_antwoorden === true,
    tussenstand: onderdelen.tussenstand === true,
    stukken: onderdelen.stukken || [],
    rapporten: onderdelen.rapporten || [],
  };
}

function linkVoorBeheer(rij) {
  let onderdelen = {};
  try {
    onderdelen = JSON.parse(rij.onderdelen || '{}');
  } catch {
    onderdelen = {};
  }
  const verlopen = !!rij.verloopt_op && rij.verloopt_op < vandaagNL();
  return {
    id: rij.id,
    naam: rij.naam,
    code: rij.code,
    onderdelen: leesOnderdelen(onderdelen),
    verloopt_op: rij.verloopt_op,
    ingetrokken: !!rij.ingetrokken,
    verlopen,
    actief: !rij.ingetrokken && !verlopen,
    aangemaakt_op: rij.aangemaakt_op,
    laatst_bekeken: rij.laatst_bekeken,
  };
}

async function haalLink(env, id) {
  const rij = await een(env, 'SELECT * FROM deellinks WHERE id = ?', id);
  if (!rij) throw new Fout(404, 'Deze deellink bestaat niet (meer).');
  return rij;
}

export async function lijst({ env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId);
  const rijen = await alle(env, 'SELECT * FROM deellinks WHERE onderzoek_id = ? ORDER BY id DESC', onderzoekId);
  return json({ deellinks: rijen.map(linkVoorBeheer) });
}

export async function nieuw({ request, env, params }) {
  const onderzoekId = v.id(params.id);
  await haalOnderzoek(env, onderzoekId); // ook bij een gearchiveerd onderzoek: delen wijzigt het onderzoek niet
  const body = await leesJson(request);
  const naam = v.tekst(body.naam, 'Voor wie', { verplicht: true, max: 150 });
  const verlooptOp = v.datum(body.verloopt_op, 'Verloopdatum');
  if (verlooptOp && verlooptOp < vandaagNL()) throw new Fout(400, 'De verloopdatum ligt in het verleden.');
  const onderdelen = await controleerOnderdelen(env, body.onderdelen, onderzoekId);
  const tel = await een(env, 'SELECT COUNT(*) AS n FROM deellinks WHERE onderzoek_id = ?', onderzoekId);
  if (tel.n >= MAX_LINKS_PER_ONDERZOEK) {
    throw new Fout(409, `Een onderzoek kan maximaal ${MAX_LINKS_PER_ONDERZOEK} deellinks hebben. Verwijder er eerst een.`);
  }
  const toegangscode = nieuweToegangscode();
  const zout = willekeurigeCode(16);
  const rij = await env.DB.prepare(
    `INSERT INTO deellinks (onderzoek_id, naam, code, toegang_zout, toegang_hash, onderdelen, verloopt_op, aangemaakt_op)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(onderzoekId, naam, willekeurigeCode(16), zout, await hashToegang(zout, toegangscode), JSON.stringify(onderdelen), verlooptOp, nuIso()).first();
  // De toegangscode wordt alleen nu getoond; in de database staat alleen een hash.
  return json({ deellink: linkVoorBeheer(rij), toegangscode }, 201);
}

export async function wijzig({ request, env, params }) {
  const id = v.id(params.id);
  const huidig = await haalLink(env, id);
  const body = await leesJson(request);
  const naam = v.tekst(body.naam, 'Voor wie', { verplicht: true, max: 150 });
  const verlooptOp = v.datum(body.verloopt_op, 'Verloopdatum');
  const ingetrokken = v.vlag(body.ingetrokken);
  // Intrekken moet altijd kunnen, ook als alles wat gedeeld was intussen is verwijderd.
  const onderdelen = await controleerOnderdelen(env, body.onderdelen, huidig.onderzoek_id, { magLeeg: !!ingetrokken });
  const stmts = [
    env.DB.prepare('UPDATE deellinks SET naam = ?, verloopt_op = ?, onderdelen = ?, ingetrokken = ? WHERE id = ?')
      .bind(naam, verlooptOp, JSON.stringify(onderdelen), ingetrokken, id),
  ];
  // Intrekken beëindigt lopende kijksessies direct.
  if (ingetrokken) stmts.push(env.DB.prepare('DELETE FROM kijksessies WHERE deellink_id = ?').bind(id));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

export async function nieuweCode({ env, params }) {
  const id = v.id(params.id);
  await haalLink(env, id);
  const toegangscode = nieuweToegangscode();
  const zout = willekeurigeCode(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE deellinks SET toegang_zout = ?, toegang_hash = ? WHERE id = ?').bind(zout, await hashToegang(zout, toegangscode), id),
    env.DB.prepare('DELETE FROM kijksessies WHERE deellink_id = ?').bind(id),
    env.DB.prepare('DELETE FROM kijkpogingen WHERE deellink_id = ?').bind(id),
  ]);
  return json({ ok: true, toegangscode });
}

export async function verwijder({ env, params }) {
  const id = v.id(params.id);
  await haalLink(env, id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM kijksessies WHERE deellink_id = ?').bind(id),
    env.DB.prepare('DELETE FROM kijkpogingen WHERE deellink_id = ?').bind(id),
    env.DB.prepare('DELETE FROM deellinks WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Kijker
// ---------------------------------------------------------------------------

const NIET_BESCHIKBAAR = 'Deze link werkt niet (meer). Vraag de afzender om een nieuwe link.';

/** Zoekt een werkende deellink bij de code uit het adres; anders 404 (zonder te zeggen waarom). */
async function werkendeLink(env, code) {
  if (!CODE_PATROON.test(code || '')) throw new Fout(404, NIET_BESCHIKBAAR);
  const rij = await een(env, 'SELECT * FROM deellinks WHERE code = ?', code);
  if (!rij || rij.ingetrokken || (rij.verloopt_op && rij.verloopt_op < vandaagNL())) throw new Fout(404, NIET_BESCHIKBAAR);
  let onderdelen = {};
  try {
    onderdelen = JSON.parse(rij.onderdelen || '{}');
  } catch {
    onderdelen = {};
  }
  rij.mag = leesOnderdelen(onderdelen);
  return rij;
}

async function heeftSessie(request, env, link) {
  const token = leesCookie(request, cookieNaam(link.id));
  if (!token || !/^[A-Za-z0-9_-]{30,60}$/.test(token)) return false;
  const rij = await een(env, 'SELECT verloopt_op FROM kijksessies WHERE token_hash = ? AND deellink_id = ?', await sha256Hex(token), link.id);
  return !!rij && rij.verloopt_op > Date.now();
}

async function vereisSessie(request, env, link) {
  if (!(await heeftSessie(request, env, link))) throw new Fout(401, 'Vul eerst de toegangscode in.');
}

/** Status van de link: bestaat hij en is de kijker al binnen? Geeft vóór de toegangscode niets prijs. */
export async function status({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  return json({ toegang: await heeftSessie(request, env, link) });
}

export async function toegang({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  const body = await leesJson(request, 5_000);
  const nu = Date.now();
  const afzender = await afzenderCode(env, request);
  // Poging vastleggen en tellen in één ondeelbare batch; boven de grens wordt niet meer vergeleken.
  // Er geldt een grens per afzender en een ruimere grens voor alle afzenders samen.
  const [poging] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO kijkpogingen (deellink_id, tijdstip, afzender)
       SELECT ?, ?, ?
       WHERE (SELECT COUNT(*) FROM kijkpogingen WHERE deellink_id = ? AND afzender = ? AND tijdstip > ?) < ?
         AND (SELECT COUNT(*) FROM kijkpogingen WHERE deellink_id = ? AND tijdstip > ?) < ?
       RETURNING id`,
    ).bind(link.id, nu, afzender, link.id, afzender, nu - POGING_VENSTER_MS, MAX_POGINGEN, link.id, nu - POGING_VENSTER_MS, MAX_POGINGEN_LINK),
    env.DB.prepare('DELETE FROM kijkpogingen WHERE tijdstip < ?').bind(nu - 24 * 60 * 60 * 1000),
    env.DB.prepare('DELETE FROM kijksessies WHERE verloopt_op < ?').bind(nu),
  ]);
  if (!poging.results.length) {
    throw new Fout(429, 'Te veel pogingen met een verkeerde toegangscode. Wacht 15 minuten en probeer het dan opnieuw.');
  }
  const invoer = typeof body.toegangscode === 'string' ? body.toegangscode.slice(0, 100) : '';
  const hash = await hashToegang(link.toegang_zout, invoer);
  // Vergelijking van twee hashes van gelijke lengte (geen tijdsverschil dat de code prijsgeeft).
  let verschil = hash.length ^ link.toegang_hash.length;
  for (let i = 0; i < hash.length; i++) verschil |= hash.charCodeAt(i) ^ link.toegang_hash.charCodeAt(i % link.toegang_hash.length);
  if (!normaliseer(invoer) || verschil !== 0) {
    throw new Fout(401, 'Deze toegangscode klopt niet.');
  }
  const token = willekeurigeCode(32);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO kijksessies (token_hash, deellink_id, verloopt_op) VALUES (?, ?, ?)').bind(await sha256Hex(token), link.id, nu + SESSIEDUUR_SEC * 1000),
    env.DB.prepare('DELETE FROM kijkpogingen WHERE id = ?').bind(poging.results[0].id),
    env.DB.prepare('UPDATE deellinks SET laatst_bekeken = ? WHERE id = ? AND COALESCE(laatst_bekeken, \'\') <> ?').bind(vandaagNL(), link.id, vandaagNL()),
  ]);
  return json({ toegang: true }, 200, {
    'Set-Cookie': `${cookieNaam(link.id)}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSIEDUUR_SEC}`,
  });
}

export async function sluiten({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  const token = leesCookie(request, cookieNaam(link.id));
  if (token && /^[A-Za-z0-9_-]{30,60}$/.test(token)) {
    await env.DB.prepare('DELETE FROM kijksessies WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
  return json({ toegang: false }, 200, {
    'Set-Cookie': `${cookieNaam(link.id)}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  });
}

/** Wat de kijker te zien krijgt: titel, bedrijf, onderzoeksvraag en de vrijgegeven onderdelen. */
export async function overzicht({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  await vereisSessie(request, env, link);
  const o = await haalOnderzoek(env, link.onderzoek_id);
  let stukken = [];
  if (link.mag.stukken.length) {
    const rijen = await alle(env, 'SELECT id, titel, soort, bijgewerkt_op FROM stukken WHERE onderzoek_id = ? ORDER BY volgorde, id', o.id);
    stukken = rijen.filter((s) => link.mag.stukken.includes(s.id));
  }
  let rapporten = [];
  if (link.mag.rapporten.length) {
    const rijen = await alle(env, 'SELECT id, titel, soort, bijgewerkt_op FROM rapporten WHERE onderzoek_id = ? ORDER BY id', o.id);
    rapporten = rijen.filter((r) => link.mag.rapporten.includes(r.id));
  }
  // Namen van thema's zijn nodig om de resultaten te kunnen tonen.
  const themas = link.mag.dashboard
    ? await alle(env, 'SELECT id, naam FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id', o.id)
    : [];
  return json({
    onderzoek: { titel: o.titel, bedrijfsnaam: o.bedrijfsnaam, onderzoeksvraag: o.onderzoeksvraag, status: o.status },
    onderdelen: { dashboard: link.mag.dashboard, open_antwoorden: link.mag.open_antwoorden },
    themas,
    stukken,
    rapporten,
    drempel: DREMPEL,
  });
}

/** Dashboard voor de kijker: dezelfde berekening, maar zonder wat niet gedeeld mag worden. */
export async function dashboard({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  await vereisSessie(request, env, link);
  if (!link.mag.dashboard) throw new Fout(403, 'De resultaten zijn niet gedeeld via deze link.');
  const o = await haalOnderzoek(env, link.onderzoek_id);
  const grens = (naam, standaard) => (Number(env[naam]) > 0 ? Number(env[naam]) : standaard);
  // Eén query: per vragenlijst inzendingen en vragen geteld via hun index, zonder antwoorden te lezen.
  const tel = await een(
    env,
    `SELECT COALESCE(SUM(t.n), 0) AS n, COALESCE(SUM(t.n * t.v), 0) AS cellen FROM (
       SELECT (SELECT COUNT(*) FROM inzendingen i WHERE i.vragenlijst_id = vl.id) AS n,
              (SELECT COUNT(*) FROM vragen q WHERE q.vragenlijst_id = vl.id) AS v
       FROM vragenlijsten vl WHERE vl.onderzoek_id = ?) t`,
    o.id,
  );
  if (tel.n > grens('KIJK_MAX_INZENDINGEN', KIJK_MAX_INZENDINGEN) || tel.cellen > grens('KIJK_MAX_CELLEN', KIJK_MAX_CELLEN)) {
    throw new Fout(413, TE_GROOT, { te_groot: true });
  }
  const url = new URL(request.url);
  const d = await berekenDashboard(env, o, {
    vragenlijst: url.searchParams.get('vragenlijst'),
    uitsplitsen: url.searchParams.get('uitsplitsen'),
  });

  return json(kijkerDashboard(d, link.mag));
}

/**
 * Maakt van het dashboard (zoals de onderzoeker het ziet) de versie voor een kijker.
 * Uitgangspunt: niets tonen waaruit de antwoorden van minder dan DREMPEL personen zijn af te leiden,
 * ook niet door verschillende getallen tegen elkaar weg te strepen. Daarom:
 * - een vragenlijst met minder dan DREMPEL respondenten: geen uitkomsten;
 * - een vragenlijst die nog openstaat: geen uitkomsten (tenzij de tussenstand is gedeeld), omdat een kijker
 *   anders door twee keer te kijken de antwoorden van één nieuwe respondent kan zien;
 * - een vraag met minder dan DREMPEL scores: geen verdeling, gemiddelde of aantal (bij een cijfervraag ook geen eNPS);
 * - een thema of meetpunt met zo'n vraag: geen gemiddelde (het zou de verborgen vraag verraden);
 * - een punt in het verloop waar een kleine of nog open vragenlijst aan bijdraagt: geen gemiddelde;
 * - geen open antwoorden (tenzij gedeeld), geen links, geen aantallen eigen invoer;
 * - gemiddelden afgerond op twee decimalen.
 * De verdeling van een achtergrondvraag (beschermd: kenmerk of uitsplitsvraag) is al gemaskeerd door
 * dashboardUitRijen: kleine aantallen en hun percentages zijn null, net als n zodra er iets verborgen is.
 */
export function kijkerDashboard(d, mag) {
  const rond = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
  const isOpen = new Map(d.respons.map((r) => [r.vragenlijst_id, r.status === 'open']));
  for (const r of d.respons) delete r.code;

  // Een punt in het verloop alleen tonen als elke bijdragende vragenlijst groot genoeg en (zonder tussenstand) gesloten is.
  const puntVeilig = (p) => p.n !== null && p.n >= DREMPEL && !p.klein && (mag.tussenstand || !p.open);
  const schoonPunt = (p, velden) => {
    const veilig = puntVeilig(p);
    const uit = { meetmoment_id: p.meetmoment_id, naam: p.naam };
    if (p.datum !== undefined) uit.datum = p.datum;
    for (const v of velden) uit[v] = veilig ? rond(p[v]) : null;
    uit.n = veilig ? p.n : null;
    return uit;
  };

  const s = d.selectie;
  if (s) {
    const open = isOpen.get(s.vragenlijst_id) && !mag.tussenstand;
    if (s.n < DREMPEL || open) {
      d.selectie = {
        vragenlijst_id: s.vragenlijst_id,
        titel: s.titel,
        meetmoment_naam: s.meetmoment_naam,
        n: s.n,
        klein: s.n < DREMPEL,
        verborgen: true,
        reden: s.n < DREMPEL ? 'klein' : 'open',
        themas: [],
        meetpunten: [],
        vragen: [],
        open: [],
        uitsplitsvragen: [],
        uitsplitsing: null,
      };
    } else {
      if (!mag.open_antwoorden) {
        s.open = [];
        s.open_verborgen = true;
      }
      const verborgenThemas = new Set();
      const verborgenMeetpunten = new Set();
      for (const q of s.vragen) {
        // Schaal- en cijfervragen: het aantal scores telt (weet niet / n.v.t. niet).
        const metScore = q.type === 'schaal' || q.type === 'cijfer';
        const scores = metScore ? q.n_score : q.n;
        const klein = (q.n > 0 && q.n < DREMPEL) || (metScore && scores > 0 && scores < DREMPEL);
        if (klein) {
          q.verdeling = [];
          q.gemiddelde = null;
          q.percentage_ja = null;
          q.n = null;
          delete q.n_score;
          if (q.type === 'cijfer') {
            q.enps = null;
            if ('pct_onvoldoende' in q) q.pct_onvoldoende = null;
          }
          q.verborgen = true;
          if (q.type === 'schaal') {
            verborgenThemas.add(q.thema_id);
            if (q.meetpunt_id) verborgenMeetpunten.add(q.meetpunt_id);
          }
        } else {
          q.gemiddelde = rond(q.gemiddelde);
          q.percentage_ja = rond(q.percentage_ja);
          if (q.type === 'cijfer') {
            if (q.enps) {
              for (const k of ['pct_promotors', 'pct_passief', 'pct_criticasters', 'score']) q.enps[k] = rond(q.enps[k]);
            }
            if ('pct_onvoldoende' in q) q.pct_onvoldoende = rond(q.pct_onvoldoende);
          }
        }
        if (q.verloop) q.verloop = q.verloop.map((p) => schoonPunt(p, q.type === 'cijfer' ? ['gemiddelde', 'enps_score'] : ['gemiddelde', 'percentage_ja']));
      }
      const verberg = (t, extra) => {
        if ((t.n > 0 && t.n < DREMPEL) || extra) {
          t.gemiddelde = null;
          t.n = null;
          t.verborgen = true;
        } else {
          t.gemiddelde = rond(t.gemiddelde);
        }
        delete t.antwoorden;
      };
      for (const t of s.themas) verberg(t, verborgenThemas.has(t.thema_id));
      for (const m of s.meetpunten) verberg(m, verborgenMeetpunten.has(m.meetpunt_id));
      // In de uitsplitsing per groep geldt hetzelfde: geen themagemiddelde als er een verborgen vraag in zit.
      // De cijferkolommen (g.cijfers) zijn al per kolom onderdrukt in dashboardUitRijen.
      for (const g of (s.uitsplitsing && s.uitsplitsing.groepen) || []) {
        for (const c of g.themas || []) {
          if (verborgenThemas.has(c.thema_id)) {
            c.gemiddelde = null;
            c.n = null;
            c.verborgen = true;
          }
        }
      }
      // Open antwoorden op een vraag met minder dan DREMPEL antwoorden ook niet tonen.
      s.open = s.open.map((q) => (q.antwoorden.length < DREMPEL ? { ...q, antwoorden: [], verborgen: true } : q));
    }
  }
  for (const reeks of [...d.verloop.themas, ...d.verloop.meetpunten]) {
    reeks.punten = reeks.punten.map((p) => schoonPunt(p, ['gemiddelde']));
  }
  d.verloop.themas = d.verloop.themas.filter((r) => r.punten.some((p) => p.gemiddelde !== null));
  d.verloop.meetpunten = d.verloop.meetpunten.filter((r) => r.punten.some((p) => p.gemiddelde !== null));
  // Aantallen interviews, observaties en dergelijke zijn voor de onderzoeker zelf.
  delete d.eigen_invoer_telling;
  d.kijker = true;
  return d;
}

export async function stuk({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  await vereisSessie(request, env, link);
  const id = v.id(params.id);
  if (!link.mag.stukken.includes(id)) throw new Fout(404, 'Dit stuk is niet gedeeld via deze link.');
  const rij = await een(env, 'SELECT id, titel, soort, inhoud, bijgewerkt_op FROM stukken WHERE id = ? AND onderzoek_id = ?', id, link.onderzoek_id);
  if (!rij) throw new Fout(404, 'Dit stuk bestaat niet (meer).');
  return json({ stuk: rij });
}

export async function rapport({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  await vereisSessie(request, env, link);
  const id = v.id(params.id);
  if (!link.mag.rapporten.includes(id)) throw new Fout(404, 'Dit rapport is niet gedeeld via deze link.');
  const rij = await een(env, 'SELECT * FROM rapporten WHERE id = ? AND onderzoek_id = ?', id, link.onderzoek_id);
  if (!rij) throw new Fout(404, 'Dit rapport bestaat niet (meer).');
  // Zonder tussenstand geen uitkomsten van vragenlijsten die op de peildatum nog openstonden (BOUWPLAN B8).
  return json({ rapport: rapportVoorKijker(rij, { verbergOpen: !link.mag.tussenstand }) });
}

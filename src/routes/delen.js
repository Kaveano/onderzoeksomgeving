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
// - van kijkers wordt niets bewaard (alleen de datum waarop de link het laatst is bekeken).

import { Fout, json, leesJson } from '../lib/http.js';
import * as v from '../lib/validatie.js';
import { alle, een, haalOnderzoek, nuIso, vandaagNL } from '../lib/db.js';
import { willekeurigeCode } from '../lib/auth.js';
import { berekenDashboard } from './dashboard.js';
import { DREMPEL } from '../lib/schalen.js';

const SESSIEDUUR_SEC = 8 * 60 * 60;
const POGING_VENSTER_MS = 15 * 60 * 1000;
const MAX_POGINGEN = 5;
const MAX_LINKS_PER_ONDERZOEK = 20;
const CODE_PATROON = /^[A-Za-z0-9_-]{16,40}$/;
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
async function controleerOnderdelen(env, ruw, onderzoekId) {
  const o = ruw && typeof ruw === 'object' && !Array.isArray(ruw) ? ruw : {};
  const stukIds = Array.isArray(o.stukken) ? v.idLijst(o.stukken, 'Stukken', { max: 50 }) : [];
  if (stukIds.length) {
    const rijen = await alle(env, 'SELECT id FROM stukken WHERE onderzoek_id = ?', onderzoekId);
    const eigen = new Set(rijen.map((r) => r.id));
    if (stukIds.some((id) => !eigen.has(id))) throw new Fout(400, 'Een gekozen stuk hoort niet bij dit onderzoek.');
  }
  const onderdelen = {
    dashboard: o.dashboard !== false,
    open_antwoorden: o.open_antwoorden === true,
    stukken: stukIds,
  };
  if (!onderdelen.dashboard && !onderdelen.stukken.length) {
    throw new Fout(400, 'Kies minstens één onderdeel dat de kijker mag zien.');
  }
  return onderdelen;
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
    onderdelen: { dashboard: onderdelen.dashboard !== false, open_antwoorden: onderdelen.open_antwoorden === true, stukken: onderdelen.stukken || [] },
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
  const onderdelen = await controleerOnderdelen(env, body.onderdelen, huidig.onderzoek_id);
  const ingetrokken = v.vlag(body.ingetrokken);
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
  rij.mag = { dashboard: onderdelen.dashboard !== false, open_antwoorden: onderdelen.open_antwoorden === true, stukken: onderdelen.stukken || [] };
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
  // Poging vastleggen en tellen in één ondeelbare batch; boven de grens wordt niet meer vergeleken.
  const [poging] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO kijkpogingen (deellink_id, tijdstip)
       SELECT ?, ? WHERE (SELECT COUNT(*) FROM kijkpogingen WHERE deellink_id = ? AND tijdstip > ?) < ?
       RETURNING id`,
    ).bind(link.id, nu, link.id, nu - POGING_VENSTER_MS, MAX_POGINGEN),
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
  // Namen van thema's zijn nodig om de resultaten te kunnen tonen.
  const themas = link.mag.dashboard
    ? await alle(env, 'SELECT id, naam FROM themas WHERE onderzoek_id = ? ORDER BY volgorde, id', o.id)
    : [];
  return json({
    onderzoek: { titel: o.titel, bedrijfsnaam: o.bedrijfsnaam, onderzoeksvraag: o.onderzoeksvraag, status: o.status },
    onderdelen: { dashboard: link.mag.dashboard, open_antwoorden: link.mag.open_antwoorden },
    themas,
    stukken,
    drempel: DREMPEL,
  });
}

/** Dashboard voor de kijker: dezelfde berekening, maar zonder wat niet gedeeld mag worden. */
export async function dashboard({ request, env, params }) {
  const link = await werkendeLink(env, params.code);
  await vereisSessie(request, env, link);
  if (!link.mag.dashboard) throw new Fout(403, 'De resultaten zijn niet gedeeld via deze link.');
  const o = await haalOnderzoek(env, link.onderzoek_id);
  const url = new URL(request.url);
  const d = await berekenDashboard(env, o, {
    vragenlijst: url.searchParams.get('vragenlijst'),
    uitsplitsen: url.searchParams.get('uitsplitsen'),
  });

  // Geen links naar vragenlijsten.
  for (const r of d.respons) delete r.code;

  const s = d.selectie;
  if (s) {
    if (s.n < DREMPEL) {
      // Te weinig respondenten: voor kijkers helemaal geen uitkomsten van deze vragenlijst.
      d.selectie = {
        vragenlijst_id: s.vragenlijst_id,
        titel: s.titel,
        meetmoment_naam: s.meetmoment_naam,
        n: s.n,
        klein: true,
        verborgen: true,
        themas: [],
        meetpunten: [],
        vragen: [],
        open: [],
        uitsplitsvragen: [],
        uitsplitsing: null,
      };
    } else {
      if (!link.mag.open_antwoorden) {
        s.open = [];
        s.open_verborgen = true;
      }
      // Vragen met minder dan DREMPEL antwoorden: geen verdeling of gemiddelde.
      for (const q of s.vragen) {
        if (q.n > 0 && q.n < DREMPEL) {
          q.verdeling = [];
          q.gemiddelde = null;
          q.percentage_ja = null;
          q.verborgen = true;
        }
        if (q.verloop) q.verloop = q.verloop.map((p) => (p.n < DREMPEL ? { meetmoment_id: p.meetmoment_id, naam: p.naam, gemiddelde: null, percentage_ja: null, n: null } : p));
      }
      for (const t of [...s.themas, ...s.meetpunten]) {
        if (t.n > 0 && t.n < DREMPEL) {
          t.gemiddelde = null;
          t.verborgen = true;
        }
        delete t.antwoorden;
      }
      // Open antwoorden op een vraag met minder dan DREMPEL antwoorden ook niet tonen.
      s.open = s.open.map((q) => (q.antwoorden.length < DREMPEL ? { ...q, antwoorden: [], verborgen: true } : q));
    }
  }
  // Verloop: meetmomenten met minder dan DREMPEL respondenten tonen geen gemiddelde.
  for (const reeks of [...d.verloop.themas, ...d.verloop.meetpunten]) {
    reeks.punten = reeks.punten.map((p) => (p.n < DREMPEL ? { ...p, gemiddelde: null, n: null } : p));
  }
  d.verloop.themas = d.verloop.themas.filter((r) => r.punten.some((p) => p.gemiddelde !== null));
  d.verloop.meetpunten = d.verloop.meetpunten.filter((r) => r.punten.some((p) => p.gemiddelde !== null));
  // Aantallen interviews, observaties en dergelijke zijn voor de onderzoeker zelf.
  delete d.eigen_invoer_telling;
  d.kijker = true;
  return json(d);
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

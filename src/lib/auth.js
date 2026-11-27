// Inloggen voor de beheeromgeving.
// - Het wachtwoord staat als geheim (BEHEER_WACHTWOORD) in Cloudflare, nooit in de code.
// - Na inloggen krijgt de browser een willekeurige sessiesleutel in een beveiligde cookie.
//   In de database staat alleen een hash van die sleutel.
// - Te veel mislukte pogingen blokkeren het inloggen tijdelijk (per afzender, en een ruimere grens voor iedereen samen).
// - Wijzigt het wachtwoord, dan vervallen alle bestaande sessies.

import { Fout, json } from './http.js';

export const COOKIE_NAAM = '__Host-sessie';
const SESSIEDUUR_SEC = 12 * 60 * 60; // 12 uur
const MIN_WACHTWOORD_LENGTE = 12;
const POGING_VENSTER_MS = 15 * 60 * 1000; // 15 minuten
const MAX_MISLUKT_PER_AFZENDER = 10; // per afzender per 15 minuten
const MAX_MISLUKT_TOTAAL = 200; // alle afzenders samen per 15 minuten (afzenders boven hun grens tellen niet mee)

const encoder = new TextEncoder();

async function sha256(tekst) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(tekst)));
}

function naarHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function naarBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Willekeurige, niet te raden code (standaard 16 bytes = 128 bits). */
export function willekeurigeCode(bytes = 16) {
  return naarBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function gelijkInConstanteTijd(a, b) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(ha, hb);
  let verschil = 0;
  for (let i = 0; i < ha.length; i++) verschil |= ha[i] ^ hb[i];
  return verschil === 0;
}

function leesCookie(request, naam) {
  const kop = request.headers.get('Cookie') || '';
  for (const deel of kop.split(';')) {
    const [k, ...rest] = deel.trim().split('=');
    if (k === naam) return rest.join('=');
  }
  return null;
}

function cookieKop(waarde, maxAge) {
  return `${COOKIE_NAAM}=${waarde}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

/**
 * Kenmerk dat een sessie aan het huidige wachtwoord koppelt: HMAC(wachtwoord, sessiesleutel).
 * Alleen te controleren met de sessiesleutel uit de cookie; met alleen de database is het
 * wachtwoord er niet uit te raden. Wijzigt het wachtwoord, dan vervallen alle sessies.
 */
async function wachtwoordKenmerk(geheim, token) {
  const sleutel = await crypto.subtle.importKey('raw', encoder.encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return naarHex(new Uint8Array(await crypto.subtle.sign('HMAC', sleutel, encoder.encode(token)))).slice(0, 32);
}

/**
 * Niet terug te rekenen code voor de afzender van een inlogpoging (alleen om pogingen
 * per afzender te tellen; wordt na een dag gewist). Bij IPv6 telt het hele /64-blok als één afzender.
 */
export async function afzenderCode(env, request) {
  let ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
  if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':');
  const [, rij] = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO instellingen (sleutel, waarde) VALUES ('afzender_zout', ?)").bind(willekeurigeCode(32)),
    env.DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'afzender_zout'"),
  ]);
  return naarHex(await sha256(`${rij.results[0].waarde}|${ip}`)).slice(0, 32);
}

/**
 * De ingestelde beheerwachtwoorden: BEHEER_WACHTWOORD en optioneel BEHEER_WACHTWOORD_2
 * (een tweede toegang, bijvoorbeeld voor ondersteuning; weg te halen door dat geheim in
 * Cloudflare te verwijderen). Te korte wachtwoorden tellen niet mee.
 */
function wachtwoorden(env) {
  return [env.BEHEER_WACHTWOORD, env.BEHEER_WACHTWOORD_2].filter((w) => typeof w === 'string' && w.length >= MIN_WACHTWOORD_LENGTE);
}

/** Geeft true als het verzoek bij een geldige sessie hoort. */
export async function isIngelogd(request, env) {
  const token = leesCookie(request, COOKIE_NAAM);
  const geldig = wachtwoorden(env);
  if (!token || !/^[A-Za-z0-9_-]{30,60}$/.test(token) || !geldig.length) return false;
  const hash = naarHex(await sha256(token));
  const rij = await env.DB.prepare('SELECT verloopt_op, wachtwoord_kenmerk FROM sessies WHERE token_hash = ?')
    .bind(hash)
    .first();
  if (!rij || rij.verloopt_op <= Date.now()) return false;
  for (const w of geldig) {
    if (rij.wachtwoord_kenmerk === (await wachtwoordKenmerk(w, token))) return true;
  }
  return false;
}

export async function vereisInlog(request, env) {
  if (!(await isIngelogd(request, env))) {
    throw new Fout(401, 'Je bent niet (meer) ingelogd.');
  }
}

export async function inloggen(request, env, body) {
  const geheim = env.BEHEER_WACHTWOORD;
  if (!geheim) {
    throw new Fout(503, 'Er is nog geen wachtwoord ingesteld. Stel het geheim BEHEER_WACHTWOORD in bij Cloudflare.');
  }
  if (geheim.length < MIN_WACHTWOORD_LENGTE) {
    throw new Fout(503, `Het ingestelde wachtwoord is te kort. Kies in Cloudflare een wachtwoord van minimaal ${MIN_WACHTWOORD_LENGTE} tekens.`);
  }

  // De poging alleen vastleggen als deze afzender nog onder zijn eigen grens zit, en in dezelfde
  // (ondeelbare) batch tellen. Zo kan één afzender niet de grens voor iedereen samen opvullen,
  // en kunnen gelijktijdige pogingen de grens niet omzeilen.
  const nu = Date.now();
  const venster = nu - POGING_VENSTER_MS;
  const afzender = await afzenderCode(env, request);
  const [poging, totaal] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO inlogpogingen (tijdstip, afzender)
       SELECT ?, ? WHERE (SELECT COUNT(*) FROM inlogpogingen WHERE afzender = ? AND tijdstip > ?) < ?
       RETURNING id`,
    ).bind(nu, afzender, afzender, venster, MAX_MISLUKT_PER_AFZENDER),
    env.DB.prepare('SELECT COUNT(*) AS n FROM inlogpogingen WHERE tijdstip > ?').bind(venster),
    env.DB.prepare('DELETE FROM inlogpogingen WHERE tijdstip < ?').bind(nu - 24 * 60 * 60 * 1000),
  ]);
  if (!poging.results.length || totaal.results[0].n > MAX_MISLUKT_TOTAAL) {
    throw new Fout(429, 'Te veel mislukte pogingen. Wacht 15 minuten en probeer het dan opnieuw.');
  }

  const invoer = typeof body.wachtwoord === 'string' ? body.wachtwoord.slice(0, 500) : '';
  let gekozen = null;
  for (const w of wachtwoorden(env)) {
    // Altijd alle wachtwoorden vergelijken (geen verschil in tijd).
    if (invoer.length > 0 && (await gelijkInConstanteTijd(invoer, w)) && !gekozen) gekozen = w;
  }
  if (!gekozen) {
    throw new Fout(401, 'Dit wachtwoord klopt niet.');
  }

  const token = willekeurigeCode(32);
  const hash = naarHex(await sha256(token));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessies (token_hash, verloopt_op, wachtwoord_kenmerk) VALUES (?, ?, ?)')
      .bind(hash, nu + SESSIEDUUR_SEC * 1000, await wachtwoordKenmerk(gekozen, token)),
    env.DB.prepare('DELETE FROM inlogpogingen WHERE id = ?').bind(poging.results[0].id),
    env.DB.prepare('DELETE FROM sessies WHERE verloopt_op < ?').bind(nu),
  ]);
  return json({ ingelogd: true }, 200, { 'Set-Cookie': cookieKop(token, SESSIEDUUR_SEC) });
}

export async function uitloggen(request, env) {
  const token = leesCookie(request, COOKIE_NAAM);
  if (token && /^[A-Za-z0-9_-]{30,60}$/.test(token)) {
    const hash = naarHex(await sha256(token));
    await env.DB.prepare('DELETE FROM sessies WHERE token_hash = ?').bind(hash).run();
  }
  return json({ ingelogd: false }, 200, { 'Set-Cookie': cookieKop('', 0) });
}

// Inloggen voor de beheeromgeving.
// - Het wachtwoord staat als geheim (BEHEER_WACHTWOORD) in Cloudflare, nooit in de code.
// - Na inloggen krijgt de browser een willekeurige sessiesleutel in een beveiligde cookie.
//   In de database staat alleen een hash van die sleutel.
// - Te veel mislukte pogingen achter elkaar blokkeren het inloggen tijdelijk.

import { Fout, json } from './http.js';

export const COOKIE_NAAM = '__Host-sessie';
const SESSIEDUUR_SEC = 12 * 60 * 60; // 12 uur
const MIN_WACHTWOORD_LENGTE = 12;
const POGING_VENSTER_MS = 15 * 60 * 1000; // 15 minuten
const MAX_MISLUKT_IN_VENSTER = 10;

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

/** Geeft true als het verzoek bij een geldige sessie hoort. */
export async function isIngelogd(request, env) {
  const token = leesCookie(request, COOKIE_NAAM);
  if (!token || !/^[A-Za-z0-9_-]{30,60}$/.test(token)) return false;
  const hash = naarHex(await sha256(token));
  const rij = await env.DB.prepare('SELECT verloopt_op FROM sessies WHERE token_hash = ?')
    .bind(hash)
    .first();
  return !!rij && rij.verloopt_op > Date.now();
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

  const nu = Date.now();
  const telling = await env.DB.prepare('SELECT COUNT(*) AS n FROM inlogpogingen WHERE tijdstip > ?')
    .bind(nu - POGING_VENSTER_MS)
    .first();
  if (telling && telling.n >= MAX_MISLUKT_IN_VENSTER) {
    throw new Fout(429, 'Te veel mislukte pogingen. Wacht 15 minuten en probeer het dan opnieuw.');
  }

  const invoer = typeof body.wachtwoord === 'string' ? body.wachtwoord.slice(0, 500) : '';
  const klopt = invoer.length > 0 && (await gelijkInConstanteTijd(invoer, geheim));
  if (!klopt) {
    await env.DB.prepare('INSERT INTO inlogpogingen (tijdstip) VALUES (?)').bind(nu).run();
    throw new Fout(401, 'Dit wachtwoord klopt niet.');
  }

  const token = willekeurigeCode(32);
  const hash = naarHex(await sha256(token));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessies (token_hash, verloopt_op) VALUES (?, ?)').bind(hash, nu + SESSIEDUUR_SEC * 1000),
    env.DB.prepare('DELETE FROM sessies WHERE verloopt_op < ?').bind(nu),
    env.DB.prepare('DELETE FROM inlogpogingen WHERE tijdstip < ?').bind(nu - 24 * 60 * 60 * 1000),
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

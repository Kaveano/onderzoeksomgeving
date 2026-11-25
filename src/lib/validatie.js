// Controle van invoer aan de serverkant. Elke functie geeft een schone waarde terug
// of gooit een Fout (400) met een begrijpelijke Nederlandse melding.

import { Fout } from './http.js';

// Verwijdert onzichtbare stuurtekens (behalve tab en regeleinde).
function schoon(tekst) {
  return tekst.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** Verplichte of optionele tekst met maximale lengte. */
export function tekst(waarde, veld, { verplicht = false, max = 500, standaard = '' } = {}) {
  if (waarde === undefined || waarde === null) {
    if (verplicht) throw new Fout(400, `${veld} is verplicht.`);
    return standaard;
  }
  if (typeof waarde !== 'string' && typeof waarde !== 'number') {
    throw new Fout(400, `${veld} heeft een ongeldige waarde.`);
  }
  const t = schoon(String(waarde)).trim();
  if (verplicht && !t) throw new Fout(400, `${veld} is verplicht.`);
  if (t.length > max) throw new Fout(400, `${veld} is te lang (maximaal ${max} tekens).`);
  return t;
}

/** Lange tekst (stukken, toelichting): behoudt witruimte aan begin/eind van regels. */
export function langeTekst(waarde, veld, { max = 500_000 } = {}) {
  if (waarde === undefined || waarde === null) return '';
  if (typeof waarde !== 'string') throw new Fout(400, `${veld} heeft een ongeldige waarde.`);
  const t = schoon(waarde);
  if (t.length > max) throw new Fout(400, `${veld} is te lang (maximaal ${max.toLocaleString('nl-NL')} tekens).`);
  return t;
}

/** Datum in de vorm JJJJ-MM-DD (of leeg als niet verplicht). */
export function datum(waarde, veld, { verplicht = false } = {}) {
  if (waarde === undefined || waarde === null || waarde === '') {
    if (verplicht) throw new Fout(400, `${veld} is verplicht.`);
    return null;
  }
  if (typeof waarde !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(waarde)) {
    throw new Fout(400, `${veld} moet een geldige datum zijn.`);
  }
  const [j, m, d] = waarde.split('-').map(Number);
  const dt = new Date(Date.UTC(j, m - 1, d));
  if (dt.getUTCFullYear() !== j || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || j < 1900 || j > 2200) {
    throw new Fout(400, `${veld} moet een geldige datum zijn.`);
  }
  return waarde;
}

/** Geheel getal binnen grenzen (of null als niet verplicht). */
export function geheelGetal(waarde, veld, { verplicht = false, min = 0, max = 1_000_000 } = {}) {
  if (waarde === undefined || waarde === null || waarde === '') {
    if (verplicht) throw new Fout(400, `${veld} is verplicht.`);
    return null;
  }
  const n = typeof waarde === 'string' ? Number(waarde.trim()) : waarde;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new Fout(400, `${veld} moet een geheel getal zijn tussen ${min} en ${max}.`);
  }
  return n;
}

/** Getal (mag decimaal; komma of punt) of null. */
export function getal(waarde, veld, { verplicht = false } = {}) {
  if (waarde === undefined || waarde === null || waarde === '') {
    if (verplicht) throw new Fout(400, `${veld} is verplicht.`);
    return null;
  }
  let n = waarde;
  if (typeof n === 'string') n = Number(n.trim().replace(/\s/g, '').replace(',', '.'));
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e12) {
    throw new Fout(400, `${veld} moet een getal zijn.`);
  }
  return n;
}

/** Ja/nee-vlag als 0 of 1. */
export function vlag(waarde) {
  return waarde === true || waarde === 1 || waarde === '1' || waarde === 'true' ? 1 : 0;
}

/** Waarde uit een vaste lijst. */
export function keuze(waarde, veld, toegestaan, { standaard } = {}) {
  if ((waarde === undefined || waarde === null || waarde === '') && standaard !== undefined) return standaard;
  if (!toegestaan.includes(waarde)) throw new Fout(400, `${veld} heeft een ongeldige waarde.`);
  return waarde;
}

/** Positief id uit de URL of de body. */
export function id(waarde, veld = 'id') {
  const n = typeof waarde === 'string' ? Number(waarde) : waarde;
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) {
    throw new Fout(400, `Ongeldig ${veld}.`);
  }
  return n;
}

/** Optioneel id (null/leeg mag). */
export function optioneelId(waarde, veld) {
  if (waarde === undefined || waarde === null || waarde === '' || waarde === 0) return null;
  return id(waarde, veld);
}

/** Lijst met ids. */
export function idLijst(waarde, veld, { max = 500 } = {}) {
  if (!Array.isArray(waarde)) throw new Fout(400, `${veld} moet een lijst zijn.`);
  if (waarde.length > max) throw new Fout(400, `${veld} bevat te veel items.`);
  const ids = waarde.map((w) => id(w, veld));
  if (new Set(ids).size !== ids.length) throw new Fout(400, `${veld} bevat dubbele items.`);
  return ids;
}

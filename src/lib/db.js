// Gedeelde databasehulpjes.

import { Fout } from './http.js';

export function nuIso() {
  return new Date().toISOString();
}

/** Datum van vandaag in Nederlandse tijd, als JJJJ-MM-DD. */
export function vandaagNL() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function alle(env, sql, ...params) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function een(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first();
}

export async function uitvoeren(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).run();
}

/** Haalt een onderzoek op; 404 als het niet bestaat. */
export async function haalOnderzoek(env, onderzoekId) {
  const o = await een(env, 'SELECT * FROM onderzoeken WHERE id = ?', onderzoekId);
  if (!o) throw new Fout(404, 'Dit onderzoek bestaat niet (meer).');
  return o;
}

/** Haalt een onderzoek op en weigert als het gearchiveerd is. */
export async function haalBewerkbaarOnderzoek(env, onderzoekId) {
  const o = await haalOnderzoek(env, onderzoekId);
  if (o.status === 'gearchiveerd') {
    throw new Fout(409, 'Dit onderzoek is gearchiveerd en kan niet meer worden gewijzigd.');
  }
  return o;
}

/**
 * Zoekt het onderzoek bij een onderliggend item (thema, vraag, stuk, ...).
 * soort bepaalt via welke tabel(len) we naar het onderzoek gaan.
 */
const ONDERZOEK_VIA = {
  thema: 'SELECT onderzoek_id FROM themas WHERE id = ?',
  meetpunt: 'SELECT t.onderzoek_id FROM meetpunten m JOIN themas t ON t.id = m.thema_id WHERE m.id = ?',
  meetmoment: 'SELECT onderzoek_id FROM meetmomenten WHERE id = ?',
  vragenlijst: 'SELECT onderzoek_id FROM vragenlijsten WHERE id = ?',
  vraag: 'SELECT vl.onderzoek_id FROM vragen v JOIN vragenlijsten vl ON vl.id = v.vragenlijst_id WHERE v.id = ?',
  invoer: 'SELECT onderzoek_id FROM eigen_invoer WHERE id = ?',
  stuk: 'SELECT onderzoek_id FROM stukken WHERE id = ?',
  actie: 'SELECT onderzoek_id FROM acties WHERE id = ?',
};

const NIET_GEVONDEN = {
  thema: 'Dit thema bestaat niet (meer).',
  meetpunt: 'Dit meetpunt bestaat niet (meer).',
  meetmoment: 'Dit meetmoment bestaat niet (meer).',
  vragenlijst: 'Deze vragenlijst bestaat niet (meer).',
  vraag: 'Deze vraag bestaat niet (meer).',
  invoer: 'Deze invoer bestaat niet (meer).',
  stuk: 'Dit stuk bestaat niet (meer).',
  actie: 'Deze actie bestaat niet (meer).',
};

export async function onderzoekVan(env, soort, itemId) {
  const rij = await een(env, ONDERZOEK_VIA[soort], itemId);
  if (!rij) throw new Fout(404, NIET_GEVONDEN[soort]);
  return rij.onderzoek_id;
}

/** Controleert dat item bij een bewerkbaar onderzoek hoort; geeft onderzoek terug. */
export async function bewerkbaarVia(env, soort, itemId) {
  const onderzoekId = await onderzoekVan(env, soort, itemId);
  return haalBewerkbaarOnderzoek(env, onderzoekId);
}

/** Controleert dat een (optioneel) thema/meetpunt/meetmoment bij het onderzoek hoort. */
export async function controleerHoortBij(env, soort, itemId, onderzoekId) {
  if (itemId === null || itemId === undefined) return;
  const eigenaar = await onderzoekVan(env, soort, itemId);
  if (eigenaar !== onderzoekId) {
    throw new Fout(400, `Het gekozen ${soort} hoort niet bij dit onderzoek.`);
  }
}

/** Volgende volgnummer binnen een tabel/ouder. */
export async function volgendeVolgorde(env, tabel, ouderKolom, ouderId) {
  const rij = await een(env, `SELECT COALESCE(MAX(volgorde), 0) + 1 AS v FROM ${tabel} WHERE ${ouderKolom} = ?`, ouderId);
  return rij ? rij.v : 1;
}

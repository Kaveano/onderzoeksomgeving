// Bibliotheek: controle van een bron aan de serverkant en het kiezen van een citeersleutel (BOUWPLAN §3.9, D3 §2.4).
// Ook gebruikt door scripts/startcollectie.mjs. De vaste lijsten en de APA-regels staan in
// public/js/beheer/bibliotheek-regels.js (dezelfde code als in de browser).

import { Fout } from './http.js';
import * as v from './validatie.js';
import {
  BRONSOORTEN, ONDERWERPEN, TALEN, BETROUWBAARHEID, LIMIETEN, detailveldenVan, citeersleutelBasis, vrijeCiteersleutel, voorletters,
} from '../../public/js/beheer/bibliotheek-regels.js';

/** Tekst bij een poging een bron uit de startcollectie aan te passen (BOUWPLAN §3.12). */
export const START_ALLEEN_LEZEN = 'Bronnen uit de startcollectie kun je niet aanpassen. Maak een eigen kopie als je iets wilt veranderen.';
export const START_NIET_VERWIJDEREN = 'Bronnen uit de startcollectie kun je niet verwijderen. Kies "Verbergen" als je deze bron niet wilt zien.';
export const BIBLIOTHEEK_VOL = 'Je bibliotheek is vol (maximaal 1.000 bronnen). Verwijder eerst bronnen die je niet meer gebruikt.';

const DOI = /^10\.\d{4,9}\/\S+$/;
const URL_PATROON = /^https?:\/\/[^\s<>"]+$/i;

/** 'https://doi.org/10.1/x' · 'doi:10.1/x' · '10.1/x' → '10.1/x'; leeg mag. Anders 400. */
export function normaliseerDoi(t) {
  if (t === undefined || t === null) return '';
  if (typeof t !== 'string') throw new Fout(400, 'Dit lijkt geen geldige DOI. Een DOI begint met 10. (bijvoorbeeld 10.1037/ocp0000056).');
  const d = t.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
  if (!d) return '';
  if (d.length > LIMIETEN.doi || !DOI.test(d)) throw new Fout(400, 'Dit lijkt geen geldige DOI. Een DOI begint met 10. (bijvoorbeeld 10.1037/ocp0000056).');
  return d;
}

/** Een link moet met http:// of https:// beginnen (dus nooit javascript: of data:); leeg mag. */
export function controleerUrl(t) {
  if (t === undefined || t === null) return '';
  if (typeof t !== 'string') throw new Fout(400, 'Een link moet beginnen met http:// of https://.');
  const u = t.trim();
  if (!u) return '';
  if (u.length > LIMIETEN.url || !URL_PATROON.test(u)) throw new Fout(400, 'Een link moet beginnen met http:// of https://.');
  return u;
}

/** Eén auteur: { achternaam (verplicht), tussenvoegsel, voorletters }. */
export function controleerAuteur(ruw, waar = 'Auteur') {
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) throw new Fout(400, `${waar}: vul de achternaam in.`);
  const achternaam = v.tekst(ruw.achternaam, `${waar}: achternaam`, { max: LIMIETEN.achternaam });
  if (!achternaam) throw new Fout(400, `${waar}: vul de achternaam in.`);
  return {
    achternaam,
    tussenvoegsel: v.tekst(ruw.tussenvoegsel, `${waar}: tussenvoegsel`, { max: LIMIETEN.tussenvoegsel }).toLowerCase(),
    voorletters: voorletters(v.tekst(ruw.voorletters, `${waar}: voorletters`, { max: LIMIETEN.voorletters })),
  };
}

function lijstVan(waarde, veld) {
  if (waarde === undefined || waarde === null) return [];
  if (!Array.isArray(waarde)) throw new Fout(400, `${veld} moet een lijst zijn.`);
  return waarde;
}

/** 'JJJJ-MM-DD' of (als maand mag) 'JJJJ-MM'; leeg mag. */
function datumVeld(waarde, veld, { maand = false } = {}) {
  if (waarde === undefined || waarde === null || waarde === '') return '';
  if (maand && typeof waarde === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(waarde.trim())) return waarde.trim();
  return v.datum(typeof waarde === 'string' ? waarde.trim() : waarde, veld);
}

function controleerDetails(ruw, soort, waar) {
  if (ruw === undefined || ruw === null) return {};
  if (typeof ruw !== 'object' || Array.isArray(ruw)) throw new Fout(400, `${waar}: de gegevens per soort zijn ongeldig.`);
  const uit = {};
  for (const veld of detailveldenVan(soort)) {
    const w = ruw[veld.sleutel];
    if (w === undefined || w === null || w === '') continue;
    if (veld.type === 'auteurs') {
      const lijst = lijstVan(w, `${waar}: ${veld.label}`);
      if (lijst.length > LIMIETEN.redacteuren) throw new Fout(400, `${waar}: hooguit ${LIMIETEN.redacteuren} redacteuren.`);
      const red = lijst.map((a, i) => controleerAuteur(a, `${waar}: redacteur ${i + 1}`));
      if (red.length) uit[veld.sleutel] = red;
    } else if (veld.type === 'datum') {
      const d = datumVeld(w, `${waar}: ${veld.label}`, { maand: veld.sleutel === 'datum' });
      if (d) uit[veld.sleutel] = d;
    } else if (veld.type === 'keuze') {
      uit[veld.sleutel] = v.keuze(w, `${waar}: ${veld.label}`, veld.opties);
    } else {
      const t = v.tekst(w, `${waar}: ${veld.label}`, { max: LIMIETEN.detail });
      if (t) uit[veld.sleutel] = t;
    }
  }
  return uit;
}

/**
 * Controleert een bron en geeft een schone kopie terug met alle velden die de gebruiker invult (alles behalve id,
 * collectie, sleutel, citeersleutel, verborgen, kopie_van en de tijden). Onbekende velden in details vallen weg.
 * Een fout geeft Fout(400) met een Nederlandse melding; waar zet er iets voor (bijv. "Bron 3").
 */
export function controleerBron(ruw, { waar = '' } = {}) {
  const pre = waar ? `${waar}: ` : '';
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) throw new Fout(400, `${pre}De gegevens van de bron zijn ongeldig.`);
  if (!Object.hasOwn(BRONSOORTEN, ruw.soort)) throw new Fout(400, `${pre}Kies een geldige soort bron.`);
  const soort = ruw.soort;
  const titel = v.tekst(ruw.titel, `${pre}Titel`, { max: LIMIETEN.titel });
  if (!titel) throw new Fout(400, `${pre}Vul de titel van de bron in.`);
  const auteurs = lijstVan(ruw.auteurs, `${pre}Auteurs`);
  if (auteurs.length > LIMIETEN.auteurs) throw new Fout(400, `${pre}Een bron kan hooguit ${LIMIETEN.auteurs} auteurs hebben.`);
  let jaar = null;
  if (ruw.jaar !== undefined && ruw.jaar !== null && ruw.jaar !== '') {
    const j = typeof ruw.jaar === 'string' ? Number(ruw.jaar.trim()) : ruw.jaar;
    if (!Number.isInteger(j) || j < 1800 || j > 2200) throw new Fout(400, `${pre}Het jaar moet tussen 1800 en 2200 liggen, of leeg zijn (zonder datum).`);
    jaar = j;
  }
  const onderwerpen = lijstVan(ruw.onderwerpen, `${pre}Onderwerpen`);
  if (onderwerpen.length > LIMIETEN.onderwerpen || onderwerpen.some((o) => typeof o !== 'string' || !Object.hasOwn(ONDERWERPEN, o))) {
    throw new Fout(400, `${pre}Kies onderwerpen uit de lijst.`);
  }
  const trefwoorden = lijstVan(ruw.trefwoorden, `${pre}Trefwoorden`);
  if (trefwoorden.length > LIMIETEN.trefwoorden) throw new Fout(400, `${pre}Hooguit ${LIMIETEN.trefwoorden} trefwoorden.`);
  const kernpunten = lijstVan(ruw.kernpunten, `${pre}Kernpunten`);
  if (kernpunten.length > LIMIETEN.kernpunten) throw new Fout(400, `${pre}Hooguit ${LIMIETEN.kernpunten} kernpunten.`);
  const taal = ruw.taal === undefined || ruw.taal === null || ruw.taal === '' ? 'nl' : ruw.taal;
  if (!Object.hasOwn(TALEN, taal)) throw new Fout(400, `${pre}Kies een geldige taal.`);
  const betrouwbaarheid = ruw.betrouwbaarheid === undefined || ruw.betrouwbaarheid === null || ruw.betrouwbaarheid === '' ? 'onbekend' : ruw.betrouwbaarheid;
  if (!Object.hasOwn(BETROUWBAARHEID, betrouwbaarheid)) throw new Fout(400, `${pre}Kies een geldige betrouwbaarheid.`);
  const uniek = (lijst) => [...new Set(lijst)];
  return {
    soort,
    titel,
    auteurs: auteurs.map((a, i) => controleerAuteur(a, `${pre}Auteur ${i + 1}`)),
    organisatie: v.tekst(ruw.organisatie, `${pre}Organisatie`, { max: LIMIETEN.organisatie }),
    afkorting: v.tekst(ruw.afkorting, `${pre}Afkorting`, { max: LIMIETEN.afkorting }),
    jaar,
    taal,
    url: controleerUrl(ruw.url),
    doi: normaliseerDoi(ruw.doi),
    details: controleerDetails(ruw.details, soort, waar || 'Bron'),
    onderwerpen: uniek(onderwerpen),
    trefwoorden: uniek(trefwoorden.map((w, i) => v.tekst(w, `${pre}Trefwoord ${i + 1}`, { max: LIMIETEN.trefwoord })).filter(Boolean)),
    samenvatting: v.langeTekst(ruw.samenvatting, `${pre}Samenvatting`, { max: LIMIETEN.samenvatting }).trim(),
    kernpunten: kernpunten.map((k, i) => v.tekst(k, `${pre}Kernpunt ${i + 1}`, { max: LIMIETEN.kernpunt })).filter(Boolean),
    betrouwbaarheid,
    betrouwbaarheid_toelichting: v.tekst(ruw.betrouwbaarheid_toelichting, `${pre}Toelichting`, { max: LIMIETEN.betrouwbaarheid_toelichting }),
    notities: v.langeTekst(ruw.notities, `${pre}Eigen notities`, { max: LIMIETEN.notities }).trim(),
  };
}

/** Alleen de eigen notities (bij een bron uit de startcollectie). */
export function controleerNotities(waarde) {
  return v.langeTekst(waarde, 'Eigen notities', { max: LIMIETEN.notities }).trim();
}

/** Nieuwe, vrije citeersleutel: citeersleutelBasis(bron), dan …b, …c (bezet: Set van bestaande sleutels). */
export function nieuweCiteersleutel(bron, bezet) {
  return vrijeCiteersleutel(citeersleutelBasis(bron), bezet);
}

/** De kolommen van een bron in de tabel bronnen, in de volgorde van INSERT_KOLOMMEN. */
export const INSERT_KOLOMMEN = [
  'collectie', 'sleutel', 'citeersleutel', 'soort', 'titel', 'auteurs', 'organisatie', 'afkorting', 'jaar', 'taal', 'url', 'doi',
  'details', 'onderwerpen', 'trefwoorden', 'samenvatting', 'kernpunten', 'betrouwbaarheid', 'betrouwbaarheid_toelichting',
  'notities', 'verborgen', 'kopie_van', 'aangemaakt_op', 'bijgewerkt_op',
];

/** Waarden voor INSERT_KOLOMMEN (JSON-velden als tekst). */
export function insertWaarden(schoon, { collectie = 'eigen', sleutel = null, citeersleutel, verborgen = 0, kopieVan = null, nu }) {
  return [
    collectie, sleutel, citeersleutel, schoon.soort, schoon.titel, JSON.stringify(schoon.auteurs), schoon.organisatie, schoon.afkorting,
    schoon.jaar, schoon.taal, schoon.url, schoon.doi, JSON.stringify(schoon.details), JSON.stringify(schoon.onderwerpen),
    JSON.stringify(schoon.trefwoorden), schoon.samenvatting, JSON.stringify(schoon.kernpunten), schoon.betrouwbaarheid,
    schoon.betrouwbaarheid_toelichting, schoon.notities, verborgen, kopieVan, nu, nu,
  ];
}

const leesJsonKolom = (t, standaard) => {
  try {
    const w = JSON.parse(t);
    return w ?? standaard;
  } catch {
    return standaard;
  }
};

/** Een rij uit de tabel bronnen als Bron (JSON-velden gelezen). onderzoeken: tekst van json_group_array of een lijst. */
export function bronUitRij(rij) {
  return {
    id: rij.id, collectie: rij.collectie, sleutel: rij.sleutel, citeersleutel: rij.citeersleutel, soort: rij.soort, titel: rij.titel,
    auteurs: leesJsonKolom(rij.auteurs, []), organisatie: rij.organisatie, afkorting: rij.afkorting, jaar: rij.jaar, taal: rij.taal,
    url: rij.url, doi: rij.doi, details: leesJsonKolom(rij.details, {}), onderwerpen: leesJsonKolom(rij.onderwerpen, []),
    trefwoorden: leesJsonKolom(rij.trefwoorden, []), samenvatting: rij.samenvatting, kernpunten: leesJsonKolom(rij.kernpunten, []),
    betrouwbaarheid: rij.betrouwbaarheid, betrouwbaarheid_toelichting: rij.betrouwbaarheid_toelichting, notities: rij.notities,
    verborgen: rij.verborgen, kopie_van: rij.kopie_van,
    onderzoeken: typeof rij.onderzoeken === 'string' ? leesJsonKolom(rij.onderzoeken, []) : rij.onderzoeken || [],
    aangemaakt_op: rij.aangemaakt_op, bijgewerkt_op: rij.bijgewerkt_op,
  };
}
